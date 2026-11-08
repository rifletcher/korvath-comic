const fs = require('fs');
const file = '01_Script/episodes/episode_02.json';
const ep = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = Array.isArray(ep) ? ep : Object.values(ep);
list.forEach((p, i) => {
  const chars = (p.characters || []).join(', ');
  const cap = p.narrative_caption || p.caption || '';
  console.log(`P${p.panelId || (i+1)}: chars=[${chars}] | cap="${cap.slice(0, 60)}"`);
});

