import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak references sağlar
 */
export class KipReferenceProvider implements vscode.ReferenceProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        // LSP client'ın hazır olup olmadığını kontrol et
        if (!this.isClientReady()) {
            console.log('LSP client not ready, using semantic tokens for references');
            return this.getFallbackReferences(document, position, context);
        }

        // Önce LSP'den references iste
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
            }, token);

            if (result && Array.isArray(result) && result.length > 0) {
                return result.map(loc => new vscode.Location(
                    vscode.Uri.parse(loc.uri),
                    new vscode.Range(
                        new vscode.Position(loc.range.start.line, loc.range.start.character),
                        new vscode.Position(loc.range.end.line, loc.range.end.character)
                    )
                ));
            }
        } catch (error) {
            // LSP references yoksa, semantic tokens kullan
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('no handler') || errorMsg.includes('not supported')) {
                console.log('LSP references not supported by server, using semantic tokens');
            } else {
                console.warn('LSP references request failed:', errorMsg);
            }
        }

        return this.getFallbackReferences(document, position, context);
    }

    private isClientReady(): boolean {
        try {
            const clientState = (this.client as any).state;
            return clientState === 2; // Running
        } catch (e) {
            return false;
        }
    }

    private async getFallbackReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext
    ): Promise<vscode.Location[]> {

        // Fallback: Semantic tokens kullan
        try {
            const symbol = await this.semanticProvider.findSymbolAtPosition(document, position);
            if (!symbol) {
                return [];
            }

            // Tüm dosyada aynı isimdeki sembolleri bul
            const allSymbols = await this.semanticProvider.findSymbolsByName(document, symbol.name);
            
            // Declaration'ı filtrele
            let references = allSymbols.map(s => new vscode.Location(document.uri, s.range));
            
            if (!context.includeDeclaration) {
                // Declaration'ı çıkar (ilk function/type/class olanı)
                const declaration = allSymbols.find(s => 
                    s.kind === vscode.SymbolKind.Function || 
                    s.kind === vscode.SymbolKind.Class
                );
                
                if (declaration) {
                    references = references.filter(ref => 
                        !ref.range.isEqual(declaration.range)
                    );
                }
            }

            return references;
        } catch (error) {
            console.warn('Failed to get fallback references:', error);
            return [];
        }
    }
}

/**
 * LSP semantic bilgilerini kullanarak document highlight sağlar
 */
export class KipDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    private semanticProvider: SemanticProvider;

    constructor(semanticProvider: SemanticProvider) {
        this.semanticProvider = semanticProvider;
    }

    async provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentHighlight[] | undefined> {
        const symbol = await this.semanticProvider.findSymbolAtPosition(document, position);
        if (!symbol) {
            return [];
        }

        // Tüm dosyada aynı isimdeki sembolleri bul
        const allSymbols = await this.semanticProvider.findSymbolsByName(document, symbol.name);
        
        return allSymbols.map(s => new vscode.DocumentHighlight(
            s.range,
            vscode.DocumentHighlightKind.Read
        ));
    }
}
