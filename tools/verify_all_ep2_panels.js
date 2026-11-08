const fs = require('fs');
const path = require('path');
const ep = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));

console.log('=== VERIFYING EPISODE 2 PANELS ===');
ep.forEach((p, idx) => {
  const pad = String(p.panelId || (idx+1)).padStart(2, '0');
  const sel = path.join('02_Assets', 'Episode_02_meta', 'selected', `panel_${pad}.webp`);
  const doc = path.join('docs', 'assets', 'ep2_meta', `panel_${pad}.webp`);
  const selExists = fs.existsSync(sel);
  const docExists = fs.existsSync(doc);
  const selSz = selExists ? (fs.statSync(sel).size / 1024).toFixed(1) + ' KB' : 'MISSING';
  console.log(`Panel ${pad} [${selSz}]: "${p.beat?.name}" - Caption: "${p.caption?.slice(0, 40)}..."`);
});

