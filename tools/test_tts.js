const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

async function synthesizeToFile(tts, text, filePath, options = {}) {
  const { audioStream } = tts.toStream(text, options);
  const out = fs.createWriteStream(filePath);
  return new Promise((resolve, reject) => {
    audioStream.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    audioStream.on('error', reject);
  });
}

async function generateVoiceClips() {
  const outDir = path.join(__dirname, '..', '02_Assets', 'audio_test');
  fs.mkdirSync(outDir, { recursive: true });

  const narratorFile = path.join(outDir, 'panel03_narrator.mp3');
  const korvathFile = path.join(outDir, 'panel03_korvath.mp3');

  console.log('🎙️ Generating Narrator audio clip...');
  const ttsNarrator = new MsEdgeTTS();
  await ttsNarrator.setMetadata('en-GB-RyanNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await synthesizeToFile(ttsNarrator, 'The ale tasted of ditch-water, but the danger smelled fresh.', narratorFile, {
    pitch: '-8Hz',
    rate: '-8%'
  });
  console.log(`✅ Narrator audio saved: ${narratorFile} (${fs.statSync(narratorFile).size} bytes)`);

  console.log('🎙️ Generating Korvath audio clip...');
  const ttsKorvath = new MsEdgeTTS();
  await ttsKorvath.setMetadata('en-US-ChristopherNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await synthesizeToFile(ttsKorvath, 'Let them whisper. Iron speaks louder than gossip.', korvathFile, {
    pitch: '-15Hz',
    rate: '-6%'
  });
  console.log(`✅ Korvath audio saved: ${korvathFile} (${fs.statSync(korvathFile).size} bytes)`);
}

generateVoiceClips().catch(console.error);
