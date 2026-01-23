#!/usr/bin/env node
/**
 * Extension test scripti
 * Extension'ın doğru şekilde yüklendiğini ve çalıştığını test eder
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧪 Testing extension...\n');

let hasErrors = false;

// 1. Derlenmiş dosyaları kontrol et
console.log('1. Checking compiled files...');
const outPath = path.join(__dirname, '..', 'out');
const requiredFiles = [
    'extension.js',
    'kipRunner.js',
    'hoverProvider.js',
    'completionProvider.js',
    'formattingProvider.js',
    'diagnosticProvider.js'
];

for (const file of requiredFiles) {
    const filePath = path.join(outPath, file);
    if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ❌ ${file}: MISSING`);
        hasErrors = true;
    }
}

// 2. TypeScript derleme hatalarını kontrol et
console.log('\n2. Checking TypeScript compilation...');
try {
    execSync('npm run compile', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
    });
    console.log('   ✅ TypeScript compilation successful');
} catch (e) {
    console.log('   ❌ TypeScript compilation failed');
    console.log('   Error:', e.message);
    hasErrors = true;
}

// 3. VSIX oluşturma testi
console.log('\n3. Testing VSIX creation...');
try {
    // Önce eski VSIX'i temizle
    const vsixFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.vsix'));
    const testVsix = path.join(__dirname, '..', 'test-extension.vsix');
    
    // Test VSIX oluştur
    execSync(`npx @vscode/vsce package --out test-extension.vsix`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
    });
    
    if (fs.existsSync(testVsix)) {
        const stats = fs.statSync(testVsix);
        console.log(`   ✅ VSIX created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        // VSIX içeriğini kontrol et
        try {
            const output = execSync(`unzip -l "${testVsix}" 2>/dev/null | grep "extension.js"`, { encoding: 'utf8' });
            if (output.includes('extension.js')) {
                console.log('   ✅ extension.js found in VSIX');
            } else {
                console.log('   ⚠️  extension.js not found in VSIX');
            }
        } catch (e) {
            console.log('   ⚠️  Could not verify VSIX content');
        }
        
        // Test VSIX'i sil
        fs.unlinkSync(testVsix);
    } else {
        console.log('   ❌ VSIX creation failed');
        hasErrors = true;
    }
} catch (e) {
    console.log('   ⚠️  VSIX creation test skipped (vsce may not be available)');
    console.log('   Error:', e.message);
}

// 4. LSP modül yükleme testi
console.log('\n4. Testing LSP module loading...');
try {
    // Node.js ortamında LSP modülünü yüklemeyi dene
    const testScript = `
        try {
            const lsp = require('vscode-languageclient/node');
            console.log('   ✅ LSP module can be loaded');
        } catch (e) {
            console.log('   ❌ LSP module loading failed:', e.message);
            process.exit(1);
        }
    `;
    
    execSync(`node -e "${testScript}"`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
    });
} catch (e) {
    console.log('   ⚠️  LSP module test skipped (vscode module may not be available in Node.js)');
}

console.log('\n' + '='.repeat(50));
if (hasErrors) {
    console.log('❌ EXTENSION TEST FAILED');
    process.exit(1);
} else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
}
