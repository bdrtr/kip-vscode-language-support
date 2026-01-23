import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * LSP'den gelen semantic bilgileri yönetir
 */
export class SemanticProvider {
    private client: LanguageClient;
    private semanticCache: Map<string, vscode.SemanticTokens> = new Map();

    constructor(client: LanguageClient) {
        this.client = client;
    }

    /**
     * LSP'den semantic tokens alır
     */
    async getSemanticTokens(document: vscode.TextDocument): Promise<vscode.SemanticTokens | null> {
        const uri = document.uri.toString();
        
        // Cache'den kontrol et
        const cached = this.semanticCache.get(uri);
        if (cached) {
            return cached;
        }

        try {
            // LSP'den semantic tokens iste
            const result = await this.client.sendRequest('textDocument/semanticTokens/full', {
                textDocument: {
                    uri: document.uri.toString()
                }
            });

            if (result && typeof result === 'object' && result !== null && 'data' in result) {
                const data = (result as any).data;
                const resultId = (result as any).resultId;
                if (Array.isArray(data)) {
                    const tokens = new vscode.SemanticTokens(
                        new Uint32Array(data),
                        resultId
                    );
                    this.semanticCache.set(uri, tokens);
                    return tokens;
                }
            }
        } catch (error) {
            console.error('Error getting semantic tokens:', error);
        }

        return null;
    }

    /**
     * Semantic tokens'dan sembol bilgilerini çıkarır
     */
    async extractSymbols(document: vscode.TextDocument): Promise<Array<{
        name: string;
        kind: vscode.SymbolKind;
        range: vscode.Range;
        type: 'function' | 'variable' | 'type' | 'keyword' | 'string' | 'number';
    }>> {
        const tokens = await this.getSemanticTokens(document);
        if (!tokens) {
            return [];
        }

        const symbols: Array<{
            name: string;
            kind: vscode.SymbolKind;
            range: vscode.Range;
            type: 'function' | 'variable' | 'type' | 'keyword' | 'string' | 'number';
        }> = [];

        const data = tokens.data;
        let line = 0;
        let char = 0;

        for (let i = 0; i < data.length; i += 5) {
            const deltaLine = data[i];
            const deltaChar = data[i + 1];
            const length = data[i + 2];
            const tokenType = data[i + 3];
            const tokenModifiers = data[i + 4];

            line += deltaLine;
            if (deltaLine === 0) {
                char += deltaChar;
            } else {
                char = deltaChar;
            }

            const range = new vscode.Range(
                new vscode.Position(line, char),
                new vscode.Position(line, char + length)
            );

            const text = document.getText(range);
            if (!text) continue;

            // Token type'a göre sembol tipi belirle
            let symbolKind: vscode.SymbolKind;
            let symbolType: 'function' | 'variable' | 'type' | 'keyword' | 'string' | 'number';

            // LSP legend'e göre: 0=keyword, 1=function, 2=variable, 3=string, 4=number, 5=type, 6=operator
            switch (tokenType) {
                case 0: // keyword
                    symbolKind = vscode.SymbolKind.Key;
                    symbolType = 'keyword';
                    break;
                case 1: // function
                    symbolKind = vscode.SymbolKind.Function;
                    symbolType = 'function';
                    break;
                case 2: // variable
                    symbolKind = vscode.SymbolKind.Variable;
                    symbolType = 'variable';
                    break;
                case 3: // string
                    symbolKind = vscode.SymbolKind.String;
                    symbolType = 'string';
                    break;
                case 4: // number
                    symbolKind = vscode.SymbolKind.Number;
                    symbolType = 'number';
                    break;
                case 5: // type
                    symbolKind = vscode.SymbolKind.Class;
                    symbolType = 'type';
                    break;
                default:
                    continue;
            }

            symbols.push({
                name: text,
                kind: symbolKind,
                range: range,
                type: symbolType
            });
        }

        return symbols;
    }

    /**
     * Belirli bir pozisyondaki sembolü bulur
     */
    async findSymbolAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<{
        name: string;
        kind: vscode.SymbolKind;
        range: vscode.Range;
        type: string;
    } | null> {
        const symbols = await this.extractSymbols(document);
        
        // Position'ı içeren sembolü bul
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                return symbol;
            }
        }

        return null;
    }

    /**
     * Belirli bir isimle eşleşen tüm sembolleri bulur
     */
    async findSymbolsByName(
        document: vscode.TextDocument,
        name: string
    ): Promise<Array<{
        name: string;
        kind: vscode.SymbolKind;
        range: vscode.Range;
        type: string;
    }>> {
        const symbols = await this.extractSymbols(document);
        const baseName = this.stripCaseSuffixes(name.toLowerCase());

        return symbols.filter(s => {
            const symbolBase = this.stripCaseSuffixes(s.name.toLowerCase());
            return symbolBase === baseName || s.name.toLowerCase() === name.toLowerCase();
        });
    }

    /**
     * Cache'i temizle
     */
    clearCache(uri?: vscode.Uri) {
        if (uri) {
            this.semanticCache.delete(uri.toString());
        } else {
            this.semanticCache.clear();
        }
    }

    /**
     * Türkçe hal eklerini kaldırır
     */
    public stripCaseSuffixes(word: string): string {
        const suffixes = [
            "'ı", "'i", "'u", "'ü",
            "'e", "'a",
            "'de", "'da", "'te", "'ta",
            "'den", "'dan", "'ten", "'tan",
            "'in", "'ın", "'un", "'ün",
            "'le", "'la",
            "'nin", "'nın", "'nun", "'nün",
            "'ye", "'ya",
            "'yı", "'yi", "'yu", "'yü",
            "'yle", "'yla",
            "yı", "yi", "yu", "yü",
            "nin", "nın", "nun", "nün",
            "ın", "in", "un", "ün",
            "e", "a",
            "de", "da", "te", "ta",
            "den", "dan", "ten", "tan",
            "le", "la",
            "ye", "ya",
            "ip", "ıp", "up", "üp"
        ];

        let result = word;

        for (const suffix of suffixes.sort((a, b) => b.length - a.length)) {
            if (result.endsWith(suffix)) {
                const stripped = result.substring(0, result.length - suffix.length);
                if (stripped.length > 0) {
                    return stripped;
                }
            }
        }

        return result;
    }
}
