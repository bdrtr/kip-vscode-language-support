#!/usr/bin/env node
/**
 * Örnek .kip dosyaları üzerinde LSP (semantic tokens) testi.
 * Kurulum: npm run package && code --install-extension kip-language-1.1.0.vsix
 * Çalıştır: node scripts/test-examples-lsp.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_PATH = path.join(__dirname, '..', 'out', 'server', 'server.js');
const EXAMPLES = [
    path.join(__dirname, '..', '..', 'test', 'basit.kip'),
    path.join(__dirname, '..', '..', 'test', 'ornek.kip'),
    path.join(__dirname, '..', '..', 'kip-lang-new', 'tests', 'succeed', 'bir-fazlası.kip'),
    path.join(__dirname, '..', '..', 'kip-lang-new', 'tests', 'succeed', 'fibonacci.kip'),
    path.join(__dirname, '..', '..', 'kip-lang-new', 'tests', 'succeed', 'diyelim.kip'),
    path.join(__dirname, '..', '..', 'kip-lang-new', 'tests', 'lsp', 'basic.kip'),
].filter(p => {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
});

let requestId = 0;
function createRequest(method, params) {
    return { jsonrpc: '2.0', id: ++requestId, method, params };
}

async function run() {
    console.log('🚀 Örnek .kip dosyalarında LSP testi\n');
    console.log(`Server: ${SERVER_PATH}`);
    console.log(`Örnekler: ${EXAMPLES.length} dosya\n`);

    const proc = spawn('node', [SERVER_PATH], { stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map();
    let buffer = '';

    proc.stdout.on('data', (d) => {
        buffer += d.toString();
        for (;;) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) break;
            const match = buffer.substring(0, headerEnd).match(/Content-Length:\s*(\d+)/i);
            if (!match) { buffer = buffer.slice(buffer.indexOf('\r\n\r\n') + 4); continue; }
            const len = parseInt(match[1], 10);
            const total = headerEnd + 4 + len;
            if (buffer.length < total) break;
            const body = buffer.slice(headerEnd + 4, total);
            buffer = buffer.slice(total);
            try {
                const msg = JSON.parse(body);
                if (msg.id != null && pending.has(msg.id)) {
                    const p = pending.get(msg.id);
                    pending.delete(msg.id);
                    msg.error ? p.reject(new Error(msg.error.message || 'LSP error')) : p.resolve(msg.result);
                }
            } catch (_) {}
        }
    });

    function send(msg) {
        const json = JSON.stringify(msg);
        const raw = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
        return new Promise((resolve, reject) => {
            if (msg.id != null) pending.set(msg.id, { resolve, reject });
            proc.stdin.write(raw, 'utf8', () => { if (msg.id == null) resolve(undefined); });
        });
    }

    async function request(method, params) {
        const req = createRequest(method, params);
        let timer;
        const p = Promise.race([
            new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 8000); }),
            send(req).then(r => { clearTimeout(timer); return r; })
        ]);
        return p;
    }

    try {
        await request('initialize', {
            processId: null,
            rootUri: `file://${path.join(__dirname, '..', '..')}`,
            capabilities: {},
            workspaceFolders: null
        });
        await send({ jsonrpc: '2.0', method: 'initialized', params: {} });

        let ok = 0;
        let fail = 0;

        for (const filePath of EXAMPLES) {
            const name = path.relative(path.join(__dirname, '..', '..'), filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const uri = `file://${filePath}`;

            await send({
                jsonrpc: '2.0',
                method: 'textDocument/didOpen',
                params: {
                    textDocument: { uri, languageId: 'kip', version: 1, text: content }
                }
            });

            const result = await request('textDocument/semanticTokens/full', {
                textDocument: { uri }
            }).catch(e => ({ data: [], error: e.message }));

            const data = result && Array.isArray(result.data) ? result.data : [];
            const tokenCount = data.length;
            if (tokenCount > 0) {
                console.log(`  ✅ ${name}  → ${tokenCount} semantic token`);
                ok++;
            } else {
                console.log(`  ⚠️ ${name}  → 0 token`);
                fail++;
            }
        }

        console.log('\n============================================================');
        console.log(`📊 Özet: ${ok} geçti, ${fail} uyarı (${EXAMPLES.length} örnek)`);
        console.log('============================================================\n');
        process.exit(fail === EXAMPLES.length ? 1 : 0);
    } catch (e) {
        console.error('Hata:', e.message || e);
        process.exit(1);
    } finally {
        proc.kill('SIGTERM');
    }
}

run();
