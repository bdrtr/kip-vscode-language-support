import * as vscode from 'vscode';
import { KipRunner } from './kipRunner';
import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipFormattingProvider } from './formattingProvider';
import { KipDiagnosticProvider } from './diagnosticProvider';

type LanguageClientType = import('vscode-languageclient/node').LanguageClient;

let LanguageClient: typeof import('vscode-languageclient/node').LanguageClient | null = null;
let TransportKind: typeof import('vscode-languageclient/node').TransportKind | null = null;

const LSP_PROVIDERS = {
    KipDefinitionProvider: null as typeof import('./definitionProvider').KipDefinitionProvider | null,
    KipReferenceProvider: null as typeof import('./referenceProvider').KipReferenceProvider | null,
    KipDocumentHighlightProvider: null as typeof import('./referenceProvider').KipDocumentHighlightProvider | null,
    KipRenameProvider: null as typeof import('./renameProvider').KipRenameProvider | null,
    KipCodeActionProvider: null as typeof import('./codeActionProvider').KipCodeActionProvider | null,
    KipCodeLensProvider: null as typeof import('./codeLensProvider').KipCodeLensProvider | null,
    KipSymbolProvider: null as typeof import('./symbolProvider').KipSymbolProvider | null,
    KipWorkspaceSymbolProvider: null as typeof import('./workspaceSymbolProvider').KipWorkspaceSymbolProvider | null,
    SemanticProvider: null as typeof import('./semanticProvider').SemanticProvider | null
};

function loadLSPModule() {
    try {
        const lspModule = require('vscode-languageclient/node');
        LanguageClient = lspModule.LanguageClient;
        TransportKind = lspModule.TransportKind;
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

    loadLSPProvider('definitionProvider', 'KipDefinitionProvider');
    loadLSPProvider('referenceProvider', 'KipReferenceProvider');
    loadLSPProvider('referenceProvider', 'KipDocumentHighlightProvider');
    loadLSPProvider('renameProvider', 'KipRenameProvider');
    loadLSPProvider('codeActionProvider', 'KipCodeActionProvider');
    loadLSPProvider('codeLensProvider', 'KipCodeLensProvider');
    loadLSPProvider('symbolProvider', 'KipSymbolProvider');
    loadLSPProvider('workspaceSymbolProvider', 'KipWorkspaceSymbolProvider');
    loadLSPProvider('semanticProvider', 'SemanticProvider');
}

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
    if (!LSP_PROVIDERS.SemanticProvider || !LanguageClient) {
        console.warn('LSP providers not available');
        return;
    }

    try {
        const semanticProvider = new LSP_PROVIDERS.SemanticProvider(lspClient);

        if (LSP_PROVIDERS.KipDefinitionProvider) {
            context.subscriptions.push(
                vscode.languages.registerDefinitionProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipDefinitionProvider(lspClient, semanticProvider)
                )
            );
        }

        if (LSP_PROVIDERS.KipReferenceProvider) {
            context.subscriptions.push(
                vscode.languages.registerReferenceProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipReferenceProvider(lspClient, semanticProvider)
                )
            );
        }

        if (LSP_PROVIDERS.KipDocumentHighlightProvider) {
            context.subscriptions.push(
                vscode.languages.registerDocumentHighlightProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipDocumentHighlightProvider(semanticProvider)
                )
            );
        }

        if (LSP_PROVIDERS.KipRenameProvider) {
            context.subscriptions.push(
                vscode.languages.registerRenameProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipRenameProvider(lspClient, semanticProvider)
                )
            );
        }

        if (LSP_PROVIDERS.KipCodeActionProvider) {
            context.subscriptions.push(
                vscode.languages.registerCodeActionsProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipCodeActionProvider(lspClient, semanticProvider),
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

        if (LSP_PROVIDERS.KipCodeLensProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableCodeLens', true)) {
                context.subscriptions.push(
                    vscode.languages.registerCodeLensProvider(
                        kipSelector,
                        new LSP_PROVIDERS.KipCodeLensProvider(lspClient, semanticProvider)
                    )
                );
            }
        }

        if (LSP_PROVIDERS.KipSymbolProvider) {
            context.subscriptions.push(
                vscode.languages.registerDocumentSymbolProvider(
                    kipSelector,
                    new LSP_PROVIDERS.KipSymbolProvider(lspClient, semanticProvider)
                )
            );
        }

        if (LSP_PROVIDERS.KipWorkspaceSymbolProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableWorkspaceSymbols', true)) {
                context.subscriptions.push(
                    vscode.languages.registerWorkspaceSymbolProvider(
                        new LSP_PROVIDERS.KipWorkspaceSymbolProvider(lspClient, semanticProvider)
                    )
                );
            }
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

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        },
        errorHandler: {
            error: (error: Error, message: any, count: number) => {
                // Ignore "no handler" errors for optional LSP methods
                if (error.message && (
                    error.message.includes('no handler for') ||
                    error.message.includes('SetTrace') ||
                    error.message.includes('Initialized')
                )) {
                    return { action: 'continue' as const };
                }
                return { action: 'continue' as const };
            },
            closed: () => ({ action: 'restart' as const })
        }
    };

    const client = new LanguageClient(
        'kipLanguageServer',
        'Kip Language Server',
        {
            run: serverExecutable,
            debug: serverExecutable
        },
        clientOptions
    );

    return client;
}

export function deactivate() {
    // Cleanup if needed
}
