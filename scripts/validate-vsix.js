#!/usr/bin/env node
/**
 * VSIX validation scripti
 * VSIX dosyasının içeriğini ve bağımlılıklarını kontrol eder
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUIRED_FILES = [
    'extension/out/extension.js',
    'extension/package.json',
    'extension/node_modules/vscode-languageclient',
    'extension/node_modules/semver/functions/parse.js',
    'extension/node_modules/balanced-match'
];

function checkVsix(vsixPath) {
    console.log(`🔍 Validating VSIX: ${path.basename(vsixPath)}\n`);
    
    if (!fs.existsSync(vsixPath)) {
        console.log(`❌ VSIX file not found: ${vsixPath}`);
        return false;
    }
    
    const stats = fs.statSync(vsixPath);
    console.log(`📦 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);
    
    let allFound = true;
    
    try {
        // VSIX içeriğini listele
        const output = execSync(`unzip -l "${vsixPath}"`, { encoding: 'utf8' });
        
        console.log('Checking required files...\n');
        
        for (const requiredFile of REQUIRED_FILES) {
            // VSIX içinde dosya yolu extension/ ile başlar
            const searchPattern = requiredFile.replace(/^extension\//, '');
            
            if (output.includes(searchPattern) || output.includes(requiredFile)) {
                console.log(`   ✅ ${requiredFile}`);
            } else {
                console.log(`   ❌ ${requiredFile}: MISSING`);
                allFound = false;
            }
        }
        
        // Semver modülünü özel kontrol
        console.log('\nChecking semver module...');
        if (output.includes('semver/functions/parse.js')) {
            console.log('   ✅ semver/functions/parse.js found');
        } else {
            console.log('   ❌ semver/functions/parse.js NOT FOUND');
            allFound = false;
        }
        
        // Balanced-match kontrolü
        console.log('\nChecking balanced-match module...');
        if (output.includes('balanced-match')) {
            console.log('   ✅ balanced-match found');
        } else {
            console.log('   ❌ balanced-match NOT FOUND');
            allFound = false;
        }
        
        // Toplam dosya sayısı
        const fileCount = (output.match(/^\s+\d+/gm) || []).length;
        console.log(`\n📊 Total files in VSIX: ${fileCount}`);
        
    } catch (e) {
        console.log(`❌ Error reading VSIX: ${e.message}`);
        console.log('   Make sure unzip is installed');
        return false;
    }
    
    return allFound;
}

// Ana fonksiyon
const vsixPath = process.argv[2] || path.join(__dirname, '..', 'kip-language-1.0.10-fixed.vsix');

console.log('='.repeat(60));
const isValid = checkVsix(vsixPath);
console.log('='.repeat(60));

if (isValid) {
    console.log('\n✅ VSIX VALIDATION PASSED');
    process.exit(0);
} else {
    console.log('\n❌ VSIX VALIDATION FAILED');
    console.log('\nFix suggestions:');
    console.log('1. Run: npm install');
    console.log('2. Check .vscodeignore file');
    console.log('3. Rebuild VSIX: npm run package');
    process.exit(1);
}
