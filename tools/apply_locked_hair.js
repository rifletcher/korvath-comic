const fs = require('fs');
const path = require('path');

const ep2Path = path.join(__dirname, '..', '01_Script', 'episodes', 'episode_02.json');
const sbPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');

const ep2 = JSON.parse(fs.readFileSync(ep2Path, 'utf8'));

const oldHairRegex = /square-cut shaggy raven-black hair falling to broad shoulders/g;
const newHair = "distinctive square-cut mane of thick coarse raven-black hair with jagged front bangs, hair length strictly shoulder-length stopping at the collarbone, strictly NOT waist length, NOT past the shoulders, NOT tied in a ponytail, NOT short cropped";

let updatedCount = 0;
ep2.forEach(p => {
  if (p.prompt.includes('square-cut shaggy raven-black hair falling to broad shoulders')) {
    p.prompt = p.prompt.replace(oldHairRegex, newHair);
    updatedCount++;
  }
});

fs.writeFileSync(ep2Path, JSON.stringify(ep2, null, 2), 'utf8');
fs.writeFileSync(sbPath, JSON.stringify(ep2, null, 2), 'utf8');
console.log(`✅ Applied locked hair formula across ${updatedCount} panels in episode_02.json and storyboard.json.`);

