const fs = require('fs');
const ep = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));

const targets = [1, 2, 8, 9, 10, 12, 18, 19, 20];

targets.forEach(id => {
  const p = ep.find(x => x.panelId === id);
  console.log(`================ PANEL ${id} ================`);
  console.log(`Beat: ${p.beat?.name}`);
  console.log(`Action: ${p.action}`);
  console.log(`Caption: ${p.caption}`);
  console.log(`Prompt:\n${p.prompt}\n`);
});

