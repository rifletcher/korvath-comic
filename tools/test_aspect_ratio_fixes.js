const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const img = path.resolve('02_Assets/Episode_01_meta/selected/panel_15.webp');
const audioSrc = path.resolve('02_Assets/episode_01_build/audio/p15_narrator_fx.mp3');

const outDir = path.resolve('02_Assets/aspect_ratio_tests');
fs.mkdirSync(outDir, { recursive: true });

console.log('Testing Aspect Ratio solutions on Panel 15...');
console.log('Image:', img);
console.log('Audio:', audioSrc);

// Duration
let dur = 8;
if (fs.existsSync(audioSrc)) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioSrc}"`).toString().trim();
  dur = parseFloat(out) || 8;
}

// Test 1: Vertical Pan (Ken Burns tilt down)
// Scale image width to 1280 (height becomes 1920), then crop a 1280x720 window and pan y from 0 (top) to (1920-720) = 1200
const vPanFilter = `scale=1280:1920,crop=1280:720:0:'(1920-720)*(t/${dur})',format=yuv420p`;
const vPanOut = path.join(outDir, 'panel_15_vertical_pan.mp4');
console.log('1. Rendering Vertical Pan (Tilt down)...');
execSync(`ffmpeg -y -loop 1 -i "${img}" -i "${audioSrc}" -t ${dur} -filter_complex "[0:v]${vPanFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k "${vPanOut}"`, { stdio: 'ignore' });

// Test 2: Blurred Pillarbox (Background blurred 16:9, Foreground 100% aspect ratio preserved)
// Background: scale to 1280x720 (filling), blur. Foreground: scale to height 720 (preserving aspect ratio), overlay in center.
const blurFilter = `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=25:5[bg];[0:v]scale=-1:720[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p`;
const blurOut = path.join(outDir, 'panel_15_blurred_pillarbox.mp4');
console.log('2. Rendering Blurred Pillarbox...');
execSync(`ffmpeg -y -loop 1 -i "${img}" -i "${audioSrc}" -t ${dur} -filter_complex "${blurFilter}" -map 1:a -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k "${blurOut}"`, { stdio: 'ignore' });

console.log('✅ Both test videos rendered successfully!');
