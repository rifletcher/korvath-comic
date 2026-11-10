const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = env.match(/ELEVENLABS_API_KEY=([^\r\n]+)/)[1].trim();

const postData = JSON.stringify({
  text: 'Die, dog of the north! Sarkath claims your flesh!',
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.22,
    similarity_boost: 0.85,
    style: 0.85,
    use_speaker_boost: true
  }
});

const req = https.request({
  hostname: 'api.elevenlabs.io',
  path: '/v1/text-to-speech/nPczCjzI2devNBz1zQrb',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'xi-api-key': key,
    'Content-Length': Buffer.byteLength(postData)
  }
}, res => {
  console.log('ElevenLabs status:', res.statusCode);
  if (res.statusCode !== 200) {
    let err = '';
    res.on('data', c => err += c);
    res.on('end', () => console.error('Error:', err));
    return;
  }
  const rawFile = path.join(__dirname, '..', 'test_barbarian_p05_raw.mp3');
  const fxFile = path.join(__dirname, '..', 'test_barbarian_p05_kratos.mp3');
  const out = fs.createWriteStream(rawFile);
  res.pipe(out);
  out.on('finish', () => {
    console.log('✅ Wrote raw barbarian audio:', rawFile);
    const dsp = 'asetrate=44100*0.88,aresample=44100,equalizer=f=95:width_type=h:width=60:g=8,volume=1.45';
    execSync(`ffmpeg -y -i "${rawFile}" -af "${dsp}" "${fxFile}"`);
    console.log('✅ Applied Subterranean Kratos DSP chain ->', fxFile);
  });
});
req.write(postData);
req.end();

