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
    TypeParameter,
    FunctionParameter,
    PatternCase,
    createRange,
    createPosition,
    ASTNode
} from './ast';
import { analyzeMorphology, findBaseIdentifier, extractCase, Case } from './morphology';
import { tokenize as lexerTokenize, KIP_KEYWORDS, type Token } from './lexer';

/** Orijinal kip-lexer ile uyumlu tokenize; parser ve LSP aynı çıktıyı kullanır. */
export const tokenize = lexerTokenize;

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
        // Try to parse type declaration (Kılavuz: ya...olabilir | yerleşik X olsun | X var olamaz)
        if (tokens[i].token === 'Bir') {
            const prim = parsePrimitiveType(tokens, i);
            if (prim) {
                program.declarations.push(prim.node);
                i = prim.nextIndex;
                continue;
            }
            const empty = parseEmptyType(tokens, i);
            if (empty) {
                program.declarations.push(empty.node);
                i = empty.nextIndex;
                continue;
            }
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
 * Parse primitive type: "Bir yerleşik X olsun." (Kılavuz: Yerleşik Tipler)
 */
function parsePrimitiveType(tokens: Token[], startIndex: number): { node: TypeDeclaration; nextIndex: number } | null {
    if (tokens[startIndex].token !== 'Bir' || startIndex + 3 >= tokens.length) return null;
    if (tokens[startIndex + 1].token !== 'yerleşik') return null;
    const nameToken = tokens[startIndex + 2];
    if (nameToken.kind !== 'Ident') return null;
    const name = nameToken.token;
    if (tokens[startIndex + 3].token !== 'olsun') return null;
    let next = startIndex + 4;
    if (next < tokens.length && tokens[next].token === '.') next++;
    return {
        node: {
            type: 'TypeDeclaration',
            name,
            nameParts: [name],
            constructors: [],
            range: createRange(
                tokens[startIndex].line,
                tokens[startIndex].char,
                tokens[next - 1].line,
                tokens[next - 1].char + tokens[next - 1].token.length
            )
        },
        nextIndex: next
    };
}

/**
 * Parse empty type: "Bir X var olamaz." (Kılavuz: Yapkısız Tipler)
 */
function parseEmptyType(tokens: Token[], startIndex: number): { node: TypeDeclaration; nextIndex: number } | null {
    if (tokens[startIndex].token !== 'Bir' || startIndex + 1 >= tokens.length) return null;
    const nameParts: string[] = [];
    let i = startIndex + 1;
    while (i < tokens.length && tokens[i].token !== 'var') {
        const t = tokens[i].token;
        if (/^\p{L}/u.test(t) && !KIP_KEYWORDS.has(t)) nameParts.push(t);
        i++;
    }
    if (nameParts.length === 0 || i + 2 >= tokens.length) return null;
    if (tokens[i].token !== 'var' || tokens[i + 1].token !== 'olamaz') return null;
    i += 2;
    if (i < tokens.length && tokens[i].token === '.') i++;
    const name = nameParts.join(' ');
    return {
        node: {
            type: 'TypeDeclaration',
            name,
            nameParts,
            constructors: [],
            range: createRange(
                tokens[startIndex].line,
                tokens[startIndex].char,
                tokens[i - 1].line,
                tokens[i - 1].char + tokens[i - 1].token.length
            )
        },
        nextIndex: i
    };
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
    
    // Find "ya" and collect type name (Kılavuz: "Bir (öğe listesi)" veya "Bir doğruluk")
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
        } else if (/^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
            // Parantez içi de tip adı: (öğe listesi), (öğenin olasılığı)
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
        
        const constructorStart = i;
        let constructorName = tokens[i].token;
        const parameters: TypeParameter[] = [];
        
        // Check for "bir" type argument marker (constructor with parameters)
        if (i + 1 < olabilirIndex && tokens[i + 1].token === 'bir') {
            // Parse type arguments: "bir öğenin bir öğe listesine eki"
            let argStart = i + 1; // Skip "bir"
            
            while (argStart < olabilirIndex) {
                // Skip "bir" markers
                if (tokens[argStart].token === 'bir') {
                    argStart++;
                    continue;
                }
                
                // Parse type argument (e.g., "öğenin", "öğe listesine")
                const typeParts: string[] = [];
                let argEnd = argStart;
                
                // Collect type name parts until we find the constructor name
                while (argEnd < olabilirIndex && 
                       tokens[argEnd].token !== 'eki' && 
                       tokens[argEnd].token !== 'boş' &&
                       tokens[argEnd].token !== 'ya' &&
                       tokens[argEnd].token !== 'da') {
                    const token = tokens[argEnd].token;
                    if (/^\p{L}/u.test(token) && !KIP_KEYWORDS.has(token)) {
                        const baseWord = findBaseIdentifier(token);
                        typeParts.push(baseWord);
                    }
                    argEnd++;
                }
                
                if (typeParts.length > 0) {
                    parameters.push({
                        name: typeParts.join(' '),
                        type: undefined, // Type is the parameter itself
                        range: createRange(
                            tokens[argStart].line,
                            tokens[argStart].char,
                            tokens[argEnd - 1].line,
                            tokens[argEnd - 1].char + tokens[argEnd - 1].token.length
                        )
                    });
                }
                
                // Find constructor name (usually "eki" after type arguments)
                if (argEnd < olabilirIndex && 
                    (tokens[argEnd].token === 'eki' || tokens[argEnd].token.startsWith('eki'))) {
                    constructorName = tokens[argEnd].token;
                    i = argEnd;
                    break;
                }
                
                argStart = argEnd;
                if (argStart >= olabilirIndex) {
                    break;
                }
            }
        }
        
        // Extract base name if it has suffix (e.g., "ekine" -> "eki")
        const baseName = findBaseIdentifier(constructorName);
        
        constructors.push({
            name: baseName,
            parameters,
            range: createRange(
                tokens[constructorStart].line,
                tokens[constructorStart].char,
                tokens[i].line,
                tokens[i].char + constructorName.length
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
            
            // Parse function body (pattern matching) after comma
            const bodyStart = i + 2;
            const body = parseFunctionBody(tokens, bodyStart);
            
            return {
                node: {
                    type: 'FunctionDefinition',
                    name: baseName,
                    parameters: [],
                    isGerund: true,
                    body: body?.node,
                    range: createRange(
                        startToken.line,
                        startToken.char,
                        body ? body.nextIndex - 1 : endToken.line,
                        body ? tokens[body.nextIndex - 1].char + tokens[body.nextIndex - 1].token.length : endToken.char + 1
                    )
                },
                nextIndex: body ? body.nextIndex : i + 2
            };
        }
    }
    
    // Check for function pattern: "(args) name,"
    if (tokens[i].token === '(') {
        const params: FunctionParameter[] = [];
        let parenCount = 1;
        i++;
        
        // Parse parameters (each parameter is in parentheses with type)
        while (i < tokens.length && parenCount > 0) {
            if (tokens[i].token === '(') {
                parenCount++;
                // Start of a parameter group
                i++;
                continue;
            }
            if (tokens[i].token === ')') {
                parenCount--;
                if (parenCount === 0) {
                    break;
                }
                i++;
                continue;
            }
            
            // Parse parameter name and type
            if (parenCount > 0 && /^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
                const paramName = tokens[i].token;
                const baseParamName = findBaseIdentifier(paramName);
                
                // Try to find type (next tokens might be type name)
                let paramType: string | undefined;
                let j = i + 1;
                const typeParts: string[] = [];
                
                // Look for type name (words before closing paren)
                while (j < tokens.length && tokens[j].token !== ')') {
                    if (/^\p{L}/u.test(tokens[j].token) && 
                        !KIP_KEYWORDS.has(tokens[j].token) &&
                        tokens[j].token !== paramName) {
                        const typeWord = tokens[j].token;
                        const baseTypeWord = findBaseIdentifier(typeWord);
                        typeParts.push(baseTypeWord);
                    }
                    j++;
                }
                
                if (typeParts.length > 0) {
                    paramType = typeParts.join(' ');
                }
                
                params.push({
                    name: baseParamName,
                    type: paramType,
                    range: createRange(
                        tokens[i].line,
                        tokens[i].char,
                        tokens[i].line,
                        tokens[i].char + paramName.length
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
            const baseFuncName = findBaseIdentifier(funcName);
            const startToken = tokens[startIndex];
            const endToken = tokens[i + 1];
            
            // Parse function body (pattern matching) after comma
            const bodyStart = i + 2;
            const body = parseFunctionBody(tokens, bodyStart);
            
            return {
                node: {
                    type: 'FunctionDefinition',
                    name: baseFuncName,
                    parameters: params,
                    isGerund: false,
                    body: body?.node,
                    range: createRange(
                        startToken.line,
                        startToken.char,
                        body ? body.nextIndex - 1 : endToken.line,
                        body ? tokens[body.nextIndex - 1].char + tokens[body.nextIndex - 1].token.length : endToken.char + 1
                    )
                },
                nextIndex: body ? body.nextIndex : i + 2
            };
        }
    }
    
    return null;
}

/**
 * Parse function body with pattern matching: "pattern, result, pattern, result, ..."
 */
function parseFunctionBody(tokens: Token[], startIndex: number): { node: PatternMatch; nextIndex: number } | null {
    if (startIndex >= tokens.length) {
        return null;
    }
    
    // In function definitions, the scrutinee is usually the first parameter
    // We'll use "bu" as default scrutinee if not found
    let i = startIndex;
    let scrutinee: Expression | null = null;
    
    // Look for first variable as scrutinee (usually "bu")
    while (i < tokens.length && i < startIndex + 5) {
        if (/^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
            scrutinee = {
                type: 'VariableReference',
                name: findBaseIdentifier(tokens[i].token),
                range: createRange(
                    tokens[i].line,
                    tokens[i].char,
                    tokens[i].line,
                    tokens[i].char + tokens[i].token.length
                )
            };
            i++;
            break;
        }
        i++;
    }
    
    // Default scrutinee if not found
    if (!scrutinee) {
        scrutinee = {
            type: 'VariableReference',
            name: 'bu',
            range: createRange(
                tokens[startIndex].line,
                tokens[startIndex].char,
                tokens[startIndex].line,
                tokens[startIndex].char
            )
        };
    }
    
    // Parse pattern cases: "pattern, result, pattern, result, ..."
    const patterns: PatternCase[] = [];
    
    while (i < tokens.length) {
        // Check for period (end of function)
        if (tokens[i].token === '.') {
            break;
        }
        
        // Skip commas between patterns
        if (tokens[i].token === ',') {
            i++;
            continue;
        }
        
        // Parse pattern (e.g., "boşsa", "ekiyse")
        const patternStart = i;
        let patternExpr: Expression | null = null;
        
        // Check for conditional pattern (ends with -sa/-se)
        if (i < tokens.length && /^\p{L}/u.test(tokens[i].token)) {
            const token = tokens[i].token;
            const analyses = analyzeMorphology(token);
            const condAnalysis = analyses.find(a => a.case === Case.Cond);
            
            if (condAnalysis) {
                // Pattern like "boşsa" -> pattern is "boş"
                patternExpr = {
                    type: 'VariableReference',
                    name: condAnalysis.base,
                    range: createRange(
                        tokens[i].line,
                        tokens[i].char,
                        tokens[i].line,
                        tokens[i].char + token.length
                    )
                };
                i++;
            } else {
                // Simple variable pattern
                patternExpr = {
                    type: 'VariableReference',
                    name: findBaseIdentifier(token),
                    range: createRange(
                        tokens[i].line,
                        tokens[i].char,
                        tokens[i].line,
                        tokens[i].char + token.length
                    )
                };
                i++;
            }
        } else {
            i++;
            continue;
        }
        
        if (!patternExpr) {
            break;
        }
        
        // Find comma after pattern
        while (i < tokens.length && tokens[i].token !== ',' && tokens[i].token !== '.') {
            i++;
        }
        
        if (i >= tokens.length || tokens[i].token === '.') {
            break;
        }
        
        // Skip comma
        i++;
        
        // Parse result expression
        let resultExpr: Expression | null = null;
        
        // Parse result (could be variable, function call, etc.)
        if (i < tokens.length) {
            const resultToken = tokens[i];
            
            // Check if it's a function call pattern: "(expr) functionName"
            if (resultToken.token === '(') {
                const funcCall = parseFunctionCall(tokens, i);
                if (funcCall) {
                    resultExpr = funcCall.node;
                    i = funcCall.nextIndex;
                } else {
                    // Try as regular expression
                    const expr = parseExpression(tokens, i);
                    if (expr) {
                        resultExpr = expr.node;
                        i = expr.nextIndex;
                    } else {
                        i++;
                    }
                }
            } else if (/^\p{L}/u.test(resultToken.token) && !KIP_KEYWORDS.has(resultToken.token)) {
                // Simple variable or identifier
                resultExpr = {
                    type: 'VariableReference',
                    name: findBaseIdentifier(resultToken.token),
                    range: createRange(
                        resultToken.line,
                        resultToken.char,
                        resultToken.line,
                        resultToken.char + resultToken.token.length
                    )
                };
                i++;
            } else if (/^\d/.test(resultToken.token)) {
                // Number literal
                const numStr = resultToken.token.includes("'") 
                    ? resultToken.token.split("'")[0] 
                    : resultToken.token;
                const numValue = parseFloat(numStr);
                resultExpr = {
                    type: 'Literal',
                    value: numValue,
                    literalType: 'number',
                    range: createRange(
                        resultToken.line,
                        resultToken.char,
                        resultToken.line,
                        resultToken.char + resultToken.token.length
                    )
                };
                i++;
            } else {
                i++;
            }
        }
        
        if (resultExpr) {
            patterns.push({
                pattern: patternExpr,
                result: resultExpr,
                range: createRange(
                    tokens[patternStart].line,
                    tokens[patternStart].char,
                    resultExpr.range.end.line,
                    resultExpr.range.end.character
                )
            });
        }
    }
    
    if (patterns.length === 0) {
        return null;
    }
    
    const startToken = tokens[startIndex];
    const endToken = i > 0 && i <= tokens.length ? tokens[i - 1] : tokens[tokens.length - 1];
    
    return {
        node: {
            type: 'PatternMatch',
            value: scrutinee,
            patterns,
            range: createRange(
                startToken.line,
                startToken.char,
                endToken.line,
                endToken.char + endToken.token.length
            )
        },
        nextIndex: i
    };
}

/**
 * Parse expression (function call, variable reference, etc.)
 * Supports nested expressions and complex patterns
 */
function parseExpression(tokens: Token[], startIndex: number): { node: Expression; nextIndex: number } | null {
    if (startIndex >= tokens.length) {
        return null;
    }
    
    // Try to parse function call: "(expr) name" or nested calls
    if (tokens[startIndex].token === '(') {
        const funcCall = parseFunctionCall(tokens, startIndex);
        if (funcCall) {
            return funcCall;
        }
        
        // Try to parse as nested expression in parentheses
        let i = startIndex + 1;
        let parenCount = 1;
        const visited = new Set<number>();
        
        while (i < tokens.length && parenCount > 0) {
            if (visited.has(i)) break;
            visited.add(i);
            
            if (tokens[i].token === '(') {
                parenCount++;
                // Try to parse nested expression
                const nested = parseExpression(tokens, i);
                if (nested) {
                    i = nested.nextIndex;
                    continue;
                }
            } else if (tokens[i].token === ')') {
                parenCount--;
                if (parenCount === 0) {
                    // End of parentheses, try to parse what's inside
                    if (i > startIndex + 1) {
                        // There's content inside, try to parse it
                        const inner = parseExpression(tokens, startIndex + 1);
                        if (inner && inner.nextIndex <= i) {
                            return {
                                node: inner.node,
                                nextIndex: i + 1
                            };
                        }
                    }
                    break;
                }
            }
            i++;
        }
    }
    
    // Try to parse variable reference or literal
    const token = tokens[startIndex];
    
    // Number literal (may have Turkish suffix like "1'in", "2'nin")
    if (/^\d/.test(token.token)) {
        // Extract number part (before apostrophe if present)
        let numStr = token.token;
        if (numStr.includes("'")) {
            numStr = numStr.split("'")[0];
        }
        const numValue = parseFloat(numStr);
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
    
    // Variable reference (may have Turkish suffix)
    if (/^\p{L}/u.test(token.token) && !KIP_KEYWORDS.has(token.token)) {
        const baseName = findBaseIdentifier(token.token);
        return {
            node: {
                type: 'VariableReference',
                name: baseName,
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
 * Supports nested function calls and expressions
 */
function parseFunctionCall(tokens: Token[], startIndex: number): { node: FunctionCall; nextIndex: number } | null {
    if (startIndex >= tokens.length || tokens[startIndex].token !== '(') {
        return null;
    }
    
    const args: Expression[] = [];
    let i = startIndex + 1; // Skip opening '('
    let parenCount = 1;
    const visited = new Set<number>(); // Track visited indices to prevent infinite loops
    
    // Parse arguments (each argument is an expression in parentheses)
    while (i < tokens.length && parenCount > 0) {
        // Prevent infinite loop
        if (visited.has(i)) {
            break;
        }
        visited.add(i);
        
        if (tokens[i].token === '(') {
            // Nested expression - try to parse as function call first
            const nestedCall = parseFunctionCall(tokens, i);
            if (nestedCall) {
                args.push(nestedCall.node);
                i = nestedCall.nextIndex;
                // Adjust parenCount based on how many parentheses were consumed
                let nestedParens = 1;
                let nestedI = i;
                while (nestedI < tokens.length && nestedParens > 0) {
                    if (tokens[nestedI]?.token === '(') nestedParens++;
                    if (tokens[nestedI]?.token === ')') nestedParens--;
                    nestedI++;
                }
                if (nestedParens === 0) {
                    parenCount--;
                }
                continue;
            }
            
            // Try as regular nested expression
            const argExpr = parseExpression(tokens, i);
            if (argExpr && argExpr.nextIndex > i) {
                args.push(argExpr.node);
                i = argExpr.nextIndex;
                // Check if we consumed a closing paren
                if (i < tokens.length && tokens[i - 1]?.token === ')') {
                    parenCount--;
                }
                continue;
            }
            
            parenCount++;
            i++;
        } else if (tokens[i].token === ')') {
            parenCount--;
            if (parenCount === 0) {
                // End of arguments, next should be function name
                i++;
                break;
            }
            i++;
        } else {
            // Try to parse as expression (number, string, variable, etc.)
            const argExpr = parseExpression(tokens, i);
            if (argExpr) {
                args.push(argExpr.node);
                i = argExpr.nextIndex;
                continue;
            }
            i++;
        }
    }
    
    // Find function name (may have Turkish suffix)
    if (i < tokens.length && /^\p{L}/u.test(tokens[i].token) && !KIP_KEYWORDS.has(tokens[i].token)) {
        const funcName = tokens[i].token;
        const baseFuncName = findBaseIdentifier(funcName);
        const startToken = tokens[startIndex];
        const endToken = tokens[i];
        
        return {
            node: {
                type: 'FunctionCall',
                functionName: baseFuncName,
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
