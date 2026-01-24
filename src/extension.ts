import * as vscode from 'vscode';
import { KipRunner } from './kipRunner';
import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipFormattingProvider } from './formattingProvider';
import { KipDiagnosticProvider } from './diagnosticProvider';

type LanguageClientType = import('vscode-languageclient/node').LanguageClient;
type ErrorAction = import('vscode-languageclient/node').ErrorAction;
type CloseAction = import('vscode-languageclient/node').CloseAction;
type Trace = import('vscode-languageclient/node').Trace;
type TraceFormat = import('vscode-languageclient/node').TraceFormat;

let LanguageClient: typeof import('vscode-languageclient/node').LanguageClient | null = null;
let TransportKind: typeof import('vscode-languageclient/node').TransportKind | null = null;
let ErrorActionEnum: typeof import('vscode-languageclient/node').ErrorAction | null = null;
let CloseActionEnum: typeof import('vscode-languageclient/node').CloseAction | null = null;

// kip-lsp only supports: Hover, Definition, Completion, Formatting
// Removed: CodeLens, SemanticTokens, DocumentSymbol (not supported by kip-lsp)
const LSP_PROVIDERS = {
    KipDefinitionProvider: null as typeof import('./definitionProvider').KipDefinitionProvider | null,
    KipReferenceProvider: null as typeof import('./referenceProvider').KipReferenceProvider | null,
    KipDocumentHighlightProvider: null as typeof import('./referenceProvider').KipDocumentHighlightProvider | null,
    KipRenameProvider: null as typeof import('./renameProvider').KipRenameProvider | null,
    KipCodeActionProvider: null as typeof import('./codeActionProvider').KipCodeActionProvider | null
    // Removed: KipCodeLensProvider, KipSymbolProvider, KipWorkspaceSymbolProvider, SemanticProvider
};

function loadLSPModule() {
    try {
        const lspModule = require('vscode-languageclient/node');
        LanguageClient = lspModule.LanguageClient;
        TransportKind = lspModule.TransportKind;
        ErrorActionEnum = lspModule.ErrorAction;
        CloseActionEnum = lspModule.CloseAction;
        return true;
    } catch (err) {
        console.warn('LSP module not available:', err);
        return false;
    }
}

function loadLSPProvider(moduleName: string, providerName: string): boolean {
    try {
        const module = require(`./${moduleName}`);
        (LSP_PROVIDERS as any)[providerName] = module[providerName];
        return true;
    } catch (err) {
        console.warn(`${providerName} not available:`, err);
        return false;
    }
}

function loadLSPProviders() {
    if (!LanguageClient) return;

    // Only load providers that kip-lsp supports
    loadLSPProvider('definitionProvider', 'KipDefinitionProvider');
    loadLSPProvider('referenceProvider', 'KipReferenceProvider');
    loadLSPProvider('referenceProvider', 'KipDocumentHighlightProvider');
    loadLSPProvider('renameProvider', 'KipRenameProvider');
    loadLSPProvider('codeActionProvider', 'KipCodeActionProvider');
    // Removed: CodeLens, Symbol, WorkspaceSymbol, SemanticTokens (not supported by kip-lsp)
}

// Removed all filtering code - we only use features that kip-lsp supports

export function activate(context: vscode.ExtensionContext) {
    console.log('Kip Language Support extension activated');

    const kipSelector: vscode.DocumentSelector = { scheme: 'file', language: 'kip' };

    const kipRunner = new KipRunner(context);
    const runCommand = vscode.commands.registerCommand('kip.runFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'kip') {
            vscode.window.showErrorMessage('No active Kip file');
            return;
        }
        await kipRunner.runFile(editor.document);
    });
    context.subscriptions.push(runCommand, kipRunner);

    const hoverProvider = vscode.languages.registerHoverProvider(
        kipSelector,
        new KipHoverProvider()
    );
    context.subscriptions.push(hoverProvider);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        kipSelector,
        new KipCompletionProvider(),
        '.', '\'', ' '
    );
    context.subscriptions.push(completionProvider);

    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        kipSelector,
        new KipFormattingProvider()
    );
    const rangeFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
        kipSelector,
        new KipFormattingProvider()
    );
    context.subscriptions.push(formattingProvider, rangeFormattingProvider);

    // Format on Save (if enabled)
    const formatOnSaveDisposable = vscode.workspace.onWillSaveTextDocument(async (event) => {
        const config = vscode.workspace.getConfiguration('kip');
        if (config.get<boolean>('formatOnSave', false) && event.document.languageId === 'kip') {
            const formatter = new KipFormattingProvider();
            const docConfig = vscode.workspace.getConfiguration('editor', event.document.uri);
            const formattingOptions: vscode.FormattingOptions = {
                tabSize: docConfig.get<number>('tabSize', 4),
                insertSpaces: docConfig.get<boolean>('insertSpaces', true)
            };
            const edits = await formatter.provideDocumentFormattingEdits(
                event.document,
                formattingOptions,
                new vscode.CancellationTokenSource().token
            );
            if (edits && edits.length > 0) {
                const edit = new vscode.WorkspaceEdit();
                edits.forEach(e => edit.replace(event.document.uri, e.range, e.newText));
                event.waitUntil(Promise.resolve(edit));
            }
        }
    });
    context.subscriptions.push(formatOnSaveDisposable);

    const diagnosticProvider = new KipDiagnosticProvider();
    context.subscriptions.push(diagnosticProvider);

    if (vscode.window.activeTextEditor?.document.languageId === 'kip') {
        diagnosticProvider.validateDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            if (document.languageId === 'kip') {
                diagnosticProvider.validateDocument(document);
            }
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document.languageId === 'kip') {
                diagnosticProvider.validateDocument(event.document);
            }
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (document.languageId === 'kip') {
                diagnosticProvider.clearDiagnostics(document);
            }
        })
    );

    if (!loadLSPModule()) {
        vscode.window.showErrorMessage(
            'LSP modülü bulunamadı. Extension düzgün çalışmayabilir.',
            'Yeniden Yükle'
        ).then(action => {
            if (action === 'Yeniden Yükle') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        return;
    }

    loadLSPProviders();

    let lspClient: LanguageClientType | null = null;
    
    try {
        lspClient = initializeLSP(context, kipSelector);
        
        if (lspClient) {
            context.subscriptions.push(lspClient);
            
            // Handle configuration changes (matching onConfigurationChange in Haskell)
            const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('kip')) {
                    // Configuration changed, but kip-lsp doesn't need special handling
                    // (Haskell: onConfigurationChange = \cfg _ -> Right cfg)
                }
            });
            context.subscriptions.push(configWatcher);
            
            // Start LSP client
            lspClient.start().then(() => {
                registerLSPProviders(context, kipSelector, lspClient!);
            }).catch((err) => {
                console.error('LSP failed to start:', err);
                vscode.window.showWarningMessage(
                    'Kip LSP başlatılamadı. LSP özellikleri çalışmayabilir.',
                    'Tekrar Dene'
                ).then(action => {
                    if (action === 'Tekrar Dene') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            });
        }
    } catch (err) {
        console.error('LSP initialization failed:', err);
        vscode.window.showErrorMessage(
            'LSP başlatılamadı. Extension düzgün çalışmayabilir.',
            'Yeniden Yükle'
        ).then(action => {
            if (action === 'Yeniden Yükle') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
}

function registerLSPProviders(
    context: vscode.ExtensionContext,
    kipSelector: vscode.DocumentSelector,
    lspClient: LanguageClientType
): void {
    if (!LanguageClient) {
        console.warn('LSP providers not available');
        return;
    }

    try {
        // kip-lsp only supports: Hover, Definition, Completion, Formatting
        // No SemanticProvider needed - kip-lsp doesn't support semantic tokens

        // Register only providers that kip-lsp supports: Definition, Hover (via LSP), Completion, Formatting
        // Removed: CodeLens, DocumentSymbol, WorkspaceSymbol (kip-lsp doesn't support these)
        
        if (LSP_PROVIDERS.KipDefinitionProvider) {
            context.subscriptions.push(
                vscode.languages.registerDefinitionProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipDefinitionProvider(lspClient)
                )
            );
        }

        if (LSP_PROVIDERS.KipReferenceProvider) {
            context.subscriptions.push(
                vscode.languages.registerReferenceProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipReferenceProvider(lspClient)
                )
            );
        }

        if (LSP_PROVIDERS.KipDocumentHighlightProvider) {
            context.subscriptions.push(
                vscode.languages.registerDocumentHighlightProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipDocumentHighlightProvider()
                )
            );
        }

        if (LSP_PROVIDERS.KipRenameProvider) {
            context.subscriptions.push(
                vscode.languages.registerRenameProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipRenameProvider(lspClient)
                )
            );
        }

        if (LSP_PROVIDERS.KipCodeActionProvider) {
            context.subscriptions.push(
                vscode.languages.registerCodeActionsProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipCodeActionProvider(lspClient),
                    {
                        providedCodeActionKinds: [
                            vscode.CodeActionKind.QuickFix,
                            vscode.CodeActionKind.Refactor,
                            vscode.CodeActionKind.RefactorExtract
                        ]
                    }
                )
            );
        }

        console.log('All LSP providers registered');
    } catch (err) {
        console.error('Error registering LSP providers:', err);
    }
}

function initializeLSP(context: vscode.ExtensionContext, kipSelector: vscode.DocumentSelector): LanguageClientType | null {
    const path = require('path');
    const fs = require('fs');

    const findServerPath = (): string | null => {
        const configPath = vscode.workspace.getConfiguration('kip').get<string>('lspPath');
        if (configPath?.trim()) {
            const resolvedPath = path.isAbsolute(configPath) 
                ? configPath 
                : path.resolve(configPath);
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
        }

        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const localBinPath = path.join(homeDir, '.local', 'bin', 'kip-lsp');
            if (fs.existsSync(localBinPath)) {
                return localBinPath;
            }
        }

        return 'kip-lsp';
    };

    const serverPath = findServerPath();
    
    if (!serverPath || !TransportKind || !LanguageClient) {
        return null;
    }

    const serverExecutable = {
        command: serverPath,
        args: [],
        transport: TransportKind.stdio
    };

    // Create output channels (no filtering - we only use supported features)
    const lspOutputChannel = vscode.window.createOutputChannel('Kip LSP');
    const traceOutputChannel = vscode.window.createOutputChannel('Kip LSP Trace', { log: true });

    // LSP options matching Haskell implementation
    // Based on kip-lang/app/Lsp.hs lspOptions
    const clientOptions: any = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        // TextDocumentSyncOptions matching Haskell: Full sync, open/close enabled, save enabled
        synchronize: {
            // Full document sync (TextDocumentSyncKind_Full)
            configurationSection: ['kip'],
            fileEvents: [
                vscode.workspace.createFileSystemWatcher('**/*.kip'),
                vscode.workspace.createFileSystemWatcher('**/.clientrc')
            ]
        },
        outputChannel: lspOutputChannel,
        traceOutputChannel: traceOutputChannel,
        // Completion trigger characters matching Haskell: "-'"
        initializationOptions: {
            // Pass any initialization options if needed
        },
        // Middleware: Only prevent sending initialized and setTrace (kip-lsp doesn't implement these)
        // kip-lsp only implements: DidOpen, DidChange, DidSave, Hover, Definition, Completion, Formatting
        middleware: {
            sendNotification: (type: any, params: any, next: any) => {
                const method = type?.method || type;
                const methodStr = String(method).toLowerCase();
                // kip-lsp doesn't implement initialized and setTrace handlers (optional in LSP spec)
                if (methodStr === 'initialized' || methodStr.includes('settrace')) {
                    return Promise.resolve();
                }
                return next(type, params);
            }
        }
    };
    
    // Set trace to Off to minimize logging (matching Haskell's minimal logging approach)
    try {
        const TraceEnum = require('vscode-languageclient/node').Trace;
        if (TraceEnum && TraceEnum.Off !== undefined) {
            clientOptions.trace = TraceEnum.Off;
        }
    } catch (e) {
        // Trace enum not available, ignore
    }

    // Add error handler - continue on errors (don't crash extension)
    if (ErrorActionEnum && CloseActionEnum) {
        const ErrorAction = ErrorActionEnum;
        const CloseAction = CloseActionEnum;
        clientOptions.errorHandler = {
            error: (error: Error, message: any, count: number) => {
                // Continue on errors - kip-lsp may not support all optional LSP features
                return { action: ErrorAction.Continue };
            },
            closed: () => ({ action: CloseAction.Restart })
        };
    }

    const client = new LanguageClient(
        'kipLanguageServer',
        'Kip Language Server',
        {
            run: serverExecutable,
            debug: serverExecutable
        },
        clientOptions
    );
    
    // No connection interception needed - we only use supported features

    return client;
}

export function deactivate() {
    // Cleanup if needed
}
