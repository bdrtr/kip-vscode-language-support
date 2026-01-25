#!/usr/bin/env node
/**
 * Release script: bump version in package.json (patch | minor | major).
 * VSIX ve GitHub Release, package.json version + v* tag kullanır.
 *
 * Kullanım:
 *   npm run release:patch   → 1.1.0 → 1.1.1
 *   npm run release:minor   → 1.1.0 → 1.2.0
 *   npm run release:major   → 1.1.0 → 2.0.0
 *
 * Sonrası: commit + tag + push
 *   git add package.json package-lock.json && git commit -m "chore: release vX.Y.Z" && git tag vX.Y.Z && git push && git push --tags
 */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const pkgPath = path.join(__dirname, '..', 'package.json');
const lockPath = path.join(__dirname, '..', 'package-lock.json');

const bump = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Kullanım: node scripts/release.js <patch|minor|major>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const next = semver.inc(current, bump);
if (!next) {
  console.error('Geçersiz version:', current);
  process.exit(1);
}

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
console.log(`Version: ${current} → ${next}`);

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log('package-lock.json güncellendi.');
}

console.log('');
console.log('Sonraki adımlar (release için):');
console.log(`  git add package.json package-lock.json`);
console.log(`  git commit -m "chore: release v${next}"`);
console.log(`  git tag v${next}`);
console.log(`  git push && git push --tags`);
console.log('');
console.log('Tag push sonrası GitHub Actions v' + next + ' için Release oluşturur.');
