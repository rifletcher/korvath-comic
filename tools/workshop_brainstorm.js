const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const rootDir = path.join(__dirname, '..');

function getArg(key, def = '') {
  const idx = process.argv.indexOf('--' + key);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return def;
}

function loadProject(projectId) {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  if (fs.existsSync(projPath)) {
    try {
      return JSON.parse(fs.readFileSync(projPath, 'utf8'));
    } catch (e) {}
  }
  return { id: projectId, title: projectId, genre: 'Graphic Novel', artStyleAnchor: 'classic graphic novel' };
}

function getDeterministicFallback(genre = '', projectTitle = '', topic = '') {
  const g = genre.toLowerCase();
  if (g.includes('noir') || g.includes('art-deco') || g.includes('detective') || g.includes('chromium')) {
    return {
      storyDirection: topic || "In a rain-slicked art-deco metropolis where corporate barons rule above the clouds and syndicate killers haunt the alleys, a disgraced private investigator is hired by a mysterious socialite who holds a ledger capable of bringing down the ruling syndicate.",
      characters: [
        {
          id: "protagonist",
          role: "Protagonist / Private Eye",
          name: "Vincent Cole",
          visualPrompt: "rugged 1930s private detective, sharp chiseled jaw with dark five o'clock shadow scruff, piercing world-weary hazel eyes, dark brown fedora tilted low, weathered charcoal-grey wool trench coat with upturned collar, loose patterned silk tie, white dress shirt, snub-nosed .38 revolver",
          voicePersona: "Low gravelly baritone, cynical, world-weary and measured cadence"
        },
        {
          id: "companion",
          role: "Companion / Femme Fatale",
          name: "Evelyn Cross",
          visualPrompt: "breathtaking 1930s art-deco high-society femme fatale, platinum wave hair cascading over one eye, sultry dark crimson lips, alluring defiant expression, backless emerald-green silk evening gown, diamond-encrusted serpent choker, coiled gold bangles",
          voicePersona: "Velvety, seductive, sharp wit with hidden vulnerability"
        },
        {
          id: "antagonist",
          role: "Antagonist / Tycoon",
          name: "Baron Viktor Sterling",
          visualPrompt: "cold predatory industrial tycoon in his fifties, silver-templed slicked hair, thin mustache, gold-rimmed monocle over left eye, immaculate double-breasted black tuxedo with satin lapels, diamond cufflinks, smoldering Havana cigar",
          voicePersona: "Aristocratic, haughty, calculated British-tinged menace"
        }
      ],
      objects: [
        {
          id: "object_1",
          name: "Snub-Nosed .38 & Black Ledger",
          visualPrompt: "vintage blued-steel snub-nosed .38 revolver with walnut grip beside a leather-bound black ledger stamped with gold art-deco embossing"
        },
        {
          id: "object_2",
          name: "Serpent Diamond Choker",
          visualPrompt: "intricate platinum and diamond art-deco serpent necklace with emerald eyes"
        }
      ],
      settings: [
        {
          id: "setting_1",
          name: "Rain-Slicked Chromium Skyline",
          visualPrompt: "1930s art-deco metropolis at midnight in pouring rain, towering ziggurat skyscrapers, sweeping searchlights, neon reflections on wet cobblestones"
        },
        {
          id: "setting_2",
          name: "Gilded Penthouse Ballroom",
          visualPrompt: "opulent art-deco penthouse ballroom with black marble columns, massive crystal chandelier, geometric brass railings, moody amber and violet chiaroscuro"
        }
      ]
    };
  } else if (g.includes('sci-fi') || g.includes('cyberpunk') || g.includes('space')) {
    return {
      storyDirection: topic || "In the neon-soaked lower sectors of an orbital megacity, a rogue cyber-runner and an escaped synthetic courier navigate corporate death squads to broadcast encrypted coordinates of an uncorrupted terraforming relay.",
      characters: [
        {
          id: "protagonist",
          role: "Protagonist / Cyber-Runner",
          name: "Kaelen Voss",
          visualPrompt: "athletic cybernetic mercenary, cybernetic right eye glowing faint amber, short textured undercut dark hair, high-collar matte black armored techwear jacket with luminescent blue seam accents, utility tactical harness, suppressed smart-pistol",
          voicePersona: "Quiet, intense, clipped tactical diction"
        },
        {
          id: "companion",
          role: "Companion / Synthetic Courier",
          name: "Lyra-7",
          visualPrompt: "agile synthetic operative with silver iridescent hair, delicate porcelain synthetic skin with subtle geometric subdermal circuit traces, luminous violet eyes, sleek holographic stealth bodysuit, holographic datapad",
          voicePersona: "Melodic, calm, analytical with nascent human warmth"
        },
        {
          id: "antagonist",
          role: "Antagonist / Megacorp Director",
          name: "Director Vane",
          visualPrompt: "imposing corporate enforcer in chrome-accented obsidian ballistic trench coat, cranial neural uplink crown, polished silver prosthetic arm, cold calculating expression",
          voicePersona: "Deep modulated synthetic timbre, imperious and devoid of empathy"
        }
      ],
      objects: [
        {
          id: "object_1",
          name: "Encrypted Relay Drive",
          visualPrompt: "matte-black hexagonal data core with glowing cyan holographic circuit channels"
        },
        {
          id: "object_2",
          name: "Suppressed Smart-Pistol",
          visualPrompt: "angular titanium tactical smart-pistol with integrated blue optic rail and carbon suppressor"
        }
      ],
      settings: [
        {
          id: "setting_1",
          name: "Sector 4 Neon Abyss",
          visualPrompt: "vertical cyberpunk megacity canyon in acid rain, towering holographic billboards, elevated mag-lev rails, cyan and magenta reflections"
        },
        {
          id: "setting_2",
          name: "Orbital Broadcast Spire",
          visualPrompt: "colossal steel and glass transmission tower piercing storm clouds above the city grid, pulsing blue beacon"
        }
      ]
    };
  } else {
    // Pulp Barbarian / Fantasy
    return {
      storyDirection: topic || "Across the blood-drenched sands and forgotten serpent crypts of the Hyborian frontier, a lone northern warrior and a fierce rebel priestess battle an ancient death-cult seeking to resurrect a slumbering spider-god.",
      characters: [
        {
          id: "protagonist",
          role: "Protagonist / Barbarian",
          name: "Korvath",
          visualPrompt: "towering bronze-skinned Cimmerian warrior, massive sinewy muscular frame, weathered square jaw with rough stubble, fierce wolfish blue eyes, windswept raven mane, shaggy wolf-fur mantle draped over shoulders, cross-chest leather harness, heavy broadsword with central fuller in scabbard",
          voicePersona: "Subterranean rumbling baritone, guttural, fierce and unyielding"
        },
        {
          id: "companion",
          role: "Companion / Rebel Sorceress",
          name: "Valka of Zamora",
          visualPrompt: "lithe athletic Zamora thief and rogue priestess, honey-bronze skin, long wavy ebony locks interwoven with gold beads, piercing amber cat-eyes, fitted ornate brass serpent corset cuirass, flowing crimson silk battle kilt, twin matched serpentine daggers",
          voicePersona: "Smoky contralto, cunning, proud and fiercely independent"
        },
        {
          id: "antagonist",
          role: "Antagonist / High Priest",
          name: "Thorgar the Undying",
          visualPrompt: "gaunt sinister high priest in hooded obsidian serpent-scales cowl, hollow sunken glowing emerald eyes, pallid withered flesh, gripping an ornate twisted iron serpent staff topped with a smoldering dark soul-gem",
          voicePersona: "Raspy, sibilant hiss, cold ritualistic arrogance"
        }
      ],
      objects: [
        {
          id: "object_1",
          name: "42-Inch Iron Broadsword",
          visualPrompt: "straight 42-inch double-edged forged iron broadsword with central blood fuller, rectangular iron crossguard, wire-wrapped hilt, octagonal pommel"
        },
        {
          id: "object_2",
          name: "Blood-Ruby of Sarkath",
          visualPrompt: "fist-sized faceted crimson ruby set inside a blackened iron serpent-talon claw relic"
        }
      ],
      settings: [
        {
          id: "setting_1",
          name: "Valkash Desert Outpost",
          visualPrompt: "smoky mud-brick Hyborian border tavern lit by flickering pine torches, hanging furs, carved timber pillars"
        },
        {
          id: "setting_2",
          name: "Sunken Vaults of Sarkesh",
          visualPrompt: "cyclopean subterranean serpent temple ruins with moss-covered stone altars, green witch-fire braziers, towering carved arachnid pillars"
        }
      ]
    };
  }
}

async function main() {
  const projectId = getArg('project');
  const topic = getArg('topic', '');

  const project = loadProject(projectId);
  const fallback = getDeterministicFallback(project.genre, project.title, topic);

  const prompt = `You are the master creative showrunner and story director for the graphic novel "${project.title}".
GENRE: ${project.genre || 'Graphic Novel'}
ART STYLE: ${project.artStyleAnchor || 'Classic Graphic Novel'}
USER STORY / PREMISE HINT: "${topic || 'Create a captivating original storyline with high dramatic stakes and a compelling trio of characters.'}"

Brainstorm the story direction, cast, key objects/props, and key settings/environments. Return STRICTLY a single JSON object in \`\`\`json codeblock with this exact structure:
{
  "storyDirection": "2-3 sentence engaging synopsis describing the central conflict, setting, and narrative arc.",
  "characters": [
    {
      "id": "protagonist",
      "role": "Protagonist / Hero",
      "name": "Full Character Name",
      "visualPrompt": "Detailed visual description including facial features, hair, signature attire/wardrobe layers, key held prop or weapon, maintaining comic illustration fidelity.",
      "voicePersona": "Vocal timbre, accent, emotional tone, and speaking cadence."
    },
    {
      "id": "companion",
      "role": "Companion / Ally / Foil",
      "name": "Full Character Name",
      "visualPrompt": "Detailed visual description with distinctive outfit, color motifs, and physical appearance.",
      "voicePersona": "Vocal timbre and emotional delivery style."
    },
    {
      "id": "antagonist",
      "role": "Antagonist / Villain",
      "name": "Full Character Name",
      "visualPrompt": "Detailed visual description highlighting menacing features, garments, and silhouette.",
      "voicePersona": "Vocal timbre and sinister or authoritative presence."
    }
  ],
  "objects": [
    {
      "id": "object_1",
      "name": "Key Weapon or Relic Name",
      "visualPrompt": "Detailed physical appearance, materials, proportions, and signature details for a 3-view object turnaround sheet."
    },
    {
      "id": "object_2",
      "name": "Second Key Prop or Artifact Name",
      "visualPrompt": "Detailed physical appearance, materials, proportions, and signature details."
    }
  ],
  "settings": [
    {
      "id": "setting_1",
      "name": "Primary Location / Environment Name",
      "visualPrompt": "Detailed architectural, atmospheric, lighting, and environmental description for a wide establishing concept art sheet."
    },
    {
      "id": "setting_2",
      "name": "Climax Location / Environment Name",
      "visualPrompt": "Detailed architectural, atmospheric, lighting, and environmental description."
    }
  ]
}`;

  try {
    execFile('agy.exe', ['--model', 'gemini-3.8-flash-medium', '-p', prompt], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024
    }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const raw = stdout.trim();
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonStr = match ? match[1].trim() : raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.storyDirection && Array.isArray(parsed.characters) && parsed.characters.length > 0) {
            console.log(JSON.stringify(parsed, null, 2));
            return;
          }
        } catch (pe) {}
      }
      // Deterministic fallback
      console.log(JSON.stringify(fallback, null, 2));
    });
  } catch (e) {
    console.log(JSON.stringify(fallback, null, 2));
  }
}

main();

