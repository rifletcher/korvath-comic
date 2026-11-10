const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const chapters = JSON.parse(fs.readFileSync('docs/episode_01_chapters.json', 'utf8'));
const outDir = 'docs/assets/movie_timeline_debug';
fs.mkdirSync(outDir, { recursive: true });

console.log('Extracting frames from master movie at chapter timestamps + 2s:');

chapters.forEach(c => {
  const pad = String(c.panelId).padStart(2, '0');
  const t = c.timestamp + 2.0;
  const framePath = path.join(outDir, `meta_master_p${pad}.jpg`);
  execSync(`ffmpeg -y -ss ${t} -i docs/episode_01_meta_motion_comic.mp4 -vframes 1 -q:v 2 "${framePath}"`, { stdio: 'ignore' });
  console.log(`Panel ${pad} [${c.formattedTime} / ${t}s] -> extracted frame`);
});

