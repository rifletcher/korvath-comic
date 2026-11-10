const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '02_Assets', 'Episode_02_meta', 'selected');
const docs = path.join(__dirname, '..', 'docs', 'assets', 'ep2_meta');

// Backup all current files to a temp folder first so no file is overwritten prematurely
const tmp = path.join(__dirname, '..', '02_Assets', 'Episode_02_meta', 'temp_remap');
fs.mkdirSync(tmp, { recursive: true });
fs.readdirSync(dir).filter(f => f.endsWith('.webp')).forEach(f => {
  fs.copyFileSync(path.join(dir, f), path.join(tmp, f));
});

console.log('Backed up files to temp_remap');

// Confirmed correct mappings from our visual inspection:
// Panel 1 -> tmp/panel_01.webp (Gates of Valkash)
// Panel 2 -> tmp/panel_02.webp (The Midnight Bazaar)
// Panel 3 -> tmp/panel_03.webp (The Black Lotus Tavern)
// Panel 4 -> tmp/panel_05.webp (Civilized merchants understand contracts... broker)
// Panel 6 -> tmp/panel_06.webp (Savage Tavern Cleave)
// Panel 7 -> tmp/panel_08.webp (Above the filth... Rooftops of Valkash)
// Panel 9 -> tmp/panel_11.webp (The wealth of fifty caravans... vault door)
// Panel 13 -> tmp/panel_14.webp (Iron, flame, and unyielding will... torch vs spider)
// Panel 15 -> tmp/panel_18.webp (A desert rogue never forgets a debt... Natari strikes merchant)
// Panel 16 -> tmp/panel_16.webp (Even gods of the dark bleed... Abyssal Skull-Strike)
// Panel 19 -> tmp/panel_19.webp (Behind them lay a burning palace... Breaching Southern Gate)

const verified = {
  1: 'panel_01.webp',
  2: 'panel_02.webp',
  3: 'panel_03.webp',
  4: 'panel_05.webp',
  6: 'panel_06.webp',
  7: 'panel_08.webp',
  9: 'panel_11.webp',
  13: 'panel_14.webp',
  15: 'panel_18.webp',
  16: 'panel_16.webp',
  19: 'panel_19.webp'
};

Object.entries(verified).forEach(([id, srcFile]) => {
  const pad = String(id).padStart(2, '0');
  const targetFile = `panel_${pad}.webp`;
  fs.copyFileSync(path.join(tmp, srcFile), path.join(dir, targetFile));
  fs.copyFileSync(path.join(tmp, srcFile), path.join(docs, targetFile));
  console.log(`✅ Correctly mapped Panel ${pad} from ${srcFile}`);
});

