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
        // Definition provider not available
    }
    
    try {
        const referenceModule = require('./referenceProvider');
        KipReferenceProvider = referenceModule.KipReferenceProvider;
        KipDocumentHighlightProvider = referenceModule.KipDocumentHighlightProvider;
    } catch (e) {
        // Reference provider not available
    }
    
    try {
        const renameModule = require('./renameProvider');
        KipRenameProvider = renameModule.KipRenameProvider;
    } catch (e) {
        // Rename provider not available
    }
    
    try {
        const codeActionModule = require('./codeActionProvider');
        KipCodeActionProvider = codeActionModule.KipCodeActionProvider;
    } catch (e) {
        // Code action provider not available
    }
    
    try {
        const codeLensModule = require('./codeLensProvider');
        KipCodeLensProvider = codeLensModule.KipCodeLensProvider;
    } catch (e) {
        // Code lens provider not available
    }
    
    try {
        const symbolModule = require('./symbolProvider');
        KipSymbolProvider = symbolModule.KipSymbolProvider;
    } catch (e) {
        // Symbol provider not available
    }
    
    try {
        const workspaceSymbolModule = require('./workspaceSymbolProvider');
        KipWorkspaceSymbolProvider = workspaceSymbolModule.KipWorkspaceSymbolProvider;
    } catch (e) {
        // Workspace symbol provider not available
    }
    
    try {
        const semanticModule = require('./semanticProvider');
        SemanticProvider = semanticModule.SemanticProvider;
    } catch (e) {
        // Semantic provider not available
    }
    
    try {
        const semanticTokensModule = require('./semanticTokensProvider');
        KipSemanticTokensProvider = semanticTokensModule.KipSemanticTokensProvider;
    } catch (e) {
        // Semantic tokens provider not available
    }
} catch (err) {
    // LSP module not available
}

// Output channel for errors only
let outputChannel: vscode.OutputChannel | null = null;

function logError(message: string, error: any): void {
    // Only log critical errors to output channel
    if (!outputChannel) return;
    
    const errorMessage = `ERROR: ${message}`;
    outputChannel.appendLine(errorMessage);
    
    if (error instanceof Error) {
        outputChannel.appendLine(`  Message: ${error.message}`);
    } else {
        outputChannel.appendLine(`  Error: ${String(error)}`);
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Create output channel for errors only
    outputChannel = vscode.window.createOutputChannel('Kip Language Server');
    context.subscriptions.push(outputChannel);

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
    
    if (LanguageClient && TransportKind) {
        try {
            lspClient = initializeLSP(context, kipSelector);
            
            if (lspClient) {
                // LSP client'ı context'e ekle (cleanup için)
                context.subscriptions.push(lspClient);
                
                // LSP başlatma promise'ini yakala
                const client = lspClient;
                
                // Monitor for errors
                (client as any).onError?.((error: Error, message: any, count: number) => {
                    logError(`LSP client error (count: ${count})`, error);
                });
                
                client.start().then(() => {
                    // LSP provider'larını kayıt et
                    registerLSPProviders(context, kipSelector, client);
                }).catch((err: unknown) => {
                    logError('LSP failed to start', err);
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
    const path = require('path');
    const fs = require('fs');

    // Use our own TypeScript LSP server
    const serverPath = context.asAbsolutePath(path.join('out', 'server', 'server.js'));

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
    
    // Trace disabled in production

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
        return client;
    } catch (error) {
        logError('Failed to create LanguageClient', error);
        return null;
    }
}

export function deactivate() {
    // Cleanup if needed
}
