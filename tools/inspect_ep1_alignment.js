const fs = require('fs');
const path = require('path');

const ep1 = JSON.parse(fs.readFileSync('01_Script/episodes/episode_01.json', 'utf8'));

console.log(`Episode 1 has ${ep1.length} panels in 01_Script/episodes/episode_01.json.\n`);

ep1.forEach((p, idx) => {
  const pad = String(p.panelId || (idx + 1)).padStart(2, '0');
  console.log(`=== PANEL ${pad} ===`);
  console.log(`Beat: ${p.beat?.name}`);
  console.log(`Caption: ${p.caption}`);
  if (p.dialogue && p.dialogue.length > 0) {
    p.dialogue.forEach(d => console.log(`Dialogue [${d.speaker}]: "${d.text}"`));
  } else {
    console.log(`Dialogue: (none)`);
  }
  console.log(`Prompt / Description: ${(p.description || p.prompt || p.visual_prompt || '').substring(0, 120)}...`);
  console.log('---');
});

