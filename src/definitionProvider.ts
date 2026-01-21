import * as vscode from 'vscode';

interface KipSymbol {
    name: string;
    location: vscode.Location;
    type: 'function' | 'variable' | 'type' | 'entrypoint';
}

export class KipDefinitionProvider implements vscode.DefinitionProvider {
    private symbolCache: Map<string, KipSymbol[]> = new Map();

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
        // Parse document and build symbol table
        const symbols = this.parseDocument(document);

        // Get the symbol at current position
        const wordRange = document.getWordRangeAtPosition(position, /[a-züğışöçÜĞIŞÖÇ-]+/);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);

        // Find definition for this symbol
        const definition = this.findDefinition(word, symbols);

        return definition?.location;
    }

    private parseDocument(document: vscode.TextDocument): KipSymbol[] {
        const uri = document.uri.toString();

        // Check cache
        const cached = this.symbolCache.get(uri);
        if (cached) {
            return cached;
        }

        const symbols: KipSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Pattern 1: Function definitions - (params) function-name,
        const functionPattern = /\([^)]+\)\s+([a-züğışöçÜĞIŞÖÇ-]+),/g;
        let match;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            // Reset regex
            functionPattern.lastIndex = 0;

            while ((match = functionPattern.exec(line)) !== null) {
                const functionName = match[1];
                const startChar = match.index + match[0].indexOf(functionName);

                symbols.push({
                    name: functionName,
                    location: new vscode.Location(
                        document.uri,
                        new vscode.Position(lineNum, startChar)
                    ),
                    type: 'function'
                });
            }
        }

        // Pattern 2: Variable bindings - (expression) variable-name diyelim
        const variablePattern = /\([^)]+\)\s+([a-züğışöçÜĞIŞÖÇ-]+)\s+diyelim/g;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            variablePattern.lastIndex = 0;

            while ((match = variablePattern.exec(line)) !== null) {
                const varName = match[1];
                const startChar = match.index + match[0].indexOf(varName);

                symbols.push({
                    name: varName,
                    location: new vscode.Location(
                        document.uri,
                        new vscode.Position(lineNum, startChar)
                    ),
                    type: 'variable'
                });
            }
        }

        // Pattern 3: Type definitions - Bir type-name
        const typePattern = /^Bir\s+([a-züğışöçÜĞIŞÖÇ-]+)/m;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            typePattern.lastIndex = 0;

            const typeMatch = typePattern.exec(line);
            if (typeMatch) {
                const typeName = typeMatch[1];
                const startChar = typeMatch.index + typeMatch[0].indexOf(typeName);

                symbols.push({
                    name: typeName,
                    location: new vscode.Location(
                        document.uri,
                        new vscode.Position(lineNum, startChar)
                    ),
                    type: 'type'
                });
            }
        }

        // Pattern 4: Entry point - çalıştırmak,
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum].trim();
            if (line === 'çalıştırmak,') {
                symbols.push({
                    name: 'çalıştır',
                    location: new vscode.Location(
                        document.uri,
                        new vscode.Position(lineNum, 0)
                    ),
                    type: 'entrypoint'
                });
            }
        }

        // Cache the symbols
        this.symbolCache.set(uri, symbols);

        return symbols;
    }

    private findDefinition(word: string, symbols: KipSymbol[]): KipSymbol | undefined {
        // Strip common Turkish case suffixes for matching
        const baseWord = this.stripCaseSuffixes(word);

        // Find exact match first
        let found = symbols.find(s => s.name === word);

        // If not found, try with base form
        if (!found) {
            found = symbols.find(s => s.name === baseWord || this.stripCaseSuffixes(s.name) === baseWord);
        }

        return found;
    }

    private stripCaseSuffixes(word: string): string {
        // Common Turkish case suffixes
        const suffixes = [
            "'ı", "'i", "'u", "'ü",           // Accusative
            "'e", "'a",                        // Dative
            "'de", "'da", "'te", "'ta",        // Locative
            "'den", "'dan", "'ten", "'tan",    // Ablative
            "'in", "'ın", "'un", "'ün",        // Genitive
            "'le", "'la",                      // Instrumental
            "'nin", "'nın", "'nun", "'nün",    // Genitive with buffer
            "'ye", "'ya",                      // Dative with buffer
            "'yı", "'yi", "'yu", "'yü",        // Accusative with buffer
            "'yle", "'yla",                    // Instrumental with buffer
            "yı", "yi", "yu", "yü",            // Without apostrophe
            "nin", "nın", "nun", "nün",
            "ın", "in", "un", "ün",
            "e", "a",
            "de", "da", "te", "ta",
            "den", "dan", "ten", "tan",
            "le", "la",
            "ye", "ya"
        ];

        let result = word;

        // Try to strip suffixes (longest first)
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

    // Clear cache when document changes
    public clearCache(uri: vscode.Uri) {
        this.symbolCache.delete(uri.toString());
    }
}
