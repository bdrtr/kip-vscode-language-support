import * as vscode from 'vscode';

export class KipSymbolProvider implements vscode.DocumentSymbolProvider {

    provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        return this.parseDocumentSymbols(document);
    }

    private parseDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // Pattern 1: Function definitions - (params) function-name,
        const functionPattern = /\(([^)]+)\)\s+([a-züğışöçÜĞIŞÖÇ-]+),/;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const match = functionPattern.exec(line);

            if (match) {
                const params = match[1];
                const functionName = match[2];
                const startChar = line.indexOf(functionName);

                // Find function body end (ends with 'dir.', 'dır.', 'tir.', 'tır.' or sometimes just '.')
                let endLine = lineNum;
                for (let i = lineNum + 1; i < lines.length; i++) {
                    const nextLine = lines[i].trim();
                    if (nextLine.endsWith('dir.') || nextLine.endsWith('dır.') ||
                        nextLine.endsWith('tir.') || nextLine.endsWith('tır.') ||
                        (nextLine.endsWith('.') && !nextLine.startsWith('ya ') && nextLine.length < 50)) {
                        endLine = i;
                        break;
                    }
                    // Also break on next function or type definition
                    if (functionPattern.test(nextLine) || nextLine.startsWith('Bir ')) {
                        endLine = i - 1;
                        break;
                    }
                }

                const symbol = new vscode.DocumentSymbol(
                    functionName,
                    `(${params})`,
                    vscode.SymbolKind.Function,
                    new vscode.Range(lineNum, 0, endLine, lines[endLine].length),
                    new vscode.Range(lineNum, startChar, lineNum, startChar + functionName.length)
                );

                symbols.push(symbol);
            }
        }

        // Pattern 2: Variable bindings - (expression) variable-name diyelim
        const variablePattern = /\([^)]+\)\s+([a-züğışöçÜĞIŞÖÇ-]+)\s+diyelim/;

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const match = variablePattern.exec(line);

            if (match) {
                const varName = match[1];
                const startChar = line.indexOf(varName);

                const symbol = new vscode.DocumentSymbol(
                    varName,
                    'variable binding',
                    vscode.SymbolKind.Variable,
                    new vscode.Range(lineNum, 0, lineNum, line.length),
                    new vscode.Range(lineNum, startChar, lineNum, startChar + varName.length)
                );

                symbols.push(symbol);
            }
        }

        // Pattern 3: Type definitions - Bir type-name ... ya variant ... olabilir.
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum].trim();
            const typeMatch = /^Bir\s+([a-züğışöçÜĞIŞÖÇ-]+)/.exec(line);

            if (typeMatch) {
                const typeName = typeMatch[1];
                const startChar = lines[lineNum].indexOf(typeName);

                // Find all variants and the end of type definition
                const variants: vscode.DocumentSymbol[] = [];
                let endLine = lineNum;

                for (let i = lineNum + 1; i < lines.length; i++) {
                    const variantLine = lines[i].trim();

                    // Check for variant
                    const variantMatch = /^ya\s+([a-züğışöçÜĞIŞÖÇ-]+)/.exec(variantLine);
                    if (variantMatch) {
                        const variantName = variantMatch[1];
                        const variantStartChar = lines[i].indexOf(variantName);

                        const variantSymbol = new vscode.DocumentSymbol(
                            variantName,
                            'variant',
                            vscode.SymbolKind.EnumMember,
                            new vscode.Range(i, 0, i, lines[i].length),
                            new vscode.Range(i, variantStartChar, i, variantStartChar + variantName.length)
                        );

                        variants.push(variantSymbol);
                    }

                    // Check for end of type definition
                    if (variantLine === 'olabilir.') {
                        endLine = i;
                        break;
                    }
                }

                const typeSymbol = new vscode.DocumentSymbol(
                    typeName,
                    'type definition',
                    vscode.SymbolKind.Class,
                    new vscode.Range(lineNum, 0, endLine, lines[endLine].length),
                    new vscode.Range(lineNum, startChar, lineNum, startChar + typeName.length)
                );

                // Add variants as children
                typeSymbol.children = variants;

                symbols.push(typeSymbol);
            }
        }

        // Pattern 4: Entry point - çalıştırmak, and çalıştır.
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum].trim();

            if (line === 'çalıştırmak,') {
                // Find the end of çalıştırmak function
                let endLine = lineNum;
                for (let i = lineNum + 1; i < lines.length; i++) {
                    const nextLine = lines[i].trim();
                    if (nextLine.endsWith('dir.') || nextLine.endsWith('dır.') ||
                        nextLine.endsWith('tir.') || nextLine.endsWith('tır.') ||
                        nextLine === 'çalıştır.') {
                        endLine = i;
                        break;
                    }
                }

                const symbol = new vscode.DocumentSymbol(
                    'çalıştırmak',
                    'entry point',
                    vscode.SymbolKind.Function,
                    new vscode.Range(lineNum, 0, endLine, lines[endLine].length),
                    new vscode.Range(lineNum, 0, lineNum, 'çalıştırmak'.length)
                );

                symbols.push(symbol);
            } else if (line === 'çalıştır.') {
                const symbol = new vscode.DocumentSymbol(
                    'çalıştır',
                    'entry point call',
                    vscode.SymbolKind.Function,
                    new vscode.Range(lineNum, 0, lineNum, lines[lineNum].length),
                    new vscode.Range(lineNum, 0, lineNum, 'çalıştır'.length)
                );

                symbols.push(symbol);
            }
        }

        // Sort symbols by line number
        symbols.sort((a, b) => a.range.start.line - b.range.start.line);

        return symbols;
    }
}
