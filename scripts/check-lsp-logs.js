#!/usr/bin/env node
/**
 * LSP log kontrol scripti
 * Extension'ın loglarını kontrol eder ve LSP durumunu raporlar
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 LSP Log Kontrolü Başlatılıyor...\n');

// VS Code log dizinleri
const logDirs = [
    path.join(os.homedir(), '.config', 'Code', 'logs'),
    path.join(os.homedir(), '.vscode', 'logs'),
    path.join(os.homedir(), '.local', 'share', 'code', 'logs'),
];

// Extension dizini
const extensionDirs = [
    path.join(os.homedir(), '.vscode', 'extensions'),
    path.join(os.homedir(), '.vscode-server', 'extensions'),
];

console.log('📁 Log dizinleri kontrol ediliyor...');
for (const dir of logDirs) {
    if (fs.existsSync(dir)) {
        console.log(`✅ Bulundu: ${dir}`);
        try {
            const files = fs.readdirSync(dir);
            const recentLogs = files
                .filter(f => f.includes('kip') || f.includes('extension') || f.includes('exthost'))
                .sort()
                .slice(-5);
            if (recentLogs.length > 0) {
                console.log(`   Son log dosyaları: ${recentLogs.join(', ')}`);
            }
        } catch (e) {
            console.log(`   ⚠️  Okunamadı: ${e.message}`);
        }
    } else {
        console.log(`❌ Yok: ${dir}`);
    }
}

console.log('\n📦 Extension dizinleri kontrol ediliyor...');
for (const dir of extensionDirs) {
    if (fs.existsSync(dir)) {
        console.log(`✅ Bulundu: ${dir}`);
        try {
            const extensions = fs.readdirSync(dir);
            const kipExt = extensions.find(e => e.toLowerCase().includes('kip'));
            if (kipExt) {
                console.log(`   ✅ Kip extension bulundu: ${kipExt}`);
                const extPath = path.join(dir, kipExt);
                const packageJson = path.join(extPath, 'package.json');
                if (fs.existsSync(packageJson)) {
                    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
                    console.log(`   📦 Version: ${pkg.version || 'unknown'}`);
                }
            } else {
                console.log(`   ❌ Kip extension bulunamadı`);
            }
        } catch (e) {
            console.log(`   ⚠️  Okunamadı: ${e.message}`);
        }
    } else {
        console.log(`❌ Yok: ${dir}`);
    }
}

console.log('\n🔧 LSP Server kontrolü...');
const lspPaths = [
    path.join(os.homedir(), '.local', 'bin', 'kip-lsp'),
    '/usr/local/bin/kip-lsp',
    '/usr/bin/kip-lsp',
    'kip-lsp' // PATH'te olabilir
];

let lspFound = false;
for (const lspPath of lspPaths) {
    try {
        if (lspPath === 'kip-lsp') {
            // PATH'te kontrol et
            const { execSync } = require('child_process');
            try {
                execSync('which kip-lsp', { stdio: 'ignore' });
                console.log(`✅ LSP server PATH'te bulundu`);
                lspFound = true;
                break;
            } catch (e) {
                // PATH'te yok
            }
        } else {
            if (fs.existsSync(lspPath)) {
                console.log(`✅ LSP server bulundu: ${lspPath}`);
                const stats = fs.statSync(lspPath);
                console.log(`   📅 Son değişiklik: ${stats.mtime}`);
                console.log(`   📦 Boyut: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                lspFound = true;
                break;
            }
        }
    } catch (e) {
        // Kontrol edilemedi
    }
}

if (!lspFound) {
    console.log(`❌ LSP server bulunamadı`);
}

console.log('\n📋 Özet:');
console.log('Extension loglarını görmek için:');
console.log('1. VS Code\'u açın');
console.log('2. Help → Toggle Developer Tools');
console.log('3. Console tab\'ına gidin');
console.log('4. "kip" veya "LSP" ile filtreleyin');
console.log('\nVeya Output panel\'de:');
console.log('1. View → Output');
console.log('2. Dropdown\'dan "Kip Language Server" seçin');
