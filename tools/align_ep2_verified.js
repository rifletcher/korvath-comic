const fs = require('fs');
const path = require('path');

// Let's copy panel_08 -> panel_02, panel_09 -> panel_08, panel_10 -> panel_09
// But first let's backup to temp
const selDir = '02_Assets/Episode_02_meta/selected';
const docsDir = 'docs/assets/ep2_meta';

console.log('Mapping correctly verified panels:');
// panel_08 is Panel 02 (Midnight Bazaar)
// panel_09 is Panel 08 (Harem Terrace)
// panel_10 is Panel 09 (Vault kick)

const p02_buf = fs.readFileSync(path.join(selDir, 'panel_08.webp'));
const p08_buf = fs.readFileSync(path.join(selDir, 'panel_09.webp'));
const p09_buf = fs.readFileSync(path.join(selDir, 'panel_10.webp'));

fs.writeFileSync(path.join(selDir, 'panel_02.webp'), p02_buf);
fs.writeFileSync(path.join(docsDir, 'panel_02.webp'), p02_buf);
console.log('✅ Panel 02 (Midnight Bazaar) saved.');

fs.writeFileSync(path.join(selDir, 'panel_08.webp'), p08_buf);
fs.writeFileSync(path.join(docsDir, 'panel_08.webp'), p08_buf);
console.log('✅ Panel 08 (Harem Terrace) saved.');

fs.writeFileSync(path.join(selDir, 'panel_09.webp'), p09_buf);
fs.writeFileSync(path.join(docsDir, 'panel_09.webp'), p09_buf);
console.log('✅ Panel 09 (Vault Door Kick) saved.');

