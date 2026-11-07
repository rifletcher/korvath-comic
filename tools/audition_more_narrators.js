const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const rootDir = path.join(__dirname, '..');
const docsAudioDir = path.join(rootDir, 'docs', 'audio');

let elevenApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenApiKey && fs.existsSync(path.join(rootDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  const match = envContent.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) elevenApiKey = match[1].trim();
}

const testText = "Beyond the red sands of Sarkesh lay Valkash—city of thieves, poisoned wine, and men whose smiles were sharper than their daggers.";

async function runEdgeTTS(voice, pitch, rate, filter, outFile) {
  const raw = outFile.replace('.mp3', '_raw.mp3');
  let attempts = 0;
  while (attempts < 5) {
    let tts = null;
    try {
      tts = new MsEdgeTTS({ connectionTimeoutMs: 30000 });
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(testText, { pitch, rate });
      const outStream = fs.createWriteStream(raw);
      await new Promise((res, rej) => { audioStream.pipe(outStream); outStream.on('finish', res); outStream.on('error', rej); });
      tts.close();
      break;
    } catch (e) {
      if (tts) { try { tts.close(); } catch(err) {} }
      if (fs.existsSync(raw)) { try { fs.unlinkSync(raw); } catch(err) {} }
      attempts++;
      if (attempts >= 5) throw e;
      await new Promise(r => setTimeout(r, 1500 * attempts));
    }
  }
  execSync(`"${FFMPEG_PATH}" -y -i "${raw}" -af "${filter}" "${outFile}"`, { stdio: 'ignore' });
  if (fs.existsSync(raw)) fs.unlinkSync(raw);
}

function runElevenLabs(voiceId, text, settings, outFile) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: settings
    });

    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenApiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`ElevenLabs error ${res.statusCode}`));
      const fileStream = fs.createWriteStream(outFile);
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve(outFile));
      fileStream.on('error', reject);
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Generating 4 new non-cliché manly narrator contenders...\n');

  // 1. The Outback Wanderer (William - en-AU)
  console.log('1. The Outback Wanderer (William - en-AU)...');
  const williamOut = path.join(docsAudioDir, 'narrator_opt_william.mp3');
  await runEdgeTTS('en-AU-WilliamMultilingualNeural', '-6Hz', '-5%', 'bass=g=5:f=110,volume=1.4', williamOut);

  // 2. The Dark Bard (Andrew - en-US)
  console.log('2. The Dark Bard (Andrew - en-US)...');
  const andrewOut = path.join(docsAudioDir, 'narrator_opt_andrew.mp3');
  await runEdgeTTS('en-US-AndrewMultilingualNeural', '-8Hz', '-6%', 'bass=g=5:f=110,volume=1.35', andrewOut);

  // 3. The Veteran Mercenary (Roger - en-US)
  console.log('3. The Veteran Mercenary (Roger - en-US)...');
  const rogerOut = path.join(docsAudioDir, 'narrator_opt_roger.mp3');
  await runEdgeTTS('en-US-RogerNeural', '-6Hz', '-5%', 'bass=g=5:f=110,volume=1.4', rogerOut);

  // 4. ElevenLabs George (Raspy, Textured, Older Dark Fantasy Storyteller)
  console.log('4. ElevenLabs George (Textured Dark Fantasy Chronicler)...');
  const georgeOut = path.join(docsAudioDir, 'narrator_opt_george.mp3');
  try {
    await runElevenLabs('JBFqnCBsd6RMkjVDRZzb', testText, { stability: 0.55, similarity_boost: 0.80, style: 0.40, use_speaker_boost: true }, georgeOut);
  } catch (err) {
    console.warn('ElevenLabs George fallback:', err.message);
  }

  console.log('\n✅ All 4 new contenders generated in docs/audio/!');
}

main().catch(console.error);

