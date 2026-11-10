const fs = require('fs');
const path = require('path');

const ep1 = JSON.parse(fs.readFileSync('01_Script/episodes/episode_01.json', 'utf8'));

console.log('=== EPISODE 1 PANEL VS AUDIO MAPPING ===\n');

for (let i = 0; i < ep1.length; i++) {
  const p = ep1[i];
  const pad = String(p.panelId || (i + 1)).padStart(2, '0');
  const audioDir = '02_Assets/episode_01_build/audio';
  const metaImg = `docs/assets/ep1_meta/panel_${pad}.webp`;
  const grokImg = `docs/assets/ep1/panel_${pad}.webp`;
  
  const narratorRaw = path.join(audioDir, `p${pad}_narrator_raw.mp3`);
  const mixedWav = path.join(audioDir, `p${pad}_mixed.wav`);
  
  console.log(`[Panel ${pad}]`);
  console.log(`  Beat: ${p.beat?.name}`);
  console.log(`  Caption: ${p.caption}`);
  if (p.dialogue) {
    p.dialogue.forEach(d => console.log(`  Dialogue: [${d.speaker}] "${d.text}"`));
  }
  console.log(`  Meta Image exists: ${fs.existsSync(metaImg)} (${fs.existsSync(metaImg) ? fs.statSync(metaImg).size : 0} bytes)`);
  console.log(`  Grok Image exists: ${fs.existsSync(grokImg)} (${fs.existsSync(grokImg) ? fs.statSync(grokImg).size : 0} bytes)`);
  console.log(`  Mixed Audio exists: ${fs.existsSync(mixedWav)} (${fs.existsSync(mixedWav) ? fs.statSync(mixedWav).size : 0} bytes)`);
  console.log('');
}

