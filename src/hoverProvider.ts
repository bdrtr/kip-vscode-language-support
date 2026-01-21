import * as vscode from 'vscode';
import { builtinDocs, categoryInfo } from './data/builtins';

export class KipHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        // Kelimenin range'ini al
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
}
