import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * LSP diagnostic'lerinden code actions türetir
 * Note: kip-lsp may not support textDocument/codeAction, derives from diagnostics
 */
export class KipCodeActionProvider implements vscode.CodeActionProvider {
    private client: LanguageClient;

    constructor(client: LanguageClient) {
        this.client = client;
    }

    async provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        // LSP client'ın hazır olup olmadığını kontrol et
        if (!this.isClientReady()) {
            console.log('LSP client not ready, deriving code actions from diagnostics');
            return this.getFallbackCodeActions(document, range, context);
        }

        // Önce LSP'den code actions iste
        try {
            const result = await this.client.sendRequest('textDocument/codeAction', {
                textDocument: {
                    uri: document.uri.toString()
                },
                range: {
                    start: {
                        line: range.start.line,
                        character: range.start.character
                    },
                    end: {
                        line: range.end.line,
                        character: range.end.character
                    }
                },
                context: {
                    diagnostics: context.diagnostics.map(d => ({
                        range: {
                            start: { line: d.range.start.line, character: d.range.start.character },
                            end: { line: d.range.end.line, character: d.range.end.character }
                        },
                        severity: d.severity,
                        code: d.code,
                        source: d.source,
                        message: d.message
                    })),
                    only: undefined
                }
            });

            if (result && Array.isArray(result)) {
                // LSP'den gelen code actions'ı dönüştür
                for (const action of result) {
                    if ('edit' in action || 'command' in action) {
                        const vscodeAction = this.convertCodeAction(action, document);
                        if (vscodeAction) {
                            actions.push(vscodeAction);
                        }
                    }
                }
            }
        } catch (error) {
            // LSP code actions yoksa, diagnostic'lerden türet
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('no handler') || errorMsg.includes('not supported')) {
                console.log('LSP code actions not supported by server, deriving from diagnostics');
            } else {
                console.warn('LSP code actions request failed:', errorMsg);
            }
        }

        return this.getFallbackCodeActions(document, range, context);
    }

    private isClientReady(): boolean {
        try {
            const clientState = (this.client as any).state;
            return clientState === 2; // Running
        } catch (e) {
            return false;
        }
    }

    private async getFallbackCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): Promise<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];

        // Diagnostic'lerden code actions türet
        for (const diagnostic of context.diagnostics) {
            const diagnosticActions = await this.deriveActionsFromDiagnostic(
                document,
                diagnostic,
                range
            );
            actions.push(...diagnosticActions);
        }

        // Seçili metin için refactoring actions
        if (!range.isEmpty) {
            const selectedText = document.getText(range);
            const refactoringActions = this.createRefactoringActions(document, range, selectedText);
            actions.push(...refactoringActions);
        }

        return actions;
    }

    private async deriveActionsFromDiagnostic(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        range: vscode.Range
    ): Promise<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];
        const message = diagnostic.message.toLowerCase();

        // Tanımsız değişken/fonksiyon hatası
        if (message.includes('tanımsız') || message.includes('undefined') || message.includes('bulunamadı')) {
            // Extract symbol name from diagnostic message or range
            const symbolName = this.extractSymbolName(document, diagnostic.range);
            
            if (symbolName) {
                // Eksik tanım ekle action'ı
                const action = new vscode.CodeAction(
                    `"${symbolName}" için tanım ekle`,
                    vscode.CodeActionKind.QuickFix
                );
                action.diagnostics = [diagnostic];
                action.edit = this.createDefinitionEdit(document, symbolName);
                actions.push(action);
            }
        }

        // Tip hatası
        if (message.includes('tip') || message.includes('type')) {
            const action = new vscode.CodeAction(
                'Tip hatasını düzelt',
                vscode.CodeActionKind.QuickFix
            );
            action.diagnostics = [diagnostic];
            // Tip düzeltme mantığı buraya eklenebilir
            actions.push(action);
        }

        return actions;
    }

    private extractSymbolName(document: vscode.TextDocument, range: vscode.Range): string | null {
        // Extract symbol name from document at range
        const text = document.getText(range);
        if (text && text.trim().length > 0) {
            return text.trim();
        }
        return null;
    }

    private createDefinitionEdit(
        document: vscode.TextDocument,
        symbolName: string
    ): vscode.WorkspaceEdit {
        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(0, 0);

        // Simple template - assume function
        const template = `(bu tip) ${symbolName},\n  durmaktır.\n\n`;

        edit.insert(document.uri, insertPosition, template);
        return edit;
    }

    private createRefactoringActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        selectedText: string
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // Extract function
        if (selectedText.split('\n').length >= 2) {
            const action = new vscode.CodeAction(
                'Fonksiyon olarak çıkar',
                vscode.CodeActionKind.RefactorExtract
            );
            action.command = {
                command: 'kip.extractFunction',
                title: 'Fonksiyon olarak çıkar',
                arguments: [document, range]
            };
            actions.push(action);
        }

        // Comment out
        const commentAction = new vscode.CodeAction(
            'Yorum satırına al',
            vscode.CodeActionKind.Refactor
        );
        const lines = selectedText.split('\n');
        const commentedLines = lines.map(line => 
            line.trim().startsWith('(*') ? line : `(* ${line} *)`
        ).join('\n');
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, commentedLines);
        commentAction.edit = edit;
        actions.push(commentAction);

        return actions;
    }

    private convertCodeAction(action: any, document: vscode.TextDocument): vscode.CodeAction | null {
        const vscodeAction = new vscode.CodeAction(
            action.title,
            action.kind ? vscode.CodeActionKind[action.kind as keyof typeof vscode.CodeActionKind] : vscode.CodeActionKind.QuickFix
        );

        if (action.edit) {
            const edit = new vscode.WorkspaceEdit();
            // LSP edit formatını VSCode formatına dönüştür
            if (action.edit.changes) {
                for (const [uri, textEdits] of Object.entries(action.edit.changes)) {
                    const edits = (textEdits as any[]).map((te: any) => new vscode.TextEdit(
                        new vscode.Range(
                            new vscode.Position(te.range.start.line, te.range.start.character),
                            new vscode.Position(te.range.end.line, te.range.end.character)
                        ),
                        te.newText
                    ));
                    edit.set(vscode.Uri.parse(uri), edits);
                }
            }
            vscodeAction.edit = edit;
        }

        if (action.command) {
            vscodeAction.command = action.command;
        }

        return vscodeAction;
    }
}
