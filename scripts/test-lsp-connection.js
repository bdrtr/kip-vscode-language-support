#!/usr/bin/env node
/**
 * LSP server bağlantı testi
 * LSP server'ın çalışıp çalışmadığını ve yanıt verip vermediğini test eder
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

console.log('🧪 LSP Server Bağlantı Testi\n');

const lspPath = path.join(os.homedir(), '.local', 'bin', 'kip-lsp');
const fsmPath = path.join(os.homedir(), '.vscode', 'extensions', 'algorynth.kip-language-1.1.0', 'trmorph.fst');

console.log(`📁 LSP Path: ${lspPath}`);
console.log(`📁 FSM Path: ${fsmPath}\n`);

// LSP initialize request
const initializeRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        processId: process.pid,
        clientInfo: {
            name: 'test-client',
            version: '1.0.0'
        },
        capabilities: {},
        workspaceFolders: null
    }
};

console.log('🔄 LSP server başlatılıyor...');
const lsp = spawn(lspPath, ['--fsm', fsmPath, '--stdio'], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

lsp.stdout.on('data', (data) => {
    output += data.toString();
    console.log('📥 Response:', data.toString().substring(0, 200));
});

lsp.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.error('❌ Error:', data.toString().substring(0, 200));
});

lsp.on('close', (code) => {
    console.log(`\n🔚 LSP server kapandı (code: ${code})`);
    if (output) {
        console.log('\n📋 Output:', output.substring(0, 500));
    }
    if (errorOutput) {
        console.log('\n⚠️  Errors:', errorOutput.substring(0, 500));
    }
});

// Initialize request gönder
setTimeout(() => {
    console.log('\n📤 Initialize request gönderiliyor...');
    const request = JSON.stringify(initializeRequest) + '\n';
    lsp.stdin.write(request);
    
    // 2 saniye sonra kapat
    setTimeout(() => {
        lsp.kill();
        process.exit(0);
    }, 2000);
}, 500);
