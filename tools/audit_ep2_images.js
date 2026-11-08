const fs = require('fs');
const path = require('path');
const ep = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));

console.log('Auditing Episode 2 panels against script captions...');
for (let i = 1; i <= 20; i++) {
  const pad = String(i).padStart(2, '0');
  const file = path.join('02_Assets', 'Episode_02_meta', 'selected', `panel_${pad}.webp`);
  const exists = fs.existsSync(file);
  const p = ep.find(x => x.panelId === i);
  console.log(`Panel ${pad}: exists=${exists} | scene="${p.beat?.name}" | caption="${p.caption?.slice(0, 35)}..."`);
}

