import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * LSP kullanarak references sağlar
 * Note: kip-lsp may not support textDocument/references, returns empty if not available
 */
export class KipReferenceProvider implements vscode.ReferenceProvider {
    private client: LanguageClient;

    constructor(client: LanguageClient) {
        this.client = client;
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        // kip-lsp may not support textDocument/references
        try {
            const result = await this.client.sendRequest('textDocument/references', {
                textDocument: {
                    uri: document.uri.toString()
                },
                position: {
                    line: position.line,
                    character: position.character
                },
                context: {
                    includeDeclaration: context.includeDeclaration
                }
            });

            if (result && Array.isArray(result)) {
                return result.map(loc => new vscode.Location(
                    vscode.Uri.parse(loc.uri),
                    new vscode.Range(
                        new vscode.Position(loc.range.start.line, loc.range.start.character),
                        new vscode.Position(loc.range.end.line, loc.range.end.character)
                    )
                ));
            }
        } catch (error) {
            // kip-lsp doesn't support this
            return [];
        }

        return [];
    }
}

/**
 * Document highlight provider - kip-lsp doesn't support this, returns empty
 */
export class KipDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    constructor() {
        // No semantic provider needed - kip-lsp doesn't support document highlights
    }

    async provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentHighlight[] | undefined> {
        // kip-lsp doesn't support document highlights
        return [];
    }
}
