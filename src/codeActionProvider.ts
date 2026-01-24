import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP diagnostic'lerinden code actions türetir
 */
export class KipCodeActionProvider implements vscode.CodeActionProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
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
            const symbol = await this.semanticProvider.findSymbolAtPosition(
                document,
                diagnostic.range.start
            );

            if (symbol) {
                // Eksik tanım ekle action'ı
                const action = new vscode.CodeAction(
                    `"${symbol.name}" için tanım ekle`,
                    vscode.CodeActionKind.QuickFix
                );
                action.diagnostics = [diagnostic];
                action.edit = await this.createDefinitionEdit(document, symbol);
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

    private async createDefinitionEdit(
        document: vscode.TextDocument,
        symbol: { name: string; kind: vscode.SymbolKind; range: vscode.Range; type: string }
    ): Promise<vscode.WorkspaceEdit> {
        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(0, 0);

        // Semantic bilgilerine göre uygun template oluştur
        let template = '';
        if (symbol.kind === vscode.SymbolKind.Function) {
            template = `(bu tip) ${symbol.name},\n  durmaktır.\n\n`;
        } else if (symbol.kind === vscode.SymbolKind.Variable) {
            template = `0'a ${symbol.name} diyelim.\n\n`;
        } else if (symbol.kind === vscode.SymbolKind.Class) {
            template = `Bir ${symbol.name} ya değer olabilir.\n\n`;
        }

        if (template) {
            edit.insert(document.uri, insertPosition, template);
        }

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
