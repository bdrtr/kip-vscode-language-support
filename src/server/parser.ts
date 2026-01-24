/**
 * Kip Language Parser
 * 
 * Parses Kip source code into an AST (Abstract Syntax Tree)
 */

import {
    Program,
    TypeDeclaration,
    FunctionDefinition,
    VariableDefinition,
    FunctionCall,
    VariableReference,
    Literal,
    ConditionalExpression,
    PatternMatch,
    Expression,
    TypeConstructor,
    FunctionParameter,
    PatternCase,
    createRange,
    createPosition,
    ASTNode
} from './ast';

interface Token {
    token: string;
    start: number;
    line: number;
    char: number;
}

/**
 * Kip keywords
 */
const KIP_KEYWORDS = new Set<string>([
    'Bir', 'bir', 'ya', 'da', 'olabilir', 'var', 'olamaz',
    'değilse', 'yazdır', 'diyelim', 'olsun', 'olarak', 'yerleşik',
    'ise', 'ile', 'yükle', 'doğru', 'yanlış', 'doğruysa', 'yanlışsa', 'yokluksa',
    'boşsa', 'ekiyse', 'ekidir', 'durmaktır', 'yazmaktır', 'bastırmaktır'
]);

/**
 * Tokenize Kip source code
 */
export function tokenize(text: string): Token[] {
    const tokens: Token[] = [];
    const tokenPattern = /\d+(?:'?\p{L}+)?|\p{L}+(?:-\p{L}+)*|[(),.]|"[^"]*"/gu;
    
    let match;
    while ((match = tokenPattern.exec(text)) !== null) {
        const token = match[0];
        const start = match.index;
        const textBefore = text.substring(0, start);
        const linesBefore = textBefore.split('\n');
        const line = linesBefore.length - 1;
        const char = linesBefore[linesBefore.length - 1].length;
        
        tokens.push({ token, start, line, char });
    }
    
    return tokens;
}

/**
 * Parse Kip source code into AST
 */
export function parse(text: string): Program {
    const tokens = tokenize(text);
    const program: Program = {
        type: 'Program',
        range: createRange(0, 0, text.split('\n').length - 1, 0),
        declarations: [],
        expressions: []
    };
    
    let i = 0;
    
    while (i < tokens.length) {
        // Try to parse type declaration
        if (tokens[i].token === 'Bir') {
            const typeDecl = parseTypeDeclaration(tokens, i);
            if (typeDecl) {
                program.declarations.push(typeDecl.node);
                i = typeDecl.nextIndex;
                continue;
            }
        }
        
        // Try to parse variable definition
        if (i + 1 < tokens.length && tokens[i + 1].token === 'diyelim') {
            const varDef = parseVariableDefinition(tokens, i);
            if (varDef) {
                program.declarations.push(varDef.node);
                i = varDef.nextIndex;
                continue;
            }
        }
        
        // Try to parse function definition
        const funcDef = parseFunctionDefinition(tokens, i);
        if (funcDef) {
            program.declarations.push(funcDef.node);
            i = funcDef.nextIndex;
            continue;
        }
        
        // Try to parse expression (function call, etc.)
        const expr = parseExpression(tokens, i);
        if (expr) {
            program.expressions.push(expr.node);
            i = expr.nextIndex;
            continue;
        }
        
        i++;
    }
    
    return program;
}

/**
 * Parse type declaration: "Bir ... ya ... olabilir"
 */
function parseTypeDeclaration(tokens: Token[], startIndex: number): { node: TypeDeclaration; nextIndex: number } | null {
    if (tokens[startIndex].token !== 'Bir') {
        return null;
    }
    
    let i = startIndex + 1;
    const nameParts: string[] = [];
    let inParens = false;
    let foundYa = false;
    let yaIndex = -1;
    
    // Find "ya" and collect type name
    while (i < tokens.length && !foundYa) {
        if (tokens[i].token === 'ya') {
            foundYa = true;
            yaIndex = i;
            break;
        }
        
        if (tokens[i].token === '(') {
            inParens = true;
        } else if (tokens[i].token === ')') {
            inParens = false;
        } else if (!inParens && /^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
            nameParts.push(tokens[i].token);
        }
        i++;
    }
    
    if (!foundYa || nameParts.length === 0) {
        return null;
    }
    
    // Find "olabilir"
    let olabilirIndex = -1;
    while (i < tokens.length) {
        if (tokens[i].token === 'olabilir') {
            olabilirIndex = i;
            break;
        }
        i++;
    }
    
    if (olabilirIndex === -1) {
        return null;
    }
    
    // Parse constructors between "ya" and "olabilir"
    const constructors: TypeConstructor[] = [];
    i = yaIndex + 1;
    
    while (i < olabilirIndex) {
        if (tokens[i].token === 'ya' || tokens[i].token === 'da') {
            i++;
            continue;
        }
        
        // Parse constructor
        const constructorStart = i;
        const constructorName = tokens[i].token;
        const constructorEnd = i;
        
        constructors.push({
            name: constructorName,
            range: createRange(
                tokens[constructorStart].line,
                tokens[constructorStart].char,
                tokens[constructorEnd].line,
                tokens[constructorEnd].char + constructorName.length
            )
        });
        
        i++;
    }
    
    const typeName = nameParts.join(' ');
    const startToken = tokens[startIndex];
    const endToken = tokens[olabilirIndex];
    
    return {
        node: {
            type: 'TypeDeclaration',
            name: typeName,
            nameParts,
            constructors,
            range: createRange(
                startToken.line,
                startToken.char,
                endToken.line,
                endToken.char + 'olabilir'.length
            )
        },
        nextIndex: olabilirIndex + 1
    };
}

/**
 * Parse variable definition: "X Y Z diyelim"
 */
function parseVariableDefinition(tokens: Token[], startIndex: number): { node: VariableDefinition; nextIndex: number } | null {
    let i = startIndex;
    const names: string[] = [];
    
    // Collect variable names before "diyelim"
    while (i < tokens.length && tokens[i].token !== 'diyelim') {
        const token = tokens[i].token;
        if (/^\p{L}/u.test(token) && 
            !KIP_KEYWORDS.has(token) && 
            token !== '(' && 
            token !== ')' && 
            token !== ',') {
            names.push(token);
        }
        i++;
    }
    
    if (i >= tokens.length || tokens[i].token !== 'diyelim' || names.length === 0) {
        return null;
    }
    
    const diyelimIndex = i;
    const startToken = tokens[startIndex];
    const endToken = tokens[diyelimIndex];
    
    return {
        node: {
            type: 'VariableDefinition',
            names,
            range: createRange(
                startToken.line,
                startToken.char,
                endToken.line,
                endToken.char + 'diyelim'.length
            )
        },
        nextIndex: diyelimIndex + 1
    };
}

/**
 * Parse function definition: "(args) name," or "name...mak/mek,"
 */
function parseFunctionDefinition(tokens: Token[], startIndex: number): { node: FunctionDefinition; nextIndex: number } | null {
    let i = startIndex;
    
    // Check for gerund pattern: "name...mak/mek,"
    if (i + 1 < tokens.length && tokens[i + 1].token === ',') {
        const token = tokens[i].token;
        if ((token.endsWith('mak') || token.endsWith('mek')) && 
            /^\p{L}/u.test(token) && 
            !KIP_KEYWORDS.has(token) &&
            token.length > 3) {
            const baseName = token.slice(0, -3);
            const startToken = tokens[i];
            const endToken = tokens[i + 1];
            
            return {
                node: {
                    type: 'FunctionDefinition',
                    name: baseName,
                    parameters: [],
                    isGerund: true,
                    range: createRange(
                        startToken.line,
                        startToken.char,
                        endToken.line,
                        endToken.char + 1
                    )
                },
                nextIndex: i + 2
            };
        }
    }
    
    // Check for function pattern: "(args) name,"
    if (tokens[i].token === '(') {
        const params: FunctionParameter[] = [];
        let parenCount = 1;
        i++;
        
        // Parse parameters
        while (i < tokens.length && parenCount > 0) {
            if (tokens[i].token === '(') parenCount++;
            if (tokens[i].token === ')') parenCount--;
            
            if (parenCount > 0 && /^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
                params.push({
                    name: tokens[i].token,
                    range: createRange(
                        tokens[i].line,
                        tokens[i].char,
                        tokens[i].line,
                        tokens[i].char + tokens[i].token.length
                    )
                });
            }
            i++;
        }
        
        // Check for function name and comma
        if (i < tokens.length && 
            i + 1 < tokens.length &&
            /^\p{L}/u.test(tokens[i].token) && 
            !KIP_KEYWORDS.has(tokens[i].token) &&
            tokens[i + 1].token === ',') {
            const funcName = tokens[i].token;
            const startToken = tokens[startIndex];
            const endToken = tokens[i + 1];
            
            return {
                node: {
                    type: 'FunctionDefinition',
                    name: funcName,
                    parameters: params,
                    isGerund: false,
                    range: createRange(
                        startToken.line,
                        startToken.char,
                        endToken.line,
                        endToken.char + 1
                    )
                },
                nextIndex: i + 2
            };
        }
    }
    
    return null;
}

/**
 * Parse expression (function call, variable reference, etc.)
 */
function parseExpression(tokens: Token[], startIndex: number): { node: Expression; nextIndex: number } | null {
    if (startIndex >= tokens.length) {
        return null;
    }
    
    // Try to parse function call: "(expr) name"
    if (tokens[startIndex].token === '(') {
        return parseFunctionCall(tokens, startIndex);
    }
    
    // Try to parse variable reference or literal
    const token = tokens[startIndex];
    
    // Number literal
    if (/^\d/.test(token.token)) {
        const numValue = parseFloat(token.token);
        return {
            node: {
                type: 'Literal',
                value: numValue,
                literalType: 'number',
                range: createRange(
                    token.line,
                    token.char,
                    token.line,
                    token.char + token.token.length
                )
            },
            nextIndex: startIndex + 1
        };
    }
    
    // String literal
    if (token.token.startsWith('"') && token.token.endsWith('"')) {
        const strValue = token.token.slice(1, -1);
        return {
            node: {
                type: 'Literal',
                value: strValue,
                literalType: 'string',
                range: createRange(
                    token.line,
                    token.char,
                    token.line,
                    token.char + token.token.length
                )
            },
            nextIndex: startIndex + 1
        };
    }
    
    // Variable reference
    if (/^\p{L}/u.test(token.token) && !KIP_KEYWORDS.has(token.token)) {
        return {
            node: {
                type: 'VariableReference',
                name: token.token,
                range: createRange(
                    token.line,
                    token.char,
                    token.line,
                    token.char + token.token.length
                )
            },
            nextIndex: startIndex + 1
        };
    }
    
    return null;
}

/**
 * Parse function call: "(expr1) (expr2) functionName"
 */
function parseFunctionCall(tokens: Token[], startIndex: number): { node: FunctionCall; nextIndex: number } | null {
    if (tokens[startIndex].token !== '(') {
        return null;
    }
    
    const args: Expression[] = [];
    let i = startIndex + 1; // Skip opening '('
    let parenCount = 1; // We're inside the function call parentheses
    const visited = new Set<number>(); // Track visited indices to prevent infinite loops
    
    // Parse arguments (each argument is an expression in parentheses)
    while (i < tokens.length && parenCount > 0) {
        // Prevent infinite loop by tracking visited indices
        if (visited.has(i)) {
            break;
        }
        visited.add(i);
        
        if (tokens[i].token === '(') {
            parenCount++;
            // Try to parse this as an expression
            const argExpr = parseExpression(tokens, i);
            if (argExpr) {
                args.push(argExpr.node);
                i = argExpr.nextIndex;
                continue;
            }
        } else if (tokens[i].token === ')') {
            parenCount--;
            if (parenCount === 0) {
                // End of arguments, next should be function name
                i++;
                break;
            }
        }
        i++;
    }
    
    // Find function name
    if (i < tokens.length && /^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
        const funcName = tokens[i].token;
        const startToken = tokens[startIndex];
        const endToken = tokens[i];
        
        return {
            node: {
                type: 'FunctionCall',
                functionName: funcName,
                arguments: args,
                range: createRange(
                    startToken.line,
                    startToken.char,
                    endToken.line,
                    endToken.char + funcName.length
                )
            },
            nextIndex: i + 1
        };
    }
    
    return null;
}
