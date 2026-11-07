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
        response.on('end', () => rej(new Error(err)));
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
  const roarText = 'DIE, BEAST OF SHADOWS! BURN IN THE PITS OF VALKASH!';
  const threatText = 'I pay for wine with silver. I pay for insults with steel.';

  const voices = [
    { key: 'arnold_subbass', id: 'VR6AewLTigWG4xSOukaG', label: 'Arnold Deep Kratos' },
    { key: 'callum_subbass', id: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum Savage Behemoth' },
    { key: 'brian_subbass',  id: 'nPczCjzI2devNBz1zQrb', label: 'Brian Thunder Barbarian' },
    { key: 'george_subbass', id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George Gravelly Warlord' }
  ];

  const audioDir = path.join(__dirname, '..', 'docs', 'audio');

  for (const v of voices) {
    console.log(`Generating ${v.label}...`);
    const rawRoar = path.join(audioDir, `temp_raw_${v.key}_roar.mp3`);
    const rawThreat = path.join(audioDir, `temp_raw_${v.key}_threat.mp3`);
    
    await callEleven(v.id, roarText, { stability: 0.20, similarity_boost: 0.85, style: 0.85 }, rawRoar);
    await callEleven(v.id, threatText, { stability: 0.32, similarity_boost: 0.85, style: 0.70 }, rawThreat);

    // Deep subterranean pitch-shift (-12% pitch) + +8dB sub-bass @ 95Hz + warm saturation
    // asetrate=44100*0.88 drops pitch by ~12% (approx 2 semitones down into subterranean Kratos depth)
    // atempo=1.136 keeps the exact natural human speech cadence without slowing down
    const fxFilter = 'asetrate=44100*0.88,atempo=1.136,bass=g=8:f=95,volume=1.45';
    
    const outRoar = path.join(audioDir, `korvath_deep_${v.key}_roar.mp3`);
    const outThreat = path.join(audioDir, `korvath_deep_${v.key}_threat.mp3`);

    execSync(`"${ffmpeg}" -y -i "${rawRoar}" -af "${fxFilter}" "${outRoar}"`, { stdio: 'ignore' });
    execSync(`"${ffmpeg}" -y -i "${rawThreat}" -af "${fxFilter}" "${outThreat}"`, { stdio: 'ignore' });

    try { fs.unlinkSync(rawRoar); } catch(e) {}
    try { fs.unlinkSync(rawThreat); } catch(e) {}
    console.log(`✅ Generated ${v.label}`);
  }
}

main().catch(console.error);

