import {
    createConnection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    CompletionItem,
    CompletionItemKind,
    Hover,
    MarkupContent,
    MarkupKind,
    Definition,
    Location,
    ReferenceParams,
    DocumentSymbolParams,
    SymbolInformation,
    SymbolKind,
    SemanticTokensParams,
    SemanticTokens,
    SemanticTokensLegend,
    Position,
    Range,
    TextDocumentPositionParams,
    TextDocumentChangeEvent,
    DidChangeConfigurationParams,
    WorkspaceSymbolParams,
    DocumentFormattingParams,
    TextEdit,
    CodeActionParams,
    CodeAction,
    CodeLensParams,
    CodeLens,
    SemanticTokensRangeParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parse, tokenize } from './parser';
import { tokenize as lexerTokenize, KIP_KEYWORDS, KEYWORD_KINDS, type Token } from './lexer';
import { 
    Program, 
    ASTVisitor, 
    TypeDeclaration, 
    FunctionDefinition, 
    VariableDefinition, 
    FunctionCall, 
    VariableReference,
    Expression,
    ConditionalExpression,
    PatternMatch
} from './ast';

// Logging helper - only log critical errors
const DEBUG = process.env.NODE_ENV !== 'production';
function log(message: string, ...args: any[]): void {
    // Removed - no verbose logging in production
}

function logError(message: string, error: any): void {
    // Only log critical errors
    const timestamp = new Date().toISOString();
    const errorMessage = `[LSP Server ${timestamp}] ERROR: ${message}`;
    console.error(errorMessage);
    
    if (error instanceof Error) {
        console.error(`  Message: ${error.message}`);
        if (DEBUG && error.stack) {
            console.error(`  Stack: ${error.stack}`);
        }
    } else {
        console.error(`  Error: ${String(error)}`);
    }
}

// LSP Server bağlantısı oluştur (stdio transport)
const connection = createConnection(process.stdin, process.stdout);

// Document'leri yönet
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Document state cache
interface DocumentState {
    text: string;
    diagnostics: Diagnostic[];
    symbols: SymbolInformation[];
    functions: Set<string>;
    functionDetails: Map<string, { parameters: string[]; isGerund: boolean; range: Range }>; // Function details
    types: Set<string>;
    typeDetails: Map<string, { constructors: string[]; range: Range }>; // Type details
    typePhrases: Map<string, string>; // Maps type phrase to base type name
    variables: Set<string>; // Variable definitions (Defn statements)
    variableDetails: Map<string, { range: Range }>; // Variable details
    variableRefs: Set<string>; // All variable references in expressions
    keywords: Set<string>;
}

const documentStates = new Map<string, DocumentState>();

// Anahtar kelimeler tek kaynak: ra-kip kip-lexer token.rs

/**
 * Semantic token listesi (renklendirme).
 * Kılavuz: https://github.com/kip-dili/kip/wiki/Kılavuz
 *
 * - Keyword, string, number: lexer TokenKind (token.rs ile aynı).
 * - Tip/fonksiyon/değişken: AST (analyzeDocument) + Türkçe ek uyumu (isim halleri).
 * - Çok kelimeli tipler: "öğe listesi", "uzunluk tam-sayısı" (Kılavuz: bazen boşluklu ifade).
 */
function emitSemanticTokens(
    allTokens: Token[],
    state: DocumentState,
    range?: Range
): number[] {
    const out: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    const marked = new Set<number>();

    function inRange(t: Token): boolean {
        if (!range) return true;
        if (t.line < range.start.line || t.line > range.end.line) return false;
        if (t.line === range.start.line && t.char + t.text.length < range.start.character) return false;
        if (t.line === range.end.line && t.char > range.end.character) return false;
        return true;
    }

    function push(line: number, char: number, len: number, type: number): void {
        const dLine = line - prevLine;
        const dChar = dLine === 0 ? char - prevChar : char;
        out.push(dLine, dChar, len, type, 0);
        prevLine = line;
        prevChar = char;
    }

    const allVars = new Set([...state.variables, ...state.variableRefs]);
    const turkishSuffix = /^[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,6}$/;

    for (let i = 0; i < allTokens.length; i++) {
        if (marked.has(i)) continue;
        const t = allTokens[i];
        if (range && !inRange(t)) continue;

        let tokenType: number | null = null;
        let tokenLen = t.text.length;
        const toMark = [i];

        if (KEYWORD_KINDS.has(t.kind)) {
            tokenType = 0;
        } else if (t.kind === 'String') {
            tokenType = 3;
        } else if (t.kind === 'Float' || t.kind === 'Integer' || t.kind === 'IntegerWithSuffix') {
            tokenType = 4;
        } else if (t.kind === 'Ident') {
            let found = false;
            const text = t.text;

            if (i + 1 < allTokens.length && allTokens[i + 1].kind === 'Ident') {
                const n = allTokens[i + 1].text;
                const two = `${text} ${n}`;
                if (state.types.has(two)) {
                    tokenType = 5;
                    found = true;
                    tokenLen = text.length + 1 + n.length;
                    toMark.push(i + 1);
                } else {
                    for (const tn of state.types) {
                        if (!tn.includes(' ')) continue;
                        const [f, ...r] = tn.split(' ');
                        const rest = r.join(' ');
                        if (!text.startsWith(f) || !n.startsWith(rest)) continue;
                        const s1 = text.slice(f.length);
                        const s2 = n.slice(rest.length);
                        if ((!s1 || turkishSuffix.test(s1)) && (!s2 || turkishSuffix.test(s2))) {
                            tokenType = 5;
                            found = true;
                            tokenLen = text.length + 1 + n.length;
                            toMark.push(i + 1);
                            break;
                        }
                    }
                }
            }
            if (!found && i + 2 < allTokens.length &&
                allTokens[i + 1].kind === 'Ident' && allTokens[i + 2].kind === 'Ident') {
                const three = `${text} ${allTokens[i + 1].text} ${allTokens[i + 2].text}`;
                if (state.types.has(three)) {
                    tokenType = 5;
                    found = true;
                    tokenLen = text.length + 1 + allTokens[i + 1].text.length + 1 + allTokens[i + 2].text.length;
                    toMark.push(i + 1, i + 2);
                }
            }
            if (!found) {
                if (state.types.has(text)) {
                    tokenType = 5;
                    found = true;
                } else {
                    for (const tn of state.types) {
                        if (tn.includes(' ') || !text.startsWith(tn) || text.length <= tn.length) continue;
                        if (turkishSuffix.test(text.slice(tn.length))) {
                            tokenType = 5;
                            found = true;
                            break;
                        }
                    }
                }
            }
            if (!found && state.functions.has(text)) {
                tokenType = 1;
                found = true;
            }
            if (!found) {
                for (const fn of state.functions) {
                    if (!text.startsWith(fn) || text.length <= fn.length) continue;
                    if (turkishSuffix.test(text.slice(fn.length))) {
                        tokenType = 1;
                        found = true;
                        break;
                    }
                }
            }
            if (!found && allVars.has(text)) {
                tokenType = 2;
                found = true;
            }
            if (!found) {
                for (const vn of allVars) {
                    if (!text.startsWith(vn) || text.length <= vn.length) continue;
                    if (turkishSuffix.test(text.slice(vn.length))) {
                        tokenType = 2;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (tokenType !== null) {
            for (const j of toMark) marked.add(j);
            push(t.line, t.char, tokenLen, tokenType);
        }
    }

    return out;
}

// Semantic tokens legend
const semanticTokensLegend: SemanticTokensLegend = {
    tokenTypes: [
        'keyword',      // 0
        'function',     // 1
        'variable',     // 2
        'string',       // 3
        'number',       // 4
        'type',         // 5
        'operator',     // 6
        'property',     // 7
        'enumMember',   // 8
        'event',        // 9
        'modifier',     // 10
        'class',        // 11
        'interface',    // 12
        'namespace',    // 13
        'parameter',    // 14
        'comment',      // 15
        'enum',         // 16
        'struct',       // 17
        'typeParameter', // 18
        'decorator'     // 19
    ],
    tokenModifiers: [
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
};

// Initialize handler
connection.onInitialize((params: InitializeParams): InitializeResult => {
    try {
        const capabilities: any = {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                triggerCharacters: ['-', "'"]
            },
            hoverProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            documentSymbolProvider: true,
            semanticTokensProvider: {
                legend: semanticTokensLegend,
                range: true,
                full: {
                    delta: false
                }
            },
            workspaceSymbolProvider: true,
            codeActionProvider: true,
            codeLensProvider: {
                resolveProvider: false
            },
            documentHighlightProvider: true,
            renameProvider: true,
            documentFormattingProvider: true
        };
        
        return { capabilities };
    } catch (error) {
        logError('Error in onInitialize', error);
        throw error;
    }
});

connection.onInitialized(() => {
    // Server initialized successfully
});

// Document change handler
documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
    try {
        validateDocument(change.document);
    } catch (error) {
        logError(`Error validating document: ${change.document.uri}`, error);
    }
});

// Document open handler
documents.onDidOpen((event) => {
    try {
        validateDocument(event.document);
    } catch (error) {
        logError(`Error validating document: ${event.document.uri}`, error);
    }
});

function validateDocument(document: TextDocument): void {
    try {
        const text = document.getText();
        const diagnostics: Diagnostic[] = [];
        
        // Analyze document and extract symbols
        const state = analyzeDocument(text);
        
        // Update document state with URI
        const symbolsWithUri = state.symbols.map(s => ({
            ...s,
            location: {
                uri: document.uri,
                range: s.location.range
            }
        }));
        
        documentStates.set(document.uri, {
            text,
            diagnostics,
            symbols: symbolsWithUri,
            functions: state.functions,
            functionDetails: state.functionDetails,
            types: state.types,
            typeDetails: state.typeDetails,
            typePhrases: state.typePhrases,
            variables: state.variables,
            variableDetails: state.variableDetails,
            variableRefs: state.variableRefs,
            keywords: state.keywords
        });
        
        // Send diagnostics
        connection.sendDiagnostics({
            uri: document.uri,
            diagnostics
        });
    } catch (error) {
        logError(`Error in validateDocument: ${document.uri}`, error);
        throw error;
    }
}

function analyzeDocument(text: string): Omit<DocumentState, 'text' | 'diagnostics'> {
    // Parse into AST
    const ast = parse(text);
    
    const functions = new Set<string>();
    const functionDetails = new Map<string, { parameters: string[]; isGerund: boolean; range: Range }>();
    const types = new Set<string>();
    const typeDetails = new Map<string, { constructors: string[]; range: Range }>();
    const typePhrases = new Map<string, string>(); // Maps type phrase to base type name
    const variables = new Set<string>(); // Variables from Defn statements
    const variableDetails = new Map<string, { range: Range }>();
    const variableRefs = new Set<string>(); // All variable references in expressions
    const symbols: SymbolInformation[] = [];
    
    // Visit AST to extract symbols
    const visitor: ASTVisitor = {
        visitTypeDeclaration(node: TypeDeclaration) {
            types.add(node.name);
            node.nameParts.forEach(part => {
                types.add(part);
                typePhrases.set(part, node.name);
            });
            typePhrases.set(node.name, node.name);
            
            // Store type details with constructor names
            const constructors = node.constructors.map(c => c.name);
            typeDetails.set(node.name, { constructors, range: node.range });
            
            symbols.push({
                name: node.name,
                kind: SymbolKind.Class,
                location: {
                    uri: '',
                    range: node.range
                }
            });
        },
        
        visitFunctionDefinition(node: FunctionDefinition) {
            functions.add(node.name);
            if (node.isGerund) {
                functions.add(node.name + (node.name.endsWith('a') ? 'mak' : 'mek'));
            }
            
            // Store function details
            const parameters = node.parameters.map(p => p.name);
            functionDetails.set(node.name, { parameters, isGerund: node.isGerund, range: node.range });
            
            // Visit function body if it exists (pattern matching)
            if (node.body) {
                const visitExpr = (expr: Expression, depth: number = 0) => {
                    if (depth > 100) return;
                    
                    if (expr.type === 'VariableReference') {
                        variableRefs.add((expr as VariableReference).name);
                    } else if (expr.type === 'FunctionCall') {
                        const call = expr as FunctionCall;
                        variableRefs.add(call.functionName);
                        call.arguments.forEach(arg => visitExpr(arg, depth + 1));
                    } else if (expr.type === 'PatternMatch') {
                        const match = expr as PatternMatch;
                        visitExpr(match.value, depth + 1);
                        match.patterns.forEach(pattern => {
                            visitExpr(pattern.pattern, depth + 1);
                            visitExpr(pattern.result, depth + 1);
                        });
                    }
                };
                
                visitExpr(node.body, 0);
            }
            
            symbols.push({
                name: node.name,
                kind: SymbolKind.Function,
                location: {
                    uri: '',
                    range: node.range
                }
            });
        },
        
        visitVariableDefinition(node: VariableDefinition) {
            node.names.forEach(name => {
                variables.add(name);
                variableDetails.set(name, { range: node.range });
                symbols.push({
                    name,
                    kind: SymbolKind.Variable,
                    location: {
                        uri: '',
                        range: node.range
                    }
                });
            });
        },
        
        visitFunctionCall(node: FunctionCall) {
            variableRefs.add(node.functionName);
            // Recursively collect variable references from arguments
            // Use depth limit to prevent infinite loops (but allow same expression in different contexts)
            const visitExpr = (expr: Expression, depth: number = 0) => {
                // Prevent stack overflow by limiting depth
                if (depth > 100) {
                    return;
                }
                
                if (expr.type === 'VariableReference') {
                    variableRefs.add((expr as VariableReference).name);
                } else if (expr.type === 'FunctionCall') {
                    const call = expr as FunctionCall;
                    variableRefs.add(call.functionName);
                    call.arguments.forEach(arg => visitExpr(arg, depth + 1));
                } else if (expr.type === 'ConditionalExpression') {
                    const cond = expr as ConditionalExpression;
                    visitExpr(cond.condition, depth + 1);
                    visitExpr(cond.thenBranch, depth + 1);
                    if (cond.elseBranch) {
                        visitExpr(cond.elseBranch, depth + 1);
                    }
                } else if (expr.type === 'PatternMatch') {
                    const match = expr as PatternMatch;
                    visitExpr(match.value, depth + 1);
                    match.patterns.forEach(pattern => {
                        visitExpr(pattern.pattern, depth + 1);
                        visitExpr(pattern.result, depth + 1);
                    });
                }
            };
            node.arguments.forEach(arg => visitExpr(arg, 0));
        },
        
        visitVariableReference(node: VariableReference) {
            variableRefs.add(node.name);
        }
    };
    
    // Traverse AST
    ast.declarations.forEach(decl => {
        if (decl.type === 'TypeDeclaration') {
            visitor.visitTypeDeclaration?.(decl as TypeDeclaration);
        } else if (decl.type === 'FunctionDefinition') {
            visitor.visitFunctionDefinition?.(decl as FunctionDefinition);
        } else if (decl.type === 'VariableDefinition') {
            visitor.visitVariableDefinition?.(decl as VariableDefinition);
        }
    });
    
    ast.expressions.forEach(expr => {
        if (expr.type === 'FunctionCall') {
            visitor.visitFunctionCall?.(expr as FunctionCall);
        } else if (expr.type === 'VariableReference') {
            visitor.visitVariableReference?.(expr as VariableReference);
        }
    });
    
    // Symbols are already created by AST visitor above
    
    return { 
        symbols, 
        functions, 
        functionDetails,
        types, 
        typeDetails,
        typePhrases, 
        variables, 
        variableDetails,
        variableRefs, 
        keywords: KIP_KEYWORDS 
    };
}

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }
        
        const state = documentStates.get(params.textDocument.uri);
        if (!state) {
            return [];
        }
        
        const items: CompletionItem[] = [];
        
        // Add functions
        for (const func of state.functions) {
            items.push({
                label: func,
                kind: CompletionItemKind.Function
            });
        }
        
        // Add types
        for (const type of state.types) {
            items.push({
                label: type,
                kind: CompletionItemKind.Class
            });
        }
        
        // Add variables
        for (const variable of state.variables) {
            items.push({
                label: variable,
                kind: CompletionItemKind.Variable
            });
        }
        
        // Add keywords
        for (const keyword of state.keywords) {
            items.push({
                label: keyword,
                kind: CompletionItemKind.Keyword
            });
        }
        
        return items;
    } catch (error) {
        logError(`Error in onCompletion: ${params.textDocument.uri}`, error);
        return [];
    }
});

// Hover handler - provides detailed information about identifiers
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return null;
        
        const state = documentStates.get(params.textDocument.uri);
        if (!state) return null;
        
        const position = params.position;
        const text = document.getText();
        const lines = text.split('\n');
        const line = lines[position.line] || '';
        
        // Try to find word at position (handle Turkish suffixes)
        const wordRange = getWordAtPosition(line, position.character);
        if (!wordRange) return null;
        
        let word = line.substring(wordRange.start, wordRange.end);
        
        // Check for Turkish suffixes and find base identifier
        let baseWord = word;
        let foundIdentifier: string | null = null;
        let identifierType: 'function' | 'type' | 'variable' | 'keyword' | null = null;
        
        // Check functions
        for (const funcName of state.functions) {
            if (word === funcName || (word.startsWith(funcName) && word.length > funcName.length)) {
                const suffix = word.substring(funcName.length);
                if (/^[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,6}$/.test(suffix)) {
                    foundIdentifier = funcName;
                    identifierType = 'function';
                    baseWord = funcName;
                    break;
                }
            }
        }
        
        // Check types
        if (!foundIdentifier) {
            for (const typeName of state.types) {
                if (word === typeName || (word.startsWith(typeName) && word.length > typeName.length)) {
                    const suffix = word.substring(typeName.length);
                    if (/^[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,6}$/.test(suffix)) {
                        foundIdentifier = typeName;
                        identifierType = 'type';
                        baseWord = typeName;
                        break;
                    }
                }
            }
        }
        
        // Check variables
        if (!foundIdentifier) {
            const allVars = new Set([...state.variables, ...state.variableRefs]);
            for (const varName of allVars) {
                if (word === varName || (word.startsWith(varName) && word.length > varName.length)) {
                    const suffix = word.substring(varName.length);
                    if (/^[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,6}$/.test(suffix)) {
                        foundIdentifier = varName;
                        identifierType = 'variable';
                        baseWord = varName;
                        break;
                    }
                }
            }
        }
        
        // Check exact matches
        if (!foundIdentifier) {
            if (state.functions.has(word)) {
                foundIdentifier = word;
                identifierType = 'function';
            } else if (state.types.has(word)) {
                foundIdentifier = word;
                identifierType = 'type';
            } else if (state.variables.has(word) || state.variableRefs.has(word)) {
                foundIdentifier = word;
                identifierType = 'variable';
            } else if (state.keywords.has(word)) {
                foundIdentifier = word;
                identifierType = 'keyword';
            }
        }
        
        if (!foundIdentifier || !identifierType) return null;
        
        // Build detailed hover content
        let markdown = '';
        
        if (identifierType === 'function') {
            const funcDetail = state.functionDetails.get(foundIdentifier);
            markdown = `### 🔧 Function: \`${foundIdentifier}\`\n\n`;
            
            if (funcDetail) {
                if (funcDetail.parameters.length > 0) {
                    markdown += `**Parametreler:** ${funcDetail.parameters.join(', ')}\n\n`;
                }
                if (funcDetail.isGerund) {
                    markdown += `**Tip:** Gerund (fiilimsi)\n\n`;
                }
            }
            
            markdown += `**Kullanım Örneği:**\n\`\`\`kip\n(${funcDetail?.parameters.join(' ') || 'argümanlar'}) ${foundIdentifier},\n\`\`\`\n\n`;
            markdown += `*Fonksiyon tanımına gitmek için Ctrl+Click kullanın.*`;
            
        } else if (identifierType === 'type') {
            const typeDetail = state.typeDetails.get(foundIdentifier);
            markdown = `### 📦 Type: \`${foundIdentifier}\`\n\n`;
            
            if (typeDetail && typeDetail.constructors.length > 0) {
                markdown += `**Yapıcılar:** ${typeDetail.constructors.join(', ')}\n\n`;
            }
            
            markdown += `**Kullanım Örneği:**\n\`\`\`kip\nBir ${foundIdentifier} ya\n  ${typeDetail?.constructors[0] || 'değer1'},\n  ${typeDetail?.constructors[1] || 'değer2'}\nolabilir.\n\`\`\`\n\n`;
            markdown += `*Tip tanımına gitmek için Ctrl+Click kullanın.*`;
            
        } else if (identifierType === 'variable') {
            const varDetail = state.variableDetails.get(foundIdentifier);
            markdown = `### 📝 Variable: \`${foundIdentifier}\`\n\n`;
            
            if (state.variables.has(foundIdentifier)) {
                markdown += `**Tanım:** Bu değişken bu dosyada tanımlanmıştır.\n\n`;
            } else {
                markdown += `**Referans:** Bu değişkene bir referans.\n\n`;
            }
            
            markdown += `**Kullanım Örneği:**\n\`\`\`kip\n${foundIdentifier} diyelim\n\`\`\`\n\n`;
            markdown += `*Değişken tanımına gitmek için Ctrl+Click kullanın.*`;
            
        } else if (identifierType === 'keyword') {
            markdown = `### 🔑 Keyword: \`${foundIdentifier}\`\n\n`;
            
            // Add keyword-specific documentation
            const keywordDocs: Record<string, string> = {
                'Bir': 'Tip tanımı başlatır. "Bir X ya ... olabilir" formatında kullanılır.',
                'bir': 'Tip tanımı başlatır (küçük harf).',
                'ya': 'Tip yapıcılarını ayırır.',
                'da': '"ya ... da" yapısında kullanılır.',
                'olabilir': 'Tip tanımını bitirir.',
                'var': 'Değer kontrolü yapar.',
                'olamaz': 'Negatif kontrol yapar.',
                'değilse': 'Koşullu ifade için kullanılır.',
                'yazdır': 'Çıktı fonksiyonu.',
                'diyelim': 'Değişken tanımlama.',
                'olsun': 'Değer atama.',
                'olarak': 'Tip dönüşümü.',
                'yerleşik': 'Yerleşik fonksiyon tanımı.'
            };
            
            if (keywordDocs[foundIdentifier]) {
                markdown += `**Açıklama:** ${keywordDocs[foundIdentifier]}\n\n`;
            }
        }
        
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: markdown
            },
            range: {
                start: { line: position.line, character: wordRange.start },
                end: { line: position.line, character: wordRange.end }
            }
        };
    } catch (error) {
        logError(`Error in onHover: ${params.textDocument.uri}`, error);
        return null;
    }
});

function getWordAtPosition(line: string, char: number): { start: number; end: number } | null {
    let start = char;
    let end = char;
    
    // Find word start
    while (start > 0 && /[\p{L}\d-]/u.test(line[start - 1])) {
        start--;
    }
    
    // Find word end
    while (end < line.length && /[\p{L}\d-]/u.test(line[end])) {
        end++;
    }
    
    if (start === end) return null;
    
    return { start, end };
}

// Definition handler
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    
    const state = documentStates.get(params.textDocument.uri);
    if (!state) return null;
    
    const position = params.position;
    const line = document.getText().split('\n')[position.line] || '';
    const wordRange = getWordAtPosition(line, position.character);
    
    if (!wordRange) return null;
    
    const word = line.substring(wordRange.start, wordRange.end);
    
    // Find symbol definition
    const symbol = state.symbols.find(s => s.name === word);
    if (symbol) {
        return {
            uri: params.textDocument.uri,
            range: symbol.location.range
        };
    }
    
    return null;
});

// References handler
connection.onReferences((params: ReferenceParams): Location[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    
    const state = documentStates.get(params.textDocument.uri);
    if (!state) return [];
    
    const position = params.position;
    const line = document.getText().split('\n')[position.line] || '';
    const wordRange = getWordAtPosition(line, position.character);
    
    if (!wordRange) return [];
    
    const word = line.substring(wordRange.start, wordRange.end);
    const locations: Location[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    
    lines.forEach((lineText, lineNum) => {
        let index = 0;
        while ((index = lineText.indexOf(word, index)) !== -1) {
            // Check if it's a whole word
            const before = index > 0 ? lineText[index - 1] : ' ';
            const after = index + word.length < lineText.length ? lineText[index + word.length] : ' ';
            
            if (!/[\p{L}\d-]/u.test(before) && !/[\p{L}\d-]/u.test(after)) {
                locations.push({
                    uri: params.textDocument.uri,
                    range: {
                        start: { line: lineNum, character: index },
                        end: { line: lineNum, character: index + word.length }
                    }
                });
            }
            
            index += word.length;
        }
    });
    
    return locations;
});

// Document symbols handler
connection.onDocumentSymbol((params: DocumentSymbolParams): SymbolInformation[] => {
    try {
        const state = documentStates.get(params.textDocument.uri);
        if (!state) return [];
        
        return state.symbols.map(s => ({
            ...s,
            location: {
                uri: params.textDocument.uri,
                range: s.location.range
            }
        }));
    } catch (error) {
        logError(`Error in onDocumentSymbol: ${params.textDocument.uri}`, error);
        return [];
    }
});

// Document formatting handler
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return [];
        
        const text = document.getText();
        // Simple formatting: trim trailing whitespace, ensure trailing newline
        const lines = text.split('\n');
        const formatted = lines.map(line => line.trimEnd()).join('\n');
        const finalFormatted = formatted.endsWith('\n') ? formatted : formatted + '\n';
        
        if (finalFormatted === text) {
            return [];
        }
        
        // Calculate end position correctly
        const lastLine = lines.length > 0 ? lines.length - 1 : 0;
        const lastLineLength = lines.length > 0 ? lines[lastLine].length : 0;
        
        return [{
            range: {
                start: { line: 0, character: 0 },
                end: { line: lastLine, character: lastLineLength }
            },
            newText: finalFormatted
        }];
    } catch (error) {
        logError(`Error in onDocumentFormatting: ${params.textDocument.uri}`, error);
        return [];
    }
});

// Semantic tokens: lexer (orijinal token.rs) + AST. Anahtar kelimeler ve tipler tek kaynaktan.
connection.onRequest('textDocument/semanticTokens/full', (params: SemanticTokensParams): SemanticTokens => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return { data: [] };
        const state = documentStates.get(params.textDocument.uri);
        if (!state) return { data: [] };
        const allTokens = lexerTokenize(document.getText());
        return { data: emitSemanticTokens(allTokens, state) };
    } catch (error) {
        logError('Error in semanticTokens/full', error);
        return { data: [] };
    }
});

connection.onRequest('textDocument/semanticTokens/range', (params: SemanticTokensRangeParams): SemanticTokens => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return { data: [] };
        const state = documentStates.get(params.textDocument.uri);
        if (!state) return { data: [] };
        const allTokens = lexerTokenize(document.getText());
        return { data: emitSemanticTokens(allTokens, state, params.range) };
    } catch (error) {
        logError('Error in semanticTokens/range', error);
        return { data: [] };
    }
});

// Workspace symbols handler
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    try {
        const allSymbols: SymbolInformation[] = [];
        
        documentStates.forEach((state, uri) => {
            state.symbols.forEach(symbol => {
                if (!params.query || symbol.name.toLowerCase().includes(params.query.toLowerCase())) {
                    allSymbols.push({
                        ...symbol,
                        location: {
                            uri,
                            range: symbol.location.range
                        }
                    });
                }
            });
        });
        
        return allSymbols;
    } catch (error) {
        logError(`Error in onWorkspaceSymbol`, error);
        return [];
    }
});

// Code action handler
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    try {
        // Return empty array for now - can be extended later
        return [];
    } catch (error) {
        logError(`Error in onCodeAction: ${params.textDocument.uri}`, error);
        return [];
    }
});

// Code lens handler
connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
    // Return empty array for now - can be extended later
    return [];
});


// Listen for document changes
documents.listen(connection);

// Start server with error handling
try {
    // Set up uncaught exception handler
    process.on('uncaughtException', (error) => {
        logError('Uncaught exception in LSP server', error);
        process.exit(1);
    });
    
    process.on('unhandledRejection', (reason) => {
        logError('Unhandled rejection in LSP server', reason);
    });
    
    if (!process.stdin || !process.stdout) {
        logError('stdin or stdout not available', null);
        process.exit(1);
    }
    
    connection.listen();
} catch (error) {
    logError('Failed to start LSP server', error);
    process.exit(1);
}
