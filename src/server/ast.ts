/**
 * Kip Language AST (Abstract Syntax Tree)
 * 
 * This module defines the AST structure for the Kip programming language.
 */

export interface Position {
    line: number;
    character: number;
}

export interface Range {
    start: Position;
    end: Position;
}

export interface Location {
    uri: string;
    range: Range;
}

/**
 * Base AST Node interface
 */
export interface ASTNode {
    type: string;
    range: Range;
}

/**
 * Type Declaration Node
 * Represents: "Bir ... ya ... olabilir"
 */
export interface TypeDeclaration extends ASTNode {
    type: 'TypeDeclaration';
    name: string; // Full type name (e.g., "öğe listesi")
    nameParts: string[]; // Individual words (e.g., ["öğe", "listesi"])
    constructors: TypeConstructor[];
}

export interface TypeConstructor {
    name: string; // Constructor name (e.g., "boş", "eki")
    parameters?: TypeParameter[];
    range: Range;
}

export interface TypeParameter {
    name: string;
    type?: string;
    range: Range;
}

/**
 * Function Definition Node
 * Represents: "(args) name," or gerund pattern "name...mak/mek,"
 */
export interface FunctionDefinition extends ASTNode {
    type: 'FunctionDefinition';
    name: string;
    parameters: FunctionParameter[];
    isGerund: boolean; // true if ends with -mak/-mek
    body?: Expression; // Function body (optional, may be in separate definition)
}

export interface FunctionParameter {
    name: string;
    type?: string;
    range: Range;
}

/**
 * Variable Definition Node
 * Represents: "X Y Z diyelim"
 */
export interface VariableDefinition extends ASTNode {
    type: 'VariableDefinition';
    names: string[]; // Variable names
}

/**
 * Expression Node
 * Represents various expressions in Kip
 */
export type Expression = 
    | FunctionCall
    | VariableReference
    | Literal
    | ConditionalExpression
    | PatternMatch;

export interface FunctionCall extends ASTNode {
    type: 'FunctionCall';
    functionName: string;
    arguments: Expression[];
}

export interface VariableReference extends ASTNode {
    type: 'VariableReference';
    name: string;
}

export interface Literal extends ASTNode {
    type: 'Literal';
    value: string | number | boolean;
    literalType: 'string' | 'number' | 'boolean';
}

export interface ConditionalExpression extends ASTNode {
    type: 'ConditionalExpression';
    condition: Expression;
    thenBranch: Expression;
    elseBranch?: Expression;
}

export interface PatternMatch extends ASTNode {
    type: 'PatternMatch';
    value: Expression;
    patterns: PatternCase[];
}

export interface PatternCase {
    pattern: Expression;
    result: Expression;
    range: Range;
}

/**
 * Program Node (Root of AST)
 */
export interface Program extends ASTNode {
    type: 'Program';
    declarations: (TypeDeclaration | FunctionDefinition | VariableDefinition)[];
    expressions: Expression[];
}

/**
 * AST Visitor interface for traversing the tree
 */
export interface ASTVisitor {
    visitProgram?(node: Program): void;
    visitTypeDeclaration?(node: TypeDeclaration): void;
    visitFunctionDefinition?(node: FunctionDefinition): void;
    visitVariableDefinition?(node: VariableDefinition): void;
    visitFunctionCall?(node: FunctionCall): void;
    visitVariableReference?(node: VariableReference): void;
    visitLiteral?(node: Literal): void;
    visitConditionalExpression?(node: ConditionalExpression): void;
    visitPatternMatch?(node: PatternMatch): void;
}

/**
 * Helper function to create a Range from positions
 */
export function createRange(startLine: number, startChar: number, endLine: number, endChar: number): Range {
    return {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar }
    };
}

/**
 * Helper function to create a Position
 */
export function createPosition(line: number, character: number): Position {
    return { line, character };
}
