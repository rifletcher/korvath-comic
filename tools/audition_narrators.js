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
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 30000 });
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(testText, { pitch, rate });
  const outStream = fs.createWriteStream(raw);
  await new Promise((res, rej) => { audioStream.pipe(outStream); outStream.on('finish', res); outStream.on('error', rej); });
  tts.close();
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
  console.log('Generating manly narrator auditions...');

  // 1. ElevenLabs Adam (Cinematic Movie Trailer / Deep Rugged Man)
  console.log('1. ElevenLabs Adam...');
  const adamRaw = path.join(docsAudioDir, 'narrator_opt_adam.mp3');
  await runElevenLabs('pNInz6obpgDQGcFmaJgB', testText, { stability: 0.45, similarity_boost: 0.85, style: 0.40, use_speaker_boost: true }, adamRaw);

  // 2. Edge TTS Brian (Deep Bass American Chronicler)
  console.log('2. Edge TTS Brian (-8Hz + 5dB Bass)...');
  const brianOut = path.join(docsAudioDir, 'narrator_opt_brian.mp3');
  await runEdgeTTS('en-US-BrianNeural', '-8Hz', '-5%', 'bass=g=5:f=110,volume=1.35', brianOut);

  // 3. Edge TTS Guy (Gritty Weathered Pulp Action Hero)
  console.log('3. Edge TTS Guy (-10Hz + 5dB Bass)...');
  const guyOut = path.join(docsAudioDir, 'narrator_opt_guy.mp3');
  await runEdgeTTS('en-US-GuyNeural', '-10Hz', '-6%', 'bass=g=5:f=110,volume=1.4', guyOut);

  console.log('✅ Auditions generated in docs/audio/');
}

main().catch(console.error);
