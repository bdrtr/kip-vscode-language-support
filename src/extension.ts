import * as vscode from 'vscode';
import { KipRunner } from './kipRunner';
import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipFormattingProvider } from './formattingProvider';
import { KipDiagnosticProvider } from './diagnosticProvider';

// LSP imports - opsiyonel, hata durumunda extension çalışmaya devam eder
import type { LanguageClient as LanguageClientType } from 'vscode-languageclient/node';
let LanguageClient: typeof import('vscode-languageclient/node').LanguageClient | null = null;
let TransportKind: typeof import('vscode-languageclient/node').TransportKind | null = null;

// Logging helper - only log errors in production
const DEBUG = process.env.NODE_ENV !== 'production';

// LSP Provider imports - sadece LSP mevcut olduğunda kullanılacak
let KipDefinitionProvider: typeof import('./definitionProvider').KipDefinitionProvider | null = null;
let KipReferenceProvider: typeof import('./referenceProvider').KipReferenceProvider | null = null;
let KipDocumentHighlightProvider: typeof import('./referenceProvider').KipDocumentHighlightProvider | null = null;
let KipRenameProvider: typeof import('./renameProvider').KipRenameProvider | null = null;
let KipCodeActionProvider: typeof import('./codeActionProvider').KipCodeActionProvider | null = null;
let KipCodeLensProvider: typeof import('./codeLensProvider').KipCodeLensProvider | null = null;
let KipSymbolProvider: typeof import('./symbolProvider').KipSymbolProvider | null = null;
let KipWorkspaceSymbolProvider: typeof import('./workspaceSymbolProvider').KipWorkspaceSymbolProvider | null = null;
let SemanticProvider: typeof import('./semanticProvider').SemanticProvider | null = null;
let KipSemanticTokensProvider: typeof import('./semanticTokensProvider').KipSemanticTokensProvider | null = null;

try {
    const lspModule = require('vscode-languageclient/node');
    LanguageClient = lspModule.LanguageClient;
    TransportKind = lspModule.TransportKind;
    
    // LSP provider'larını yükle
    try {
        const definitionModule = require('./definitionProvider');
        KipDefinitionProvider = definitionModule.KipDefinitionProvider;
    } catch (e) {
        if (DEBUG) console.warn('Definition provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const referenceModule = require('./referenceProvider');
        KipReferenceProvider = referenceModule.KipReferenceProvider;
        KipDocumentHighlightProvider = referenceModule.KipDocumentHighlightProvider;
    } catch (e) {
        if (DEBUG) console.warn('Reference provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const renameModule = require('./renameProvider');
        KipRenameProvider = renameModule.KipRenameProvider;
    } catch (e) {
        if (DEBUG) console.warn('Rename provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const codeActionModule = require('./codeActionProvider');
        KipCodeActionProvider = codeActionModule.KipCodeActionProvider;
    } catch (e) {
        if (DEBUG) console.warn('Code action provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const codeLensModule = require('./codeLensProvider');
        KipCodeLensProvider = codeLensModule.KipCodeLensProvider;
    } catch (e) {
        if (DEBUG) console.warn('Code lens provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const symbolModule = require('./symbolProvider');
        KipSymbolProvider = symbolModule.KipSymbolProvider;
    } catch (e) {
        if (DEBUG) console.warn('Symbol provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const workspaceSymbolModule = require('./workspaceSymbolProvider');
        KipWorkspaceSymbolProvider = workspaceSymbolModule.KipWorkspaceSymbolProvider;
    } catch (e) {
        if (DEBUG) console.warn('Workspace symbol provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const semanticModule = require('./semanticProvider');
        SemanticProvider = semanticModule.SemanticProvider;
    } catch (e) {
        if (DEBUG) console.warn('Semantic provider not available:', e instanceof Error ? e.message : String(e));
    }
    
    try {
        const semanticTokensModule = require('./semanticTokensProvider');
        KipSemanticTokensProvider = semanticTokensModule.KipSemanticTokensProvider;
    } catch (e) {
        if (DEBUG) console.warn('Semantic tokens provider not available:', e instanceof Error ? e.message : String(e));
    }
} catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('LSP module not available:', errMsg);
}

// Output channel for logging
let outputChannel: vscode.OutputChannel | null = null;
function log(message: string, ...args: any[]): void {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        const logMessage = `[Extension ${timestamp}] ${message}${args.length > 0 ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') : ''}`;
        console.log(logMessage);
        if (outputChannel) {
            outputChannel.appendLine(logMessage);
        }
    }
}

function logError(message: string, error: any): void {
    const timestamp = new Date().toISOString();
    const errorMessage = `[Extension ${timestamp}] ERROR: ${message}`;
    
    console.error(errorMessage);
    if (outputChannel) {
        outputChannel.appendLine(errorMessage);
    }
    
    if (error instanceof Error) {
        const details = `  Message: ${error.message}${DEBUG ? `\n  Stack: ${error.stack}` : ''}`;
        console.error(details);
        if (outputChannel) {
            outputChannel.appendLine(details);
        }
    } else {
        const details = `  Error object: ${JSON.stringify(error, null, 2)}`;
        console.error(details);
        if (outputChannel) {
            outputChannel.appendLine(details);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Create output channel for logging
    outputChannel = vscode.window.createOutputChannel('Kip Language Server');
    if (DEBUG) {
        outputChannel.show(true);
    }
    context.subscriptions.push(outputChannel);
    
    log('Extension activation started');

    const kipSelector: vscode.DocumentSelector = { scheme: 'file', language: 'kip' };

    // ============================================
    // FAZ 1: CRITICAL - Run Command (En Öncelikli)
    // ============================================
    const kipRunner = new KipRunner(context);
    const runCommand = vscode.commands.registerCommand('kip.runFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active Kip file');
            return;
        }

        if (editor.document.languageId !== 'kip') {
            vscode.window.showErrorMessage('Current file is not a Kip file');
            return;
        }

        await kipRunner.runFile(editor.document);
    });
    context.subscriptions.push(runCommand, kipRunner);

    // ============================================
    // FAZ 2: LSP Server Başlatma (Zorunlu)
    // ============================================
    // Tüm özellikler LSP üzerinden çalışacak - fallback yok
    let lspClient: LanguageClientType | null = null;
    let lspWorking = false;
    
    if (LanguageClient && TransportKind) {
        log('LSP module available, initializing LSP...');
        try {
            lspClient = initializeLSP(context, kipSelector);
            
            if (lspClient) {
                log('LSP client created successfully');
                
                // LSP client'ı context'e ekle (cleanup için)
                context.subscriptions.push(lspClient);
                
                // LSP başlatma promise'ini yakala
                const client = lspClient;
                const startTime = Date.now();
                
                // Add event listeners for debugging
                if (DEBUG) {
                    client.onDidChangeState((e) => {
                        log(`LSP client state changed: ${e.oldState} -> ${e.newState}`);
                    });
                }
                
                // Monitor for errors
                (client as any).onError?.((error: Error, message: any, count: number) => {
                    logError(`LSP client error (count: ${count})`, error);
                });
                
                // Add timeout to detect if start hangs
                const startTimeout = setTimeout(() => {
                    log(`WARNING: client.start() has been running for 10 seconds without completion`);
                }, 10000);
                
                client.start().then(() => {
                    clearTimeout(startTimeout);
                    const duration = Date.now() - startTime;
                    lspWorking = true;
                    log(`LSP started successfully in ${duration}ms`);
                    
                    // LSP provider'larını kayıt et
                    registerLSPProviders(context, kipSelector, client);
                }).catch((err: unknown) => {
                    const duration = Date.now() - startTime;
                    lspWorking = false;
                    logError(`LSP failed to start after ${duration}ms`, err);
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Kip LSP server failed to start: ${errorMsg}`);
                    outputChannel?.show(true);
                });
            } else {
                logError('LSP client is null - initializeLSP returned null', null);
            }
        } catch (err) {
            logError('LSP initialization failed - LSP is required', err);
            vscode.window.showErrorMessage('Kip LSP server could not be started. Extension features will not work.');
        }
    } else {
        logError('LSP module not available - LSP is required', null);
        vscode.window.showErrorMessage('LSP module not available. Extension features will not work.');
    }

    // ============================================
    // FAZ 3: Diagnostics (LSP Only)
    // ============================================
    // Diagnostics LSP server tarafından sağlanacak
    // Fallback diagnostic provider yok - sadece LSP kullanılıyor
    
    log('Extension activation completed');
}

// updateProvidersWithLSP removed - all providers are LSP-only now

/**
 * LSP provider'larını kayıt eder (LSP başarıyla başladığında çağrılır)
 */
function registerLSPProviders(
    context: vscode.ExtensionContext,
    kipSelector: vscode.DocumentSelector,
    lspClient: LanguageClientType
): void {
    if (!SemanticProvider || !LanguageClient) {
        if (DEBUG) console.warn('LSP providers not available');
        return;
    }

    try {

        // Semantic Provider oluştur (LSP server'dan semantic tokens alır)
        const semanticProvider = new SemanticProvider(lspClient);
        
        // Hover Provider - Sadece LSP kullanır
        if (KipHoverProvider) {
            const hoverProvider = vscode.languages.registerHoverProvider(
                kipSelector,
                new KipHoverProvider(lspClient)
            );
            context.subscriptions.push(hoverProvider);
        }
        
        // Completion Provider
        if (KipCompletionProvider) {
            const completionProvider = vscode.languages.registerCompletionItemProvider(
                kipSelector,
                new KipCompletionProvider(lspClient),
                '-', '\''
            );
            context.subscriptions.push(completionProvider);
        }
        
        // Formatting Provider
        if (KipFormattingProvider) {
            const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
                kipSelector,
                new KipFormattingProvider(lspClient)
            );
            context.subscriptions.push(formattingProvider);
        }

        // Definition Provider
        if (KipDefinitionProvider) {
            const definitionProvider = vscode.languages.registerDefinitionProvider(
                kipSelector,
                new KipDefinitionProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(definitionProvider);
        }

        // Reference Provider
        if (KipReferenceProvider) {
            const referenceProvider = vscode.languages.registerReferenceProvider(
                kipSelector,
                new KipReferenceProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(referenceProvider);
        }

        // Document Highlight Provider
        if (KipDocumentHighlightProvider) {
            const highlightProvider = vscode.languages.registerDocumentHighlightProvider(
                kipSelector,
                new KipDocumentHighlightProvider(semanticProvider)
            );
            context.subscriptions.push(highlightProvider);
        }

        // Rename Provider
        if (KipRenameProvider) {
            const renameProvider = vscode.languages.registerRenameProvider(
                kipSelector,
                new KipRenameProvider(lspClient)
            );
            context.subscriptions.push(renameProvider);
        }

        // Code Action Provider
        if (KipCodeActionProvider) {
            const codeActionProvider = vscode.languages.registerCodeActionsProvider(
                kipSelector,
                new KipCodeActionProvider(lspClient),
                {
                    providedCodeActionKinds: [
                        vscode.CodeActionKind.QuickFix,
                        vscode.CodeActionKind.Refactor,
                        vscode.CodeActionKind.RefactorExtract
                    ]
                }
            );
            context.subscriptions.push(codeActionProvider);
        }

        // Code Lens Provider
        if (KipCodeLensProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableCodeLens', true)) {
                const codeLensProvider = new KipCodeLensProvider(lspClient, semanticProvider);
                const codeLensDisposable = vscode.languages.registerCodeLensProvider(
                    kipSelector,
                    codeLensProvider
                );
                context.subscriptions.push(codeLensDisposable);
            }
        }

        // Document Symbol Provider
        if (KipSymbolProvider) {
            const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
                kipSelector,
                new KipSymbolProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(symbolProvider);
        }

        // Workspace Symbol Provider
        if (KipWorkspaceSymbolProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableWorkspaceSymbols', true)) {
                const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider(
                    new KipWorkspaceSymbolProvider(lspClient, semanticProvider)
                );
                context.subscriptions.push(workspaceSymbolProvider);
            }
        }

        // Semantic Tokens Provider
        if (KipSemanticTokensProvider) {
            const semanticTokensProvider = new KipSemanticTokensProvider(semanticProvider);
            const semanticTokensDisposable = vscode.languages.registerDocumentSemanticTokensProvider(
                kipSelector,
                semanticTokensProvider,
                semanticTokensProvider.getLegend()
            );
            context.subscriptions.push(semanticTokensDisposable);
        }
    } catch (err) {
        logError('Error registering LSP providers', err);
    }
}

function initializeLSP(context: vscode.ExtensionContext, kipSelector: vscode.DocumentSelector): LanguageClientType | null {
    log('initializeLSP called');
    const path = require('path');
    const fs = require('fs');

    // Use our own TypeScript LSP server
    const serverPath = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    log(`Server path: ${serverPath}`);

    // Check if server exists
    if (!fs.existsSync(serverPath)) {
        logError('LSP server not found', { path: serverPath });
        return null;
    }

    if (!TransportKind) {
        logError('TransportKind not available', null);
        return null;
    }

    // Use Node.js to run our TypeScript LSP server
    const serverExecutable = {
        command: 'node',
        args: [serverPath],
        transport: TransportKind.stdio,
        options: {
            env: {
                ...process.env,
                NODE_ENV: process.env.NODE_ENV || 'production'
            }
        }
    };

    const serverOptions = {
        run: serverExecutable,
        debug: serverExecutable
    };

    // LSP options for our TypeScript LSP server
    const clientOptions: any = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        synchronize: {
            fileEvents: []
        },
        initializationOptions: {},
        outputChannel: outputChannel
    };
    
    // Set trace level
    if (DEBUG) {
        try {
            const TraceEnum = require('vscode-languageclient/node').Trace;
            if (TraceEnum && TraceEnum.Verbose !== undefined) {
                clientOptions.trace = TraceEnum.Verbose;
            } else if (TraceEnum && TraceEnum.Messages !== undefined) {
                clientOptions.trace = TraceEnum.Messages;
            }
        } catch (e) {
            // Ignore trace setting errors
        }
    }

    if (!LanguageClient) {
        logError('LanguageClient not available', null);
        return null;
    }

    try {
        const client = new LanguageClient(
            'kipLanguageServer',
            'Kip Language Server',
            serverOptions,
            clientOptions
        );
        log('LanguageClient instance created');
        return client;
    } catch (error) {
        logError('Failed to create LanguageClient', error);
        return null;
    }
}

export function deactivate() {
    // Cleanup if needed
}
