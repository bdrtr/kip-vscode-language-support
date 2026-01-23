import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak document symbols sağlar
 */
export class KipSymbolProvider implements vscode.DocumentSymbolProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
    }

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        // Önce LSP'den document symbols iste
        try {
            const result = await this.client.sendRequest('textDocument/documentSymbol', {
                textDocument: {
                    uri: document.uri.toString()
                }
            });

            if (result && Array.isArray(result)) {
                return result.map(sym => this.convertDocumentSymbol(sym));
            }
        } catch (error) {
            // LSP document symbols yoksa, semantic tokens kullan
            console.log('LSP document symbols not available, using semantic tokens');
        }

        // Fallback: Semantic tokens kullan
        const symbols = await this.semanticProvider.extractSymbols(document);
        
        // Sadece function, type ve variable'ları döndür (outline için)
        const documentSymbols: vscode.DocumentSymbol[] = [];
        
        for (const sym of symbols) {
            if (sym.kind === vscode.SymbolKind.Function ||
                sym.kind === vscode.SymbolKind.Class ||
                sym.kind === vscode.SymbolKind.Variable) {
                
                documentSymbols.push(new vscode.DocumentSymbol(
                    sym.name,
                    sym.type,
                    sym.kind,
                    sym.range,
                    sym.range
                ));
            }
        }

        // Hiyerarşik yapı oluştur (iç içe fonksiyonlar için)
        return this.buildHierarchy(documentSymbols);
    }

    private convertDocumentSymbol(sym: any): vscode.DocumentSymbol {
        const range = new vscode.Range(
            new vscode.Position(sym.range.start.line, sym.range.start.character),
            new vscode.Position(sym.range.end.line, sym.range.end.character)
        );

        const selectionRange = sym.selectionRange ? new vscode.Range(
            new vscode.Position(sym.selectionRange.start.line, sym.selectionRange.start.character),
            new vscode.Position(sym.selectionRange.end.line, sym.selectionRange.end.character)
        ) : range;

        const symbol = new vscode.DocumentSymbol(
            sym.name,
            sym.detail || '',
            this.convertSymbolKind(sym.kind),
            range,
            selectionRange
        );

        if (sym.children && Array.isArray(sym.children)) {
            symbol.children = sym.children.map((child: any) => this.convertDocumentSymbol(child));
        }

        return symbol;
    }

    private convertSymbolKind(kind: number): vscode.SymbolKind {
        // LSP SymbolKind enum değerlerini VSCode SymbolKind'a dönüştür
        const kindMap: Record<number, vscode.SymbolKind> = {
            1: vscode.SymbolKind.File,
            2: vscode.SymbolKind.Module,
            3: vscode.SymbolKind.Namespace,
            4: vscode.SymbolKind.Package,
            5: vscode.SymbolKind.Class,
            6: vscode.SymbolKind.Method,
            7: vscode.SymbolKind.Property,
            8: vscode.SymbolKind.Field,
            9: vscode.SymbolKind.Constructor,
            10: vscode.SymbolKind.Enum,
            11: vscode.SymbolKind.Interface,
            12: vscode.SymbolKind.Function,
            13: vscode.SymbolKind.Variable,
            14: vscode.SymbolKind.Constant,
            15: vscode.SymbolKind.String,
            16: vscode.SymbolKind.Number,
            17: vscode.SymbolKind.Boolean,
            18: vscode.SymbolKind.Array,
            19: vscode.SymbolKind.Object,
            20: vscode.SymbolKind.Key,
            21: vscode.SymbolKind.Null,
            22: vscode.SymbolKind.EnumMember,
            23: vscode.SymbolKind.Struct,
            24: vscode.SymbolKind.Event,
            25: vscode.SymbolKind.Operator,
            26: vscode.SymbolKind.TypeParameter
        };

        return kindMap[kind] || vscode.SymbolKind.Variable;
    }

    private buildHierarchy(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        // Basit hiyerarşi: iç içe olan sembolleri bul
        const result: vscode.DocumentSymbol[] = [];
        const sorted = symbols.sort((a, b) => a.range.start.line - b.range.start.line);

        for (const symbol of sorted) {
            // Bu sembolün parent'ı var mı?
            let parent = result.find(s => 
                s.range.contains(symbol.range.start) && 
                s !== symbol &&
                (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Class)
            );

            if (parent) {
                if (!parent.children) {
                    parent.children = [];
                }
                parent.children.push(symbol);
            } else {
                result.push(symbol);
            }
        }

        return result;
    }
}
