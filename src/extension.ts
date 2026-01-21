import * as vscode from 'vscode';
import { KipHoverProvider } from './hoverProvider';
import { KipCompletionProvider } from './completionProvider';
import { KipRunner } from './kipRunner';

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

    context.subscriptions.push(hoverProvider, completionProvider, runCommand, kipRunner);
}

export function deactivate() {
    console.log('Kip Language Support extension is now deactivated.');
}
