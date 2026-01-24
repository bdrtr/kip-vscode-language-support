import * as vscode from 'vscode';
import { builtinDocs, categoryInfo } from './data/builtins';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Completion provider - combines builtin completions with LSP completions
 * Matching Haskell LSP pattern: parser state (ctxIdents, typeNames, funcNames) + builtins
 */
export class KipCompletionProvider implements vscode.CompletionItemProvider {
    private lspClient: LanguageClient | null = null;

    constructor(lspClient?: LanguageClient | null) {
        this.lspClient = lspClient || null;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        const completionItems: vscode.CompletionItem[] = [];

        // First, try to get LSP completions (matching Haskell: parser state from DocState)
        if (this.lspClient && this.isClientReady()) {
            try {
                const lspCompletions = await this.lspClient.sendRequest('textDocument/completion', {
                    textDocument: {
                        uri: document.uri.toString()
                    },
                    position: {
                        line: position.line,
                        character: position.character
                    }
                }, token);

                if (lspCompletions && Array.isArray(lspCompletions) && lspCompletions.length > 0) {
                    // Convert LSP completions to VS Code format
                    for (const item of lspCompletions) {
                        const vscodeItem = this.convertLSPCompletion(item);
                        if (vscodeItem) {
                            completionItems.push(vscodeItem);
                        }
                    }
                }
            } catch (error) {
                // LSP completion not available, continue with builtins
                const errorMsg = error instanceof Error ? error.message : String(error);
                // Silently fallback to builtins - don't log "not supported" messages
                // Handler exists in server, but capabilities might not be set correctly
                if (!errorMsg.includes('no handler') && !errorMsg.includes('not supported')) {
                    console.warn('LSP completion request failed:', errorMsg);
                }
            }
        } else if (this.lspClient) {
            // LSP not ready - return empty (LSP is required)
            return [];
        }

        // LSP is required - no builtin fallback
        if (!this.lspClient || !this.isClientReady()) {
            return [];
        }

        // LSP is required - return only LSP completions
        return completionItems;
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

    private convertLSPCompletion(item: any): vscode.CompletionItem | null {
        if (!item || !item.label) {
            return null;
        }

        const vscodeItem = new vscode.CompletionItem(
            item.label,
            this.mapLSPKindToVSCodeKind(item.kind)
        );

        if (item.detail) {
            vscodeItem.detail = item.detail;
        }

        if (item.documentation) {
            if (typeof item.documentation === 'string') {
                vscodeItem.documentation = new vscode.MarkdownString(item.documentation);
            } else if (item.documentation.value) {
                vscodeItem.documentation = new vscode.MarkdownString(item.documentation.value);
            }
        }

        if (item.insertText) {
            vscodeItem.insertText = item.insertText;
        }

        if (item.sortText) {
            vscodeItem.sortText = item.sortText;
        }

        return vscodeItem;
    }

    private mapLSPKindToVSCodeKind(kind?: number): vscode.CompletionItemKind {
        // Map LSP CompletionItemKind to VS Code CompletionItemKind
        // Default to Variable (matching Haskell: CompletionItemKind_Variable)
        return vscode.CompletionItemKind.Variable;
    }

    private getCompletionKind(category: string): vscode.CompletionItemKind {
        switch (category) {
            case 'io':
            case 'arithmetic':
            case 'comparison':
            case 'string':
                return vscode.CompletionItemKind.Function;
            case 'keyword':
                return vscode.CompletionItemKind.Keyword;
            case 'type':
                return vscode.CompletionItemKind.Class;
            case 'constant':
                return vscode.CompletionItemKind.Constant;
            default:
                return vscode.CompletionItemKind.Text;
        }
    }

    private getSortText(category: string, name: string): string {
        // Öncelik sırası: keyword > type > io > arithmetic > comparison > string > constant
        const categoryPriority: Record<string, string> = {
            'keyword': '1',
            'type': '2',
            'io': '3',
            'arithmetic': '4',
            'comparison': '5',
            'string': '6',
            'constant': '7'
        };

        const priority = categoryPriority[category] || '9';
        return `${priority}_${name}`;
    }

    private addSnippetCompletions(items: vscode.CompletionItem[]) {
        // Tip tanımı snippet
        const typeSnippet = new vscode.CompletionItem('Bir ... olabilir', vscode.CompletionItemKind.Snippet);
        typeSnippet.insertText = new vscode.SnippetString(
            'Bir ${1:tip-adı}\nya ${2:yapıcı1}\nya da ${3:yapıcı2}\nolabilir.'
        );
        typeSnippet.detail = 'Tip tanımı şablonu';
        typeSnippet.documentation = new vscode.MarkdownString('Yeni bir tip tanımı oluşturur.');
        typeSnippet.sortText = '0_type_template';
        items.push(typeSnippet);

        // Fonksiyon tanımı snippet
        const funcSnippet = new vscode.CompletionItem('(bu ...) fonksiyon', vscode.CompletionItemKind.Snippet);
        funcSnippet.insertText = new vscode.SnippetString(
            '(${1:bu} ${2:tip}${3:i}) ${4:fonksiyon-adı},\n  ${5:gövde}.'
        );
        funcSnippet.detail = 'Fonksiyon tanımı şablonu';
        funcSnippet.documentation = new vscode.MarkdownString('Yeni bir fonksiyon tanımı oluşturur.');
        funcSnippet.sortText = '0_func_template';
        items.push(funcSnippet);

        // Koşullu ifade snippet
        const ifSnippet = new vscode.CompletionItem('doğruysa ... yanlışsa', vscode.CompletionItemKind.Snippet);
        ifSnippet.insertText = new vscode.SnippetString(
            '${1:koşul} doğruysa,\n  ${2:doğru-durumu},\nyanlışsa,\n  ${3:yanlış-durumu}.'
        );
        ifSnippet.detail = 'Koşullu ifade şablonu';
        ifSnippet.documentation = new vscode.MarkdownString('If-else yapısı oluşturur.');
        ifSnippet.sortText = '0_if_template';
        items.push(ifSnippet);

        // I/O pattern
        const ioSnippet = new vscode.CompletionItem('yazıp ... okuyup', vscode.CompletionItemKind.Snippet);
        ioSnippet.insertText = new vscode.SnippetString(
            '"${1:mesaj}" yazıp,\n${2:isim} olarak okuyup,'
        );
        ioSnippet.detail = 'I/O işlem şablonu';
        ioSnippet.documentation = new vscode.MarkdownString('Yazdırma ve okuma işlemleri.');
        ioSnippet.sortText = '0_io_template';
        items.push(ioSnippet);
    }

    // Trigger characters için resolve
    resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem> {
        return item;
    }
}
