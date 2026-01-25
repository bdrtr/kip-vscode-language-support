#!/usr/bin/env node
/**
 * Node 20+ gerekli (vsce/undici @azure vb. Node 18'de "File is not defined" hatası verir).
 * npm run package öncesi çalıştırılır.
 */
const v = process.versions.node.split('.').map(Number);
const major = v[0] || 0;
if (major < 20) {
  console.error('');
  console.error('Hata: Node 20+ gerekli. Mevcut: ' + process.version);
  console.error('vsce ve bağımlılıkları (undici, @azure) Node 18\'de çalışmaz.');
  console.error('');
  console.error('Çözüm: Node 20 kullanın. Örnek:');
  console.error('  nvm install 20 && nvm use 20');
  console.error('  veya: npx n node@20');
  console.error('');
  process.exit(1);
}
