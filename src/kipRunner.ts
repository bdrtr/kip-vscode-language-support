import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class KipRunner {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Kip');
    }

    async runFile(document: vscode.TextDocument): Promise<void> {
        // Dosyayı kaydet
        await document.save();

        const filePath = document.fileName;

        // Kip executable'ı bul
        const kipPath = await this.findKipExecutable();
        const command = kipPath ? `"${kipPath}" --exec "${filePath}"` : `kip --exec "${filePath}"`;

        // Terminal kullanmayı dene, başarısız olursa Output Channel kullan
        try {
            // Output channel yerine Terminal kullan (Input desteği için)
            // Mevcut bir terminal varsa onu kullan veya yeni oluştur
            let terminal = vscode.window.terminals.find(t => t.name === 'Kip Run');
            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    name: 'Kip Run',
                    hideFromUser: false
                });
            }

            terminal.show();
            terminal.sendText(`echo 'Running: ${path.basename(filePath)}...'`);
            terminal.sendText(command);
            
            console.log('✅ Kip program started in terminal');
        } catch (terminalError) {
            // Terminal oluşturulamazsa Output Channel kullan
            console.warn('⚠️ Terminal creation failed, using Output Channel:', terminalError);
            
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Running: ${path.basename(filePath)}...`);
            this.outputChannel.appendLine('');
            this.outputChannel.show(true);

            // Child process ile çalıştır
            try {
                await this.executeKipWithStreaming(kipPath || 'kip', filePath);
            } catch (execError) {
                const errorMsg = execError instanceof Error ? execError.message : String(execError);
                this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to run Kip file: ${errorMsg}`);
            }
        }
    }

    async findKipExecutable(): Promise<string | null> {
        // 1. Önce konfigürasyona bak (gelecek özellik)
        // const configPath = vscode.workspace.getConfiguration('kip').get<string>('compilerPath');
        // if (configPath && fs.existsSync(configPath)) return configPath;

        // 2. Varsayılan kurulum yolunu kontrol et (~/.local/bin/kip)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const defaultPath = path.join(homeDir, '.local', 'bin', 'kip');
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

        // 3. Sistem PATH'ini kontrol et
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

    private async executeKipWithStreaming(kipPath: string, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = ['--exec', filePath];
            const proc = child_process.spawn(kipPath, args, {
                cwd: path.dirname(filePath)
            });

            // Kip REPL'ın asılı kalmaması için stdin'i kapat (EOF gönder)
            proc.stdin.end();

            proc.stdout.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            proc.stderr.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    this.outputChannel.appendLine('\n✅ Program finished');
                } else {
                    this.outputChannel.appendLine(`\n❌ Exited with code ${code}`);
                }
                resolve();
            });

            proc.on('error', (error) => {
                this.outputChannel.appendLine(`\n❌ Error: ${error.message}`);
                reject(error);
            });
        });
    }

    private executeKip(kipPath: string, filePath: string): Promise<{ stdout: string, stderr: string, exitCode: number }> {
        return new Promise((resolve) => {
            const process = child_process.spawn(kipPath, [filePath], {
                cwd: path.dirname(filePath)
            });

            // Kip REPL'ın asılı kalmaması için stdin'i kapat
            process.stdin.end();

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code || 0
                });
            });

            process.on('error', (error) => {
                resolve({
                    stdout,
                    stderr: error.message,
                    exitCode: 1
                });
            });
        });
    }

    private showInstallationGuide() {
        this.outputChannel.appendLine('❌ Kip compiler not found!');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('📦 Installation Options:');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Option 1: Automatic Installation');
        this.outputChannel.appendLine('  cd <kip-lang-directory>');
        this.outputChannel.appendLine('  ./install.sh');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Option 2: Manual Installation');
        this.outputChannel.appendLine('  sudo apt install haskell-stack');
        this.outputChannel.appendLine('  cd <kip-lang-directory>');
        this.outputChannel.appendLine('  stack install');
        this.outputChannel.appendLine('  export PATH="$HOME/.local/bin:$PATH"');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('📚 See KIP-INSTALLATION.md for detailed instructions');

        const action = vscode.window.showErrorMessage(
            'Kip compiler not found. Would you like to see installation instructions?',
            'Open Guide',
            'Install Now'
        );

        action.then(choice => {
            if (choice === 'Open Guide') {
                const guideUri = vscode.Uri.file(
                    path.join(__dirname, '..', 'KIP-INSTALLATION.md')
                );
                vscode.commands.executeCommand('markdown.showPreview', guideUri);
            } else if (choice === 'Install Now') {
                this.startInstallation();
            }
        });
    }

    private startInstallation() {
        const terminal = vscode.window.createTerminal('Kip Installation');
        terminal.show();

        // Workspace'den kip-lang dizinini bul
        let kipLangPath: string | null = null;
        
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            // Workspace'de kip-lang dizinini ara
            for (const folder of vscode.workspace.workspaceFolders) {
                const potentialPath = path.join(folder.uri.fsPath, 'kip-lang');
                if (fs.existsSync(potentialPath)) {
                    kipLangPath = potentialPath;
                    break;
                }
                // Bir üst dizinde de ara
                const parentPath = path.join(path.dirname(folder.uri.fsPath), 'kip-lang');
                if (fs.existsSync(parentPath)) {
                    kipLangPath = parentPath;
                    break;
                }
            }
        }

        // Bulunamazsa kullanıcıdan sor
        if (!kipLangPath) {
            vscode.window.showInputBox({
                prompt: 'Kip-lang dizininin yolunu girin',
                placeHolder: '/path/to/kip-lang',
                validateInput: (value) => {
                    if (!value || !fs.existsSync(value)) {
                        return 'Geçerli bir dizin yolu girin';
                    }
                    return null;
                }
            }).then(selectedPath => {
                if (selectedPath) {
                    this.runInstallation(terminal, selectedPath);
                }
            });
            return;
        }

        this.runInstallation(terminal, kipLangPath);
    }

    private runInstallation(terminal: vscode.Terminal, kipLangPath: string) {
        terminal.sendText(`cd "${kipLangPath}"`);
        terminal.sendText("echo '🚀 Starting Automated Installation for VS Code...'");
        terminal.sendText("echo 'ℹ️ This will require your password for dependencies (foma).'");

        // Tek komutla her şeyi kur (chmod ekle)
        terminal.sendText("chmod +x ./install.sh && ./install.sh && stack install && echo '✅ Installation Completed! You can run Kip code now.'");

        vscode.window.showInformationMessage(
            'Installation started. Please enter your password in the terminal if asked.'
        );
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
