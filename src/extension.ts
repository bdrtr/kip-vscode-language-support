import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
    Executable
} from 'vscode-languageclient/node';
import * as path from 'path';
import * as fs from 'fs';

import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipRunner } from './kipRunner';
import { KipDefinitionProvider } from './definitionProvider';
import { KipFormattingProvider } from './formattingProvider';
import { KipSymbolProvider } from './symbolProvider';
import { KipReferenceProvider, KipDocumentHighlightProvider } from './referenceProvider';
import { KipRenameProvider } from './renameProvider';
import { KipCodeActionProvider } from './codeActionProvider';
import { KipWorkspaceSymbolProvider } from './workspaceSymbolProvider';
import { KipCodeLensProvider } from './codeLensProvider';
import { SemanticProvider } from './semanticProvider';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
    console.log('Kip Language Support extension is now active!');

    // Kip dili için selector
    const kipSelector: vscode.DocumentSelector = { scheme: 'file', language: 'kip' };

    // --- LSP SETUP ---
    // Helper to find the server executable
    const findServerPath = (): string => {
        // 1. Check bundled binary in extension folder
        const bundledPath = context.asAbsolutePath(path.join('bin', 'kip-lsp'));
        if (fs.existsSync(bundledPath)) {
            // Ensure it's executable
            try {
                fs.chmodSync(bundledPath, '755');
            } catch (e) {
                console.error('Failed to chmod bundled binary:', e);
            }
            return bundledPath;
        }

        // 2. Check local installation
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const localBinPath = path.join(homeDir, '.local', 'bin', 'kip-lsp');
            if (fs.existsSync(localBinPath)) {
                return localBinPath;
            }
        }

        // 3. Fallback to PATH
        return 'kip-lsp';
    };

    const serverPath = findServerPath();
    const fsmPath = context.asAbsolutePath('trmorph.fst');

    // Debug log
    console.log(`Using Kip LSP at: ${serverPath}`);
    console.log(`Using FSM at: ${fsmPath}`);

    const serverExecutable: Executable = {
        command: serverPath,
        args: ['--fsm', fsmPath],
        transport: TransportKind.stdio
    };

    const serverOptions: ServerOptions = {
        run: serverExecutable,
        debug: serverExecutable
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'kip' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client
    client = new LanguageClient(
        'kipLanguageServer',
        'Kip Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client and initialize providers after it's ready
    client.start().then(() => {
        initializeProviders();
    }).catch(err => {
        vscode.window.showErrorMessage(`Kip LSP could not be started: ${err}`);
        console.error('LSP Start Error:', err);
        // Even if LSP fails, initialize providers with fallback mode
        initializeProviders();
    });

    function initializeProviders() {
        // Semantic Provider - LSP'den semantic bilgileri alır
        const semanticProvider = new SemanticProvider(client);

        // Hover Provider'ı kaydet
        const hoverProvider = vscode.languages.registerHoverProvider(
            kipSelector,
            new KipHoverProvider()
        );

        // Completion Provider'ı kaydet
        const completionProvider = vscode.languages.registerCompletionItemProvider(
            kipSelector,
            new KipCompletionProvider(),
            '.', // Trigger character: nokta
            '\'', // Trigger character: apostrof (hal ekleri için)
            ' '  // Trigger character: boşluk
        );

        // Kip Runner - Run current file
        const kipRunner = new KipRunner();
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

        // Definition Provider - Go to Definition (F12) - LSP semantic kullanır
        const definitionProvider = vscode.languages.registerDefinitionProvider(
            kipSelector,
            new KipDefinitionProvider(client, semanticProvider)
        );

        // Formatting Provider - Format Document (Shift+Alt+F)
        const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
            kipSelector,
            new KipFormattingProvider()
        );

        const rangeFormattingProvider = vscode.languages.registerDocumentRangeFormattingEditProvider(
            kipSelector,
            new KipFormattingProvider()
        );

        // Symbol Provider - Outline view, breadcrumbs, Ctrl+Shift+O - LSP semantic kullanır
        const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
            kipSelector,
            new KipSymbolProvider(client, semanticProvider)
        );

        // Reference Provider - Find All References (Shift+F12) - LSP semantic kullanır
        const referenceProvider = vscode.languages.registerReferenceProvider(
            kipSelector,
            new KipReferenceProvider(client, semanticProvider)
        );

        // Document Highlight Provider - Highlight references - LSP semantic kullanır
        const highlightProvider = vscode.languages.registerDocumentHighlightProvider(
            kipSelector,
            new KipDocumentHighlightProvider(semanticProvider)
        );

        // Rename Provider - F2 to rename - LSP semantic kullanır
        const renameProvider = vscode.languages.registerRenameProvider(
            kipSelector,
            new KipRenameProvider(client, semanticProvider)
        );

        // Code Action Provider - Quick fixes and refactorings - LSP diagnostic kullanır
        const codeActionProvider = vscode.languages.registerCodeActionsProvider(
            kipSelector,
            new KipCodeActionProvider(client, semanticProvider),
            {
                providedCodeActionKinds: [
                    vscode.CodeActionKind.QuickFix,
                    vscode.CodeActionKind.Refactor,
                    vscode.CodeActionKind.RefactorExtract
                ]
            }
        );

        // Workspace Symbol Provider - Ctrl+T for workspace symbol search - LSP semantic kullanır
        const workspaceSymbolProviderInstance = new KipWorkspaceSymbolProvider(client, semanticProvider);
        const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider(
            workspaceSymbolProviderInstance
        );

        // Code Lens Provider - Show reference counts - LSP semantic kullanır
        const codeLensProviderInstance = new KipCodeLensProvider(client, semanticProvider);
        const codeLensProvider = vscode.languages.registerCodeLensProvider(
            kipSelector,
            codeLensProviderInstance
        );

        // Format on Save
        const formatOnSave = vscode.workspace.onWillSaveTextDocument((event) => {
            const config = vscode.workspace.getConfiguration('kip', event.document.uri);
            if (config.get<boolean>('formatOnSave', false) && event.document.languageId === 'kip') {
                event.waitUntil(
                    vscode.commands.executeCommand('editor.action.formatDocument')
                );
            }
        });

        // Command: Show references (for code lens)
        const showReferencesCommand = vscode.commands.registerCommand('kip.showReferences', async (uri: vscode.Uri, position: vscode.Position) => {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.selection = new vscode.Selection(position, position);
                await vscode.commands.executeCommand('editor.action.referenceSearch.trigger');
            }
        });

        // Command: Extract function (for code actions)
        const extractFunctionCommand = vscode.commands.registerCommand('kip.extractFunction', async (document: vscode.TextDocument, range: vscode.Range) => {
            const selectedText = document.getText(range);
            const functionName = await vscode.window.showInputBox({
                prompt: 'Fonksiyon adı girin',
                placeHolder: 'yeni-fonksiyon'
            });

            if (!functionName) {
                return;
            }

            // Simple extraction - in a real implementation, this would be more sophisticated
            const edit = new vscode.WorkspaceEdit();
            const functionDefinition = `(bu tip) ${functionName},\n  ${selectedText.trim()}.\n\n`;
            
            // Insert function definition before the selection
            edit.insert(document.uri, range.start, functionDefinition);
            
            // Replace selection with function call
            edit.replace(document.uri, range, `${functionName}.`);
            
            await vscode.workspace.applyEdit(edit);
        });

        // Watch for file changes to refresh semantic cache
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.kip');
        fileWatcher.onDidChange((uri) => {
            // Clear semantic cache when files change
            semanticProvider.clearCache(uri);
            // Refresh code lenses
            codeLensProviderInstance.refresh();
        });
        fileWatcher.onDidCreate((uri) => {
            semanticProvider.clearCache(uri);
            codeLensProviderInstance.refresh();
        });
        fileWatcher.onDidDelete((uri) => {
            semanticProvider.clearCache(uri);
            codeLensProviderInstance.refresh();
        });

        // Watch for configuration changes
        const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('kip.enableCodeLens')) {
                codeLensProviderInstance.refresh();
            }
        });

        context.subscriptions.push(
            hoverProvider,
            completionProvider,
            runCommand,
            kipRunner,
            definitionProvider,
            formattingProvider,
            rangeFormattingProvider,
            symbolProvider,
            referenceProvider,
            highlightProvider,
            renameProvider,
            codeActionProvider,
            workspaceSymbolProvider,
            codeLensProvider,
            showReferencesCommand,
            extractFunctionCommand,
            fileWatcher,
            formatOnSave,
            configWatcher
        );
    }
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
