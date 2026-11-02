const fs = require('fs');
const path = require('path');

// Replacements map
const REPLACEMENTS = [
  // Names & Places
  [/\bStygian\b/g, 'Sarkeshian'],
  [/\bstygian\b/g, 'sarkeshian'],
  [/\bStygia\b/g, 'Sarkesh'],
  [/\bstygia\b/g, 'sarkesh'],
  [/\bBlood-Ruby of Set\b/g, 'Blood-Ruby of Sarkath'],
  [/\bAltar of Set\b/g, 'Altar of Sarkath'],
  [/\bSet claims\b/g, 'Sarkath claims'],
  [/\bTell Set\b/g, 'Tell Sarkath'],
  [/\bHigh Priest of Set\b/g, 'High Priest of Sarkath'],
  [/\bhigh priest of Set\b/g, 'high priest of Sarkath'],
  [/\bSet\b/g, 'Sarkath'], // after specific ones
  [/\bCimmerian\b/g, 'Iron-Born'],
  [/\bcimmerian\b/g, 'iron-born'],
  [/\bCimmeria\b/g, 'the Iron Wastes'],
  [/\bCrom\b/g, 'the Iron Gods'],
  [/\bAtlantean Broadsword\b/g, 'Iron-Breaker Broadsword'],
  [/\batlantean broadsword\b/g, 'iron-breaker broadsword'],
  [/\bAtlantean\b/g, 'Ancient'],
  [/\batlantean\b/g, 'ancient'],
  [/\bConan the Barbarian\b/g, 'Korvath the Barbarian'],
  [/\bConan the Cimmerian\b/g, 'Korvath the Iron-Born'],
  [/\bConan\b/g, 'Korvath'],
  [/\bconan\b/g, 'korvath'],
];

// 1. Process 01_Script/storyboard.json
const sbPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');
let sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));

sb.forEach(panel => {
  // Check and rewrite verbatim Robert E. Howard quotes
  if (panel.panelId === 1) {
    panel.caption = "Before the first iron towers rose, and before the empires of dust forgot their makers, there walked an older breed of men—forged in blood, bound by no king's law.";
  }
  if (panel.panelId === 10) {
    panel.caption = "From the frozen crags of the northern wastes strode Korvath—lone wolf, reaver, breaker of chains. With cold steel and an unbending will, he carved his legend across the burning sands of a dying world.";
  }

  // Stringify panel, apply replacements, parse back
  let pStr = JSON.stringify(panel);
  for (const [pattern, replacement] of REPLACEMENTS) {
    pStr = pStr.replace(pattern, replacement);
  }
  const updatedPanel = JSON.parse(pStr);
  Object.assign(panel, updatedPanel);
});

fs.writeFileSync(sbPath, JSON.stringify(sb, null, 2), 'utf8');
console.log('✅ 01_Script/storyboard.json scrubbed and rewritten!');

// 2. Process active_saga_beats.json
const beatsPath = path.join(__dirname, '..', '01_Script', 'arcs', 'active_saga_beats.json');
if (fs.existsSync(beatsPath)) {
  let beatsStr = fs.readFileSync(beatsPath, 'utf8');
  for (const [pattern, replacement] of REPLACEMENTS) {
    beatsStr = beatsStr.replace(pattern, replacement);
  }
  fs.writeFileSync(beatsPath, beatsStr, 'utf8');
  console.log('✅ 01_Script/arcs/active_saga_beats.json scrubbed!');
}

// 3. Process 00_Reference/character_prompts.json
const charPromptsPath = path.join(__dirname, '..', '00_Reference', 'character_prompts.json');
let cpStr = fs.readFileSync(charPromptsPath, 'utf8');
for (const [pattern, replacement] of REPLACEMENTS) {
  cpStr = cpStr.replace(pattern, replacement);
}
fs.writeFileSync(charPromptsPath, cpStr, 'utf8');
console.log('✅ 00_Reference/character_prompts.json scrubbed!');

// 4. Process 00_Reference/character_bible.md
const charBiblePath = path.join(__dirname, '..', '00_Reference', 'character_bible.md');
let cbStr = fs.readFileSync(charBiblePath, 'utf8');
for (const [pattern, replacement] of REPLACEMENTS) {
  cbStr = cbStr.replace(pattern, replacement);
}
fs.writeFileSync(charBiblePath, cbStr, 'utf8');
console.log('✅ 00_Reference/character_bible.md scrubbed!');

// 5. Process 00_Reference/object_prompts.json
const objPromptsPath = path.join(__dirname, '..', '00_Reference', 'object_prompts.json');
let opStr = fs.readFileSync(objPromptsPath, 'utf8');
for (const [pattern, replacement] of REPLACEMENTS) {
  opStr = opStr.replace(pattern, replacement);
}
fs.writeFileSync(objPromptsPath, opStr, 'utf8');
console.log('✅ 00_Reference/object_prompts.json scrubbed!');

// 6. Process 00_Reference/object_bible.md
const objBiblePath = path.join(__dirname, '..', '00_Reference', 'object_bible.md');
let obStr = fs.readFileSync(objBiblePath, 'utf8');
for (const [pattern, replacement] of REPLACEMENTS) {
  obStr = obStr.replace(pattern, replacement);
}
fs.writeFileSync(objBiblePath, obStr, 'utf8');
console.log('✅ 00_Reference/object_bible.md scrubbed!');

// 7. Process comic.config.json
const configPath = path.join(__dirname, 'comic.config.json');
let cfgStr = fs.readFileSync(configPath, 'utf8');
for (const [pattern, replacement] of REPLACEMENTS) {
  cfgStr = cfgStr.replace(pattern, replacement);
}
fs.writeFileSync(configPath, cfgStr, 'utf8');
console.log('✅ tools/comic.config.json scrubbed!');

// 8. Process Writers' Room agents
const writersRoomDir = path.join(__dirname, 'writers_room');
function scrubDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      scrubDir(full);
    } else if (f.isFile() && f.name.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      for (const [pattern, replacement] of REPLACEMENTS) {
        content = content.replace(pattern, replacement);
      }
      fs.writeFileSync(full, content, 'utf8');
      console.log(`✅ Scrubbed: ${f.name}`);
    }
  }
}
scrubDir(writersRoomDir);

