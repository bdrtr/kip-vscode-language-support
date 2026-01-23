import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak code lens sağlar
 */
export class KipCodeLensProvider implements vscode.CodeLensProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;
    private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // Önce LSP'den code lens iste
        try {
            const result = await this.client.sendRequest('textDocument/codeLens', {
                textDocument: {
                    uri: document.uri.toString()
                }
            });

            if (result && Array.isArray(result)) {
                return result.map(lens => this.convertCodeLens(lens, document));
            }
        } catch (error) {
            // LSP code lens yoksa, semantic tokens kullan
            console.log('LSP code lens not available, using semantic tokens');
        }

        // Fallback: Semantic tokens kullanarak code lens oluştur
        const codeLenses: vscode.CodeLens[] = [];
        const symbols = await this.semanticProvider.extractSymbols(document);

        // Sadece function ve type'lar için code lens ekle
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Class) {
                
                // Aynı isimdeki tüm sembolleri say (referans sayısı)
                const allSymbols = await this.semanticProvider.findSymbolsByName(document, symbol.name);
                const referenceCount = allSymbols.length - 1; // Kendisini çıkar

                if (referenceCount >= 0) {
                    const codeLens = new vscode.CodeLens(symbol.range, {
                        title: `${referenceCount} ${referenceCount === 1 ? 'referans' : 'referans'}`,
                        command: 'kip.showReferences',
                        arguments: [document.uri, symbol.range.start]
                    });

                    codeLenses.push(codeLens);
                }
            }
        }

        return codeLenses;
    }

    async resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens> {
        return codeLens;
    }

    private convertCodeLens(lens: any, document: vscode.TextDocument): vscode.CodeLens {
        const range = new vscode.Range(
            new vscode.Position(lens.range.start.line, lens.range.start.character),
            new vscode.Position(lens.range.end.line, lens.range.end.character)
        );

        const command = lens.command ? {
            title: lens.command.title,
            command: lens.command.command,
            arguments: lens.command.arguments || []
        } : undefined;

        return new vscode.CodeLens(range, command);
    }

    public refresh() {
        this.onDidChangeCodeLensesEmitter.fire();
    }
}
