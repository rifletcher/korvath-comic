const fs = require('fs');
const { execSync } = require('child_process');

console.log('=== INSPECTING INDIVIDUAL SEGMENTS ===');
let totalV = 0;
let totalA = 0;

for (let i = 1; i <= 20; i++) {
  const pad = String(i).padStart(2, '0');
  const seg = `02_Assets/episode_01_build/segments_meta/p${pad}_meta_seg.mp4`;
  if (fs.existsSync(seg)) {
    const vDur = parseFloat(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${seg}"`).toString().trim()) || 0;
    const aDur = parseFloat(execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${seg}"`).toString().trim()) || 0;
    const fmtDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${seg}"`).toString().trim()) || 0;
    console.log(`p${pad}: format=${fmtDur.toFixed(2)}s | video_stream=${vDur.toFixed(2)}s | audio_stream=${aDur.toFixed(2)}s`);
    totalV += vDur;
    totalA += aDur;
  }
}
console.log(`\nSum of segment streams: Video = ${totalV.toFixed(2)}s | Audio = ${totalA.toFixed(2)}s`);

