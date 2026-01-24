import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

// Octokit'i optional olarak yükle - eğer yüklenemezse download özelliği çalışmaz ama extension çalışmaya devam eder
let Octokit: any = null;
try {
    const octokitModule = require('@octokit/rest');
    Octokit = octokitModule.Octokit;
} catch (e) {
    console.warn('⚠️ @octokit/rest not available, GitHub download feature will be disabled');
}

export class KipRunner {
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;
    private octokit: any;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Kip');
        // Octokit sadece mevcut ise başlat
        if (Octokit) {
            try {
                this.octokit = new Octokit();
            } catch (e) {
                console.warn('⚠️ Failed to initialize Octokit:', e);
                this.octokit = null;
            }
        } else {
            this.octokit = null;
        }
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

    /**
     * Platform ve mimari bilgisini döndürür
     */
    private getPlatformInfo(): { platform: string; arch: string; binaryName: string } {
        const platform = process.platform;
        const arch = process.arch;
        
        if (platform === 'win32') {
            return { platform: 'win32', arch: 'x64', binaryName: 'kip-win32-x64.exe' };
        } else if (platform === 'darwin') {
            if (arch === 'arm64') {
                return { platform: 'darwin', arch: 'arm64', binaryName: 'kip-darwin-arm64' };
            } else {
                return { platform: 'darwin', arch: 'x64', binaryName: 'kip-darwin-x64' };
            }
        } else {
            // Linux
            return { platform: 'linux', arch: 'x64', binaryName: 'kip-linux-x64' };
        }
    }

    /**
     * Cache'deki binary'yi kontrol eder
     */
    private getCachedBinaryPath(): string | null {
        const platformInfo = this.getPlatformInfo();
        const cacheDir = path.join(this.context.globalStoragePath, 'kip-binaries');
        const cachedPath = path.join(cacheDir, platformInfo.binaryName);
        
        if (fs.existsSync(cachedPath)) {
            return cachedPath;
        }
        
        return null;
    }

    async findKipExecutable(): Promise<string | null> {
        // 1. Önce konfigürasyona bak
        const configPath = vscode.workspace.getConfiguration('kip').get<string>('compilerPath');
        if (configPath && configPath.trim().length > 0) {
            const resolvedPath = path.isAbsolute(configPath) 
                ? configPath 
                : path.resolve(configPath);
            if (fs.existsSync(resolvedPath)) {
                return resolvedPath;
            }
            console.warn(`⚠️ Configured kip.compilerPath not found: ${resolvedPath}`);
        }

        // 2. Cache'deki binary'yi kontrol et
        const cachedPath = this.getCachedBinaryPath();
        if (cachedPath) {
            // Executable permission ver (Linux/macOS)
            if (process.platform !== 'win32') {
                try {
                    fs.chmodSync(cachedPath, '755');
                } catch (e) {
                    console.warn('Failed to chmod cached binary:', e);
                }
            }
            return cachedPath;
        }

        // 3. Varsayılan kurulum yolunu kontrol et (~/.local/bin/kip)
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (homeDir) {
            const defaultPath = path.join(homeDir, '.local', 'bin', 'kip');
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
        }

        // 4. Sistem PATH'ini kontrol et
        const pathResult = await new Promise<string | null>((resolve) => {
            const command = process.platform === 'win32' ? 'where kip' : 'which kip';
            child_process.exec(command, (error, stdout) => {
                if (!error && stdout && stdout.trim().length > 0) {
                    resolve(stdout.trim());
                } else {
                    resolve(null);
                }
            });
        });

        if (pathResult) {
            return pathResult;
        }

        // 5. GitHub Releases'dan otomatik indir (son çare)
        console.log('📥 Kip binary not found, attempting to download from GitHub Releases...');
        const downloadedPath = await this.downloadKipBinary();
        return downloadedPath;
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

    /**
     * GitHub Releases'dan Kip binary'sini indirir
     */
    private async downloadKipBinary(): Promise<string | null> {
        // Octokit mevcut değilse download özelliği devre dışı
        if (!this.octokit) {
            console.warn('⚠️ GitHub download feature is not available (@octokit/rest not installed)');
            return null;
        }

        const platformInfo = this.getPlatformInfo();
        const cacheDir = path.join(this.context.globalStoragePath, 'kip-binaries');
        const cachedPath = path.join(cacheDir, platformInfo.binaryName);

        // Cache dizinini oluştur
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        try {
            // GitHub Releases API'den en son release'i al
            // Önce extension'ın kendi repo'sundan dene, sonra kip-dili/kip'ten
            let response;
            try {
                // Extension'ın kendi repo'sundan binary'leri indir
                response = await this.octokit.repos.getLatestRelease({
                    owner: 'algorynth',
                    repo: 'kip-vscode-language-support'
                });
                console.log(`📦 Found release in extension repo: ${response.data.tag_name}`);
            } catch (extError) {
                // Extension repo'sunda release yoksa, kip-dili/kip'ten dene
                console.log('⚠️ No release found in extension repo, trying kip-dili/kip...');
                response = await this.octokit.repos.getLatestRelease({
                    owner: 'kip-dili',
                    repo: 'kip'
                });
                console.log(`📦 Found release in kip-dili/kip: ${response.data.tag_name}`);
            }

            const release = response.data;
            console.log(`📦 Found release: ${release.tag_name}`);

            // Platform'a uygun asset'i bul
            const asset = release.assets.find((a: any) => a.name === platformInfo.binaryName);
            if (!asset) {
                console.warn(`⚠️ Binary not found in release: ${platformInfo.binaryName}`);
                return null;
            }

            // Kullanıcıya bilgi ver
            const downloadAction = await vscode.window.showInformationMessage(
                `Kip binary bulunamadı. GitHub Releases'dan indirmek ister misiniz? (${(asset.size / 1024 / 1024).toFixed(2)} MB)`,
                'İndir',
                'İptal'
            );

            if (downloadAction !== 'İndir') {
                return null;
            }

            // Progress göster
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Kip Binary İndiriliyor',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Binary indiriliyor...' });

                // Binary'yi indir
                const downloadUrl = asset.browser_download_url;
                const binaryData = await this.downloadFile(downloadUrl);
                
                progress.report({ increment: 50, message: 'Dosyaya kaydediliyor...' });

                // Binary'yi cache'e kaydet
                fs.writeFileSync(cachedPath, binaryData);

                // Executable permission ver (Linux/macOS)
                if (process.platform !== 'win32') {
                    fs.chmodSync(cachedPath, '755');
                }

                progress.report({ increment: 100, message: 'Tamamlandı!' });
            });

            console.log(`✅ Binary downloaded to: ${cachedPath}`);
            return cachedPath;

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to download binary: ${errorMsg}`);
            // Hata durumunda sessizce null döndür, kullanıcıya zaten kurulum rehberi gösterilecek
            return null;
        }
    }

    /**
     * URL'den dosya indirir
     */
    private downloadFile(url: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https:') ? https : http;
            
            client.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const chunks: Buffer[] = [];
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                response.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
                response.on('error', reject);
            }).on('error', reject);
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
