const { execSync } = require('child_process');

try {
  const p5 = execSync('ffmpeg -i test_p05_line2.wav -af "showwavespic=s=640x120" test_p05_wave.png');
} catch (e) {}

// Let's print out what ffmpeg says about the audio
console.log("Analyzing line 2...");

