const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ffmpeg = 'C:/Users/robert.fletcher/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=([^\r\n]+)/)[1].trim();

const GEORGE_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George - Raspy, sinister fanatic cultist

function callEleven(voiceId, text, settings, outFile) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: settings
    });
    const req = https.request('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', c => err += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err}`)));
        return;
      }
      const out = fs.createWriteStream(outFile);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const line = "Die, dog of the north! Sarkath claims your flesh!";
  const outDir = path.join(__dirname, '..', 'docs', 'audio');
  fs.mkdirSync(outDir, { recursive: true });

  const rawFile = path.join(outDir, 'cultist_p05_raw.mp3');
  const fxFile = path.join(outDir, 'cultist_p05_fx.mp3');

  console.log(`🎙️ Synthesizing Sarkeshian Cultist line via George (${GEORGE_VOICE_ID})...`);
  await callEleven(GEORGE_VOICE_ID, line, {
    stability: 0.22,
    similarity_boost: 0.85,
    style: 0.85,
    use_speaker_boost: true
  }, rawFile);

  // Apply Cultist Cobra Mask DSP chain: hollow mid-range, subtle reverb, raspy bite
  const dspFilter = 'equalizer=f=1200:width_type=h:width=400:g=4,equalizer=f=3000:width_type=h:width=800:g=3,aecho=0.8:0.7:20:0.3,volume=1.35';
  execSync(`"${ffmpeg}" -y -i "${rawFile}" -af "${dspFilter}" "${fxFile}"`, { stdio: 'ignore' });

  console.log(`✅ Saved raw -> ${rawFile}`);
  console.log(`✅ Saved fx -> ${fxFile}`);
}

main().catch(console.error);

