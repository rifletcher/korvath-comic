const fs = require('fs');
const path = require('path');
const { renderPromptVenice } = require('./render_panel_venice');

const sanitizedPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting, dark pulp fantasy aesthetic, masterwork sequential art, Peak Combat Action Freeze-Frame, Low-Angle Diagonal Tracking Angle, Bright blazing golden tavern hearthfire lighting, high-contrast dynamic action illumination, Full heroic comic book action freeze-frame. Korvath swings his massive two-handed iron broadsword in a sweeping horizontal arc, shattering the lead assassin's heavy iron shield into flying splintered debris across the tavern, while Natari hurls an ornate throwing dagger with feline precision to strike down a second cloaked attacker's weapon, korvath, towering 6'4 barbarian warrior, facial blend of Henry Cavill and Jason Momoa, massive chiseled square jaw with subtle cleft, smoldering steely blue wolfish eyes, heavy dark brooding brow, square-cut shaggy raven-black hair falling to broad shoulders, deeply muscled scarred bronze torso, weathered leather chest harness with brass studs, wolf-fur loincloth, heavy leather combat boots with calf wraps, diagonal scar across left collarbone, natari, breathtaking exotic desert maiden, facial blend of Salma Hayek and Ana de Armas, high chiseled cheekbones, smoldering kohl-lined feline eyes, luscious lips, long cascading glossy raven hair adorned with bronze beads, revealing hammered bronze scale bikini top, matching low-slung chain bikini bottoms, sheer gossamer crimson silk loincloth sash, coiled gilded serpent armbands and jeweled hip chains, flawless sun-kissed bronze skin, massive 42-inch two-handed barbarian iron broadsword, heavy straight double-edged steel blade with central fuller, rectangular solid iron crossguard, straight dark wire-wrapped grip, plain solid octagonal iron pommel, unadorned utilitarian iron weapon, strictly NO jewels on sword, NO gems on hilt, NO curved blade, At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "When the fury of the north awakens, steel carves the only law."`;

const rawDir = path.join(__dirname, '..', '02_Assets', 'Episode_02', 'raw');
const selDir = path.join(__dirname, '..', '02_Assets', 'Episode_02', 'selected');
const rawPath = path.join(rawDir, 'panel_06.webp');
const selPath = path.join(selDir, 'panel_06.webp');

(async () => {
  await renderPromptVenice(sanitizedPrompt, rawPath);
  fs.copyFileSync(rawPath, selPath);
  const size = fs.statSync(rawPath).size;
  console.log(`Rendered Panel 6: ${size} bytes`);
})();

