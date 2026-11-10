const fs = require('fs');
const { execSync } = require('child_process');

function getDur(f) {
  return execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${f}"`).toString().trim();
}

console.log('p05 narrator dur:', getDur('02_Assets/episode_01_build/audio/p05_narrator_fx.mp3'));
console.log('p05 cultist dur:', getDur('02_Assets/episode_01_build/audio/p05_dia_0_Sarkeshian Cultist_fx.mp3'));
console.log('p05 mixed dur:', getDur('02_Assets/episode_01_build/audio/p05_mixed.wav'));

