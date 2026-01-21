import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

interface KipError {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: vscode.DiagnosticSeverity;
}

export class KipDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly debounceDelay = 500; // ms

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('kip');

        // Listen to document changes
        vscode.workspace.onDidChangeTextDocument(this.onDocumentChange, this);
        vscode.workspace.onDidSaveTextDocument(this.onDocumentSave, this);
        vscode.workspace.onDidOpenTextDocument(this.onDocumentOpen, this);
        vscode.workspace.onDidCloseTextDocument(this.onDocumentClose, this);

        // Run diagnostics on all open Kip files
        vscode.workspace.textDocuments.forEach(doc => {
            if (doc.languageId === 'kip') {
                this.runDiagnostics(doc);
            }
        });
    }

    private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.languageId !== 'kip') {
            return;
        }

        // Debounce: wait for user to stop typing
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.runDiagnostics(event.document);
        }, this.debounceDelay);
    }

    private onDocumentSave(document: vscode.TextDocument): void {
        if (document.languageId === 'kip') {
            // Clear debounce and run immediately on save
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.runDiagnostics(document);
        }
    }

    private onDocumentOpen(document: vscode.TextDocument): void {
        if (document.languageId === 'kip') {
            this.runDiagnostics(document);
        }
    }

    private onDocumentClose(document: vscode.TextDocument): void {
        if (document.languageId === 'kip') {
            this.diagnosticCollection.delete(document.uri);
        }
    }

    private async runDiagnostics(document: vscode.TextDocument): Promise<void> {
        const kipPath = await this.findKipExecutable();

        if (!kipPath) {
            // No compiler found, can't run diagnostics
            return;
        }

        const filePath = document.fileName;

        try {
            const output = await this.executeKipCheck(kipPath, filePath);
            const errors = this.parseKipErrors(output, document);

            const diagnostics = errors.map(error => {
                const range = new vscode.Range(
                    error.line - 1,
                    error.column - 1,
                    error.endLine ? error.endLine - 1 : error.line - 1,
                    error.endColumn ? error.endColumn - 1 : error.column + 10
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    error.message,
                    error.severity
                );

                diagnostic.source = 'kip';
                return diagnostic;
            });

            this.diagnosticCollection.set(document.uri, diagnostics);
        } catch (err) {
            // Silently fail if there's an error running the compiler
            console.error('Kip diagnostic error:', err);
        }
    }

    private parseKipErrors(output: string, document: vscode.TextDocument): KipError[] {
        const errors: KipError[] = [];

        // Pattern 1: "Tip hatası: <message>. (satır X, sütun Y - satır Z, sütun W)"
        const typeErrorPattern = /(Tip hatası|Type error):\s*(.+?)\.\s*\(satır\s+(\d+),\s*sütun\s+(\d+)\s*-\s*satır\s+(\d+),\s*sütun\s+(\d+)\)/g;
        let match;

        while ((match = typeErrorPattern.exec(output)) !== null) {
            errors.push({
                line: parseInt(match[3]),
                column: parseInt(match[4]),
                endLine: parseInt(match[5]),
                endColumn: parseInt(match[6]),
                message: match[2].trim(),
                severity: vscode.DiagnosticSeverity.Error
            });
        }

        // Pattern 2: "Sözdizim hatası:\nKip:X:Y:\n..."
        const syntaxErrorPattern = /Sözdizim hatası:[\s\S]*?Kip:(\d+):(\d+):[\s\S]*?beklenmeyen\s+'([^']+)'[\s\S]*?bekleniyor\s+'?([^'\n]+)'?/g;

        while ((match = syntaxErrorPattern.exec(output)) !== null) {
            const lineNum = parseInt(match[1]);
            const colNum = parseInt(match[2]);
            const unexpected = match[3];
            const expected = match[4];

            errors.push({
                line: lineNum,
                column: colNum,
                message: `Sözdizim hatası: beklenmeyen '${unexpected}', beklenen '${expected}'`,
                severity: vscode.DiagnosticSeverity.Error
            });
        }

        // Pattern 3: Simple type error without range
        const simpleTypeErrorPattern = /(Tip hatası):\s*(.+?)\.\s*\(satır\s+(\d+),\s*sütun\s+(\d+)/g;

        while ((match = simpleTypeErrorPattern.exec(output)) !== null) {
            // Skip if already matched by Pattern 1
            const lineNum = parseInt(match[3]);
            const colNum = parseInt(match[4]);

            const alreadyExists = errors.some(e => e.line === lineNum && e.column === colNum);
            if (!alreadyExists) {
                errors.push({
                    line: lineNum,
                    column: colNum,
                    message: match[2].trim(),
                    severity: vscode.DiagnosticSeverity.Error
                });
            }
        }

        // Pattern 4: Generic error pattern for other errors
        // Example: "tanınmıyor" errors
        const genericErrorPattern = /(\S+)\s+tanınmıyor\.\s*\(satır\s+(\d+),\s*sütun\s+(\d+)\s*-\s*satır\s+(\d+),\s*sütun\s+(\d+)\)/g;

        while ((match = genericErrorPattern.exec(output)) !== null) {
            errors.push({
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                endLine: parseInt(match[4]),
                endColumn: parseInt(match[5]),
                message: `${match[1]} tanınmıyor`,
                severity: vscode.DiagnosticSeverity.Error
            });
        }

        return errors;
    }

    private executeKipCheck(kipPath: string, filePath: string): Promise<string> {
        return new Promise((resolve) => {
            const process = child_process.spawn(kipPath, [filePath], {
                cwd: path.dirname(filePath)
            });

            // Close stdin immediately (no REPL interaction needed)
            process.stdin.end();

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', () => {
                // Combine stdout and stderr for error parsing
                resolve(stdout + '\n' + stderr);
            });

            process.on('error', () => {
                resolve('');
            });
        });
    }

    private async findKipExecutable(): Promise<string | null> {
        // 1. Check default installation path (~/.local/bin/kip)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const defaultPath = path.join(homeDir, '.local', 'bin', 'kip');
            const fs = require('fs');
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

        // 2. Check system PATH
        return new Promise((resolve) => {
            child_process.exec('which kip', (error, stdout) => {
                if (!error && stdout && stdout.trim().length > 0) {
                    resolve(stdout.trim());
                } else {
                    resolve(null);
                }
            });
        });
    }

    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.diagnosticCollection.dispose();
    }
}
