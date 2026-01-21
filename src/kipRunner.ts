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

        // Output channel yerine Terminal kullan (Input desteği için)
        // Mevcut bir terminal varsa onu kullan veya yeni oluştur
        let terminal = vscode.window.terminals.find(t => t.name === 'Kip Run');
        if (!terminal) {
            terminal = vscode.window.createTerminal('Kip Run');
        }

        terminal.show();
        terminal.sendText(`echo 'Running: ${path.basename(filePath)}...'`);

        // Kip programını çalıştır
        // Kip derleyicisinin PATH'te olduğunu varsayıyoruz (önceki adımlarda kurduk veya PATH değişti)
        // Veya config/otomatik bulma ile tam yolu alabiliriz ama terminalde PATH zaten yüklüdür.

        const kipPath = await this.findKipExecutable();

        if (kipPath) {
            // Tam yol ile çalıştır ki garanti olsun (ve EOF gönder)
            terminal.sendText(`echo "" | "${kipPath}" "${filePath}"`);
        } else {
            // Fallback: Belki PATH'tedir, direkt dene (ve EOF gönder)
            terminal.sendText(`echo "" | kip "${filePath}"`);

            // Eğer hata verirse (komut yoksa), kullanıcı anlar.
            // Ama daha şık olması için kontrol ekleyebiliriz.
            // Şimdilik basit tutalım, kullanıcı zaten Setup yaptı.
        }
    }

    private async findKipExecutable(): Promise<string | null> {
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

    private executeKipWithStreaming(kipPath: string, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const process = child_process.spawn(kipPath, [filePath], {
                cwd: path.dirname(filePath)
            });

            // Kip REPL'ın asılı kalmaması için stdin'i kapat (EOF gönder)
            process.stdin.end();

            process.stdout.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            process.stderr.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            process.on('close', (code) => {
                if (code === 0) {
                    this.outputChannel.appendLine('\n✅ Program finished');
                } else {
                    this.outputChannel.appendLine(`\n❌ Exited with code ${code}`);
                }
                resolve();
            });

            process.on('error', (error) => {
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
        this.outputChannel.appendLine('  cd /home/bedir/Documents/vsCode/kip/kip-lang');
        this.outputChannel.appendLine('  ./install.sh');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Option 2: Manual Installation');
        this.outputChannel.appendLine('  sudo apt install haskell-stack');
        this.outputChannel.appendLine('  cd /home/bedir/Documents/vsCode/kip/kip-lang');
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

        // Bu dizin kullanıcının workspace yapısına göre ayarlanmalı
        // Ancak kullanıcının yapısında 'Documents/vsCode/kip/kip-lang' mevcut
        const kipLangPath = '/home/bedir/Documents/vsCode/kip/kip-lang';

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
