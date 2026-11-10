const fs = require('fs');
const { execSync } = require('child_process');

// Let's analyze test_p05_movie.wav
// When does the first voice start, when does the second voice start?
// We can use ffmpeg silencedetect
const out = execSync('ffmpeg -i test_p05_movie.wav -af "silencedetect=noise=-30dB:d=0.3" -f null - 2>&1', { encoding: 'utf8' });
console.log(out);

