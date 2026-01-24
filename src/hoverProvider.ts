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
        if (this.lspClient && this.isClientReady()) {
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
                const errorMsg = error instanceof Error ? error.message : String(error);
                // Silently fallback to builtin - don't log "not supported" messages
                // Handler exists in server, but capabilities might not be set correctly
                if (!errorMsg.includes('no handler') && !errorMsg.includes('not supported')) {
                    console.warn('LSP hover request failed:', errorMsg);
                }
            }
        } else if (this.lspClient) {
            // LSP not ready - return null (LSP is required)
            return null;
        }

        // LSP is required - no builtin fallback
        if (!this.lspClient || !this.isClientReady()) {
            return null;
        }

        // LSP is required - no builtin fallback
        return null;
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
