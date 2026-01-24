import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';

export class KipRunner {
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;
    private octokit: any;
    private octokitClass: any = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('Kip');
        // Octokit'i lazy loading ile yükle (sadece gerektiğinde)
        this.octokit = null;
    }

    /**
     * Octokit'i lazy loading ile yükler
     */
    private async loadOctokit(): Promise<boolean> {
        if (this.octokit) {
            return true; // Zaten yüklü
        }

        if (this.octokitClass === null) {
            // Henüz yüklenmemiş, dene
            try {
                const octokitModule = require('@octokit/rest');
                this.octokitClass = octokitModule.Octokit;
                console.log('✅ @octokit/rest loaded successfully');
                this.outputChannel.appendLine('✅ @octokit/rest modülü yüklendi');
            } catch (e: any) {
                const errorMsg = e?.message || String(e);
                const errorStack = e?.stack || '';
                console.error('❌ @octokit/rest not available:', errorMsg);
                this.outputChannel.appendLine(`❌ @octokit/rest yüklenemedi: ${errorMsg}`);
                if (errorStack) {
                    console.error('Stack:', errorStack);
                    this.outputChannel.appendLine(`Stack: ${errorStack.substring(0, 500)}`);
                }
                this.octokitClass = false; // Yüklenemedi, tekrar deneme
                return false;
            }
        }

        if (this.octokitClass === false) {
            return false; // Yüklenemedi
        }

        // Octokit instance'ı oluştur
        try {
            this.octokit = new this.octokitClass();
            return true;
        } catch (e: any) {
            console.error('❌ Failed to initialize Octokit instance:', e);
            this.outputChannel.appendLine(`❌ Octokit instance oluşturulamadı: ${e?.message || String(e)}`);
            return false;
        }
    }

    async runFile(document: vscode.TextDocument): Promise<void> {
        // Dosyayı kaydet
        await document.save();

        const filePath = document.fileName;

        // Kip executable'ı bul
        let kipPath = await this.findKipExecutable();
        
        // Eğer kip bulunamazsa, download'u dene
        if (!kipPath) {
            // Download'u dene (lazy loading ile Octokit yüklenecek)
            this.outputChannel.appendLine('📥 Kip binary bulunamadı, GitHub Releases\'dan indiriliyor...');
            this.outputChannel.show(true);
            
            kipPath = await this.downloadKipBinary();
            
            if (kipPath) {
                this.outputChannel.appendLine(`✅ Binary başarıyla indirildi: ${kipPath}`);
            } else {
                this.outputChannel.appendLine('⚠️ Binary indirilemedi veya kullanıcı iptal etti');
            }
            
            // Hala bulunamadıysa hata göster
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
        
        // Binary'nin bulunduğu dizini working directory olarak ayarla
        // Böylece vendor/trmorph.fst dosyasını bulabilir
        const binaryDir = path.dirname(kipPath);
        
        // getDataFileName binary'nin kurulu olduğu dizini kullanıyor
        // Ama bizim binary cache'de, bu yüzden getDataFileName yanlış dizini kullanıyor
        // Çözüm: Binary'yi çalıştırırken working directory'yi binary'nin olduğu dizin yap
        // ve binary'nin yanındaki vendor ve lib dizinlerini kullanmasını sağla
        // getDataFileName genellikle /usr/local/share/kip/ gibi bir dizin kullanır
        // Ama bizim durumumuzda binary cache'de, bu yüzden relative path kullanmalıyız
        
        // Binary'yi çalıştırırken working directory'yi binary'nin olduğu dizin yap
        // getDataFileName relative path kullanabilir (eğer absolute path bulamazsa)
        const command = `cd "${binaryDir}" && "${kipPath}" --exec "${filePath}"`;

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
            
            // trmorph.fst ve lib dosyalarının cache'de olup olmadığını kontrol et
            const cacheDir = path.dirname(cachedPath);
            const vendorDir = path.join(cacheDir, 'vendor');
            const libDir = path.join(cacheDir, 'lib');
            const trmorphPath = path.join(vendorDir, 'trmorph.fst');
            
            // vendor/trmorph.fst dosyasını kontrol et ve kopyala
            if (!fs.existsSync(trmorphPath)) {
                const extensionTrmorphPath = this.context.asAbsolutePath('trmorph.fst');
                if (fs.existsSync(extensionTrmorphPath)) {
                    if (!fs.existsSync(vendorDir)) {
                        fs.mkdirSync(vendorDir, { recursive: true });
                    }
                    fs.copyFileSync(extensionTrmorphPath, trmorphPath);
                    console.log(`✅ trmorph.fst dosyası cache'e kopyalandı: ${trmorphPath}`);
                }
            }
            
            // lib dizinini kontrol et ve oluştur (eğer yoksa)
            // Binary lib/temel.kip dosyasını arıyor
            if (!fs.existsSync(libDir)) {
                fs.mkdirSync(libDir, { recursive: true });
                // lib dizini boş olsa bile oluştur, binary hata vermesin
                console.log(`✅ lib dizini cache'de oluşturuldu: ${libDir}`);
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
        if (downloadedPath) {
            console.log(`✅ Binary downloaded successfully: ${downloadedPath}`);
            return downloadedPath;
        } else {
            console.warn('⚠️ Binary download failed or was cancelled');
            return null;
        }
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
        // Octokit'i lazy loading ile yükle
        const octokitLoaded = await this.loadOctokit();
        if (!octokitLoaded || !this.octokit) {
            const errorMsg = '⚠️ GitHub download feature is not available (@octokit/rest not installed)';
            console.warn(errorMsg);
            this.outputChannel.appendLine(errorMsg);
            this.outputChannel.show(true);
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
                this.outputChannel.appendLine('🔍 Extension repo\'sundan release aranıyor: algorynth/kip-vscode-language-support');
                // Extension'ın kendi repo'sundan binary'leri indir
                response = await this.octokit.repos.getLatestRelease({
                    owner: 'algorynth',
                    repo: 'kip-vscode-language-support'
                });
                console.log(`📦 Found release in extension repo: ${response.data.tag_name}`);
                this.outputChannel.appendLine(`✅ Release bulundu: ${response.data.tag_name}`);
            } catch (extError: any) {
                // Extension repo'sunda release yoksa, kip-dili/kip'ten dene
                const errorMsg = extError?.message || String(extError);
                console.log('⚠️ No release found in extension repo, trying kip-dili/kip...');
                this.outputChannel.appendLine(`⚠️ Extension repo\'sunda release bulunamadı: ${errorMsg}`);
                this.outputChannel.appendLine('🔍 Alternatif repo\'dan release aranıyor: kip-dili/kip');
                try {
                    response = await this.octokit.repos.getLatestRelease({
                        owner: 'kip-dili',
                        repo: 'kip'
                    });
                    console.log(`📦 Found release in kip-dili/kip: ${response.data.tag_name}`);
                    this.outputChannel.appendLine(`✅ Release bulundu: ${response.data.tag_name}`);
                } catch (altError: any) {
                    const altErrorMsg = altError?.message || String(altError);
                    console.error('❌ Both repos failed:', altErrorMsg);
                    this.outputChannel.appendLine(`❌ Alternatif repo\'da da release bulunamadı: ${altErrorMsg}`);
                    await vscode.window.showErrorMessage(
                        `GitHub Releases'dan binary bulunamadı. Lütfen manuel olarak kurun.`,
                        'Kurulum Rehberi'
                    ).then(action => {
                        if (action === 'Kurulum Rehberi') {
                            this.showInstallationGuide();
                        }
                    });
                    return null;
                }
            }

            const release = response.data;
            console.log(`📦 Found release: ${release.tag_name}`);

            // Platform'a uygun asset'leri bul (binary, vendor, lib)
            this.outputChannel.appendLine(`🔍 Platform binary aranıyor: ${platformInfo.binaryName}`);
            this.outputChannel.appendLine(`📋 Mevcut asset'ler: ${release.assets.map((a: any) => a.name).join(', ')}`);
            const asset = release.assets.find((a: any) => a.name === platformInfo.binaryName);
            const vendorAsset = release.assets.find((a: any) => a.name === 'vendor/trmorph.fst' || a.name.endsWith('/trmorph.fst'));
            const libAssets = release.assets.filter((a: any) => a.name.startsWith('lib/') || a.name.includes('lib/'));
            
            if (!asset) {
                const errorMsg = `⚠️ Binary not found in release: ${platformInfo.binaryName}`;
                console.warn(errorMsg);
                this.outputChannel.appendLine(errorMsg);
                this.outputChannel.show(true);
                await vscode.window.showErrorMessage(
                    `Platform binary bulunamadı: ${platformInfo.binaryName}. Lütfen manuel olarak kurun.`,
                    'Kurulum Rehberi'
                ).then(action => {
                    if (action === 'Kurulum Rehberi') {
                        this.showInstallationGuide();
                    }
                });
                return null;
            }
            
            this.outputChannel.appendLine(`✅ Binary bulundu: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`);
            if (vendorAsset) {
                this.outputChannel.appendLine(`✅ Vendor asset bulundu: ${vendorAsset.name}`);
            }
            if (libAssets.length > 0) {
                this.outputChannel.appendLine(`✅ Lib asset'leri bulundu: ${libAssets.length} dosya`);
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
            let downloadSuccess = false;
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Kip Binary İndiriliyor',
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ increment: 0, message: 'Binary indiriliyor...' });
                    this.outputChannel.appendLine(`📥 İndirme başlatıldı: ${asset.browser_download_url}`);

                    // Binary'yi indir
                    const downloadUrl = asset.browser_download_url;
                    const binaryData = await this.downloadFile(downloadUrl);
                    
                    progress.report({ increment: 50, message: 'Dosyaya kaydediliyor...' });
                    this.outputChannel.appendLine(`💾 Binary indirildi (${(binaryData.length / 1024 / 1024).toFixed(2)} MB), dosyaya kaydediliyor...`);

                    // Binary'yi cache'e kaydet
                    fs.writeFileSync(cachedPath, binaryData);

                    // Executable permission ver (Linux/macOS)
                    if (process.platform !== 'win32') {
                        fs.chmodSync(cachedPath, '755');
                        this.outputChannel.appendLine(`✅ Executable permission verildi`);
                    }

                    // vendor ve lib dosyalarını indir (eğer release'de varsa)
                    const vendorDir = path.join(cacheDir, 'vendor');
                    const libDir = path.join(cacheDir, 'lib');
                    
                    // Vendor dosyasını indir
                    if (vendorAsset) {
                        if (!fs.existsSync(vendorDir)) {
                            fs.mkdirSync(vendorDir, { recursive: true });
                        }
                        progress.report({ increment: 60, message: 'Vendor dosyası indiriliyor...' });
                        const vendorData = await this.downloadFile(vendorAsset.browser_download_url);
                        const vendorPath = path.join(vendorDir, 'trmorph.fst');
                        fs.writeFileSync(vendorPath, vendorData);
                        this.outputChannel.appendLine(`✅ vendor/trmorph.fst indirildi: ${vendorPath}`);
                    } else {
                        // Fallback: Extension'dan kopyala
                        const extensionTrmorphPath = this.context.asAbsolutePath('trmorph.fst');
                        if (fs.existsSync(extensionTrmorphPath)) {
                            if (!fs.existsSync(vendorDir)) {
                                fs.mkdirSync(vendorDir, { recursive: true });
                            }
                            const trmorphPath = path.join(vendorDir, 'trmorph.fst');
                            fs.copyFileSync(extensionTrmorphPath, trmorphPath);
                            this.outputChannel.appendLine(`✅ trmorph.fst dosyası extension'dan kopyalandı: ${trmorphPath}`);
                        } else {
                            this.outputChannel.appendLine(`⚠️ trmorph.fst dosyası bulunamadı`);
                        }
                    }
                    
                    // Lib dosyalarını indir
                    if (libAssets && libAssets.length > 0) {
                        if (!fs.existsSync(libDir)) {
                            fs.mkdirSync(libDir, { recursive: true });
                        }
                        progress.report({ increment: 70, message: 'Lib dosyaları indiriliyor...' });
                        for (const libAsset of libAssets) {
                            const libData = await this.downloadFile(libAsset.browser_download_url);
                            const libFileName = path.basename(libAsset.name);
                            const libPath = path.join(libDir, libFileName);
                            fs.writeFileSync(libPath, libData);
                            this.outputChannel.appendLine(`✅ Lib dosyası indirildi: ${libFileName}`);
                        }
                    } else {
                        // Fallback: Lib dizinini oluştur (boş olsa bile)
                        if (!fs.existsSync(libDir)) {
                            fs.mkdirSync(libDir, { recursive: true });
                            this.outputChannel.appendLine(`✅ lib dizini cache'de oluşturuldu: ${libDir}`);
                        }
                    }

                    progress.report({ increment: 100, message: 'Tamamlandı!' });
                    downloadSuccess = true;
                    this.outputChannel.appendLine(`✅ Binary başarıyla kaydedildi: ${cachedPath}`);
                } catch (downloadError: any) {
                    const errorMsg = downloadError?.message || String(downloadError);
                    console.error(`❌ Download failed: ${errorMsg}`);
                    this.outputChannel.appendLine(`❌ İndirme hatası: ${errorMsg}`);
                    this.outputChannel.show(true);
                    await vscode.window.showErrorMessage(
                        `Binary indirme başarısız: ${errorMsg}`,
                        'Tekrar Dene',
                        'Kurulum Rehberi'
                    ).then(action => {
                        if (action === 'Kurulum Rehberi') {
                            this.showInstallationGuide();
                        }
                    });
                    downloadSuccess = false;
                }
            });

            if (!downloadSuccess) {
                return null;
            }

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
     * URL'den dosya indirir (redirect'leri takip eder)
     */
    private downloadFile(url: string, maxRedirects: number = 5): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (maxRedirects <= 0) {
                reject(new Error('Çok fazla redirect (maksimum 5)'));
                return;
            }

            const client = url.startsWith('https:') ? https : http;
            
            const request = client.get(url, (response) => {
                // Redirect'leri handle et (301, 302, 303, 307, 308)
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const redirectUrl = response.headers.location;
                    this.outputChannel.appendLine(`🔄 Redirect takip ediliyor: ${redirectUrl}`);
                    // Absolute URL değilse, base URL ile birleştir
                    const fullRedirectUrl = redirectUrl.startsWith('http') 
                        ? redirectUrl 
                        : new URL(redirectUrl, url).toString();
                    // Recursive olarak redirect'i takip et
                    this.downloadFile(fullRedirectUrl, maxRedirects - 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }

                const chunks: Buffer[] = [];
                let totalSize = 0;
                const contentLength = parseInt(response.headers['content-length'] || '0', 10);
                
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                    totalSize += chunk.length;
                    if (contentLength > 0) {
                        const percent = (totalSize / contentLength * 100).toFixed(1);
                        this.outputChannel.appendLine(`📥 İndiriliyor: ${percent}% (${(totalSize / 1024 / 1024).toFixed(2)} MB / ${(contentLength / 1024 / 1024).toFixed(2)} MB)`);
                    }
                });
                
                response.on('end', () => {
                    this.outputChannel.appendLine(`✅ İndirme tamamlandı: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
                    resolve(Buffer.concat(chunks));
                });
                
                response.on('error', (error) => {
                    this.outputChannel.appendLine(`❌ İndirme hatası: ${error.message}`);
                    reject(error);
                });
            });
            
            request.on('error', (error) => {
                this.outputChannel.appendLine(`❌ Bağlantı hatası: ${error.message}`);
                reject(error);
            });
            
            // Timeout ekle (5 dakika)
            request.setTimeout(300000, () => {
                request.destroy();
                const error = new Error('İndirme zaman aşımına uğradı (5 dakika)');
                this.outputChannel.appendLine(`❌ ${error.message}`);
                reject(error);
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
