const assert = require('assert');
const { extractJsonFromText, extractFencedText } = require('../lib/headless_ai');
const { listSupportedModels, getPromptSentForEngine } = require('./providers');
const { buildUniqueNeedle } = require('./providers/meta_cdp');
const { ensureWardrobeDnaInPrompt } = require('../lib/character_dna');

// 1. Headless AI parsers
const parsed = extractJsonFromText('Some preamble\n{"passed": false, "score": 3, "summary": "Bad hand"}\nTrailing');
assert.strictEqual(parsed.passed, false);
assert.strictEqual(parsed.score, 3);
assert.strictEqual(extractFencedText('```text\nhello world\n```'), 'hello world');

// 2. Provider registry & engine prompt handling
const models = listSupportedModels();
assert.ok(models.some(m => m.id === 'meta-ai-cdp'));
assert.ok(models.some(m => m.id === 'grok-imagine-image-2-0'));
const metaSent = getPromptSentForEngine('meta-ai-cdp', 'classic comic panel with blood and gore');
assert.ok(!/\bblood\b/i.test(metaSent), 'Meta AI prompt should be sanitized');
const grokSent = getPromptSentForEngine('grok-imagine-image-2-0', 'classic comic panel with blood');
assert.ok(/\bblood\b/i.test(grokSent), 'Venice API prompt should remain uncensored');

// 3. Unique needle must NOT match shared style prefix
const p1 = 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta style. Korvath stands atop a jagged crag overlooking the Hyborian steppes.';
const p2 = 'classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta style. Inside a smoky mud-brick tavern lit by flickering torches.';
const n1 = buildUniqueNeedle(p1);
const n2 = buildUniqueNeedle(p2);
assert.notStrictEqual(n1, n2, 'Unique needles for different panels must differ');
assert.ok(!n1.startsWith('classic vintage 1970s'), 'Needle must come from unique scene body, not shared prefix');

// 4. Wardrobe DNA auto-injection from 00_Reference/character_prompts.json
const injected = ensureWardrobeDnaInPrompt(
  'classic comic panel, Korvath steps forward to defend the girl.',
  { name: 'Iron Answers Steel', summary: 'Korvath defends the girl', characters: ['protagonist', 'companion'] },
  { id: 'korvath-the-barbarian' },
  require('path').join(__dirname, '..', '..')
);
assert.ok(injected.includes('wolf-fur mantle'), 'Korvath wardrobe DNA should be injected');
assert.ok(injected.includes('hammered bronze scale-mail'), 'Natari wardrobe DNA should be injected');

// 5. Meta Muse Image (fal) provider
const { normalizeEngine } = require('./providers');
assert.ok(models.some(m => m.id === 'meta-muse-image'), 'Muse must be a selectable engine');
const museSent = getPromptSentForEngine('meta-muse-image', 'classic comic panel with blood and gore');
assert.ok(/\bblood\b/i.test(museSent), 'Muse gets the raw prompt (no softening)');
assert.throws(() => normalizeEngine('grok-cdp'), /Unsupported image engine/, 'Unimplemented engines must not fall back to Meta silently');

(async () => {
  const { renderViaFalMuse } = require('./providers/fal_muse');
  const realFetch = global.fetch;
  const realKey = process.env.FAL_KEY;
  process.env.FAL_KEY = 'test-key';
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1) {
      return { ok: true, json: async () => ({ images: [{ url: 'https://v3.fal.media/files/x.webp', width: 1344, height: 768 }] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  try {
    const buf = await renderViaFalMuse('a barbarian on a cliff');
    assert.strictEqual(calls[0].url, 'https://fal.run/meta/muse-image/text-to-image');
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Key test-key');
    const body = JSON.parse(calls[0].opts.body);
    assert.strictEqual(body.prompt, 'a barbarian on a cliff');
    assert.strictEqual(body.aspect_ratio, '16:9');
    assert.strictEqual(calls[1].url, 'https://v3.fal.media/files/x.webp');
    assert.strictEqual(buf.length, 3);

    global.fetch = async () => ({ ok: false, status: 422, text: async () => 'content policy violation' });
    await assert.rejects(renderViaFalMuse('x'), /422.*content policy/);
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = realKey;
  }
  console.log('ALL WORKER MODULE TESTS PASSED');
})().catch(err => { console.error(err); process.exit(1); });

