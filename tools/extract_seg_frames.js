const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFMPEG = 'ffmpeg';
const outDir = 'docs/assets/seg_debug';
fs.mkdirSync(outDir, { recursive: true });

console.log('Extracting frame at t=2.0s from each segment...');

for (let i = 1; i <= 20; i++) {
  const pad = String(i).padStart(2, '0');
  const metaSeg = `02_Assets/episode_01_build/segments_meta/p${pad}_meta_seg.mp4`;
  const grokSeg = `02_Assets/episode_01_build/segments_grok/p${pad}_grok_seg.mp4`;
  
  if (fs.existsSync(metaSeg)) {
    const metaFrame = path.join(outDir, `meta_p${pad}.jpg`);
    execSync(`ffmpeg -y -ss 00:00:02 -i "${metaSeg}" -vframes 1 -q:v 2 "${metaFrame}"`, { stdio: 'ignore' });
  }
  if (fs.existsSync(grokSeg)) {
    const grokFrame = path.join(outDir, `grok_p${pad}.jpg`);
    execSync(`ffmpeg -y -ss 00:00:02 -i "${grokSeg}" -vframes 1 -q:v 2 "${grokFrame}"`, { stdio: 'ignore' });
  }
}
console.log('Frames extracted to docs/assets/seg_debug!');

