import * as vscode from 'vscode';
import { builtinDocs, categoryInfo } from './data/builtins';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Hover provider - combines builtin hover with LSP hover (type inference)
 * Matching Haskell LSP pattern: inferType from expression at position
 */
export class KipHoverProvider implements vscode.HoverProvider {
    private lspClient: LanguageClient | null = null;

    constructor(lspClient?: LanguageClient | null) {
        this.lspClient = lspClient || null;
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | null> {
        // First, try LSP hover (matching Haskell: inferType from expression at position)
        if (this.lspClient) {
            try {
                const lspHover: any = await this.lspClient.sendRequest('textDocument/hover', {
                    textDocument: {
                        uri: document.uri.toString()
                    },
                    position: {
                        line: position.line,
                        character: position.character
                    }
                }, token);

                if (lspHover && lspHover.contents) {
                    // Convert LSP hover to VS Code format
                    const range = lspHover.range ? this.convertRange(lspHover.range) : document.getWordRangeAtPosition(position);
                    const markdown = this.convertLSPHoverContents(lspHover.contents);
                    if (markdown && range) {
                        return new vscode.Hover(markdown, range);
                    }
                }
            } catch (error) {
                // LSP hover not available, fallback to builtin
                console.log('LSP hover not available, using builtin');
            }
        }

        // Fallback: Builtin hover (matching Haskell's builtin knowledge)
        const range = document.getWordRangeAtPosition(position);
        if (!range) {
            return null;
        }

        let word = document.getText(range);

        // "ya da" gibi iki kelimelik ifadeleri kontrol et
        const lineText = document.lineAt(position.line).text;
        const wordStart = range.start.character;

        // "ya da" kontrolü
        if (word === 'ya' && lineText.substring(wordStart, wordStart + 5) === 'ya da') {
            word = 'ya da';
        }

        // Dokümantasyonu bul
        const doc = builtinDocs[word];
        if (!doc) {
            return null;
        }

        // Markdown içeriği oluştur
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // Kategori bilgisi
        const catInfo = categoryInfo[doc.category];
        markdown.appendMarkdown(`${catInfo.icon} **${catInfo.label}**\n\n`);

        // Signature
        markdown.appendMarkdown(`\`\`\`kip\n${doc.signature}\n\`\`\`\n\n`);

        // Açıklama
        markdown.appendMarkdown(`${doc.description}\n\n`);

        // Örnek
        markdown.appendMarkdown(`**Örnek:**\n`);
        markdown.appendMarkdown(`\`\`\`kip\n${doc.example}\n\`\`\``);

        return new vscode.Hover(markdown, range);
    }

    private convertLSPHoverContents(contents: any): vscode.MarkdownString | null {
        if (!contents) {
            return null;
        }

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        if (typeof contents === 'string') {
            markdown.appendMarkdown(contents);
        } else if (Array.isArray(contents)) {
            for (const item of contents) {
                if (typeof item === 'string') {
                    markdown.appendMarkdown(item);
                } else if (item.value) {
                    markdown.appendMarkdown(item.value);
                }
            }
        } else if (contents.value) {
            markdown.appendMarkdown(contents.value);
        } else {
            return null;
        }

        return markdown;
    }

    private convertRange(range: any): vscode.Range | null {
        if (!range || !range.start || !range.end) {
            return null;
        }

        return new vscode.Range(
            new vscode.Position(range.start.line, range.start.character),
            new vscode.Position(range.end.line, range.end.character)
        );
    }
}
