import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { SemanticProvider } from './semanticProvider';

/**
 * LSP semantic bilgilerini kullanarak workspace symbols sağlar
 */
export class KipWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    private client: LanguageClient;
    private semanticProvider: SemanticProvider;

    constructor(client: LanguageClient, semanticProvider: SemanticProvider) {
        this.client = client;
        this.semanticProvider = semanticProvider;
    }

    async provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        // Önce LSP'den workspace symbols iste
        try {
            const result = await this.client.sendRequest('workspace/symbol', {
                query: query
            });

            if (result && Array.isArray(result)) {
                return result.map(sym => this.convertSymbolInformation(sym));
            }
        } catch (error) {
            // LSP workspace symbols yoksa, semantic tokens kullan
            console.log('LSP workspace symbols not available, using semantic tokens');
        }

        // Fallback: Tüm Kip dosyalarından semantic tokens topla
        const allSymbols: vscode.SymbolInformation[] = [];
        
        try {
            const kipFiles = await vscode.workspace.findFiles(
                '**/*.kip',
                '**/node_modules/**',
                1000,
                token
            );

            for (const file of kipFiles) {
                if (token.isCancellationRequested) {
                    break;
                }

                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const symbols = await this.semanticProvider.extractSymbols(document);
                    
                    // Sadece function ve type'ları ekle
                    for (const sym of symbols) {
                        if (sym.kind === vscode.SymbolKind.Function ||
                            sym.kind === vscode.SymbolKind.Class) {
                            
                            // Query ile filtrele
                            if (!query || 
                                sym.name.toLowerCase().includes(query.toLowerCase()) ||
                                this.semanticProvider.stripCaseSuffixes(sym.name.toLowerCase()).includes(query.toLowerCase())) {
                                
                                allSymbols.push(new vscode.SymbolInformation(
                                    sym.name,
                                    sym.kind,
                                    '',
                                    new vscode.Location(file, sym.range)
                                ));
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error processing file ${file.fsPath}:`, error);
                }
            }
        } catch (error) {
            console.error('Error finding Kip files:', error);
        }

        return allSymbols;
    }

    private convertSymbolInformation(sym: any): vscode.SymbolInformation {
        return new vscode.SymbolInformation(
            sym.name,
            this.convertSymbolKind(sym.kind),
            sym.containerName || '',
            new vscode.Location(
                vscode.Uri.parse(sym.location.uri),
                new vscode.Range(
                    new vscode.Position(sym.location.range.start.line, sym.location.range.start.character),
                    new vscode.Position(sym.location.range.end.line, sym.location.range.end.character)
                )
            )
        );
    }

    private convertSymbolKind(kind: number): vscode.SymbolKind {
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
}
