const fs = require('fs');
const file = '01_Script/episodes/episode_02.json';
const ep = JSON.parse(fs.readFileSync(file, 'utf8'));

const canonicalKorvath = "korvath, towering 6'4 heroic barbarian warrior, handsome rugged weathered facial features with masculine jawline and dark scruff stubble, intense dark wolfish eyes, natural windswept wavy shoulder-length raven-black hair (strictly NO jagged bangs, NO Neanderthal ape brow, strictly normal human facial anatomy), powerful muscular bronze torso, heavy ragged shaggy wolf-fur mantle draped across broad muscular shoulders and back, weathered leather cross-chest harness with brass buckles, fur-trimmed leather war kilt, heavy fur-topped leather combat boots with calf wraps, massive 42-inch two-handed barbarian iron broadsword, heavy straight double-edged steel blade with central fuller, rectangular solid iron crossguard, straight dark wire-wrapped grip, plain solid octagonal iron pommel stone";

const canonicalNatari = "natari, breathtaking exotic desert maiden and cunning rogue, facial blend of Salma Hayek and Ana de Armas, high chiseled cheekbones, smoldering kohl-lined feline eyes, luscious lips, long cascading glossy raven hair adorned with bronze beads, revealing hammered bronze scale bikini top, matching low-slung chain bikini bottoms, sheer gossamer crimson silk loincloth sash, coiled gilded serpent armbands and jeweled hip chains, flawless sun-kissed bronze skin";

const canonicalRuby = "the Blood-Ruby of Sarkath, a fist-sized rough-faceted crimson red gem glowing with inner smoldering fire, set in a heavy black iron serpent talon claw setting";

ep.forEach(p => {
  // Normalize Korvath if present
  if (/korvath/i.test(p.prompt) || (p.characters && p.characters.includes('korvath'))) {
    if (!p.characters.includes('korvath')) p.characters.push('korvath');
    
    // If prompt contains older korvath block, replace it
    if (/korvath,\s*towering/i.test(p.prompt)) {
      p.prompt = p.prompt.replace(/korvath,\s*towering 6'4[\s\S]*?(?=,\s*natari|,\s*the Blood-Ruby|,\s*colossal|,\s*massive 42-inch|,\s*At the top|\.\s*At the top|$)/i, canonicalKorvath);
    } else {
      // Append canonical Korvath before caption or at end
      const capIdx = p.prompt.indexOf('At the top corner');
      if (capIdx !== -1) {
        p.prompt = p.prompt.slice(0, capIdx) + canonicalKorvath + ', ' + p.prompt.slice(capIdx);
      } else {
        p.prompt += ', ' + canonicalKorvath;
      }
    }
  }

  // Normalize Natari if present
  if (/natari/i.test(p.prompt) || (p.characters && p.characters.includes('natari'))) {
    if (/natari,\s*breathtaking/i.test(p.prompt)) {
      p.prompt = p.prompt.replace(/natari,\s*breathtaking[\s\S]*?(?=,\s*korvath|,\s*the Blood-Ruby|,\s*massive 42-inch|,\s*At the top|\.\s*At the top|$)/i, canonicalNatari);
    }
  }

  // Normalize Blood-Ruby if mentioned
  if (/ruby|gem/i.test(p.prompt)) {
    p.prompt = p.prompt.replace(/the Blood-Ruby[^,\.]*/gi, canonicalRuby);
    p.prompt = p.prompt.replace(/blood-ruby[^,\.]*/gi, canonicalRuby);
  }

  // Multi-character anti-ghost guard
  if (p.panelId === 18 || p.panelId === 19) {
    if (!p.prompt.includes('strictly two people in the entire scene')) {
      p.prompt = p.prompt.replace(/(debris\.|gate\.)/i, '$1 strictly two people in the entire scene, absolutely no other background characters or extra figures.');
    }
  }
});

fs.writeFileSync(file, JSON.stringify(ep, null, 2));
console.log('Successfully prepared and locked all Episode 2 prompts with full continuity DNA!');

