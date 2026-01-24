import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * Semantic tokens provider - LSP'den gelen semantic bilgileri kullanarak
 * tamamen semantic tabanlı syntax renklendirme sağlar
 */
export class KipSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    private semanticProvider: SemanticProvider;
    private legend: vscode.SemanticTokensLegend;

    constructor(semanticProvider: SemanticProvider) {
        this.semanticProvider = semanticProvider;
        
        // Semantic tokens legend - LSP'den gelen token tiplerini tanımlar
        // Bu legend LSP sunucusunun döndürdüğü token tipleriyle eşleşmeli
        this.legend = new vscode.SemanticTokensLegend(
            [
                'keyword',      // 0
                'function',    // 1
                'variable',     // 2
                'string',       // 3
                'number',       // 4
                'type',         // 5
                'operator',    // 6
                'property',    // 7
                'enumMember',  // 8
                'event',       // 9
                'modifier',    // 10
                'class',       // 11
                'interface',   // 12
                'namespace',   // 13
                'parameter',   // 14
                'comment',     // 15
                'enum',        // 16
                'struct',      // 17
                'typeParameter', // 18
                'decorator'    // 19
            ],
            [
                'declaration',  // 0
                'definition',   // 1
                'readonly',     // 2
                'static',       // 3
                'deprecated',   // 4
                'abstract',     // 5
                'async',        // 6
                'modification', // 7
                'documentation', // 8
                'defaultLibrary' // 9
            ]
        );
    }

    /**
     * Semantic tokens legend'ı döndürür
     */
    getLegend(): vscode.SemanticTokensLegend {
        return this.legend;
    }

    /**
     * Belge için semantic tokens sağlar
     */
    async provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.SemanticTokens> {
        // LSP'den semantic tokens al
        const semanticTokens = await this.semanticProvider.getSemanticTokens(document);
        
        if (semanticTokens) {
            // LSP'den gelen tokens'ı doğrudan kullan
            return semanticTokens;
        }

        // Fallback: LSP semantic tokens yoksa boş tokens döndür
        // Artık TextMate grammar yok, sadece semantic tokens kullanılıyor
        return new vscode.SemanticTokens(new Uint32Array(0));
    }

    /**
     * Belirli bir aralık için semantic tokens sağlar (incremental update için)
     */
    async provideDocumentSemanticTokensEdits(
        document: vscode.TextDocument,
        previousResultId: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SemanticTokensEdits | vscode.SemanticTokens> {
        // Şimdilik full tokens döndürüyoruz
        // Gelecekte incremental updates eklenebilir
        return this.provideDocumentSemanticTokens(document, token);
    }
}
