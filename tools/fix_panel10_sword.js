const fs = require('fs');
const path = require('path');
const { renderPromptVenice } = require('./render_panel_venice');

const fixedPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art, Dynamic Entanglement Shot, High Dutch Angle Looking Down, Gleaming white web strands contrasting against dark stone and gold coins, Sudden trap action. Heavy iron grates crash down behind them as massive thick, fibrous spiderwebs drop from the darkness above, sticking to Korvath's broad shoulders and trapping Natari against the gold chests., korvath, towering 6'4 barbarian warrior, facial blend of Henry Cavill and Jason Momoa, massive chiseled square jaw with subtle cleft, smoldering steely blue wolfish eyes, heavy dark brooding brow, distinctive square-cut mane of thick coarse raven-black hair with jagged front bangs, hair length strictly shoulder-length stopping at the collarbone, strictly NOT waist length, NOT past the shoulders, NOT tied in a ponytail, NOT short cropped, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, heavy leather combat boots with calf wraps, diagonal scar across left collarbone, natari, breathtaking exotic desert maiden, facial blend of Salma Hayek and Ana de Armas, high chiseled cheekbones, smoldering kohl-lined feline eyes, luscious lips, long cascading glossy raven hair adorned with bronze beads, revealing hammered bronze scale bikini top, matching low-slung chain bikini bottoms, sheer gossamer crimson silk loincloth sash, coiled gilded serpent armbands and jeweled hip chains, flawless sun-kissed bronze skin, massive 42-inch two-handed barbarian iron broadsword, heavy straight double-edged steel blade with central fuller, simple rectangular carved iron crossguard, straight dark wire-wrapped two-handed grip, plain solid octagonal iron pommel, unadorned utilitarian raw iron weapon, strictly NO curved scimitar, NO oriental saber, NO curved handle, NO jewels or gems on the sword, At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "The iron door was the jaws of the trap. The web was its teeth.", Include an authentic white comic book speech balloon with black ink outline and directional pointer pointing toward Natari with the text: "It's a trap! The webs... they burn like acid!"`;

const rawDir = path.join(__dirname, '..', '02_Assets', 'Episode_02', 'raw');
const outPath = path.join(rawDir, 'panel_10.webp');

(async () => {
  console.log('⚡ Re-rendering Episode 2 Panel 10 with clean unadorned iron crossguard...');
  await renderPromptVenice(fixedPrompt, outPath);
  console.log('✅ Render complete: ' + outPath);
})();

