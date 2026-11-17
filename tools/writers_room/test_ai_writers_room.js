// Tests for the AI Writers' Room using a fake AI (no network, no credits).
const assert = require('assert');
const wr = require('./ai_writers_room');

function panel(i, over = {}) {
  return Object.assign({
    name: `Beat ${i}`, act: i <= 5 ? 'Act I' : i <= 15 ? 'Act II' : 'Act III', shotType: i % 2 ? 'Close-Up' : 'Wide Shot',
    summary: `Picture ${i}: torchlight on wet stone, Korvath at the gate.`, characters: ['korvath'], objects: ['broadsword'],
    caption: `The ${i}th hour of the long night bled away into silence${i}.`, captionDelivery: 'ominous',
    dialogue: [{ speaker: 'Korvath', text: `Line number ${i}, spoken low.`, delivery: i === 3 ? 'shout' : 'wry', performanceText: i === 3 ? 'Line number 3, SPOKEN low!' : '' }],
    soundEffects: i === 3 ? [{ sound: 'heavy iron gate slamming shut in a stone hall', at: 'start', volume: 'loud', seconds: 2 }] : [],
    ambience: 'crackling torches and distant dripping water in a stone vault'
  }, over);
}
const outline = { title: 'The Iron Gate', logline: 'A test.', structure: 'heist', whatChanges: 'x',
  beats: [{ act: 'Act I', beat: 'start', panels: 20 }], newCharacters: [{ key: 'gatekeeper', name: 'The Gatekeeper', look: 'old one-eyed man in rusted mail' }],
  episodeSummary: 'Korvath broke into the vault.', endState: 'Everyone alive.' };

(async () => {
  const calls = [];
  let fixCalled = false;
  const fakeAi = async (prompt, opts) => {
    calls.push(opts.label);
    if (/Outline/.test(opts.label)) return { ok: true, model: 'fake', text: JSON.stringify(outline) };
    if (/Script draft/.test(opts.label)) {
      // panel 7 uses a banned word and an uncast speaker -> must be fixed
      const ps = Array.from({ length: 20 }, (_, k) => panel(k + 1));
      ps[6] = panel(7, { caption: 'By Crom, the vault was open.', dialogue: [{ speaker: 'Random Guard', text: 'Halt!' }] });
      return { ok: true, text: 'Here you go:\n' + JSON.stringify({ panels: ps }) };
    }
    if (/Edit pass/.test(opts.label)) {
      const m = prompt.match(/DRAFT:\n(\{[\s\S]*?\})\n\nCRAFT RULES/) || prompt.match(/DRAFT:\n(\{[\s\S]*?\})\n/);
      const draft = JSON.parse(m[1]);
      return { ok: true, text: JSON.stringify({ scores: { story: 7, dialogue: 6 }, notes: ['tightened act II'], panels: draft.panels }) };
    }
    if (/Fix pass/.test(opts.label)) {
      fixCalled = true;
      assert(/Crom|crom/.test(prompt) && /Random Guard/.test(prompt), 'fix prompt lists the problems');
      return { ok: true, text: JSON.stringify({ panels: Array.from({ length: 20 }, (_, k) => panel(k + 1)) }) };
    }
    throw new Error('unexpected call ' + opts.label);
  };

  const logs = [];
  const res = await wr.writeEpisodeScript({ projectId: 'korvath-the-barbarian', episodeId: 'ep03', ai: fakeAi, onProgress: m => logs.push(m) });
  assert.deepStrictEqual(calls, ["Writers' Room: Outline", "Writers' Room: Script draft", "Writers' Room: Edit pass", "Writers' Room: Fix pass"]);
  assert(fixCalled);
  assert.strictEqual(res.panels.length, 20);
  const p3 = res.panels[2];
  assert.strictEqual(p3.dialogue[0].audioDirection.delivery, 'shout');
  assert.strictEqual(p3.dialogue[0].audioDirection.performanceText, 'Line number 3, SPOKEN low!');
  assert(p3.dialogue[0].audioDirection.stability < 0.2);
  assert.strictEqual(p3.captionDirection.delivery, 'ominous');
  assert.strictEqual(p3.soundEffects[0].volume, 'loud');
  assert(p3.prompt.includes('Steel') === false);
  assert(/yellow vintage comic book narrative caption box/.test(p3.prompt));
  assert(res.panels[0].prompt.toLowerCase().includes('wolf-fur') || res.panels[0].prompt.toLowerCase().includes('korvath'));
  assert.strictEqual(res.writersRoom.structure, 'heist');
  assert(res.writersRoom.episodeSummary);
  assert(!JSON.stringify(res.panels).toLowerCase().includes('crom'));

  // performanceText that changes the words is dropped
  const d = wr.buildDirection('calm', 'Something else entirely', 'Hold the line.', false);
  assert(!d.performanceText);
  // unknown narrator delivery falls back to grim
  assert.strictEqual(wr.buildDirection('shout', '', 'x', true).delivery, 'grim');
  // banned-term detection is word based
  assert.deepStrictEqual(wr.bannedIn('the crom-like sword'), ['crom']);
  assert.deepStrictEqual(wr.bannedIn('a cromlech'), []);

  // AI unavailable -> clear error, nothing written
  await assert.rejects(wr.writeEpisodeScript({ projectId: 'korvath-the-barbarian', episodeId: 'ep03', ai: async () => ({ ok: false, error: 'agy.exe was not found' }) }),
    /could not reach the AI \(Outline\): agy.exe was not found. Nothing was changed/);

  // Script that still fails after the fix pass -> error
  const stubborn = async (prompt, opts) => {
    if (/Outline/.test(opts.label)) return { ok: true, text: JSON.stringify(outline) };
    return { ok: true, text: JSON.stringify({ panels: Array.from({ length: 20 }, (_, k) => panel(k + 1, { caption: 'Hyborian night.' })) }) };
  };
  await assert.rejects(wr.writeEpisodeScript({ projectId: 'korvath-the-barbarian', episodeId: 'ep03', ai: stubborn }), /still fails .* check/);

  // story so far includes ep01 and ep02
  const ctx = wr.loadSeriesContext('korvath-the-barbarian', 'ep03');
  assert.deepStrictEqual(ctx.prev.map(e => e.id), ['ep01', 'ep02']);
  assert(ctx.cast.some(c => c.key === 'thorgar'));
  console.log('ALL WRITERS ROOM TESTS PASSED');
  console.log(logs.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
