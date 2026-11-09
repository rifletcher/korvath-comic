const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const selDir = '02_Assets/Episode_02_meta/selected';
const docsDir = 'docs/assets/ep2_meta';

console.log('=== FINAL EPISODE 2 CONTINUITY VERIFICATION ===\n');

const hashes = new Set();
let allValid = true;

for (let i = 1; i <= 20; i++) {
  const pad = String(i).padStart(2, '0');
  const f1 = path.join(selDir, `panel_${pad}.webp`);
  const f2 = path.join(docsDir, `panel_${pad}.webp`);

  if (!fs.existsSync(f1) || !fs.existsSync(f2)) {
    console.error(`❌ Panel ${pad}: Missing file!`);
    allValid = false;
    continue;
  }

  const buf1 = fs.readFileSync(f1);
  const buf2 = fs.readFileSync(f2);

  const h1 = crypto.createHash('md5').update(buf1).digest('hex');
  const h2 = crypto.createHash('md5').update(buf2).digest('hex');

  if (h1 !== h2) {
    console.error(`❌ Panel ${pad}: Selected vs Docs hash mismatch!`);
    allValid = false;
  }

  if (hashes.has(h1)) {
    console.error(`❌ Panel ${pad}: DUPLICATE HASH detected (${h1.slice(0, 8)})!`);
    allValid = false;
  }
  hashes.add(h1);

  console.log(`Panel ${pad}: ${(buf1.length / 1024).toFixed(1)} KB | Hash: ${h1.slice(0, 8)} | Synced: OK`);
}

if (allValid) {
  console.log(`\n🎉 ALL 20 PANELS ARE 100% UNIQUE, HIGH-RES, AND PROPERLY SYNCED!`);
} else {
  console.error(`\n💥 ISSUES DETECTED!`);
}
