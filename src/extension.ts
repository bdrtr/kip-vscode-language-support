import * as vscode from 'vscode';
import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipRunner } from './kipRunner';
import { KipDiagnosticProvider } from './diagnosticProvider';
import { KipDefinitionProvider } from './definitionProvider';
import { KipFormattingProvider } from './formattingProvider';
import { KipSymbolProvider } from './symbolProvider';
import { KipReferenceProvider, KipDocumentHighlightProvider } from './referenceProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Kip Language Support extension is now active!');

    // Kip dili için selector
    const kipSelector: vscode.DocumentSelector = { scheme: 'file', language: 'kip' };

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

    // Diagnostic Provider - Real-time error checking
    const diagnosticProvider = new KipDiagnosticProvider();

    // Definition Provider - Go to Definition (F12)
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        kipSelector,
        new KipDefinitionProvider()
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

    // Symbol Provider - Outline view, breadcrumbs, Ctrl+Shift+O
    const symbolProvider = vscode.languages.registerDocumentSymbolProvider(
        kipSelector,
        new KipSymbolProvider()
    );

    // Reference Provider - Find All References (Shift+F12)
    const referenceProvider = vscode.languages.registerReferenceProvider(
        kipSelector,
        new KipReferenceProvider()
    );

    // Document Highlight Provider - Highlight references
    const highlightProvider = vscode.languages.registerDocumentHighlightProvider(
        kipSelector,
        new KipDocumentHighlightProvider()
    );

    context.subscriptions.push(
        hoverProvider,
        completionProvider,
        runCommand,
        kipRunner,
        diagnosticProvider,
        definitionProvider,
        formattingProvider,
        rangeFormattingProvider,
        symbolProvider,
        referenceProvider,
        highlightProvider
    );
}

export function deactivate() {
    console.log('Kip Language Support extension is now deactivated.');
}
