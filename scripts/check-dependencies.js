#!/usr/bin/env node
/**
 * Dependency kontrol scripti
 * VSIX'e dahil edilmesi gereken bağımlılıkları kontrol eder
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_DEPENDENCIES = [
    'vscode-languageclient',
    'semver',
    'balanced-match'
];

const REQUIRED_MODULES = [
    'vscode-languageclient/node',
    'semver/functions/parse',
    'balanced-match'
];

console.log('🔍 Checking dependencies...\n');

let hasErrors = false;

// 1. package.json'da dependencies kontrolü
console.log('1. Checking package.json dependencies...');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

for (const dep of REQUIRED_DEPENDENCIES) {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
        console.log(`   ✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
        console.log(`   ❌ ${dep}: MISSING in package.json dependencies`);
        hasErrors = true;
    }
}

// 2. node_modules'de modül kontrolü
console.log('\n2. Checking node_modules...');
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

for (const dep of REQUIRED_DEPENDENCIES) {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
        console.log(`   ✅ ${dep}: exists in node_modules`);
    } else {
        console.log(`   ❌ ${dep}: MISSING in node_modules`);
        hasErrors = true;
    }
}

// 3. Özel modül yolları kontrolü
console.log('\n3. Checking specific module paths...');
for (const modulePath of REQUIRED_MODULES) {
    const parts = modulePath.split('/');
    let checkPath = nodeModulesPath;
    
    for (const part of parts) {
        checkPath = path.join(checkPath, part);
    }
    
    // .js uzantısı ekle
    const jsPath = checkPath + '.js';
    const indexPath = path.join(checkPath, 'index.js');
    
    if (fs.existsSync(jsPath) || fs.existsSync(checkPath) || fs.existsSync(indexPath)) {
        console.log(`   ✅ ${modulePath}: found`);
    } else {
        console.log(`   ❌ ${modulePath}: NOT FOUND`);
        console.log(`      Checked: ${checkPath}`);
        hasErrors = true;
    }
}

// 4. .vscodeignore kontrolü
console.log('\n4. Checking .vscodeignore...');
const vscodeignorePath = path.join(__dirname, '..', '.vscodeignore');
if (fs.existsSync(vscodeignorePath)) {
    const vscodeignore = fs.readFileSync(vscodeignorePath, 'utf8');
    
    for (const dep of REQUIRED_DEPENDENCIES) {
        const pattern = `!node_modules/${dep}/**`;
        if (vscodeignore.includes(pattern)) {
            console.log(`   ✅ ${dep}: included in VSIX (${pattern})`);
        } else {
            console.log(`   ⚠️  ${dep}: may be excluded from VSIX`);
            console.log(`      Add to .vscodeignore: ${pattern}`);
        }
    }
} else {
    console.log('   ⚠️  .vscodeignore not found');
}

// 5. VSIX içeriği kontrolü (eğer varsa)
console.log('\n5. Checking VSIX content (if exists)...');
const vsixFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.vsix'));
if (vsixFiles.length > 0) {
    const latestVsix = vsixFiles.sort().reverse()[0];
    console.log(`   Checking: ${latestVsix}`);
    
    // VSIX bir zip dosyası, içeriğini kontrol et
    const { execSync } = require('child_process');
    try {
        const vsixPath = path.join(__dirname, '..', latestVsix);
        const output = execSync(`unzip -l "${vsixPath}" 2>/dev/null | grep -i "semver/functions/parse"`, { encoding: 'utf8' });
        if (output.trim()) {
            console.log('   ✅ semver/functions/parse.js found in VSIX');
        } else {
            console.log('   ❌ semver/functions/parse.js NOT in VSIX');
            hasErrors = true;
        }
    } catch (e) {
        console.log('   ⚠️  Could not check VSIX content (unzip may not be available)');
    }
} else {
    console.log('   ℹ️  No VSIX files found');
}

console.log('\n' + '='.repeat(50));
if (hasErrors) {
    console.log('❌ DEPENDENCY CHECK FAILED');
    console.log('\nFix suggestions:');
    console.log('1. Run: npm install');
    console.log('2. Add missing dependencies to package.json');
    console.log('3. Update .vscodeignore to include required modules');
    console.log('4. Rebuild VSIX: npm run package');
    process.exit(1);
} else {
    console.log('✅ ALL DEPENDENCY CHECKS PASSED');
    process.exit(0);
}
