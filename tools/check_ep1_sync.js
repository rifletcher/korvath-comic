const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ep1 = JSON.parse(fs.readFileSync('01_Script/episodes/episode_01.json', 'utf8'));

console.log('=== CHECKING SEGMENTS IN EPISODE 1 ===\n');

for (let i = 0; i < ep1.length; i++) {
  const p = ep1[i];
  const pad = String(p.panelId || (i + 1)).padStart(2, '0');
  const segFile = `02_Assets/episode_01_build/segments_meta/p${pad}_meta_seg.mp4`;
  const audioFile = `02_Assets/episode_01_build/audio/p${pad}_mixed.wav`;
  
  if (fs.existsSync(segFile)) {
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${segFile}"`).toString().trim();
    const aProbe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`).toString().trim();
    console.log(`Panel ${pad} [${p.beat?.name}]: Video = ${parseFloat(probe).toFixed(2)}s | Audio = ${parseFloat(aProbe).toFixed(2)}s`);
  } else {
    console.log(`Panel ${pad}: MISSING SEGMENT`);
  }
}

