const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FFMPEG_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffmpeg.exe';
const rootDir = path.join(__dirname, '..');
const refAudioDir = path.join(rootDir, '00_Reference', 'audio');
const docsAudioDir = path.join(rootDir, 'docs', 'audio');

fs.mkdirSync(refAudioDir, { recursive: true });
fs.mkdirSync(docsAudioDir, { recursive: true });

// Read ElevenLabs key
let elevenApiKey = process.env.ELEVENLABS_API_KEY;
if (!elevenApiKey && fs.existsSync(path.join(rootDir, '.env'))) {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  const match = envContent.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) elevenApiKey = match[1].trim();
}

const CANONICAL_VOICE_PROFILES = {
  korvath: {
    name: 'Korvath the Barbarian',
    actorBlend: 'Arnold Schwarzenegger + Christopher Judge (Kratos)',
    timbre: 'Deep, heavy guttural rumble, chest-thumping sub-bass, cold ruthless certainty',
    engine: 'Edge TTS ChristopherNeural (-14Hz pitch, -5% rate, +5dB sub-bass @ 110Hz)',
    signatureLine: 'I live, I burn with life, I love, I slay... and I am content. Let iron speak for me.',
    synthesize: async (text, outFile) => {
      const raw = outFile.replace('.mp3', '_raw.mp3');
      let attempts = 0;
      while (attempts < 4) {
        try {
          const tts = new MsEdgeTTS({ connectionTimeoutMs: 30000 });
          await tts.setMetadata('en-US-ChristopherNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const { audioStream } = tts.toStream(text, { pitch: '-14Hz', rate: '-5%' });
          const outStream = fs.createWriteStream(raw);
          await new Promise((res, rej) => { audioStream.pipe(outStream); outStream.on('finish', res); outStream.on('error', rej); });
          tts.close();
          break;
        } catch (err) {
          attempts++;
          if (attempts >= 4) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      execSync(`"${FFMPEG_PATH}" -y -i "${raw}" -af "bass=g=5:f=110,volume=1.45" "${outFile}"`, { stdio: 'ignore' });
      if (fs.existsSync(raw)) fs.unlinkSync(raw);
    }
  },
  natari: {
    name: 'Natari the Desert Rogue',
    actorBlend: 'Salma Hayek + Ana de Armas',
    timbre: 'Sultry, husky, cunning desert street-smarts, explosive terrified screaming agility',
    engine: 'ElevenLabs Sarah (stability: 0.28, style: 0.75)',
    signatureLine: 'Keep your hand on your hilt, Korvath. A purse in Valkash buys you a slit throat before dawn.',
    synthesize: async (text, outFile) => {
      const postData = JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.28, similarity_boost: 0.85, style: 0.75, use_speaker_boost: true }
      });
      await new Promise((res, rej) => {
        const req = https.request({
          hostname: 'api.elevenlabs.io',
          path: '/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': elevenApiKey,
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (resp) => {
          if (resp.statusCode !== 200) return rej(new Error(`ElevenLabs error ${resp.statusCode}`));
          const out = fs.createWriteStream(outFile);
          resp.pipe(out);
          out.on('finish', res);
          out.on('error', rej);
        });
        req.on('error', rej);
        req.write(postData);
        req.end();
      });
    }
  },
  malakor: {
    name: 'Lord Malakor',
    actorBlend: 'Christopher Lee + Charles Dance',
    timbre: 'Aristocratic, haughty, cold merchant prince with clipped consonants',
    engine: 'ElevenLabs Brian (stability: 0.50, style: 0.45)',
    signatureLine: 'Every man in Valkash has a price, barbarian. What is yours... before my beasts feed on you?',
    synthesize: async (text, outFile) => {
      const postData = JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.50, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true }
      });
      await new Promise((res, rej) => {
        const req = https.request({
          hostname: 'api.elevenlabs.io',
          path: '/v1/text-to-speech/nPczCjzI2devNBz1zQrb',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': elevenApiKey,
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (resp) => {
          if (resp.statusCode !== 200) return rej(new Error(`ElevenLabs error ${resp.statusCode}`));
          const out = fs.createWriteStream(outFile);
          resp.pipe(out);
          out.on('finish', res);
          out.on('error', rej);
        });
        req.on('error', rej);
        req.write(postData);
        req.end();
      });
    }
  },
  narrator: {
    name: 'The Pulp Chronicler (Narrator)',
    actorBlend: 'John Hurt + Orson Welles',
    timbre: 'Resonant, gravelly British chronicle, weathered storyteller',
    engine: 'Edge TTS en-GB-RyanNeural (-6Hz pitch, -6% rate)',
    signatureLine: 'Beyond the red sands of Sarkesh lay Valkash—city of thieves, poisoned wine, and men whose smiles were sharper than their daggers.',
    synthesize: async (text, outFile) => {
      const raw = outFile.replace('.mp3', '_raw.mp3');
      let attempts = 0;
      while (attempts < 4) {
        try {
          const tts = new MsEdgeTTS({ connectionTimeoutMs: 30000 });
          await tts.setMetadata('en-GB-RyanNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const { audioStream } = tts.toStream(text, { pitch: '-6Hz', rate: '-6%' });
          const outStream = fs.createWriteStream(raw);
          await new Promise((res, rej) => { audioStream.pipe(outStream); outStream.on('finish', res); outStream.on('error', rej); });
          tts.close();
          break;
        } catch (err) {
          attempts++;
          if (attempts >= 4) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      execSync(`"${FFMPEG_PATH}" -y -i "${raw}" -af "volume=1.2" "${outFile}"`, { stdio: 'ignore' });
      if (fs.existsSync(raw)) fs.unlinkSync(raw);
    }
  }
};

async function main() {
  console.log('🎙️ ===============================================================');
  console.log('⚔️ CANONICAL CHARACTER VOICE AUDITION GENERATOR');
  console.log('🎙️ Protocol 1: Triple-DNA Onboarding (Visual + Props + Voice)');
  console.log('🎙️ ===============================================================\n');

  for (const [key, char] of Object.entries(CANONICAL_VOICE_PROFILES)) {
    console.log(`▶️ Generating canonical voice sample for: [${char.name}]`);
    console.log(`   Timbre: ${char.timbre}`);
    console.log(`   Engine: ${char.engine}`);
    console.log(`   Line: "${char.signatureLine}"`);

    const refFile = path.join(refAudioDir, `${key}_voice_sample.mp3`);
    const docsFile = path.join(docsAudioDir, `${key}_voice_sample.mp3`);

    await char.synthesize(char.signatureLine, refFile);
    fs.copyFileSync(refFile, docsFile);

    console.log(`   ✅ Saved to: 00_Reference/audio/${key}_voice_sample.mp3`);
    console.log(`   🌐 Published to: docs/audio/${key}_voice_sample.mp3\n`);
  }

  // Update a metadata JSON for the Web Audition player
  const metaPath = path.join(docsAudioDir, 'voice_registry.json');
  const registry = Object.entries(CANONICAL_VOICE_PROFILES).map(([key, c]) => ({
    key,
    name: c.name,
    actorBlend: c.actorBlend,
    timbre: c.timbre,
    engine: c.engine,
    signatureLine: c.signatureLine,
    audioFile: `audio/${key}_voice_sample.mp3`
  }));
  fs.writeFileSync(metaPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`📑 Updated voice registry: ${metaPath}`);
}

main().catch(err => {
  console.error('❌ Error generating voice samples:', err);
  process.exit(1);
});
