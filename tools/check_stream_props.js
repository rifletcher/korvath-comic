const fs = require('fs');
const { execSync } = require('child_process');

console.log('=== CHECKING STREAM PROPERTIES OF SEGMENTS ===');
for (let i = 1; i <= 20; i++) {
  const pad = String(i).padStart(2, '0');
  const seg = `02_Assets/episode_01_build/segments_meta/p${pad}_meta_seg.mp4`;
  if (fs.existsSync(seg)) {
    const res = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,time_base -of csv=s=x:p=0 "${seg}"`).toString().trim();
    console.log(`p${pad}: ${res}`);
  }
}

