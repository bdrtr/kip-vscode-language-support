import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

/**
 * LSP kullanarak rename sağlar
 * Note: kip-lsp may not support textDocument/rename, throws error if not available
 */
export class KipRenameProvider implements vscode.RenameProvider {
    private client: LanguageClient;

    constructor(client: LanguageClient) {
        this.client = client;
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit> {
        // Validate new name
        if (!this.isValidIdentifier(newName)) {
            throw new Error('Geçersiz tanımlayıcı. Sadece küçük harf, tire ve Türkçe karakterler kullanılabilir.');
        }

        // Önce LSP'den rename iste
        try {
            const result = await this.client.sendRequest('textDocument/rename', {
                textDocument: {
                    uri: document.uri.toString()
                },
                position: {
                    line: position.line,
                    character: position.character
                },
                newName: newName
            });

            if (result && typeof result === 'object' && result !== null && 'changes' in result) {
                const edit = new vscode.WorkspaceEdit();
                const changes = (result as any).changes;
                
                // LSP'den gelen değişiklikleri uygula
                if (typeof changes === 'object' && changes !== null) {
                    for (const [uri, textEdits] of Object.entries(changes)) {
                        if (Array.isArray(textEdits)) {
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
                }

                return edit;
            }
        } catch (error) {
            // kip-lsp doesn't support rename
            throw new Error('Yeniden adlandırma desteklenmiyor. kip-lsp bu özelliği desteklemiyor.');
        }

        throw new Error('Yeniden adlandırma başarısız oldu.');
    }

    async prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Range | { range: vscode.Range; placeholder: string } | null> {
        // Önce LSP'den prepareRename iste
        try {
            const result = await this.client.sendRequest('textDocument/prepareRename', {
                textDocument: {
                    uri: document.uri.toString()
                },
                position: {
                    line: position.line,
                    character: position.character
                }
            });

            if (result && typeof result === 'object' && result !== null) {
                const res = result as any;
                if ('range' in res && res.range) {
                    return {
                        range: new vscode.Range(
                            new vscode.Position(res.range.start.line, res.range.start.character),
                            new vscode.Position(res.range.end.line, res.range.end.character)
                        ),
                        placeholder: res.placeholder || ''
                    };
                }
            }
        } catch (error) {
            // kip-lsp doesn't support prepareRename
            return null;
        }

        return null;
    }

    private isValidIdentifier(name: string): boolean {
        return /^[a-züğışöç-]+$/.test(name);
    }

    private preserveCaseSuffix(oldText: string, newBaseName: string): string {
        const baseWord = this.stripCaseSuffixes(oldText);
        if (baseWord === oldText) {
            return newBaseName;
        }

        const suffix = oldText.substring(baseWord.length);
        return newBaseName + suffix;
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
