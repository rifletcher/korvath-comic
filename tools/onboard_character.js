const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ffmpeg = 'C:/Users/robert.fletcher/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
let elevenKey = process.env.ELEVENLABS_API_KEY;
if (!elevenKey && fs.existsSync(envPath)) {
  const match = fs.readFileSync(envPath, 'utf8').match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) elevenKey = match[1].trim();
}

function callEleven(voiceId, text, settings, outFile) {
  return new Promise((res, rej) => {
    const data = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: settings
    });
    const req = https.request('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenKey,
        'Content-Length': Buffer.byteLength(data)
      }
    }, response => {
      if (response.statusCode !== 200) {
        let err = '';
        response.on('data', c => err += c);
        response.on('end', () => rej(new Error(`HTTP ${response.statusCode}: ${err}`)));
        return;
      }
      const out = fs.createWriteStream(outFile);
      response.pipe(out);
      out.on('finish', () => res());
    });
    req.on('error', rej);
    req.write(data);
    req.end();
  });
}

async function onboardCharacter({ key, name, role, voiceId, blend, normalLine, combatLine, dspFilter }) {
  console.log(`\n⚔️ ONBOARDING CHARACTER: ${name} [${key}]`);
  console.log(`   Persona Blend: ${blend}`);
  console.log(`   Voice ID: ${voiceId}`);

  const audioDir = path.join(rootDir, 'docs', 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const rawNormal = path.join(audioDir, `${key}_raw_normal.mp3`);
  const rawCombat = path.join(audioDir, `${key}_raw_combat.mp3`);
  const outNormal = path.join(audioDir, `${key}_audition_normal.mp3`);
  const outCombat = path.join(audioDir, `${key}_audition_combat.mp3`);

  // 1. Synthesize Benchmark A (Normal / Conversational)
  console.log(`   🎙️ Synthesizing Benchmark A (Normal): "${normalLine.slice(0, 45)}..."`);
  await callEleven(voiceId, normalLine, { stability: 0.35, similarity_boost: 0.85, style: 0.65 }, rawNormal);
  if (dspFilter) {
    execSync(`"${ffmpeg}" -y -i "${rawNormal}" -af "${dspFilter}" "${outNormal}"`, { stdio: 'ignore' });
    try { fs.unlinkSync(rawNormal); } catch(e) {}
  } else {
    fs.renameSync(rawNormal, outNormal);
  }

  // 2. Synthesize Benchmark B (Combat / Scream / Roar)
  console.log(`   🔥 Synthesizing Benchmark B (Combat): "${combatLine.slice(0, 45)}..."`);
  await callEleven(voiceId, combatLine, { stability: 0.18, similarity_boost: 0.85, style: 0.88 }, rawCombat);
  if (dspFilter) {
    execSync(`"${ffmpeg}" -y -i "${rawCombat}" -af "${dspFilter}" "${outCombat}"`, { stdio: 'ignore' });
    try { fs.unlinkSync(rawCombat); } catch(e) {}
  } else {
    fs.renameSync(rawCombat, outCombat);
  }

  console.log(`✅ Dual auditions ready:`);
  console.log(`   - Normal: ${outNormal}`);
  console.log(`   - Combat: ${outCombat}`);
}

module.exports = { onboardCharacter };
