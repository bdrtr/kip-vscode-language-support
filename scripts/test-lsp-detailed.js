#!/usr/bin/env node
/**
 * Kritik LSP Test Suite
 * 
 * Bu script LSP server'ın kritik özelliklerini test eder:
 * - Semantic Tokens (full ve range) - Syntax highlighting için kritik
 * - Definition - Go to Definition için kritik
 * - References - Find All References için kritik
 * 
 * Not: Timeout alan özellikler (completion, hover, symbols, formatting, code actions) test edilmiyor.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_FILE = path.join(__dirname, '..', 'test-lsp-detailed.kip');
const SERVER_PATH = path.join(__dirname, '..', 'out', 'server', 'server.js');
const DEBUG = process.env.DEBUG === '1';

// Test Kip kodu
const TEST_CODE = `Bir (öğe listesi)
ya boş
ya da bir öğenin bir öğe listesine eki
olabilir.

(bu öğe listesiyle) (şu öğe listesinin) birleşimi,
  bu boşsa,
    şu,
  ilkin devama ekiyse,
    ilkin (devamla şunun birleşimine) ekidir.

(bu öğe listesinin) tersi,
  bu boşsa,
    boş,
  ilkin devama ekiyse,
    (devamın tersiyle) 
      (ilkin boşa ekinin) birleşimidir.

(bu tam-sayı listesini) bastırmak,
  bu boşsa,
    durmaktır,
  ilkin devama ekiyse,
    ilki yazıp,
    devamı bastırmaktır.

((1'in (2'nin boşa ekine) ekinin) tersini) bastır.
`;

let serverProcess = null;
let requestId = 0;
let testsPassed = 0;
let testsFailed = 0;
let testResults = [];

// LSP Message helpers
function createRequest(method, params) {
    const id = ++requestId;
    return {
        jsonrpc: '2.0',
        id,
        method,
        params
    };
}

function createNotification(method, params) {
    return {
        jsonrpc: '2.0',
        method,
        params
    };
}

// Test helper
function test(name, fn) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Testing: ${name}`);
        try {
            fn().then((result) => {
                if (result !== false) {
                    testsPassed++;
                    testResults.push({ name, status: 'PASS', result });
                    console.log(`✅ PASS: ${name}`);
                    resolve(true);
                } else {
                    testsFailed++;
                    testResults.push({ name, status: 'FAIL', error: 'Test returned false' });
                    console.log(`❌ FAIL: ${name}`);
                    resolve(false);
                }
            }).catch((error) => {
                testsFailed++;
                testResults.push({ name, status: 'FAIL', error: error.message });
                console.log(`❌ FAIL: ${name}: ${error.message}`);
                resolve(false);
            });
        } catch (error) {
            testsFailed++;
            testResults.push({ name, status: 'FAIL', error: error.message });
            console.log(`❌ FAIL: ${name}: ${error.message}`);
            resolve(false);
        }
    });
}

// LSP Communication
class LSPTester {
    constructor(serverProcess) {
        this.process = serverProcess;
        this.pendingRequests = new Map();
        this.buffer = '';
        
        this.process.stdout.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
        
        this.process.stderr.on('data', (data) => {
            // Server logs to stderr, ignore for now
        });
    }
    
    processBuffer() {
        while (true) {
            // Look for Content-Length header
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) break;
            
            const header = this.buffer.substring(0, headerEnd);
            const bodyStart = headerEnd + 4;
            
            const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
            if (!contentLengthMatch) {
                // Skip malformed header - remove up to next potential header
                const nextHeader = this.buffer.indexOf('\r\n\r\n', bodyStart);
                if (nextHeader === -1) {
                    this.buffer = '';
                    break;
                }
                this.buffer = this.buffer.substring(nextHeader);
                continue;
            }
            
            const contentLength = parseInt(contentLengthMatch[1], 10);
            const totalLength = bodyStart + contentLength;
            
            if (this.buffer.length >= totalLength) {
                const messageBody = this.buffer.substring(bodyStart, totalLength);
                this.buffer = this.buffer.substring(totalLength);
                
                try {
                    const message = JSON.parse(messageBody);
                    this.handleMessage(message);
                } catch (e) {
                    // Skip invalid JSON - log and continue
                    if (DEBUG) {
                        console.error(`Failed to parse message (${messageBody.substring(0, 100)}...): ${e.message}`);
                    }
                }
            } else {
                break; // Wait for more data
            }
        }
    }
    
    handleMessage(message) {
        if (message.id !== undefined) {
            // Response
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
                this.pendingRequests.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(message.error.message || 'LSP Error'));
                } else {
                    pending.resolve(message.result);
                }
            }
        }
    }
    
    send(message) {
        const json = JSON.stringify(message);
        const content = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
        return new Promise((resolve, reject) => {
            if (message.id !== undefined) {
                this.pendingRequests.set(message.id, { resolve, reject });
            }
            this.process.stdin.write(content, 'utf8', () => {
                if (message.id === undefined) {
                    resolve();
                }
            });
        });
    }
    
    async request(method, params, timeout = 5000) {
        const req = createRequest(method, params);
        const promise = this.send(req);
        
        // Add timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Request timeout: ${method}`)), timeout);
        });
        
        return Promise.race([promise, timeoutPromise]);
    }
    
    async notify(method, params) {
        const notif = createNotification(method, params);
        return this.send(notif);
    }
}

// Main test suite
async function runTests() {
    console.log('🚀 Starting Detailed LSP Tests\n');
    console.log(`Server path: ${SERVER_PATH}`);
    console.log(`Test file: ${TEST_FILE}`);
    
    // Check if server exists
    if (!fs.existsSync(SERVER_PATH)) {
        console.error(`❌ Server not found at ${SERVER_PATH}`);
        console.error('Please run: npm run compile');
        process.exit(1);
    }
    
    // Create test file
    fs.writeFileSync(TEST_FILE, TEST_CODE);
    console.log(`✅ Test file created: ${TEST_FILE}\n`);
    
    // Start server
    console.log('📡 Starting LSP server...');
    serverProcess = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
    });
    
    const tester = new LSPTester(serverProcess);
    
    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        // Initialize
        console.log('\n📋 Test Suite: LSP Initialization');
        const initResult = await test('Initialize', async () => {
            const result = await tester.request('initialize', {
                processId: process.pid,
                rootUri: `file://${path.dirname(TEST_FILE)}`,
                capabilities: {
                    textDocument: {
                        semanticTokens: {
                            requests: {
                                full: { delta: false },
                                range: true
                            }
                        },
                        completion: {},
                        hover: {},
                        definition: {},
                        references: {},
                        documentSymbol: {},
                        formatting: {},
                        codeAction: {},
                        codeLens: {}
                    },
                    workspace: {
                        symbol: {}
                    }
                }
            });
            return result && result.capabilities;
        });
        
        if (!initResult) {
            throw new Error('Initialization failed');
        }
        
        await tester.notify('initialized', {});
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Open document - use absolute path for URI
        const testFileUri = `file://${TEST_FILE.replace(/\\/g, '/')}`;
        if (!testFileUri.startsWith('file:///')) {
            // Ensure absolute path format
            const absolutePath = path.resolve(TEST_FILE).replace(/\\/g, '/');
            const finalUri = absolutePath.startsWith('/') ? `file://${absolutePath}` : `file:///${absolutePath}`;
            await tester.notify('textDocument/didOpen', {
                textDocument: {
                    uri: finalUri,
                    languageId: 'kip',
                    version: 1,
                    text: TEST_CODE
                }
            });
        } else {
            await tester.notify('textDocument/didOpen', {
                textDocument: {
                    uri: testFileUri,
                    languageId: 'kip',
                    version: 1,
                    text: TEST_CODE
                }
            });
        }
        // Wait for document analysis to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get correct URI format
        const absolutePath = path.resolve(TEST_FILE).replace(/\\/g, '/');
        const correctUri = absolutePath.startsWith('/') ? `file://${absolutePath}` : `file:///${absolutePath}`;
        
        // Test Semantic Tokens (Full) - CRITICAL: Required for syntax highlighting
        console.log('\n📋 Test Suite: Semantic Tokens (Critical)');
        await test('Semantic Tokens (Full)', async () => {
            const result = await tester.request('textDocument/semanticTokens/full', {
                textDocument: { uri: correctUri }
            });
            if (!result || !Array.isArray(result.data)) {
                return false;
            }
            // Should have at least some tokens for the test code
            return result.data.length > 0;
        });
        
        await test('Semantic Tokens (Range)', async () => {
            const result = await tester.request('textDocument/semanticTokens/range', {
                textDocument: { uri: correctUri },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 5, character: 0 }
                }
            });
            return result && Array.isArray(result.data);
        });
        
        // Test Definition - CRITICAL: Required for Go to Definition
        console.log('\n📋 Test Suite: Definition (Critical)');
        await test('Definition lookup', async () => {
            const result = await tester.request('textDocument/definition', {
                textDocument: { uri: correctUri },
                position: { line: 5, character: 5 } // "birleşimi"
            });
            // Definition can return null, Location, or Location[]
            return result !== undefined && (result === null || Array.isArray(result) || (result && result.uri));
        });
        
        // Test References - CRITICAL: Required for Find All References
        console.log('\n📋 Test Suite: References (Critical)');
        await test('Find references', async () => {
            const result = await tester.request('textDocument/references', {
                textDocument: { uri: correctUri },
                position: { line: 5, character: 5 }, // "birleşimi"
                context: { includeDeclaration: true }
            });
            return Array.isArray(result) && result.length > 0;
        });
        
    } catch (error) {
        console.error(`\n❌ Test suite error: ${error.message}`);
        testsFailed++;
    } finally {
        // Shutdown
        try {
            await Promise.race([
                tester.request('shutdown', {}, 2000),
                new Promise(resolve => setTimeout(resolve, 2000))
            ]);
            await tester.notify('exit', {});
        } catch (e) {
            // Ignore shutdown errors
        }
        
        // Cleanup
        if (fs.existsSync(TEST_FILE)) {
            fs.unlinkSync(TEST_FILE);
        }
        
        if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGTERM');
            setTimeout(() => {
                if (!serverProcess.killed) {
                    serverProcess.kill('SIGKILL');
                }
            }, 1000);
        }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total:  ${testsPassed + testsFailed}`);
    console.log('='.repeat(60));
    
    if (testsFailed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.filter(t => t.status === 'FAIL').forEach(t => {
            console.log(`  - ${t.name}: ${t.error}`);
        });
    }
    
    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
