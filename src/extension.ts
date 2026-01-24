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

try {
    console.log('🔄 Attempting to load LSP module...');
    const lspModule = require('vscode-languageclient/node');
    LanguageClient = lspModule.LanguageClient;
    TransportKind = lspModule.TransportKind;
    console.log('✅ LSP module loaded successfully');
    
    // LSP provider'larını yükle (her biri ayrı try-catch ile)
    // Not: Provider'lar LanguageClient'a bağımlı olduğu için sadece LSP modülü yüklendikten sonra yüklenebilir
    console.log('🔄 Attempting to load LSP providers...');
    
    try {
        console.log('🔄 Loading definition provider...');
        const definitionModule = require('./definitionProvider');
        KipDefinitionProvider = definitionModule.KipDefinitionProvider;
        console.log('✅ Definition provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : '';
        console.warn('⚠️ Definition provider not available:', errMsg);
        if (stack) console.warn('Stack:', stack);
    }
    
    try {
        console.log('🔄 Loading reference provider...');
        const referenceModule = require('./referenceProvider');
        KipReferenceProvider = referenceModule.KipReferenceProvider;
        KipDocumentHighlightProvider = referenceModule.KipDocumentHighlightProvider;
        console.log('✅ Reference provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Reference provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading rename provider...');
        const renameModule = require('./renameProvider');
        KipRenameProvider = renameModule.KipRenameProvider;
        console.log('✅ Rename provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Rename provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading code action provider...');
        const codeActionModule = require('./codeActionProvider');
        KipCodeActionProvider = codeActionModule.KipCodeActionProvider;
        console.log('✅ Code action provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Code action provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading code lens provider...');
        const codeLensModule = require('./codeLensProvider');
        KipCodeLensProvider = codeLensModule.KipCodeLensProvider;
        console.log('✅ Code lens provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Code lens provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading symbol provider...');
        const symbolModule = require('./symbolProvider');
        KipSymbolProvider = symbolModule.KipSymbolProvider;
        console.log('✅ Symbol provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Symbol provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading workspace symbol provider...');
        const workspaceSymbolModule = require('./workspaceSymbolProvider');
        KipWorkspaceSymbolProvider = workspaceSymbolModule.KipWorkspaceSymbolProvider;
        console.log('✅ Workspace symbol provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Workspace symbol provider not available:', errMsg);
    }
    
    try {
        console.log('🔄 Loading semantic provider...');
        const semanticModule = require('./semanticProvider');
        SemanticProvider = semanticModule.SemanticProvider;
        console.log('✅ Semantic provider loaded');
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('⚠️ Semantic provider not available:', errMsg);
    }
    
    console.log('✅ LSP providers loaded successfully');
} catch (err) {
    console.warn('⚠️ LSP module not available, extension will work without LSP features');
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : '';
    console.warn('⚠️ LSP error details:', errMsg);
    if (errStack) {
        console.warn('⚠️ LSP error stack:', errStack);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Kip Language Support extension is now active!');

    const kipSelector: vscode.DocumentSelector = { scheme: 'file', language: 'kip' };

    // ============================================
    // FAZ 1: CRITICAL - Run Command (En Öncelikli)
    // ============================================
    const kipRunner = new KipRunner(context);
    const runCommand = vscode.commands.registerCommand('kip.runFile', async () => {
        console.log('kip.runFile command executed');
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
    console.log('✅ kip.runFile command registered successfully');

    // ============================================
    // FAZ 2: Temel Özellikler (LSP Olmadan)
    // ============================================
    
    // Hover Provider - Builtin dokümantasyon
    const hoverProvider = vscode.languages.registerHoverProvider(
        kipSelector,
        new KipHoverProvider()
    );
    context.subscriptions.push(hoverProvider);
    console.log('✅ Hover Provider registered');

    // Completion Provider - Builtin öneriler
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        kipSelector,
        new KipCompletionProvider(),
        '.', '\'', ' '
    );
    context.subscriptions.push(completionProvider);
    console.log('✅ Completion Provider registered');

    // Formatting Provider
    const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
        kipSelector,
        new KipFormattingProvider()
    );
    const rangeFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
        kipSelector,
        new KipFormattingProvider()
    );
    context.subscriptions.push(formattingProvider, rangeFormattingProvider);
    console.log('✅ Formatting Provider registered');

    console.log('✅ All basic features registered successfully');

    // ============================================
    // FAZ 3: LSP Entegrasyonu (Opsiyonel)
    // ============================================
    let lspClient: LanguageClientType | null = null;
    let lspWorking = false;
    
    if (LanguageClient && TransportKind) {
        try {
            lspClient = initializeLSP(context, kipSelector);
            console.log('✅ LSP initialization started');
            
            // LSP client'ı context'e ekle (cleanup için)
            if (lspClient) {
                context.subscriptions.push(lspClient);
                
                // LSP başlatma promise'ini yakala
                lspClient.start().then(() => {
                    lspWorking = true;
                    console.log('✅ LSP is ready and working');
                    
                    // LSP provider'larını kayıt et
                    registerLSPProviders(context, kipSelector, lspClient!);
                }).catch((err) => {
                    lspWorking = false;
                    console.warn('⚠️ LSP failed to start:', err);
                });
            }
        } catch (err) {
            console.warn('⚠️ LSP initialization failed, continuing without LSP:', err);
        }
    } else {
        console.log('ℹ️ LSP not available, extension working in basic mode');
    }

    // ============================================
    // FAZ 3.5: Fallback Diagnostics (LSP yoksa)
    // ============================================
    const diagnosticProvider = new KipDiagnosticProvider();
    context.subscriptions.push(diagnosticProvider);

    // Aktif belgeyi hemen kontrol et
    if (vscode.window.activeTextEditor?.document.languageId === 'kip') {
        diagnosticProvider.validateDocument(vscode.window.activeTextEditor.document);
    }

    // Belge açıldığında kontrol et
    const onOpenDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'kip') {
            diagnosticProvider.validateDocument(document);
        }
    });
    context.subscriptions.push(onOpenDisposable);

    // Belge değiştiğinde kontrol et
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'kip') {
            diagnosticProvider.validateDocument(event.document);
        }
    });
    context.subscriptions.push(onChangeDisposable);

    // Belge kapatıldığında diagnostics'i temizle
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === 'kip') {
            diagnosticProvider.clearDiagnostics(document);
        }
    });
    context.subscriptions.push(onCloseDisposable);

    console.log('✅ Fallback Diagnostic Provider registered');

    // ============================================
    // FAZ 4: Gelişmiş Özellikler (LSP Opsiyonel)
    // ============================================
    // Bu özellikler LSP olmadan da çalışabilir (basit versiyonları)
    // LSP başarılı olduğunda registerLSPProviders fonksiyonu çağrılacak
    console.log('✅ Extension activation completed successfully');
}

/**
 * LSP provider'larını kayıt eder (LSP başarıyla başladığında çağrılır)
 */
function registerLSPProviders(
    context: vscode.ExtensionContext,
    kipSelector: vscode.DocumentSelector,
    lspClient: LanguageClientType
): void {
    if (!SemanticProvider || !LanguageClient) {
        console.warn('⚠️ LSP providers not available');
        return;
    }

    try {
        // Semantic Provider oluştur (diğer provider'lar bunu kullanır)
        const semanticProvider = new SemanticProvider(lspClient);

        // Definition Provider
        if (KipDefinitionProvider) {
            const definitionProvider = vscode.languages.registerDefinitionProvider(
                kipSelector,
                new KipDefinitionProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(definitionProvider);
            console.log('✅ Definition Provider registered');
        }

        // Reference Provider
        if (KipReferenceProvider) {
            const referenceProvider = vscode.languages.registerReferenceProvider(
                kipSelector,
                new KipReferenceProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(referenceProvider);
            console.log('✅ Reference Provider registered');
        }

        // Document Highlight Provider
        if (KipDocumentHighlightProvider) {
            const highlightProvider = vscode.languages.registerDocumentHighlightProvider(
                kipSelector,
                new KipDocumentHighlightProvider(semanticProvider)
            );
            context.subscriptions.push(highlightProvider);
            console.log('✅ Document Highlight Provider registered');
        }

        // Rename Provider
        if (KipRenameProvider) {
            const renameProvider = vscode.languages.registerRenameProvider(
                kipSelector,
                new KipRenameProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(renameProvider);
            console.log('✅ Rename Provider registered');
        }

        // Code Action Provider
        if (KipCodeActionProvider) {
            const codeActionProvider = vscode.languages.registerCodeActionsProvider(
                kipSelector,
                new KipCodeActionProvider(lspClient, semanticProvider),
                {
                    providedCodeActionKinds: [
                        vscode.CodeActionKind.QuickFix,
                        vscode.CodeActionKind.Refactor,
                        vscode.CodeActionKind.RefactorExtract
                    ]
                }
            );
            context.subscriptions.push(codeActionProvider);
            console.log('✅ Code Action Provider registered');
        }

        // Code Lens Provider (kip.enableCodeLens ayarına göre)
        if (KipCodeLensProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableCodeLens', true)) {
                const codeLensProvider = new KipCodeLensProvider(lspClient, semanticProvider);
                const codeLensDisposable = vscode.languages.registerCodeLensProvider(
                    kipSelector,
                    codeLensProvider
                );
                context.subscriptions.push(codeLensDisposable);
                console.log('✅ Code Lens Provider registered');
            }
        }

        // Document Symbol Provider (Outline için)
        if (KipSymbolProvider) {
            const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
                kipSelector,
                new KipSymbolProvider(lspClient, semanticProvider)
            );
            context.subscriptions.push(symbolProvider);
            console.log('✅ Document Symbol Provider registered');
        }

        // Workspace Symbol Provider (Ctrl+T için)
        if (KipWorkspaceSymbolProvider) {
            const config = vscode.workspace.getConfiguration('kip');
            if (config.get<boolean>('enableWorkspaceSymbols', true)) {
                const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider(
                    new KipWorkspaceSymbolProvider(lspClient, semanticProvider)
                );
                context.subscriptions.push(workspaceSymbolProvider);
                console.log('✅ Workspace Symbol Provider registered');
            }
        }

        console.log('✅ All LSP providers registered successfully');
    } catch (err) {
        console.error('❌ Error registering LSP providers:', err);
    }
}

function initializeLSP(context: vscode.ExtensionContext, kipSelector: vscode.DocumentSelector): LanguageClientType | null {
    const path = require('path');
    const fs = require('fs');

    // Helper to find the server executable
    const findServerPath = (): string => {
        const bundledPath = context.asAbsolutePath(path.join('bin', 'kip-lsp'));
        if (fs.existsSync(bundledPath)) {
            try {
                fs.chmodSync(bundledPath, '755');
            } catch (e) {
                console.error('Failed to chmod bundled binary:', e);
            }
            return bundledPath;
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
    const fsmPath = context.asAbsolutePath('trmorph.fst');

    if (!TransportKind) {
        return null;
    }

    const serverExecutable = {
        command: serverPath,
        args: ['--fsm', fsmPath],
        transport: TransportKind.stdio
    };

    const serverOptions = {
        run: serverExecutable,
        debug: serverExecutable
    };

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    if (!LanguageClient) {
        return null;
    }

    const client = new LanguageClient(
        'kipLanguageServer',
        'Kip Language Server',
        serverOptions,
        clientOptions
    );

    // Start LSP asynchronously, don't block extension activation
    client.start().then(() => {
        console.log('✅ Kip LSP started successfully');
    }).catch((err: unknown) => {
        console.warn('⚠️ Kip LSP could not be started:', err);
        console.log('ℹ️ Extension continues to work without LSP');
    });

    return client;
}

export function deactivate() {
    // Cleanup if needed
}
