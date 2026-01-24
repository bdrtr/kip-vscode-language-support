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
import { 
    Program, 
    ASTVisitor, 
    TypeDeclaration, 
    FunctionDefinition, 
    VariableDefinition, 
    FunctionCall, 
    VariableReference,
    Expression
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
    types: Set<string>;
    typePhrases: Map<string, string>; // Maps type phrase to base type name
    variables: Set<string>; // Variable definitions (Defn statements)
    variableRefs: Set<string>; // All variable references in expressions
    keywords: Set<string>;
}

const documentStates = new Map<string, DocumentState>();

// Kip keywords
const kipKeywords = new Set<string>([
    'Bir', 'bir', 'ya', 'da', 'olabilir', 'var', 'olamaz',
    'değilse', 'yazdır', 'diyelim', 'olsun', 'olarak', 'yerleşik',
    'ise', 'ile', 'yükle', 'doğru', 'yanlış', 'doğruysa', 'yanlışsa', 'yokluksa'
]);

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
            types: state.types,
            typePhrases: state.typePhrases,
            variables: state.variables,
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
    const types = new Set<string>();
    const typePhrases = new Map<string, string>(); // Maps type phrase to base type name
    const variables = new Set<string>(); // Variables from Defn statements
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
            const visitExpr = (expr: Expression) => {
                if (expr.type === 'VariableReference') {
                    variableRefs.add((expr as VariableReference).name);
                } else if (expr.type === 'FunctionCall') {
                    const call = expr as FunctionCall;
                    variableRefs.add(call.functionName);
                    call.arguments.forEach(visitExpr);
                }
            };
            node.arguments.forEach(visitExpr);
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
    
    return { symbols, functions, types, typePhrases, variables, variableRefs, keywords: kipKeywords };
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

// Hover handler
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
        const wordRange = getWordAtPosition(line, position.character);
        
        if (!wordRange) return null;
        
        const word = line.substring(wordRange.start, wordRange.end);
        
        let content: MarkupContent | null = null;
        
        if (state.functions.has(word)) {
            content = {
                kind: MarkupKind.Markdown,
                value: `**Function:** ${word}`
            };
        } else if (state.types.has(word)) {
            content = {
                kind: MarkupKind.Markdown,
                value: `**Type:** ${word}`
            };
        } else if (state.variables.has(word)) {
            content = {
                kind: MarkupKind.Markdown,
                value: `**Variable:** ${word}`
            };
        } else if (state.keywords.has(word)) {
            content = {
                kind: MarkupKind.Markdown,
                value: `**Keyword:** ${word}`
            };
        }
        
        if (content) {
            return {
                contents: content,
                range: {
                    start: { line: position.line, character: wordRange.start },
                    end: { line: position.line, character: wordRange.end }
                }
            };
        }
        
        return null;
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

// Semantic tokens handler
connection.onRequest('textDocument/semanticTokens/full', (params: SemanticTokensParams): SemanticTokens => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) return { data: [] };
        
        const state = documentStates.get(params.textDocument.uri);
        if (!state) return { data: [] };
    
    const text = document.getText();
    const tokens: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    
    const tokenPattern = /\d+(?:'?\p{L}+)?|\p{L}+(?:-\p{L}+)*|[(),.]|"[^"]*"/gu;
    let match;
    
    const allTokens: Array<{ token: string; start: number; line: number; char: number }> = [];
    while ((match = tokenPattern.exec(text)) !== null) {
        const token = match[0];
        const start = match.index;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        allTokens.push({ token, start, line, char });
    }
    
    for (let i = 0; i < allTokens.length; i++) {
        const token = allTokens[i].token;
        const start = allTokens[i].start;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        
        let tokenType: number | null = null;
        
        if (token.startsWith('"')) {
            tokenType = 3; // string
        } else if (/^\d/.test(token)) {
            tokenType = 4; // number
        } else if (state.keywords.has(token)) {
            tokenType = 0; // keyword
        } else {
            let foundType = false;
            
            // Check 2-word phrases
            if (i + 1 < allTokens.length) {
                const twoWord = `${token} ${allTokens[i + 1].token}`;
                if (state.types.has(twoWord)) {
                    tokenType = 5; // type
                    foundType = true;
                }
            }
            
            // Check 3-word phrases
            if (!foundType && i + 2 < allTokens.length) {
                const threeWord = `${token} ${allTokens[i + 1].token} ${allTokens[i + 2].token}`;
                if (state.types.has(threeWord)) {
                    tokenType = 5; // type
                    foundType = true;
                }
            }
            
            // Check if this word is part of a type
            if (!foundType) {
                for (const [typeWord, fullType] of state.typePhrases.entries()) {
                    if (token.includes(typeWord) || typeWord.includes(token)) {
                        const baseWord = typeWord.split(' ')[0];
                        if (token.startsWith(baseWord) || baseWord.startsWith(token.substring(0, 3))) {
                            tokenType = 5; // type
                            foundType = true;
                            break;
                        }
                    }
                }
            }
            
            // Check single word types
            if (!foundType && state.types.has(token)) {
                tokenType = 5; // type
            } else if (!foundType && state.functions.has(token)) {
                tokenType = 1; // function
            } else if (!foundType && (state.variables.has(token) || state.variableRefs.has(token))) {
                tokenType = 2; // variable
            }
        }
        
        if (tokenType !== null) {
            const deltaLine = line - prevLine;
            const deltaChar = deltaLine === 0 ? char - prevChar : char;
            
            tokens.push(deltaLine, deltaChar, token.length, tokenType, 0);
            
            prevLine = line;
            prevChar = char;
        }
    }
    
    return { data: tokens };
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

// Semantic tokens range handler
connection.onRequest('textDocument/semanticTokens/range', (params: SemanticTokensRangeParams): SemanticTokens => {
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return { data: [] };
        }
        
        const state = documentStates.get(params.textDocument.uri);
        if (!state) {
            return { data: [] };
        }
    
    // For now, return full semantic tokens (can be optimized later to only return tokens in range)
    const text = document.getText();
    const tokens: number[] = [];
    let prevLine = 0;
    let prevChar = 0;
    
    // Use the same improved tokenization logic as full semantic tokens
    const tokenPattern = /\d+(?:'?\p{L}+)?|\p{L}+(?:-\p{L}+)*|[(),.]|"[^"]*"/gu;
    let match;
    
    // First pass: collect all tokens with positions
    const allTokens: Array<{ token: string; start: number; line: number; char: number }> = [];
    while ((match = tokenPattern.exec(text)) !== null) {
        const token = match[0];
        const start = match.index;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        allTokens.push({ token, start, line, char });
    }
    
    const range = params.range;
    
    // Second pass: check for multi-word type references and individual type words
    for (let i = 0; i < allTokens.length; i++) {
        const token = allTokens[i].token;
        const start = allTokens[i].start;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        
        // Check if token is within requested range
        if (line < range.start.line || line > range.end.line) {
            continue;
        }
        if (line === range.start.line && char < range.start.character) {
            continue;
        }
        if (line === range.end.line && char + token.length > range.end.character) {
            continue;
        }
        
        let tokenType: number | null = null;
        
        if (token.startsWith('"')) {
            tokenType = 3; // string
        } else if (/^\d/.test(token)) {
            tokenType = 4; // number
        } else if (state.keywords.has(token)) {
            tokenType = 0; // keyword
        } else {
            // Check for multi-word type references (e.g., "öğe listesi")
            let foundType = false;
            
            // Check 2-word phrases
            if (i + 1 < allTokens.length) {
                const twoWord = `${token} ${allTokens[i + 1].token}`;
                if (state.types.has(twoWord)) {
                    tokenType = 5; // type
                    foundType = true;
                }
            }
            
            // Check 3-word phrases
            if (!foundType && i + 2 < allTokens.length) {
                const threeWord = `${token} ${allTokens[i + 1].token} ${allTokens[i + 2].token}`;
                if (state.types.has(threeWord)) {
                    tokenType = 5; // type
                    foundType = true;
                }
            }
            
            // Check if this word is part of a type (e.g., "öğenin" -> "öğe" -> type)
            if (!foundType) {
                // Check if word is a type reference (e.g., "öğenin" contains "öğe")
                for (const [typeWord, fullType] of state.typePhrases.entries()) {
                    if (token.includes(typeWord) || typeWord.includes(token)) {
                        // Check if it's a grammatical variation (Turkish genitive/accusative)
                        const baseWord = typeWord.split(' ')[0]; // Get first word of type
                        if (token.startsWith(baseWord) || baseWord.startsWith(token.substring(0, 3))) {
                            tokenType = 5; // type
                            foundType = true;
                            break;
                        }
                    }
                }
            }
            
            // Check single word types
            if (!foundType && state.types.has(token)) {
                tokenType = 5; // type
            } else if (!foundType && state.functions.has(token)) {
                tokenType = 1; // function
            } else if (!foundType && (state.variables.has(token) || state.variableRefs.has(token))) {
                tokenType = 2; // variable (definition or reference)
            }
        }
        
        if (tokenType !== null) {
            const deltaLine = line - prevLine;
            const deltaChar = deltaLine === 0 ? char - prevChar : char;
            
            tokens.push(deltaLine, deltaChar, token.length, tokenType, 0);
            
            prevLine = line;
            prevChar = char;
        }
    }
    
    return { data: tokens };
});

// Listen for document changes
documents.listen(connection);

// Start server with error handling
log('Starting server...');

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
