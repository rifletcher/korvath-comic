const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

const rootDir = path.join(__dirname, '..');
const outDir = path.join(rootDir, '02_Assets', 'elevenlabs_test');
fs.mkdirSync(outDir, { recursive: true });

// Read API Key from argument, env, or .env file
let apiKey = process.argv[2] || process.env.ELEVENLABS_API_KEY;
if (!apiKey && fs.existsSync(path.join(rootDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  const match = envContent.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error('\n❌ ERROR: ElevenLabs API Key not found!');
  process.exit(1);
}

// Verified ElevenLabs Default System Voices (Enabled for all accounts):
// Natari: EXAVITQu4vr4xnSDxMaL (Sarah)
// Korvath: pNInz6obpgDQGcFmaJgB (Adam)
const VOICES = {
  natari: {
    id: 'EXAVITQu4vr4xnSDxMaL', // Sarah
    settings: {
      stability: 0.18,         // Maximum terror volatility & voice strain
      similarity_boost: 0.80,
      style: 0.90,             // Extreme theatrical terror
      use_speaker_boost: true
    }
  },
  korvath: {
    id: 'pNInz6obpgDQGcFmaJgB', // Adam
    settings: {
      stability: 0.32,
      similarity_boost: 0.85,
      style: 0.65,
      use_speaker_boost: true
    }
  }
};

function callElevenLabs(voiceId, text, voiceSettings, outFile) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: voiceSettings
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', chunk => errData += chunk);
        res.on('end', () => reject(new Error(`ElevenLabs API HTTP ${res.statusCode}: ${errData}`)));
        return;
      }
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

function getAudioDuration(filePath) {
  const out = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function runTrial() {
  console.log('🎙️ =======================================================');
  console.log('🔥 GENERATING ELEVENLABS TRIAL: PANEL 10 (ACID WEB ATTACK)');
  console.log('🎙️ =======================================================');

  const sfxDir = path.join(rootDir, '02_Assets', 'full_movie_build', 'sfx');
  const vaultSlam = path.join(sfxDir, 'vault_slam.mp3');
  const acidSizzle = path.join(sfxDir, 'acid_sizzle.mp3');

  // 1. Synthesize Natari's terrified scream via ElevenLabs
  const natariFile = path.join(outDir, 'p10_natari_eleven.mp3');
  const natariPrompt = "Korvath! It's a trap! The webs... they burn like acid! No, get them off me! GET THEM OFF ME! AAAAAAAHHH!";
  console.log('\n▶️ Synthesizing Natari terrified yell via ElevenLabs (Sarah - Max Terror)...');
  console.log(`   Text: "${natariPrompt}"`);
  await callElevenLabs(VOICES.natari.id, natariPrompt, VOICES.natari.settings, natariFile);
  const natariDur = getAudioDuration(natariFile);
  console.log(`   ✅ Generated: ${natariFile} (${natariDur.toFixed(2)}s)`);

  // 2. Load Chronicler narrative caption from existing high-res track
  const capFile = path.join(rootDir, '02_Assets', 'full_movie_build', 'audio', 'p10_narrator_fx.mp3');
  const capDur = getAudioDuration(capFile);

  // 3. Mix Sequenced Audio: Caption -> Iron Slam + Acid Sizzle -> ElevenLabs Scream
  console.log('\n🔊 Mixing audio layers...');
  const mixedAudio = path.join(outDir, 'p10_mixed_eleven.wav');
  
  const capDelayMs = 250;
  const slamDelayMs = Math.round((capDelayMs + capDur * 1000) + 150);
  const screamDelayMs = slamDelayMs + 400;
  const sizzleDelayMs = screamDelayMs + 800;

  const totalDur = ((screamDelayMs + natariDur * 1000 + 800) / 1000);

  const filterComplex = `[0:a]adelay=${capDelayMs}|${capDelayMs},volume=1.2[cap];` +
                        `[1:a]adelay=${slamDelayMs}|${slamDelayMs},volume=1.8[slam];` +
                        `[2:a]adelay=${screamDelayMs}|${screamDelayMs},volume=1.9[scream];` +
                        `[3:a]adelay=${sizzleDelayMs}|${sizzleDelayMs},volume=1.2[sizzle];` +
                        `[cap][slam][scream][sizzle]amix=inputs=4:duration=longest[aout]`;

  const mixCmd = `"${FFMPEG_PATH}" -y -i "${capFile}" -i "${vaultSlam}" -i "${natariFile}" -i "${acidSizzle}" -filter_complex "${filterComplex}" -map "[aout]" "${mixedAudio}"`;
  execSync(mixCmd, { stdio: 'ignore' });

  // 4. Render Panel 10 Video (Text-Safe Hybrid Camera)
  console.log('\n🎥 Rendering 2.5D Motion Video for Panel 10 (Text-Safe Hybrid)...');
  const p10Image = path.join(rootDir, '02_Assets', 'Episode_02', 'selected', 'panel_10.webp');
  const p10Video = path.join(rootDir, 'docs', 'panel_10_elevenlabs_trial.mp4');
  const totalFrames = Math.ceil(totalDur * 30);
  const holdFrames = 36;
  const zoomExpr = `if(lte(on,${holdFrames}),1.0,min(1.0+(on-${holdFrames})*0.00012,1.04))`;
  const xExpr = `iw/2-(iw/zoom/2)+((on/${totalFrames})-0.5)*30`;
  const yExpr = "0";

  const renderCmd = `"${FFMPEG_PATH}" -y -loop 1 -i "${p10Image}" -i "${mixedAudio}" -filter_complex "[0:v]scale=1536:864,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=1280x720:fps=30,format=yuv420p[v]" -map "[v]" -map 1:a -c:v libx264 -preset medium -crf 22 -c:a aac -b:a 192k -shortest -t ${totalDur.toFixed(2)} "${p10Video}"`;
  execSync(renderCmd, { stdio: 'inherit' });

  console.log(`\n🎉 ELEVENLABS TRIAL VIDEO COMPLETE!`);
  console.log(`👉 File: ${p10Video}`);
  console.log(`⏱️ Duration: ${totalDur.toFixed(1)}s`);
}

runTrial().catch(err => {
  console.error('\n❌ Trial Error:', err.message);
  process.exit(1);
});
