#!/usr/bin/env node

/**
 * Otomatik Release Script
 * 
 * Kullanım:
 *   npm run release:patch  # 1.1.0 -> 1.1.1
 *   npm run release:minor  # 1.1.0 -> 1.2.0
 *   npm run release:major  # 1.1.0 -> 2.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;
const releaseType = process.argv[2]?.replace('release:', ''); // 'patch', 'minor', 'major'

if (!releaseType || !['patch', 'minor', 'major'].includes(releaseType)) {
    console.error('❌ Geçersiz release tipi. Kullanım: npm run release:patch|minor|major');
    process.exit(1);
}

// Yeni versiyonu hesapla
const newVersion = semver.inc(currentVersion, releaseType);

if (!newVersion) {
    console.error(`❌ Geçersiz versiyon: ${currentVersion}`);
    process.exit(1);
}

console.log(`📦 Mevcut versiyon: ${currentVersion}`);
console.log(`🚀 Yeni versiyon: ${newVersion}`);

// package.json'ı güncelle
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ package.json güncellendi');

// Git işlemleri
try {
    // Değişiklikleri kontrol et
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
        console.log('📝 Git commit oluşturuluyor...');
        execSync(`git add package.json`, { stdio: 'inherit' });
        execSync(`git commit -m "chore: Bump version to ${newVersion}"`, { stdio: 'inherit' });
    }

    // Tag oluştur
    const tagName = `v${newVersion}`;
    console.log(`🏷️  Tag oluşturuluyor: ${tagName}`);
    execSync(`git tag ${tagName}`, { stdio: 'inherit' });

    // Push et
    console.log('📤 Push ediliyor...');
    execSync('git push', { stdio: 'inherit' });
    execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

    console.log('\n✅ Release başarıyla oluşturuldu!');
    console.log(`\n🔗 GitHub Actions şimdi otomatik olarak:`);
    console.log(`   1. Extension'ı derleyecek`);
    console.log(`   2. VSIX dosyası oluşturacak`);
    console.log(`   3. Release'i yayınlayacak`);
    console.log(`\n📦 Release: https://github.com/algorynth/kip-vscode-language-support/releases/tag/${tagName}`);
} catch (error) {
    console.error('❌ Git işlemi başarısız:', error.message);
    // package.json'ı geri al
    packageJson.version = currentVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    process.exit(1);
}
