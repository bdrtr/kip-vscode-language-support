import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * LSP kullanarak definition sağlar (kip-lsp supports textDocument/definition)
 */
export class KipDefinitionProvider implements vscode.DefinitionProvider {
    private client: LanguageClient;

    constructor(client: LanguageClient) {
        this.client = client;
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        // kip-lsp supports textDocument/definition
        try {
            const result = await this.client.sendRequest('textDocument/definition', {
                textDocument: {
                    uri: document.uri.toString()
                },
                position: {
                    line: position.line,
                    character: position.character
                }
            });

            if (result) {
                // LSP'den gelen sonucu dönüştür
                if (Array.isArray(result)) {
                    return result.map(this.convertLocation);
                } else {
                    return this.convertLocation(result);
                }
            }
        } catch (error) {
            // kip-lsp doesn't support this or error occurred
            return undefined;
        }

        return undefined;
    }

    private convertLocation(loc: any): vscode.Location {
        return new vscode.Location(
            vscode.Uri.parse(loc.uri),
            new vscode.Range(
                new vscode.Position(loc.range.start.line, loc.range.start.character),
                new vscode.Position(loc.range.end.line, loc.range.end.character)
            )
        );
    }
}
