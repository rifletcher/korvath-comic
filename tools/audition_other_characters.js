const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ffmpeg = 'C:/Users/robert.fletcher/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=([^\r\n]+)/)[1].trim();

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
        'xi-api-key': key,
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

async function main() {
  const audioDir = path.join(__dirname, '..', 'docs', 'audio');

  console.log('1. Synthesizing Natari Auditions (Sarah)...');
  await callEleven('EXAVITQu4vr4xnSDxMaL', 'Keep your hand on your hilt, Korvath. A purse in Valkash buys you a slit throat before dawn.', { stability: 0.35, similarity_boost: 0.85, style: 0.65 }, path.join(audioDir, 'natari_audition_sultry.mp3'));
  await callEleven('EXAVITQu4vr4xnSDxMaL', "It's a trap! The webs... they burn like acid! KORVATH, LOOK OUT!", { stability: 0.18, similarity_boost: 0.85, style: 0.88 }, path.join(audioDir, 'natari_audition_scream.mp3'));
  console.log('✅ Natari auditions generated.');

  console.log('2. Synthesizing Lord Malakor Auditions (George & Charlie)...');
  const malakorSneer = 'Every man in Valkash has a price, barbarian. What is yours...? A purse of gold, or a cup of poisoned wine?';
  const malakorShout = 'Guards! Slay him! Cut the northern dog down before he ruins me!';

  // Contender A: George (Sinister, decadent, corrupt merchant prince)
  await callEleven('JBFqnCBsd6RMkjVDRZzb', malakorSneer, { stability: 0.45, similarity_boost: 0.85, style: 0.60 }, path.join(audioDir, 'malakor_george_sneer.mp3'));
  await callEleven('JBFqnCBsd6RMkjVDRZzb', malakorShout, { stability: 0.28, similarity_boost: 0.85, style: 0.80 }, path.join(audioDir, 'malakor_george_shout.mp3'));

  // Contender B: Charlie (Aggressive, haughty noble)
  await callEleven('IKne3meq5aSn9XLyUdCD', malakorSneer, { stability: 0.40, similarity_boost: 0.85, style: 0.55 }, path.join(audioDir, 'malakor_charlie_sneer.mp3'));
  await callEleven('IKne3meq5aSn9XLyUdCD', malakorShout, { stability: 0.25, similarity_boost: 0.85, style: 0.75 }, path.join(audioDir, 'malakor_charlie_shout.mp3'));
  console.log('✅ Malakor auditions generated.');

  console.log('3. Synthesizing Spider Assassin Auditions (George)...');
  await callEleven('JBFqnCBsd6RMkjVDRZzb', 'The shadow guild sends its regards, barbarian. Sleep now in the venom...', { stability: 0.35, similarity_boost: 0.85, style: 0.70 }, path.join(audioDir, 'assassin_whisper.mp3'));
  await callEleven('JBFqnCBsd6RMkjVDRZzb', 'The brood queen... will feast upon your entrails...!', { stability: 0.20, similarity_boost: 0.85, style: 0.85 }, path.join(audioDir, 'assassin_death.mp3'));
  console.log('✅ Spider Assassin auditions generated.');

  console.log('4. Synthesizing Kheshat the Serpent Priest (Callum + Occult Reverb)...');
  const kheshatChant = 'From the black abyss of Sarkath, drink the blood of the infidels! Rise, ancient ones!';
  const rawKheshat = path.join(audioDir, 'temp_raw_kheshat.mp3');
  await callEleven('N2lVS1w4EtoT3dr4eOWO', kheshatChant, { stability: 0.22, similarity_boost: 0.85, style: 0.85 }, rawKheshat);
  const outKheshat = path.join(audioDir, 'kheshat_audition_chant.mp3');
  execSync(`"${ffmpeg}" -y -i "${rawKheshat}" -af "aecho=0.8:0.88:40:0.4,bass=g=3:f=180,volume=1.35" "${outKheshat}"`, { stdio: 'ignore' });
  try { fs.unlinkSync(rawKheshat); } catch(e) {}
  console.log('✅ Kheshat audition generated.');

  console.log('\n🎉 ALL SECONDARY CAST AUDITIONS SUCCESSFULLY GENERATED!');
}

main().catch(console.error);
