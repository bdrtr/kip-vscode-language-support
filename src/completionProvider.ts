import * as vscode from 'vscode';
import { builtinDocs, categoryInfo } from './data/builtins';

export class KipCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const completionItems: vscode.CompletionItem[] = [];

        // Tüm yerleşik fonksiyonlar ve anahtar kelimeler için completion items oluştur
        for (const [name, doc] of Object.entries(builtinDocs)) {
            const item = new vscode.CompletionItem(name, this.getCompletionKind(doc.category));

            // Detaylı bilgi
            item.detail = doc.signature;

            // Dokümantasyon
            const markdown = new vscode.MarkdownString();
            const catInfo = categoryInfo[doc.category];
            markdown.appendMarkdown(`${catInfo.icon} **${catInfo.label}**\n\n`);
            markdown.appendMarkdown(`${doc.description}\n\n`);
            markdown.appendMarkdown(`**Örnek:**\n\`\`\`kip\n${doc.example}\n\`\`\``);
            item.documentation = markdown;

            // Öncelik - kategori bazlı
            item.sortText = this.getSortText(doc.category, name);

            // Insert text - bazı özel durumlar için
            if (name === 'ya da') {
                item.insertText = 'ya da';
            }

            completionItems.push(item);
        }

        // Snippet'lerden bazı özel completion items ekle
        this.addSnippetCompletions(completionItems);

        return completionItems;
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
