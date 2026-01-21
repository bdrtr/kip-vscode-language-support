import * as vscode from 'vscode';

export class KipReferenceProvider implements vscode.ReferenceProvider {

    provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        // Get symbol at cursor position
        const wordRange = document.getWordRangeAtPosition(position, /[a-züğışöçÜĞIŞÖÇ-]+/);
        if (!wordRange) {
            return [];
        }

        const word = document.getText(wordRange);
        const baseName = this.stripCaseSuffixes(word);

        // Find all references to this symbol
        const references = this.findAllReferences(document, baseName, context.includeDeclaration);

        return references;
    }

    private findAllReferences(
        document: vscode.TextDocument,
        symbolName: string,
        includeDeclaration: boolean
    ): vscode.Location[] {
        const references: vscode.Location[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Create regex pattern for the symbol with optional case suffixes
        const symbolPattern = new RegExp(
            `\\b${this.escapeRegex(symbolName)}(?:'(?:y)?[ıiuü]|'(?:y)?[ae]|'(?:d)?[ae]|'(?:d)?[ae]n|'(?:n)?[ıiuü]n|'(?:y)?l[ae]|[ıiuü]p)?\\b`,
            'gi'
        );

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            // Skip comments
            if (line.trim().startsWith('(*')) {
                continue;
            }

            // Find all matches in this line
            symbolPattern.lastIndex = 0;
            let match;

            while ((match = symbolPattern.exec(line)) !== null) {
                // Skip matches inside strings
                if (this.isInsideString(line, match.index)) {
                    continue;
                }

                // Check if this is a definition (for includeDeclaration filter)
                const isDefinition = this.isDefinitionLine(line, match.index);

                if (includeDeclaration || !isDefinition) {
                    const location = new vscode.Location(
                        document.uri,
                        new vscode.Range(
                            lineNum,
                            match.index,
                            lineNum,
                            match.index + match[0].length
                        )
                    );
                    references.push(location);
                }
            }
        }

        return references;
    }

    private isDefinitionLine(line: string, matchIndex: number): boolean {
        // Check if this line contains a definition pattern
        const trimmed = line.trim();

        // Function definition: (params) name,
        if (/\([^)]+\)\s+[a-züğışöçÜĞIŞÖÇ-]+,/.test(trimmed)) {
            return true;
        }

        // Variable binding: (...) name diyelim
        if (/diyelim/.test(trimmed)) {
            return true;
        }

        // Type definition: Bir name
        if (trimmed.startsWith('Bir ')) {
            return true;
        }

        return false;
    }

    private isInsideString(line: string, index: number): boolean {
        let insideString = false;
        let escaped = false;

        for (let i = 0; i < index; i++) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (line[i] === '\\') {
                escaped = true;
                continue;
            }

            if (line[i] === '"') {
                insideString = !insideString;
            }
        }

        return insideString;
    }

    private stripCaseSuffixes(word: string): string {
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
            "ye", "ya"
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

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

export class KipDocumentHighlightProvider implements vscode.DocumentHighlightProvider {

    provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentHighlight[]> {
        // Get symbol at cursor position
        const wordRange = document.getWordRangeAtPosition(position, /[a-züğışöçÜĞIŞÖÇ-]+/);
        if (!wordRange) {
            return [];
        }

        const word = document.getText(wordRange);
        const baseName = this.stripCaseSuffixes(word);

        // Find all occurrences to highlight
        const highlights = this.findAllOccurrences(document, baseName);

        return highlights;
    }

    private findAllOccurrences(
        document: vscode.TextDocument,
        symbolName: string
    ): vscode.DocumentHighlight[] {
        const highlights: vscode.DocumentHighlight[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Create regex pattern for the symbol with optional case suffixes
        const symbolPattern = new RegExp(
            `\\b${this.escapeRegex(symbolName)}(?:'(?:y)?[ıiuü]|'(?:y)?[ae]|'(?:d)?[ae]|'(?:d)?[ae]n|'(?:n)?[ıiuü]n|'(?:y)?l[ae]|[ıiuü]p)?\\b`,
            'gi'
        );

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];

            // Skip comments
            if (line.trim().startsWith('(*')) {
                continue;
            }

            // Find all matches in this line
            symbolPattern.lastIndex = 0;
            let match;

            while ((match = symbolPattern.exec(line)) !== null) {
                // Skip matches inside strings
                if (this.isInsideString(line, match.index)) {
                    continue;
                }

                const range = new vscode.Range(
                    lineNum,
                    match.index,
                    lineNum,
                    match.index + match[0].length
                );

                // All highlights are treated as "read" for now
                const highlight = new vscode.DocumentHighlight(
                    range,
                    vscode.DocumentHighlightKind.Read
                );

                highlights.push(highlight);
            }
        }

        return highlights;
    }

    private isInsideString(line: string, index: number): boolean {
        let insideString = false;
        let escaped = false;

        for (let i = 0; i < index; i++) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (line[i] === '\\') {
                escaped = true;
                continue;
            }

            if (line[i] === '"') {
                insideString = !insideString;
            }
        }

        return insideString;
    }

    private stripCaseSuffixes(word: string): string {
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
            "ye", "ya"
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

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
