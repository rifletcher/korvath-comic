const fs = require('fs');
const data = JSON.parse(fs.readFileSync('01_Script/episodes/episode_02.json', 'utf8'));
const panels = Array.isArray(data) ? data : (data.panels || Object.values(data));

console.log(`Episode 2 has ${panels.length} panels.\n`);
panels.forEach((p, idx) => {
  const pid = p.panel_id || (idx + 1);
  console.log(`=== PANEL ${pid} ===`);
  console.log(`Title/Action: ${p.action || p.scene_description || p.caption}`);
  console.log(`Visual Prompt: ${(p.visual_prompt || p.prompt || '').substring(0, 160)}...`);
  console.log(`Characters: ${JSON.stringify(p.characters || [])}`);
  console.log(`Continuity: ${JSON.stringify(p.continuity || {})}`);
  console.log('---');
});
