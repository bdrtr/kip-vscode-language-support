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

// Logging helper - only log errors in production
const DEBUG = process.env.NODE_ENV !== 'production';
function log(message: string, ...args: any[]): void {
    if (DEBUG) {
        const timestamp = new Date().toISOString();
        const logMessage = `[LSP Server ${timestamp}] ${message}${args.length > 0 ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') : ''}`;
        console.error(logMessage);
    }
}

function logError(message: string, error: any): void {
    const timestamp = new Date().toISOString();
    const errorMessage = `[LSP Server ${timestamp}] ERROR: ${message}`;
    console.error(errorMessage);
    
    if (error instanceof Error) {
        const details = `  Message: ${error.message}${DEBUG ? `\n  Stack: ${error.stack}` : ''}`;
        console.error(details);
    } else {
        const details = `  Error object: ${JSON.stringify(error, null, 2)}`;
        console.error(details);
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
    log('onInitialize called');
    
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
    log('Server initialized');
    try {
        connection.console.log('Kip LSP Server initialized');
    } catch (error) {
        console.error('Kip LSP Server initialized');
    }
});

// Document change handler
documents.onDidChangeContent((change: TextDocumentChangeEvent<TextDocument>) => {
    log(`Document changed: ${change.document.uri}`);
    try {
        validateDocument(change.document);
    } catch (error) {
        logError(`Error validating document: ${change.document.uri}`, error);
    }
});

// Document open handler
documents.onDidOpen((event) => {
    log(`Document opened: ${event.document.uri}`);
    try {
        validateDocument(event.document);
    } catch (error) {
        logError(`Error validating document: ${event.document.uri}`, error);
    }
});

function validateDocument(document: TextDocument): void {
    log(`Validating document: ${document.uri}`);
    
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
    const functions = new Set<string>();
    const types = new Set<string>();
    const typePhrases = new Map<string, string>(); // Maps type phrase to base type name
    const variables = new Set<string>(); // Variables from Defn statements
    const variableRefs = new Set<string>(); // All variable references in expressions
    const symbols: SymbolInformation[] = [];
    
    // Tokenize document (including strings)
    const tokenPattern = /\d+(?:'?\p{L}+)?|\p{L}+(?:-\p{L}+)*|[(),.]|"[^"]*"/gu;
    const tokens: Array<{ token: string; start: number; line: number; char: number }> = [];
    
    let lineNum = 0;
    let match;
    
    while ((match = tokenPattern.exec(text)) !== null) {
        const token = match[0];
        const start = match.index;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        lineNum = linesBefore.length - 1;
        const charInLine = linesBefore[linesBefore.length - 1].length;
        
        tokens.push({ token, start, line: lineNum, char: charInLine });
    }
    
    // Find type declarations: "Bir ... ya ... olabilir" pattern
    // Pattern: "Bir" -> (optional params) -> type name -> "ya" -> constructors -> "olabilir"
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].token === 'Bir') {
            // Look for "ya" after "Bir"
            let foundYa = false;
            let typeStart = i + 1;
            let typeEnd = -1;
            
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].token === 'ya') {
                    foundYa = true;
                    typeEnd = j;
                    break;
                }
            }
            
            if (foundYa && typeEnd > typeStart) {
                // Extract type name - can be in parentheses like "(öğe listesi)"
                const typeTokens: string[] = [];
                let inParens = false;
                
                for (let k = typeStart; k < typeEnd; k++) {
                    if (tokens[k].token === '(') {
                        inParens = true;
                        continue;
                    }
                    if (tokens[k].token === ')') {
                        inParens = false;
                        continue;
                    }
                    if (/^\p{L}/u.test(tokens[k].token) && !kipKeywords.has(tokens[k].token)) {
                        typeTokens.push(tokens[k].token);
                    }
                }
                
                if (typeTokens.length > 0) {
                    // Add full phrase (e.g., "öğe listesi")
                    const fullTypeName = typeTokens.join(' ');
                    types.add(fullTypeName);
                    
                    // Also add individual words as type references
                    typeTokens.forEach(word => {
                        types.add(word);
                        typePhrases.set(word, fullTypeName);
                    });
                    
                    typePhrases.set(fullTypeName, fullTypeName);
                }
            }
        }
    }
    
    // Find variable definitions: "X Y Z diyelim" pattern (Defn)
    // Pattern: items... -> last item (Var) -> "diyelim" -> "."
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].token === 'diyelim') {
            // Look backwards for the variable name (last identifier before "diyelim")
            for (let j = i - 1; j >= 0 && j >= i - 20; j--) {
                const token = tokens[j].token;
                if (/^\p{L}/u.test(token) && !kipKeywords.has(token) && token !== '(' && token !== ')') {
                    // Found variable name
                    variables.add(token);
                    break;
                }
            }
        }
    }
    
    // Find function definitions: "(args) name," pattern or gerund pattern
    // Pattern 1: "(arg1 type1) (arg2 type2) name," -> Function
    // Pattern 2: "name...mak/mek," -> Function (gerund)
    for (let i = 0; i < tokens.length; i++) {
        // Check for gerund pattern (ends with "mak" or "mek" followed by comma)
        if (i + 1 < tokens.length && tokens[i + 1].token === ',') {
            const token = tokens[i].token;
            if ((token.endsWith('mak') || token.endsWith('mek')) && 
                /^\p{L}/u.test(token) && 
                !kipKeywords.has(token) &&
                token.length > 3) {
                // Gerund function
                const baseName = token.slice(0, -3);
                functions.add(baseName);
                functions.add(token); // Also add full gerund form
            }
        }
        
        // Check for function pattern: "(arg type) name,"
        if (tokens[i].token === '(' && i + 3 < tokens.length) {
            // Look for closing paren, then identifier, then comma
            let parenCount = 1;
            let j = i + 1;
            while (j < tokens.length && parenCount > 0) {
                if (tokens[j].token === '(') parenCount++;
                if (tokens[j].token === ')') parenCount--;
                j++;
            }
            
            if (parenCount === 0 && j < tokens.length) {
                // Found closing paren, check if next is identifier then comma
                if (j + 1 < tokens.length && 
                    /^\p{L}/u.test(tokens[j].token) && 
                    !kipKeywords.has(tokens[j].token) &&
                    tokens[j + 1].token === ',') {
                    functions.add(tokens[j].token);
                }
            }
        }
    }
    
    // Find all variable references in expressions (not just definitions)
    // These are identifiers that appear in expressions but are not keywords/types/functions
    // We'll identify them by context - they appear in expressions but aren't defined as functions/types
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].token;
        if (/^\p{L}/u.test(token) && 
            !kipKeywords.has(token) &&
            !types.has(token) &&
            !functions.has(token) &&
            token !== '(' && token !== ')' && token !== ',' && token !== '.') {
            // Potential variable reference - add if it's not already a defined variable
            // We'll refine this by checking if it appears in expression contexts
            variableRefs.add(token);
        }
    }
    
    // Create symbols
    const allIdentifiers = new Set([...functions, ...types, ...variables]);
    for (const identifier of allIdentifiers) {
        // Find first occurrence
        const firstToken = tokens.find(t => t.token === identifier);
        if (firstToken) {
            let kind: SymbolKind;
            if (functions.has(identifier)) {
                kind = SymbolKind.Function;
            } else if (types.has(identifier)) {
                kind = SymbolKind.Class;
            } else {
                kind = SymbolKind.Variable;
            }
            
            symbols.push({
                name: identifier,
                kind,
                location: {
                    uri: '', // Will be set by caller
                    range: {
                        start: { line: firstToken.line, character: firstToken.char },
                        end: { line: firstToken.line, character: firstToken.char + identifier.length }
                    }
                }
            });
        }
    }
    
    return { symbols, functions, types, typePhrases, variables, variableRefs, keywords: kipKeywords };
}

// Completion handler
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
    log(`Completion requested: ${params.textDocument.uri}`);
    
    try {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            log(`  ⚠️ Document not found: ${params.textDocument.uri}`);
            return [];
        }
        
        const state = documentStates.get(params.textDocument.uri);
        if (!state) {
            log(`  ⚠️ Document state not found: ${params.textDocument.uri}`);
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
    const state = documentStates.get(params.textDocument.uri);
    if (!state) return [];
    
    return state.symbols.map(s => ({
        ...s,
        location: {
            uri: params.textDocument.uri,
            range: s.location.range
        }
    }));
});

// Document formatting handler
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
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
});

// Semantic tokens handler
connection.onRequest('textDocument/semanticTokens/full', (params: SemanticTokensParams): SemanticTokens => {
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
});

// Code action handler
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    // Return empty array for now - can be extended later
    return [];
});

// Code lens handler
connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
    // Return empty array for now - can be extended later
    return [];
});

// Semantic tokens range handler
connection.onRequest('textDocument/semanticTokens/range', (params: SemanticTokensRangeParams): SemanticTokens => {
    log(`Semantic tokens range requested: ${params.textDocument.uri}`);
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
    log('Server listening on stdio');
} catch (error) {
    logError('Failed to start LSP server', error);
    process.exit(1);
}
