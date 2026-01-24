import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { LanguageClient } from 'vscode-languageclient/node';

/**
 * Diagnostic provider - combines LSP diagnostics with fallback validation
 * Matching Haskell LSP pattern: parse errors + type check errors (analyzeDocument)
 */
export class KipDiagnosticProvider implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 500;
    private lspClient: LanguageClient | null = null;

    constructor(lspClient?: LanguageClient | null) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('kip');
        this.lspClient = lspClient || null;
    }

    /**
     * Set LSP client for diagnostics (called when LSP is ready)
     */
    setLSPClient(lspClient: LanguageClient): void {
        this.lspClient = lspClient;
        // Listen to LSP diagnostics (matching Haskell: publishDiagnostics)
        // LSP client automatically publishes diagnostics, we just need to merge with fallback
    }

    /**
     * Belgeyi kontrol et ve hataları göster.
     */
    async validateDocument(document: vscode.TextDocument): Promise<void> {
        if (document.languageId !== 'kip') {
            return;
        }

        // Debounce - çok sık çalışmasını önle
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            await this.runValidation(document);
        }, this.DEBOUNCE_MS);
    }

    private async runValidation(document: vscode.TextDocument): Promise<void> {
        // First, try to get LSP diagnostics (matching Haskell: publishDiagnostics from analyzeDocument)
        // LSP diagnostics are automatically published by the client, but we can also get them manually
        let lspDiagnostics: vscode.Diagnostic[] = [];
        
        if (this.lspClient) {
            try {
                // LSP automatically publishes diagnostics via publishDiagnostics notification
                // We can also get them via textDocument/publishDiagnostics if needed
                // For now, LSP client handles this automatically, we just merge with fallback
            } catch (error) {
                // LSP diagnostics not available, continue with fallback
            }
        }

        // Fallback: Use kip executable for validation (matching Haskell's fallback behavior)
        const kipPath = await this.findKipExecutable();
        if (!kipPath) {
            // Kip bulunamadı, sadece LSP diagnostics'i kullan
            if (lspDiagnostics.length > 0) {
                this.diagnosticCollection.set(document.uri, lspDiagnostics);
            }
            return;
        }

        const filePath = document.uri.fsPath;
        const fileDir = path.dirname(filePath);

        try {
            // Kip'i --check modunda çalıştır (sadece kontrol, çalıştırma yok)
            // Matching Haskell: parse errors and type check errors are separate
            const result = await this.executeKip(kipPath, filePath, fileDir);
            
            // Hataları parse et (matching Haskell: parseErrorToDiagnostic, tcErrorToDiagnostic)
            const fallbackDiagnostics = this.parseErrors(result.stderr + result.stdout, document);
            
            // Merge LSP diagnostics with fallback diagnostics
            // LSP diagnostics take priority (more accurate)
            const allDiagnostics = [...lspDiagnostics, ...fallbackDiagnostics];
            
            // Diagnostics'i güncelle
            this.diagnosticCollection.set(document.uri, allDiagnostics);
        } catch (error) {
            console.error('[KipDiagnosticProvider] Validation error:', error);
            // On error, still set LSP diagnostics if available
            if (lspDiagnostics.length > 0) {
                this.diagnosticCollection.set(document.uri, lspDiagnostics);
            }
        }
    }

    private executeKip(kipPath: string, filePath: string, cwd: string): Promise<{ stdout: string, stderr: string, exitCode: number }> {
        return new Promise((resolve) => {
            // --test flag'i ile çalıştırıp çıktıyı kontrol ederiz
            // --test: definition logs açık, dosyayı çalıştırır ama REPL yok
            const proc = child_process.spawn(kipPath, ['--test', filePath], {
                cwd: cwd,
                timeout: 10000 // 10 saniye timeout
            });

            // stdin kapat
            proc.stdin.end();

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code || 0
                });
            });

            proc.on('error', (error) => {
                resolve({
                    stdout,
                    stderr: error.message,
                    exitCode: 1
                });
            });
        });
    }

    /**
     * Kip çıktısından hataları parse et.
     * Kip hata formatı örneği:
     * ```
     * Sözdizim hatası:
     * Kip:11:43:
     *    |
     * 11 | Bir gün ya pazar ya da cumartesi olabilir.ss
     *    |                                           ^
     * beklenmeyen 's'
     * bekleniyor girişin sonu
     * ```
     */
    private parseErrors(output: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const lines = output.split('\n');

        // Kip hata formatını yakala: "Kip:line:col:"
        const kipPattern = /^Kip:(\d+):(\d+):$/;
        
        let i = 0;
        while (i < lines.length) {
            const line = lines[i].trim();
            
            // Kip formatı: "Kip:11:43:"
            const kipMatch = line.match(kipPattern);
            if (kipMatch) {
                const lineNum = parseInt(kipMatch[1], 10) - 1; // 0-based
                const colNum = parseInt(kipMatch[2], 10) - 1;  // 0-based
                
                // Sonraki satırlardan hata mesajını topla
                let message = '';
                let j = i + 1;
                
                // "beklenmeyen" veya "bekleniyor" ile başlayan satırları bul
                while (j < lines.length) {
                    const nextLine = lines[j].trim();
                    if (nextLine.startsWith('beklenmeyen') || 
                        nextLine.startsWith('bekleniyor') ||
                        nextLine.startsWith('unexpected') ||
                        nextLine.startsWith('expecting')) {
                        message += (message ? '\n' : '') + nextLine;
                    } else if (nextLine === '|' || nextLine.match(/^\d+\s*\|/) || nextLine.match(/^\s*\^/)) {
                        // Görselleri atla
                    } else if (nextLine.match(/^Kip:\d+:\d+:/)) {
                        // Yeni hata başladı
                        break;
                    }
                    j++;
                }
                
                if (!message) {
                    message = 'Sözdizim hatası';
                }

                // Geçerli pozisyon mu kontrol et
                if (lineNum >= 0 && lineNum < document.lineCount) {
                    const docLine = document.lineAt(lineNum);
                    const startCol = Math.max(0, Math.min(colNum, docLine.text.length));
                    const endCol = docLine.text.length;

                    const range = new vscode.Range(
                        new vscode.Position(lineNum, startCol),
                        new vscode.Position(lineNum, endCol)
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        message,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'kip';

                    diagnostics.push(diagnostic);
                }
                
                i = j;
                continue;
            }
            
            // Diğer hata formatları
            const otherPatterns = [
                // Format: filename:line:col: message
                /^.*?:(\d+):(\d+):\s*(.+)$/,
                // Format: line N, column M: message
                /line\s+(\d+),?\s*column\s+(\d+):\s*(.+)/i,
                // Turkish format: satır N, sütun M: mesaj
                /satır\s+(\d+),?\s*sütun\s+(\d+):\s*(.+)/i,
            ];

            for (const pattern of otherPatterns) {
                const match = line.match(pattern);
                if (match) {
                    const lineNum = parseInt(match[1], 10) - 1;
                    const colNum = parseInt(match[2], 10) - 1;
                    const message = match[3]?.trim() || 'Hata';

                    if (lineNum >= 0 && lineNum < document.lineCount) {
                        const docLine = document.lineAt(lineNum);
                        const startCol = Math.max(0, Math.min(colNum, docLine.text.length));
                        const endCol = docLine.text.length;

                        const range = new vscode.Range(
                            new vscode.Position(lineNum, startCol),
                            new vscode.Position(lineNum, endCol)
                        );

                        const diagnostic = new vscode.Diagnostic(
                            range,
                            message,
                            vscode.DiagnosticSeverity.Error
                        );
                        diagnostic.source = 'kip';

                        diagnostics.push(diagnostic);
                    }
                    break;
                }
            }
            
            i++;
        }

        // Genel hata mesajları (konum bilgisi olmayan)
        if (diagnostics.length === 0 && 
            (output.toLowerCase().includes('hata') || output.toLowerCase().includes('error'))) {
            // Herhangi bir hata var ama konum bilgisi yok
            const range = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(0, 10)
            );
            const diagnostic = new vscode.Diagnostic(
                range,
                output.trim().split('\n').filter(l => l.trim()).slice(0, 2).join(' '),
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = 'kip';
            diagnostics.push(diagnostic);
        }

        return diagnostics;
    }

    private async findKipExecutable(): Promise<string | null> {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const defaultPath = path.join(homeDir, '.local', 'bin', 'kip');
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

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

    /**
     * Belge için diagnostics'i temizle.
     */
    clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.diagnosticCollection.dispose();
    }
}
