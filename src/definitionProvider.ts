import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak definition sağlar
 */
export class KipDefinitionProvider implements vscode.DefinitionProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        // Önce LSP'den definition iste
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
            // LSP definition yoksa, semantic tokens kullan
            console.log('LSP definition not available, using semantic tokens');
        }

        // Fallback: Semantic tokens kullan
        const symbol = await this.semanticProvider.findSymbolAtPosition(document, position);
        if (!symbol) {
            return undefined;
        }

        // Aynı isimdeki tüm sembolleri bul (definition olanı seç)
        const allSymbols = await this.semanticProvider.findSymbolsByName(document, symbol.name);
        
        // Function veya type olan ilk sembolü definition olarak döndür
        const definition = allSymbols.find(s => 
            s.kind === vscode.SymbolKind.Function || 
            s.kind === vscode.SymbolKind.Class ||
            s.kind === vscode.SymbolKind.Variable
        );

        if (definition) {
            return new vscode.Location(document.uri, definition.range);
        }

        // Eğer bulunamazsa, ilk sembolü döndür
        if (allSymbols.length > 0) {
            return new vscode.Location(document.uri, allSymbols[0].range);
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
