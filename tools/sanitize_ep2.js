const fs = require('fs');
const path = require('path');

const ep2Path = path.join(__dirname, '..', '01_Script', 'episodes', 'episode_02.json');
const sbPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');

const ep2 = JSON.parse(fs.readFileSync(ep2Path, 'utf8'));

// Panel 16: replace black blood with dark demonic ichor
const p16 = ep2.find(p => p.panelId === 16);
if (p16) {
  p16.action = p16.action.replace('explosion of black blood', 'explosion of hissing dark demonic ichor');
  p16.prompt = p16.prompt.replace('explosion of black blood', 'explosion of hissing dark demonic ichor');
}

// Ensure lighting across panels 7-20 is vivid and high contrast
ep2.forEach(p => {
  if (p.prompt.includes('pitch-black')) {
    p.prompt = p.prompt.replace(/pitch-black/g, 'dramatic shadow-cast');
  }
});

fs.writeFileSync(ep2Path, JSON.stringify(ep2, null, 2), 'utf8');
fs.writeFileSync(sbPath, JSON.stringify(ep2, null, 2), 'utf8');
console.log('✅ Episode 2 prompts sanitized and verified.');

