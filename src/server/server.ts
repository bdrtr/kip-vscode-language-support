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

// Semantic tokens handler - follows original Kip LSP logic
// Original: extractSemanticTokens processes statements and finds all occurrences of identifiers
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
        
        // Find all occurrences of identifiers (like original findAllOccurrences)
        // Process in order: types, functions, variables, keywords
        const allIdentifiers: Array<{ name: string; type: number; positions: Array<{ line: number; char: number; length: number }> }> = [];
        
        // Collect all type occurrences (including multi-word types)
        // Process multi-word types first to avoid partial matches
        const sortedTypes = Array.from(state.types).sort((a, b) => b.length - a.length); // Longer first
        for (const typeName of sortedTypes) {
            const positions = findAllOccurrences(text, typeName);
            if (positions.length > 0) {
                allIdentifiers.push({ name: typeName, type: 5, positions });
            }
        }
        
        // Also handle type phrase parts (e.g., "öğe" from "öğe listesi")
        // But only if they're not already covered by full type name
        for (const [typeWord, fullType] of state.typePhrases.entries()) {
            // Only process if the full type wasn't found or if this is a grammatical variation
            if (!state.types.has(typeWord)) {
                // Find occurrences that might be grammatical variations
                const positions = findAllOccurrences(text, typeWord);
                // Filter to only include positions that aren't already covered by full type
                const filteredPositions = positions.filter(pos => {
                    // Check if this position is already covered by a full type occurrence
                    return !allIdentifiers.some(ident => 
                        ident.type === 5 && ident.positions.some(p => 
                            p.line === pos.line && 
                            Math.abs(p.char - pos.char) < 5 // Close positions
                        )
                    );
                });
                if (filteredPositions.length > 0) {
                    allIdentifiers.push({ name: typeWord, type: 5, positions: filteredPositions });
                }
            }
        }
        
        // Collect all function occurrences
        for (const funcName of state.functions) {
            const positions = findAllOccurrences(text, funcName);
            if (positions.length > 0) {
                allIdentifiers.push({ name: funcName, type: 1, positions });
            }
        }
        
        // Collect all variable occurrences (definitions and references)
        const allVars = new Set([...state.variables, ...state.variableRefs]);
        for (const varName of allVars) {
            // Skip if already marked as type or function
            if (!state.types.has(varName) && !state.functions.has(varName)) {
                const positions = findAllOccurrences(text, varName);
                if (positions.length > 0) {
                    allIdentifiers.push({ name: varName, type: 2, positions });
                }
            }
        }
        
        // Collect keyword occurrences
        for (const keyword of state.keywords) {
            const positions = findAllOccurrences(text, keyword);
            if (positions.length > 0) {
                allIdentifiers.push({ name: keyword, type: 0, positions });
            }
        }
        
        // Collect string and number literals
        const stringPattern = /"[^"]*"/g;
        let match;
        while ((match = stringPattern.exec(text)) !== null) {
            const start = match.index;
            const textBefore = text.substring(0, start);
            const linesBefore = textBefore.split('\n');
            const line = linesBefore.length - 1;
            const char = linesBefore[linesBefore.length - 1].length;
            allIdentifiers.push({
                name: match[0],
                type: 3,
                positions: [{ line, char, length: match[0].length }]
            });
        }
        
        const numberPattern = /\d+(?:'?\p{L}+)?/gu;
        while ((match = numberPattern.exec(text)) !== null) {
            const start = match.index;
            const textBefore = text.substring(0, start);
            const linesBefore = textBefore.split('\n');
            const line = linesBefore.length - 1;
            const char = linesBefore[linesBefore.length - 1].length;
            allIdentifiers.push({
                name: match[0],
                type: 4,
                positions: [{ line, char, length: match[0].length }]
            });
        }
        
        // Sort all positions by line and character
        const allPositions: Array<{ line: number; char: number; length: number; type: number }> = [];
        for (const ident of allIdentifiers) {
            for (const pos of ident.positions) {
                allPositions.push({ ...pos, type: ident.type });
            }
        }
        
        // Sort by position (line, then char)
        allPositions.sort((a, b) => {
            if (a.line !== b.line) return a.line - b.line;
            return a.char - b.char;
        });
        
        // Build semantic tokens array (delta encoding)
        for (const pos of allPositions) {
            const deltaLine = pos.line - prevLine;
            const deltaChar = deltaLine === 0 ? pos.char - prevChar : pos.char;
            
            tokens.push(deltaLine, deltaChar, pos.length, pos.type, 0);
            
            prevLine = pos.line;
            prevChar = pos.char;
        }
        
        return { data: tokens };
    } catch (error) {
        logError('Error in semanticTokens/full', error);
        return { data: [] };
    }
});

// Helper function to find all occurrences of a string in text (like original findAllOccurrences)
function findAllOccurrences(text: string, needle: string): Array<{ line: number; char: number; length: number }> {
    const positions: Array<{ line: number; char: number; length: number }> = [];
    let offset = 0;
    
    while (true) {
        const index = text.indexOf(needle, offset);
        if (index === -1) break;
        
        const textBefore = text.substring(0, index);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        
        positions.push({ line, char, length: needle.length });
        
        offset = index + needle.length;
    }
    
    return positions;
}

// Semantic tokens range handler - uses same logic as full but filters by range
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
        
        const text = document.getText();
        const range = params.range;
        const tokens: number[] = [];
        let prevLine = 0;
        let prevChar = 0;
        
        // Find all occurrences (same as full)
        const allIdentifiers: Array<{ name: string; type: number; positions: Array<{ line: number; char: number; length: number }> }> = [];
        
        for (const typeName of state.types) {
            const positions = findAllOccurrences(text, typeName).filter(pos => 
                isPositionInRange(pos.line, pos.char, pos.length, range)
            );
            if (positions.length > 0) {
                allIdentifiers.push({ name: typeName, type: 5, positions });
            }
        }
        
        for (const funcName of state.functions) {
            const positions = findAllOccurrences(text, funcName).filter(pos => 
                isPositionInRange(pos.line, pos.char, pos.length, range)
            );
            if (positions.length > 0) {
                allIdentifiers.push({ name: funcName, type: 1, positions });
            }
        }
        
        const allVars = new Set([...state.variables, ...state.variableRefs]);
        for (const varName of allVars) {
            if (!state.types.has(varName) && !state.functions.has(varName)) {
                const positions = findAllOccurrences(text, varName).filter(pos => 
                    isPositionInRange(pos.line, pos.char, pos.length, range)
                );
                if (positions.length > 0) {
                    allIdentifiers.push({ name: varName, type: 2, positions });
                }
            }
        }
        
        for (const keyword of state.keywords) {
            const positions = findAllOccurrences(text, keyword).filter(pos => 
                isPositionInRange(pos.line, pos.char, pos.length, range)
            );
            if (positions.length > 0) {
                allIdentifiers.push({ name: keyword, type: 0, positions });
            }
        }
        
        const stringPattern = /"[^"]*"/g;
        let match;
        while ((match = stringPattern.exec(text)) !== null) {
            const start = match.index;
            const textBefore = text.substring(0, start);
            const linesBefore = textBefore.split('\n');
            const line = linesBefore.length - 1;
            const char = linesBefore[linesBefore.length - 1].length;
            if (isPositionInRange(line, char, match[0].length, range)) {
                allIdentifiers.push({
                    name: match[0],
                    type: 3,
                    positions: [{ line, char, length: match[0].length }]
                });
            }
        }
        
        const numberPattern = /\d+(?:'?\p{L}+)?/gu;
        while ((match = numberPattern.exec(text)) !== null) {
            const start = match.index;
            const textBefore = text.substring(0, start);
            const linesBefore = textBefore.split('\n');
            const line = linesBefore.length - 1;
            const char = linesBefore[linesBefore.length - 1].length;
            if (isPositionInRange(line, char, match[0].length, range)) {
                allIdentifiers.push({
                    name: match[0],
                    type: 4,
                    positions: [{ line, char, length: match[0].length }]
                });
            }
        }
        
        const allPositions: Array<{ line: number; char: number; length: number; type: number }> = [];
        for (const ident of allIdentifiers) {
            for (const pos of ident.positions) {
                allPositions.push({ ...pos, type: ident.type });
            }
        }
        
        allPositions.sort((a, b) => {
            if (a.line !== b.line) return a.line - b.line;
            return a.char - b.char;
        });
        
        for (const pos of allPositions) {
            const deltaLine = pos.line - prevLine;
            const deltaChar = deltaLine === 0 ? pos.char - prevChar : pos.char;
            
            tokens.push(deltaLine, deltaChar, pos.length, pos.type, 0);
            
            prevLine = pos.line;
            prevChar = pos.char;
        }
        
        return { data: tokens };
    } catch (error) {
        logError('Error in semanticTokens/range', error);
        return { data: [] };
    }
});

// Helper to check if position is within range
function isPositionInRange(line: number, char: number, length: number, range: Range): boolean {
    if (line < range.start.line || line > range.end.line) {
        return false;
    }
    if (line === range.start.line && char < range.start.character) {
        return false;
    }
    if (line === range.end.line && char + length > range.end.character) {
        return false;
    }
    return true;
}

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
