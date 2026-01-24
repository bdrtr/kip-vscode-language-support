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
// kip-lsp only implements: DidOpen, DidChange, DidSave, Hover, Definition, Completion, Formatting
// It does NOT implement: Initialized, SetTrace, CodeLens, SemanticTokens, etc.
function shouldFilterMessage(message: string): boolean {
    const msg = String(message).toLowerCase();
    return msg.includes('no handler for') || 
           msg.includes('smethod_settrace') || 
           msg.includes('smethod_initialized') ||
           msg.includes('smethod_textdocumentcodelens') ||
           msg.includes('smethod_semantictokens') ||
           msg.includes('smethod_semantictokensfull') ||
           msg.includes('lsp: no handler') ||
           msg.includes('sending notification') && (msg.includes('failed') || msg.includes('error')) ||
           msg.includes('workspace/didchangeconfiguration') && msg.includes('failed');
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
            
            // Handle configuration changes (matching onConfigurationChange in Haskell)
            const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('kip')) {
                    // Configuration changed, but kip-lsp doesn't need special handling
                    // (Haskell: onConfigurationChange = \cfg _ -> Right cfg)
                }
            });
            context.subscriptions.push(configWatcher);
            
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
        // Use middleware to prevent sending unsupported notifications
        // kip-lsp doesn't implement SMethod_Initialized and SMethod_SetTrace handlers
        middleware: {
            sendNotification: (type: any, params: any, next: any) => {
                const method = type?.method || type;
                const methodStr = String(method).toLowerCase();
                // Don't send initialized or setTrace notifications that kip-lsp doesn't handle
                // These are optional in LSP spec but vscode-languageclient sends them automatically
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

    // Add error handler if available
    if (ErrorActionEnum && CloseActionEnum) {
        const ErrorAction = ErrorActionEnum;
        const CloseAction = CloseActionEnum;
        clientOptions.errorHandler = {
            error: (error: Error, message: any, count: number) => {
                // Ignore "no handler" errors for optional LSP methods
                const errMsg = error?.message || String(message || '');
                const errMsgLower = errMsg.toLowerCase();
                
                // Filter all known LSP issues that kip-lsp doesn't support
                if (shouldFilterMessage(errMsg) || 
                    errMsgLower.includes('failed') || 
                    errMsgLower.includes('notification') ||
                    errMsgLower.includes('didopen') ||
                    errMsgLower.includes('didchangeconfiguration') ||
                    errMsgLower.includes('codelens') ||
                    errMsgLower.includes('semantictokens') ||
                    errMsgLower.includes('no handler')) {
                    // Silently continue for known issues (kip-lsp doesn't support these features)
                    return { action: ErrorAction.Continue };
                }
                // For other errors, also continue but log (if not filtered)
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
    
    // Additional connection interception for unsupported notifications
    // This is a fallback in case middleware doesn't catch everything
    try {
        const clientAny = client as any;
        
        // Override tracer log methods to filter "no handler" messages
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
        
        // Intercept connection after client is created (fallback for middleware)
        const interceptConnection = () => {
            try {
                const connection = clientAny._connection || clientAny._messageConnection;
                if (connection && connection.sendNotification && typeof connection.sendNotification === 'function') {
                    const originalSend = connection.sendNotification.bind(connection);
                    connection.sendNotification = function(method: string, params?: any) {
                        const methodStr = String(method).toLowerCase();
                        // Don't send unsupported notifications (matching Haskell's handler list)
                        // kip-lsp only supports: DidOpen, DidChange, DidSave
                        if (methodStr === 'initialized' || 
                            methodStr.includes('settrace') ||
                            methodStr.includes('codelens') ||
                            methodStr.includes('semantictokens')) {
                            return Promise.resolve();
                        }
                        // Wrap in try-catch to handle notification failures
                        try {
                            return originalSend(method, params).catch((err: any) => {
                                // Silently ignore notification failures (server doesn't support it)
                                const errMsg = String(err?.message || err || '').toLowerCase();
                                if (errMsg.includes('failed') || 
                                    errMsg.includes('no handler') ||
                                    errMsg.includes('didchangeconfiguration')) {
                                    return Promise.resolve();
                                }
                                return Promise.resolve();
                            });
                        } catch (e) {
                            // If send itself throws, resolve silently
                            return Promise.resolve();
                        }
                    };
                }
                
                // Also intercept onNotification to filter error messages
                if (connection && connection.onNotification) {
                    const originalOnNotification = connection.onNotification.bind(connection);
                    connection.onNotification = function(handler: any) {
                        return originalOnNotification((method: string, params: any) => {
                            // Filter out "no handler" related notifications
                            if (!shouldFilterMessage(method)) {
                                try {
                                    handler(method, params);
                                } catch (e) {
                                    // Ignore handler errors
                                }
                            }
                        });
                    };
                }
            } catch (e) {
                // Ignore interception errors
            }
        };
        
        // Try to intercept immediately and after delays
        interceptConnection();
        setTimeout(interceptConnection, 50);
        setTimeout(interceptConnection, 200);
        
        // Override start to ensure interception after initialization
        const originalStart = client.start.bind(client);
        client.start = function() {
            return originalStart().then(() => {
                interceptConnection();
                return Promise.resolve();
            });
        };
    } catch (e) {
        // Ignore errors in connection interception
    }

    return client;
}

export function deactivate() {
    // Cleanup if needed
}
