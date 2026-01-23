import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak rename sağlar
 */
export class KipRenameProvider implements vscode.RenameProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
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
            // LSP rename yoksa, semantic tokens kullan
            console.log('LSP rename not available, using semantic tokens');
        }

        // Fallback: Semantic tokens kullan
        const symbol = await this.semanticProvider.findSymbolAtPosition(document, position);
        if (!symbol) {
            throw new Error('Yeniden adlandırılabilir bir sembol bulunamadı.');
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        
        // Tüm referansları bul
        const allSymbols = await this.semanticProvider.findSymbolsByName(document, symbol.name);
        
        // Her referansı yeni isimle değiştir (hal eklerini koru)
        for (const sym of allSymbols) {
            const oldText = document.getText(sym.range);
            const newText = this.preserveCaseSuffix(oldText, newName);
            workspaceEdit.replace(document.uri, sym.range, newText);
        }

        return workspaceEdit;
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
            // LSP prepareRename yoksa, semantic tokens kullan
        }

        // Fallback: Semantic tokens kullan
        const symbol = await this.semanticProvider.findSymbolAtPosition(document, position);
        if (!symbol) {
            throw new Error('Yeniden adlandırılabilir bir sembol bulunamadı.');
        }

        const baseWord = this.stripCaseSuffixes(symbol.name);
        
        return {
            range: symbol.range,
            placeholder: baseWord
        };
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
