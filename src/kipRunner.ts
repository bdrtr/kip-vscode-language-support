import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class KipRunner {
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Kip');
    }

    async runFile(document: vscode.TextDocument): Promise<void> {
        await document.save();
        const filePath = document.fileName;

        let kipPath = await this.findKipExecutable();
        
        if (!kipPath) {
            const installAction = await vscode.window.showInformationMessage(
                'Kip derleyicisi bulunamadı. Otomatik kurulum yapmak ister misiniz?',
                'Kur',
                'İptal'
            );
            
            if (installAction === 'Kur') {
                kipPath = await this.runInstallationScript();
            }
            
            if (!kipPath) {
                const action = await vscode.window.showErrorMessage(
                    'Kip derleyicisi bulunamadı. Kip dosyalarını çalıştırmak için önce Kip derleyicisini kurmanız gerekiyor.',
                    'Kurulum Rehberi',
                    'Ayarları Aç'
                );
                
                if (action === 'Kurulum Rehberi') {
                    this.showInstallationGuide();
                } else if (action === 'Ayarları Aç') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'kip.compilerPath');
                }
                return;
            }
        }
        
        const command = `"${kipPath}" --exec "${filePath}"`;

        try {
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
        } catch (terminalError) {
            console.warn('Terminal creation failed, using Output Channel:', terminalError);
            
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Running: ${path.basename(filePath)}...`);
            this.outputChannel.appendLine('');
            this.outputChannel.show(true);

            try {
                await this.executeKipWithStreaming(kipPath, filePath);
            } catch (execError) {
                const errorMsg = execError instanceof Error ? execError.message : String(execError);
                this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
                vscode.window.showErrorMessage(`Failed to run Kip file: ${errorMsg}`);
            }
        }
    }

    async findKipExecutable(): Promise<string | null> {
        const configPath = vscode.workspace.getConfiguration('kip').get<string>('compilerPath');
        if (configPath?.trim()) {
            const resolvedPath = path.isAbsolute(configPath) 
                ? configPath 
                : path.resolve(configPath);
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
            console.warn(`Configured kip.compilerPath not found: ${resolvedPath}`);
        }

        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const defaultPath = path.join(homeDir, '.local', 'bin', 'kip');
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

        const pathResult = await new Promise<string | null>((resolve) => {
            const command = process.platform === 'win32' ? 'where kip' : 'which kip';
            child_process.exec(command, (error, stdout) => {
                if (!error && stdout?.trim()) {
                    resolve(stdout.trim());
                } else {
                    resolve(null);
                }
            });
        });

        return pathResult;
    }

    private async executeKipWithStreaming(kipPath: string, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = child_process.spawn(kipPath, ['--exec', filePath], {
                cwd: path.dirname(filePath)
            });

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

    private getPlatformInstallScript(): { script: string; command: string } | null {
        const platform = process.platform;
        const scriptsDir = this.context.asAbsolutePath('scripts');

        if (platform === 'win32') {
            const ps1Path = path.join(scriptsDir, 'install.ps1');
            const batPath = path.join(scriptsDir, 'install.bat');
            
            if (fs.existsSync(ps1Path)) {
                return {
                    script: ps1Path,
                    command: `powershell -ExecutionPolicy Bypass -File "${ps1Path}"`
                };
            } else if (fs.existsSync(batPath)) {
                return {
                    script: batPath,
                    command: `cmd /c "${batPath}"`
                };
            }
        } else {
            const shPath = path.join(scriptsDir, 'install.sh');
            if (fs.existsSync(shPath)) {
                try {
                    fs.chmodSync(shPath, '755');
                } catch (e) {
                    console.warn('Failed to chmod install.sh:', e);
                }
                return {
                    script: shPath,
                    command: `"${shPath}"`
                };
            }
        }

        return null;
    }

    private async runInstallationScript(): Promise<string | null> {
        const scriptInfo = this.getPlatformInstallScript();
        
        if (!scriptInfo) {
            const platformText = process.platform === 'win32' ? 'Windows' 
                : process.platform === 'darwin' ? 'macOS' 
                : 'Linux';
            
            await vscode.window.showErrorMessage(
                `${platformText} için kurulum script'i bulunamadı. Lütfen manuel olarak kurun.`,
                'Kurulum Rehberi'
            ).then(action => {
                if (action === 'Kurulum Rehberi') {
                    this.showInstallationGuide();
                }
            });
            return null;
        }

        const terminal = vscode.window.createTerminal({
            name: 'Kip Installation',
            hideFromUser: false
        });

        terminal.show();

        let installationResult: string | null = null;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Kip Kurulumu Çalışıyor',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 0, message: 'Kurulum script\'i başlatılıyor...' });
                this.outputChannel.appendLine(`🔧 Kurulum script'i çalıştırılıyor: ${scriptInfo.script}`);
                
                terminal.sendText(scriptInfo.command);
                
                if (process.platform !== 'win32') {
                    vscode.window.showInformationMessage(
                        'Kurulum başlatıldı. Terminal\'de şifreniz istenebilir (Foma ve Stack kurulumu için).'
                    );
                } else {
                    vscode.window.showInformationMessage(
                        'Kurulum başlatıldı. Terminal penceresini kontrol edin.'
                    );
                }

                progress.report({ increment: 50, message: 'Kurulum devam ediyor...' });
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const kipPath = await this.findKipExecutable();
                if (kipPath) {
                    installationResult = kipPath;
                    progress.report({ increment: 100, message: 'Kurulum tamamlandı!' });
                    this.outputChannel.appendLine(`✅ Kurulum başarılı! Binary bulundu: ${kipPath}`);
                } else {
                    progress.report({ increment: 100, message: 'Kurulum devam ediyor...' });
                    this.outputChannel.appendLine('ℹ️ Kurulum devam ediyor. Lütfen terminal penceresini kontrol edin.');
                    this.outputChannel.appendLine('ℹ️ Kurulum tamamlandığında VS Code\'u yeniden başlatın.');
                }
            } catch (error: any) {
                const errorMsg = error?.message || String(error);
                console.error(`Installation script failed: ${errorMsg}`);
                this.outputChannel.appendLine(`❌ Kurulum hatası: ${errorMsg}`);
                this.outputChannel.show(true);
                
                await vscode.window.showErrorMessage(
                    `Kurulum script'i başarısız: ${errorMsg}`,
                    'Kurulum Rehberi'
                ).then(action => {
                    if (action === 'Kurulum Rehberi') {
                        this.showInstallationGuide();
                    }
                });
            }
        });

        return installationResult;
    }

    private showInstallationGuide() {
        this.outputChannel.appendLine('❌ Kip derleyicisi bulunamadı!');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('📦 Kurulum Seçenekleri:');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Seçenek 1: Otomatik Kurulum');
        this.outputChannel.appendLine('  Extension\'ın "Kur" butonuna tıklayın');
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Seçenek 2: Manuel Kurulum');
        this.outputChannel.appendLine('  sudo apt install haskell-stack');
        this.outputChannel.appendLine('  cd <kip-lang-directory>');
        this.outputChannel.appendLine('  stack install');
        this.outputChannel.appendLine('  export PATH="$HOME/.local/bin:$PATH"');
        this.outputChannel.appendLine('');
        this.outputChannel.show(true);
    }

    dispose() {
        this.outputChannel.dispose();
    }
}
