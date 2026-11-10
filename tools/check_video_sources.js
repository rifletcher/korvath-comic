const fs = require('fs');

if (fs.existsSync('docs/video_preview.html')) {
  const s = fs.readFileSync('docs/video_preview.html', 'utf8');
  console.log('Video sources in video_preview.html:');
  const matches = s.match(/(?:src|href)=['"][^'"]*?\.(?:mp4|webm)['"]/gi) || [];
  console.log(matches);
}

