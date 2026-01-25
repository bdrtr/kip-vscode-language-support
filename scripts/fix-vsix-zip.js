#!/usr/bin/env node
/**
 * VSIX ZIP comment length hatasını giderir.
 * "Invalid comment length. Expected: X. Found: Y" — ZIP sonundaki fazla byte'ları keser.
 *
 * Kullanım: node scripts/fix-vsix-zip.js [dosya.vsix]
 * Varsayılan: ls *.vsix ile bulunan ilk dosya
 */

const fs = require('fs');
const path = require('path');

const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // PK\x05\x06

function findEocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
}

function fixVsix(filepath) {
  const buf = fs.readFileSync(filepath);
  const i = findEocd(buf);
  if (i < 0) {
    console.error('EOCD (PK\\x05\\x06) bulunamadı.');
    process.exit(1);
  }
  const commentLen = buf.readUInt16LE(i + 20);
  const end = i + 22 + commentLen;
  if (end >= buf.length) {
    console.log('VSIX zaten temiz, değişiklik yok.');
    return;
  }
  fs.writeFileSync(filepath, buf.subarray(0, end));
  console.log(`Temizlendi: ${end} byte kaldı, ${buf.length - end} byte silindi.`);
}

const file = process.argv[2] || (() => {
  const cwd = path.join(__dirname, '..');
  const vs = fs.readdirSync(cwd).filter(f => f.endsWith('.vsix'));
  if (vs.length === 0) {
    console.error('*.vsix bulunamadı. Önce: npm run package');
    process.exit(1);
  }
  return path.join(cwd, vs[0]);
})();

fixVsix(file);
