import * as vscode from 'vscode';

interface FormattingOptions {
    tabSize: number;
    insertSpaces: boolean;
}

export class KipFormattingProvider implements
    vscode.DocumentFormattingEditProvider,
    vscode.DocumentRangeFormattingEditProvider {
    
    private lspClient: any = null;
    
    constructor(lspClient?: any) {
        this.lspClient = lspClient || null;
    }

    async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        // Try LSP formatting first
        if (this.lspClient && this.isClientReady()) {
            try {
                const result = await this.lspClient.sendRequest('textDocument/formatting', {
                    textDocument: {
                        uri: document.uri.toString()
                    },
                    options: {
                        tabSize: options.tabSize,
                        insertSpaces: options.insertSpaces
                    }
                }, token);
                
                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map((edit: any) => vscode.TextEdit.replace(
                        new vscode.Range(
                            edit.range.start.line,
                            edit.range.start.character,
                            edit.range.end.line,
                            edit.range.end.character
                        ),
                        edit.newText
                    ));
                }
            } catch (error) {
                // LSP formatting failed - use fallback
                console.warn('LSP formatting failed, using fallback:', error);
            }
        }
        
        // Fallback formatting
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        const formatted = this.formatDocument(document.getText(), {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
        });

        return [vscode.TextEdit.replace(fullRange, formatted)];
    }
    
    private isClientReady(): boolean {
        if (!this.lspClient) return false;
        try {
            const clientState = (this.lspClient as any).state;
            return clientState === 2; // Running
        } catch (e) {
            return false;
        }
    }

    provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const text = document.getText(range);
        const formatted = this.formatDocument(text, {
            tabSize: options.tabSize,
            insertSpaces: options.insertSpaces
        });

        return [vscode.TextEdit.replace(range, formatted)];
    }

    private formatDocument(text: string, options: FormattingOptions): string {
        const lines = text.split('\n');
        const formatted: string[] = [];
        let indentLevel = 0;
        const indent = ' '.repeat(options.tabSize);

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const trimmed = line.trim();

            // Skip empty lines (preserve them)
            if (trimmed === '') {
                formatted.push('');
                continue;
            }

            // Skip comments - preserve their indentation
            if (trimmed.startsWith('(*')) {
                formatted.push(line);
                continue;
            }

            // Determine indentation for this line
            let currentIndent = indentLevel;

            // Type definition handling
            if (trimmed.startsWith('Bir ')) {
                // Type definition start - no indent
                currentIndent = 0;
            } else if (trimmed.startsWith('ya ')) {
                // Type variant - no indent (same level as 'Bir')
                currentIndent = 0;
            } else if (trimmed === 'olabilir.') {
                // Type definition end - no indent
                currentIndent = 0;
            }
            // Function signature (ends with comma)
            else if (trimmed.endsWith(',')) {
                // Function signature stays at current level
                // Next line should be indented
            }
            // Conditional keywords that maintain indentation
            else if (trimmed.startsWith('doğruysa,') ||
                trimmed.startsWith('yanlışsa,') ||
                trimmed.startsWith('değilse,') ||
                trimmed.startsWith('yokluksa,')) {
                // These stay at current indent
            }
            // Dedent triggers
            else if (trimmed.endsWith('dir.') || trimmed.endsWith('dır.') ||
                trimmed.endsWith('tir.') || trimmed.endsWith('tır.')) {
                // Function end - this line is indented, next should dedent
                currentIndent = indentLevel;
            }

            // Apply indentation
            formatted.push(indent.repeat(currentIndent) + trimmed);

            // Update indent level for next line
            // Indent after function signature
            if (trimmed.endsWith(',') && !trimmed.startsWith('ya ')) {
                indentLevel++;
            }
            // Indent after conditional keywords
            else if (trimmed.endsWith('doğruysa,') ||
                trimmed.endsWith('yanlışsa,') ||
                trimmed.endsWith('değilse,') ||
                trimmed.endsWith('yokluksa,')) {
                indentLevel++;
            }
            // Dedent after function/block end
            else if (trimmed.endsWith('dir.') || trimmed.endsWith('dır.') ||
                trimmed.endsWith('tir.') || trimmed.endsWith('tır.')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            // Dedent after simple return values (no comma)
            else if ((i > 0 && formatted[formatted.length - 2].trim().endsWith('doğruysa,') ||
                (i > 0 && formatted[formatted.length - 2].trim().endsWith('yanlışsa,')) ||
                (i > 0 && formatted[formatted.length - 2].trim().endsWith('değilse,')) ||
                (i > 0 && formatted[formatted.length - 2].trim().endsWith('yokluksa,'))) &&
                !trimmed.endsWith(',')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
        }

        // Clean up multiple consecutive blank lines
        const cleaned = this.cleanupBlankLines(formatted.join('\n'));

        return cleaned;
    }

    private cleanupBlankLines(text: string): string {
        // Matching Haskell: formatText - trim trailing whitespace and ensure trailing newline
        // (kip-lang/app/Lsp.hs lines 478-481)
        const lines = text.split('\n');
        
        // Remove trailing whitespace from each line (matching Haskell: T.stripEnd)
        const trimmed = lines.map(line => line.trimEnd()).join('\n');
        
        // Ensure file ends with single newline (matching Haskell: if T.null trimmed || T.last trimmed == '\n')
        if (trimmed.length === 0 || trimmed[trimmed.length - 1] === '\n') {
            return trimmed;
        } else {
            return trimmed + '\n';
        }
    }
}
