const fs = require('fs');
const path = require('path');

const ep2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '01_Script', 'episodes', 'episode_02.json'), 'utf8'));

ep2.forEach(p => {
  const d = p.dialogue && p.dialogue.length > 0
    ? p.dialogue.map(x => `${x.character}: "${x.text}"`).join(' | ')
    : '(No dialogue)';
  console.log(`P${p.panelId} [${p.beat?.name || ''}]`);
  console.log(`   Caption:  ${p.caption || '(None)'}`);
  console.log(`   Dialogue: ${d}`);
});

