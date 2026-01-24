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

// Global filter for LSP "no handler" messages
function shouldFilterMessage(message: string): boolean {
    const msg = String(message).toLowerCase();
    return msg.includes('no handler for') || 
           msg.includes('smethod_settrace') || 
           msg.includes('smethod_initialized') ||
           msg.includes('lsp: no handler');
}

// Override console methods globally to filter LSP warnings
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

console.error = function(...args: any[]) {
    const message = args.map(String).join(' ');
    if (!shouldFilterMessage(message)) {
        originalConsoleError.apply(console, args);
    }
};

console.warn = function(...args: any[]) {
    const message = args.map(String).join(' ');
    if (!shouldFilterMessage(message)) {
        originalConsoleWarn.apply(console, args);
    }
};

console.log = function(...args: any[]) {
    const message = args.map(String).join(' ');
    if (!shouldFilterMessage(message)) {
        originalConsoleLog.apply(console, args);
    }
};

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
            
            // Intercept and filter output channel after client is created
            setTimeout(() => {
                try {
                    const clientAny = lspClient as any;
                    // Try multiple possible output channel locations
                    const outputChannels = [
                        clientAny._outputChannel,
                        clientAny.outputChannel,
                        clientAny._tracer?.outputChannel,
                        (clientAny as any)._connection?.outputChannel
                    ].filter(Boolean);
                    
                    outputChannels.forEach((channel: any) => {
                        if (channel && typeof channel.append === 'function') {
                            const originalAppend = channel.append.bind(channel);
                            const originalAppendLine = channel.appendLine?.bind(channel);
                            
                            channel.append = function(value: string) {
                                if (!shouldFilterMessage(value)) {
                                    originalAppend(value);
                                }
                            };
                            
                            if (originalAppendLine) {
                                channel.appendLine = function(value: string) {
                                    if (!shouldFilterMessage(value)) {
                                        originalAppendLine(value);
                                    }
                                };
                            }
                        }
                    });
                } catch (e) {
                    // Ignore errors in output channel interception
                }
            }, 100);
            
            lspClient.start().then(() => {
                registerLSPProviders(context, kipSelector, lspClient!);
            }).catch((err) => {
                const errMsg = err instanceof Error ? err.message : String(err);
                // Ignore "no handler" errors
                if (!shouldFilterMessage(errMsg)) {
                    console.error('LSP failed to start:', err);
                    vscode.window.showWarningMessage(
                        'Kip LSP başlatılamadı. LSP özellikleri çalışmayabilir.',
                        'Tekrar Dene'
                    ).then(action => {
                        if (action === 'Tekrar Dene') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            });
        }
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Ignore "no handler" errors
        if (!shouldFilterMessage(errMsg)) {
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

    // Create filtered output channel to suppress "no handler" warnings
    const lspOutputChannel = vscode.window.createOutputChannel('Kip LSP');
    const originalAppend = lspOutputChannel.append.bind(lspOutputChannel);
    const originalAppendLine = lspOutputChannel.appendLine.bind(lspOutputChannel);
    
    // Filter out "no handler" warnings
    lspOutputChannel.append = function(value: string) {
        if (!shouldFilterMessage(value)) {
            originalAppend(value);
        }
    };
    
    lspOutputChannel.appendLine = function(value: string) {
        if (!shouldFilterMessage(value)) {
            originalAppendLine(value);
        }
    };


    // Create a silent trace output channel
    const traceOutputChannel = vscode.window.createOutputChannel('Kip LSP Trace', { log: true });
    const traceOriginalAppend = traceOutputChannel.append.bind(traceOutputChannel);
    const traceOriginalAppendLine = traceOutputChannel.appendLine.bind(traceOutputChannel);
    
    traceOutputChannel.append = function(value: string) {
        if (!shouldFilterMessage(value)) {
            traceOriginalAppend(value);
        }
    };
    
    traceOutputChannel.appendLine = function(value: string) {
        if (!shouldFilterMessage(value)) {
            traceOriginalAppendLine(value);
        }
    };

    const clientOptions: any = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        },
        outputChannel: lspOutputChannel,
        traceOutputChannel: traceOutputChannel
    };
    
    // Try to set trace to Off if available
    try {
        const TraceEnum = require('vscode-languageclient/node').Trace;
        if (TraceEnum && TraceEnum.Off !== undefined) {
            clientOptions.trace = TraceEnum.Off;
        }
    } catch (e) {
        // Trace enum not available, ignore
    }

    // Add error handler if available
    if (ErrorActionEnum && CloseActionEnum) {
        const ErrorAction = ErrorActionEnum;
        const CloseAction = CloseActionEnum;
        clientOptions.errorHandler = {
            error: (error: Error, message: any, count: number) => {
                // Ignore "no handler" errors for optional LSP methods
                if (error.message && shouldFilterMessage(error.message)) {
                    return { action: ErrorAction.Continue };
                }
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
    
    // Additional filtering: intercept client's internal logging and connection
    try {
        const clientAny = client as any;
        
        // Override tracer log methods
        if (clientAny._tracer) {
            const originalLog = clientAny._tracer.log;
            if (originalLog) {
                clientAny._tracer.log = function(message: string) {
                    if (!shouldFilterMessage(message)) {
                        originalLog.call(this, message);
                    }
                };
            }
        }
        
        // Intercept connection to prevent sending SetTrace and Initialized notifications
        if (clientAny._connection) {
            const connection = clientAny._connection;
            
            // Override sendNotification to prevent sending problematic notifications
            if (connection.sendNotification && typeof connection.sendNotification === 'function') {
                const originalSendNotification = connection.sendNotification.bind(connection);
                connection.sendNotification = function(method: string, params?: any) {
                    // Don't send SetTrace or Initialized notifications that cause "no handler" errors
                    const methodLower = String(method).toLowerCase();
                    if (methodLower.includes('settrace') || methodLower === 'initialized') {
                        return Promise.resolve();
                    }
                    try {
                        return originalSendNotification(method, params);
                    } catch (e) {
                        // Ignore errors for filtered methods
                        if (!shouldFilterMessage(String(e))) {
                            throw e;
                        }
                        return Promise.resolve();
                    }
                };
            }
        }
        
        // Also intercept after client starts
        const originalStart = client.start.bind(client);
        client.start = function() {
            return originalStart().then(() => {
                // Additional interception after start
                try {
                    if (clientAny._connection && clientAny._connection.sendNotification) {
                        const connection = clientAny._connection;
                        const originalSend = connection.sendNotification.bind(connection);
                        connection.sendNotification = function(method: string, params?: any) {
                            const methodLower = String(method).toLowerCase();
                            if (methodLower.includes('settrace') || methodLower === 'initialized') {
                                return Promise.resolve();
                            }
                            return originalSend(method, params);
                        };
                    }
                } catch (e) {
                    // Ignore
                }
            });
        };
    } catch (e) {
        // Ignore errors
    }

    return client;
}

export function deactivate() {
    // Cleanup if needed
}
