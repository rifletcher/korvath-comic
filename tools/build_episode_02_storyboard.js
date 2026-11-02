const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'comic.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const CHAR_PROMPTS_PATH = path.join(__dirname, '..', config.paths.characterPrompts);
const OBJ_PROMPTS_PATH = path.join(__dirname, '..', config.paths.objectPrompts);
const charPrompts = JSON.parse(fs.readFileSync(CHAR_PROMPTS_PATH, 'utf8'));
const objPrompts = JSON.parse(fs.readFileSync(OBJ_PROMPTS_PATH, 'utf8'));

const BASE_STYLE = config.style.baseStylePrompt;
const AVOID = config.style.avoidTokens;

const PANELS_EPISODE_02 = [
  // --- ACT I: CITY OF SHADOWS & TAVERN BRAWL (Panels 1-6) ---
  {
    panelId: 1,
    beat: {
      beat: 1,
      act: "Act I: City of Shadows",
      name: "Gates of Valkash",
      summary: "Korvath and Natari arrive at the towering stone gates of Valkash under a brooding moonlit dusk, minarets and thieves' towers silhouetted against a purple twilight."
    },
    action: "Wide panoramic establishing shot. Korvath and Natari approach the colossal archway gates of Valkash, the City of Shadows. Torches flicker along high crenelated walls, while ancient minarets and domed palaces rise into a bruised purple twilight sky. Korvath's massive two-handed straight iron broadsword is strapped in a weathered leather sheath across his broad muscular back, plain rectangular carved iron crossguard and unadorned solid iron octagonal pommel visible over his shoulder, strictly NO jewels or gems on the sword.",
    caption: "Beyond the red sands of Sarkesh lay Valkash—city of thieves, poisoned wine, and men whose smiles were sharper than their daggers.",
    dialogue: [],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "environment",
    camera: {
      shotType: "Ultra-Wide Panoramic Establishing Shot",
      angle: "Low Horizon-Level Perspective",
      lighting: "Deep twilight purple sky, warm amber torchlight along parapets, long ominous shadows"
    }
  },
  {
    panelId: 2,
    beat: {
      beat: 2,
      act: "Act I: City of Shadows",
      name: "The Midnight Bazaar",
      summary: "Korvath and Natari navigate a crowded, smoky night bazaar filled with snake charmers, spice merchants, and lurking cutthroats in the shadows."
    },
    action: "Crowded medium tracking shot. Korvath, towering broadsword over shoulder, strides through the bustling midnight bazaar beside Natari in her revealing hammered bronze scale bikini and gossamer silk sash, as hooded cutthroats and beggars eye the glowing pouch containing the Blood-Ruby.",
    caption: "Every shadow in Valkash had eyes. And every eye was hungry for northern blood.",
    dialogue: [
      {
        speaker: "Natari",
        text: "Keep your hand on your hilt, Korvath. A purse in Valkash buys you a slit throat before dawn."
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Medium Street Tracking Shot",
      angle: "Eye-Level Dynamic Angle",
      lighting: "Vibrant hanging lanterns, swirling grey incense smoke, heavy chiaroscuro alleyway pockets"
    }
  },
  {
    panelId: 3,
    beat: {
      beat: 3,
      act: "Act I: City of Shadows",
      name: "The Black Lotus Tavern",
      summary: "Inside a dim, smoke-filled tavern, Korvath drinks dark ale while Natari reclines beside him, scanning the room as cutthroats whisper in the corner."
    },
    action: "Interior tavern scene. Korvath sits at a heavy scarred oak table, slamming down an iron flagon of ale, muscles gleaming in firelight. Beside him, Natari lounges with feline grace on a wooden bench, smoldering eyes watching three hooded assassins whispering in the rear alcove. Korvath's massive two-handed straight iron broadsword is strapped vertically across his muscular back (NOT on the table), plain rectangular carved iron crossguard and unadorned solid iron octagonal pommel visible over his shoulder, straight black wire-wrapped grip, strictly NO jewels on sword.",
    caption: "The ale tasted of ditch-water, but the danger smelled fresh.",
    dialogue: [
      {
        speaker: "Korvath",
        text: "Let them whisper. Iron speaks louder than gossip."
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Tavern Interior Medium Three-Shot",
      angle: "Three-Quarter Low Ground Perspective",
      lighting: "Flickering tallow candles and hearthfire casting deep dramatic ink shadows"
    }
  },
  {
    panelId: 4,
    beat: {
      beat: 4,
      act: "Act I: City of Shadows",
      name: "The Crooked Broker",
      summary: "A gaunt broker in greasy velvet leans over their table, demanding the Blood-Ruby for a pittance; Korvath seizes him by the throat."
    },
    action: "Close dynamic confrontation. Korvath's scarred, massive hand seizes the cloaked broker by the collar, lifting him clean off his boots over the table, while the broker's eyes bulge in terror as Natari draws a concealed dagger.",
    caption: "Civilized merchants understand contracts. Korvath understood only fair trade and broken bones.",
    dialogue: [
      {
        speaker: "Korvath",
        text: "Offer me copper for blood again, dog, and I will feed you your own tongue."
      }
    ],
    characters: ["korvath"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Tight Chiaroscuro Confrontation Shot",
      angle: "Low Dutch Angle",
      lighting: "Harsh single-source candle glare, high-contrast black shadows"
    }
  },
  {
    panelId: 5,
    beat: {
      beat: 5,
      act: "Act I: City of Shadows",
      name: "Blades in the Smoke",
      summary: "Three hooded spider-guild assassins leap from the shadows with curved poisoned daggers, overturning heavy wooden tables."
    },
    action: "Three agile shadow-assassins in black leather and web-spun masks leap from the tavern shadows, curved poisoned kris blades gleaming, overturning tables as tankards shatter across the stone floor.",
    caption: "The trap sprang not with a shout, but with the hiss of oiled steel.",
    dialogue: [
      {
        speaker: "Spider Assassin",
        text: "Lord Malakor claims the jewel and your hides, northman!"
      }
    ],
    characters: ["spider_assassins"],
    objects: [],
    focalSubject: "spider_assassins",
    camera: {
      shotType: "Dynamic Action Ambush Shot",
      angle: "High Dutch Angle (Tension)",
      lighting: "Shattered fire embers, gleaming blades catching candle flame"
    }
  },
  {
    panelId: 6,
    beat: {
      beat: 6,
      act: "Act I: City of Shadows",
      name: "Savage Tavern Cleave",
      summary: "With ferocious speed, Korvath swings his two-handed broadsword, cleaving the lead assassin in a spray of blood while Natari buries a dagger into another."
    },
    action: "Full visceral action freeze-frame. Korvath swings his massive two-handed iron broadsword in a brutal horizontal arc, cleaving through the lead assassin's chest with a fountain of crimson blood as shattered wood flies, while Natari drives a throwing dagger cleanly into a second attacker's neck.",
    caption: "When the red mist took Korvath, taverns became slaughterhouses.",
    dialogue: [],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Peak Combat Action Freeze-Frame",
      angle: "Low-Angle Diagonal Tracking Angle",
      lighting: "Dynamic spotlighting on muscular bronze bodies, flying crimson blood droplets, deep ink shadows"
    }
  },

  // --- ACT II: PALACE INFILTRATION & THE WEBBED VAULT (Panels 7-13) ---
  {
    panelId: 7,
    beat: {
      beat: 7,
      act: "Act II: The Webbed Vault",
      name: "Rooftops of Valkash",
      summary: "Korvath and Natari sprint across clay-tiled rooftops under a blood-red crescent moon, leaping an alley gap toward Lord Malakor's palace."
    },
    action: "Dynamic high rooftop action shot. Korvath and Natari leap across a wide alleyway between terracotta tiled roofs under a stark crescent moon, the sprawling moonlit towers of Lord Malakor's palace looming in the near background.",
    caption: "Above the filth of the streets ran the highway of thieves.",
    dialogue: [
      {
        speaker: "Natari",
        text: "Malakor's pleasure gardens are ahead! If the jewel is anywhere, it is in his private vault!"
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Dynamic Midair Rooftop Leap Shot",
      angle: "High Dutch Perspective",
      lighting: "Cool silver moonlight washing over their athletic forms, dark silhouettes of city below"
    }
  },
  {
    panelId: 8,
    beat: {
      beat: 8,
      act: "Act II: The Webbed Vault",
      name: "The Harem Terrace",
      summary: "Natari and Korvath drop onto an opulent marble terrace, where exotic courtesans in sheer silk drapes lounge around a smoking fountain."
    },
    action: "Opulent palace terrace view. Surrounded by carved alabaster colonnades and a steaming rosewater fountain, two stunning exotic courtesans in sheer gossamer silks and bronze jewelry gaze in shocked awe as Korvath and Natari drop onto the marble tiles.",
    caption: "Silk and perfume could not mask the stench of spider venom that hung in the palace air.",
    dialogue: [],
    characters: ["temple_maidens"],
    objects: [],
    focalSubject: "temple_maidens",
    camera: {
      shotType: "Wide Opulent Terrace Shot",
      angle: "Low Eye-Level Angle",
      lighting: "Lush hanging brass lanterns, moonlit reflecting pools, swirling steam"
    }
  },
  {
    panelId: 9,
    beat: {
      beat: 9,
      act: "Act II: The Webbed Vault",
      name: "The Merchant's Vault",
      summary: "Korvath kicks open the heavy iron doors to Lord Malakor's vault, revealing chests of glittering gold coins and ancient relics."
    },
    action: "Korvath kicks open a massive iron vault door with a splintering crash, revealing a treasure vault overflowing with open iron chests of sparkling gold coins, jeweled chalices, and thick hanging cobwebs.",
    caption: "The wealth of fifty plundered caravans, guarded only by silence.",
    dialogue: [
      {
        speaker: "Korvath",
        text: "Too quiet. A spider never leaves its larder unguarded."
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Vault Door Breakthrough Shot",
      angle: "Low-Angle Entrance Perspective",
      lighting: "Golden glint of glittering coins clashing against deep velvet gloom"
    }
  },
  {
    panelId: 10,
    beat: {
      beat: 10,
      act: "Act II: The Webbed Vault",
      name: "Caught in the Web",
      summary: "Iron portcullises slam shut; heavy sticky spiderwebs drop from the vaulted ceiling, entangling Korvath and Natari."
    },
    action: "Sudden trap action. Heavy iron grates crash down behind them as massive thick, fibrous spiderwebs drop from the darkness above, sticking to Korvath's broad shoulders and trapping Natari against the gold chests.",
    caption: "The iron door was the jaws of the trap. The web was its teeth.",
    dialogue: [
      {
        speaker: "Natari",
        text: "It's a trap! The webs... they burn like acid!"
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Dynamic Entanglement Shot",
      angle: "High Dutch Angle Looking Down",
      lighting: "Gleaming white web strands contrasting against dark stone and gold coins"
    }
  },
  {
    panelId: 11,
    beat: {
      beat: 11,
      act: "Act II: The Webbed Vault",
      name: "The Brood Queen Descends",
      summary: "From the vault dome above, a colossal elder spider demon with obsidian chitin and a cluster of glowing red eyes descends on thick silk ropes."
    },
    action: "Colossal creature reveal. An enormous, monstrous spider demon with razor-jointed barbed legs and glistening black carapace descends from the vaulted ceiling, its central cluster of multifaceted ruby eyes burning with demonic hunger as pale venom drips from huge fangs.",
    caption: "Spawned in the forgotten pits beneath Valkash—Zor-Malkor, the living god of shadows.",
    dialogue: [],
    characters: ["demon_spider"],
    objects: [],
    focalSubject: "demon_spider",
    camera: {
      shotType: "Colossal Monster Reveal Shot",
      angle: "Extreme Low Worm's Eye View",
      lighting: "Sickly red eye glows, glistening obsidian chitin, shadowy vaulted ceiling"
    }
  },
  {
    panelId: 12,
    beat: {
      beat: 12,
      act: "Act II: The Webbed Vault",
      name: "The Merchant's Gloat",
      summary: "Lord Malakor stands behind the reinforced iron grate holding aloft the Blood-Ruby, mocking the trapped barbarian."
    },
    action: "Lord Malakor, fat merchant prince draped in emerald silk and gold chains, sneers in cruel triumph through the iron bars above, holding high the glowing Blood-Ruby of Sarkath as the spider looms over Korvath.",
    caption: "Civilized lords pay assassins with gold. Malakor paid his with living flesh.",
    dialogue: [
      {
        speaker: "Lord Malakor",
        text: "The ruby belongs to me, savage! Feed well on him, my beauty!"
      }
    ],
    characters: ["merchant_lord"],
    objects: ["blood_ruby"],
    focalSubject: "merchant_lord",
    camera: {
      shotType: "Balcony Mockery Shot",
      angle: "High-Angle Gaze Down",
      lighting: "Warm torchlight on sneering merchant face, ruby casting scarlet reflections"
    }
  },
  {
    panelId: 13,
    beat: {
      beat: 13,
      act: "Act II: The Webbed Vault",
      name: "Venom and Fire",
      summary: "The demon spider lunges with razor forelegs; Korvath sweeps an overturned torch against the webs, igniting a wall of flame."
    },
    action: "Violent combat clash. The spider demon's jagged barbed leg strikes downward, shattering an iron chest, while Korvath sweeps a roaring brass oil torch against the tangled webs, igniting a wall of blazing orange fire to shield Natari.",
    caption: "Iron, flame, and unyielding will—the barbarian answered horror with fury.",
    dialogue: [],
    characters: ["korvath", "demon_spider"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Dynamic Mid-Range Combat Clash",
      angle: "Low-Angle Diagonal Tracking Perspective",
      lighting: "Explosive wall of roaring orange flame illuminating the terrifying black spider bulk"
    }
  },

  // --- ACT III: THE SUNDER, ROOFTOP HEIST & MIDNIGHT ESCAPE (Panels 14-20) ---
  {
    panelId: 14,
    beat: {
      beat: 14,
      act: "Act III: The Sunder & Escape",
      name: "The Flaming Cleave",
      summary: "With broadsword blade coated in flaming oil, Korvath delivers a savage blow, severing two barbed spider limbs with a spray of black ichor."
    },
    action: "Peak action shot. Korvath swings his massive two-handed broadsword—its steel blade roaring with yellow fire—cleaving clean through two of the demon spider's armored jointed legs with a massive spray of hissing black ichor as the monster shrieks.",
    caption: "The iron gods give no gifts. A man carves his own way with steel.",
    dialogue: [
      {
        speaker: "Korvath",
        text: "Die, vermin! Back to the pit that spat you!"
      }
    ],
    characters: ["korvath", "demon_spider"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Dynamic Cleave Freeze-Frame",
      angle: "Dramatic Low Dutch Angle",
      lighting: "Roaring flaming sword blade illuminating Korvath's shredded bronze muscles and severed chitin"
    }
  },
  {
    panelId: 15,
    beat: {
      beat: 15,
      act: "Act III: The Sunder & Escape",
      name: "Natari's Retribution",
      summary: "Natari burns through her bonds, scales the balcony grate, and drives her dagger into Lord Malakor's chest, snatching back the Blood-Ruby."
    },
    action: "Heroic action shot. Natari, bronze scale bikini gleaming, leaps onto the upper iron balcony railing and drives her ornate dagger straight through Lord Malakor's heart, tearing the glowing Blood-Ruby of Sarkath from his limp dying fingers.",
    caption: "A desert rogue never forgets a debt. Especially one written in blood.",
    dialogue: [
      {
        speaker: "Natari",
        text: "The ruby was never yours, merchant dog!"
      }
    ],
    characters: ["natari", "merchant_lord"],
    objects: ["blood_ruby"],
    focalSubject: "natari",
    camera: {
      shotType: "Heroic Balcony Strike Shot",
      angle: "Medium Low-Angle Tilt",
      lighting: "Scarlet ruby glow and torchlight washing over Natari's fierce, sun-kissed face"
    }
  },
  {
    panelId: 16,
    beat: {
      beat: 16,
      act: "Act III: The Sunder & Escape",
      name: "The Abyssal Skull-Strike",
      summary: "Korvath leaps high from an iron chest, driving his broadsword downward between the spider demon's cluster of burning red eyes."
    },
    action: "Peak climax midair leap. Korvath leaps from a mountain of gold coins into midair, both scarred hands gripping his heavy broadsword overhead, plunging the massive iron blade straight down into the spider demon's armored skull between its burning cluster of ruby eyes amidst an explosion of black blood.",
    caption: "Even gods of the dark bleed when iron meets skull.",
    dialogue: [],
    characters: ["korvath", "demon_spider"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Peak Climax Midair Action Shot",
      angle: "Dramatic High-Impact Dutch Angle",
      lighting: "Blinding spark explosion, silhouetted muscular barbarian form against thrashing spider monster"
    }
  },
  {
    panelId: 17,
    beat: {
      beat: 17,
      act: "Act III: The Sunder & Escape",
      name: "Collapse of the Palace Vault",
      summary: "The dying spider demon thrashes in agony, crashing through the outer palace walls and bringing down the vaulted marble structure."
    },
    action: "Wide cataclysmic destruction. The dying spider monstrosity crashes through the palace's outer marble colonnade, tearing down pillars and balustrades as stone blocks and chests of gold cascade into the courtyard below.",
    caption: "The pride of Valkash crumbled into dust and broken bone.",
    dialogue: [],
    characters: ["demon_spider"],
    objects: [],
    focalSubject: "demon_spider",
    camera: {
      shotType: "Full Palace Catastrophe Wide Shot",
      angle: "High Dutch Angle",
      lighting: "Billowing dust clouds lit by moonbeams and flickering palace fires"
    }
  },
  {
    panelId: 18,
    beat: {
      beat: 18,
      act: "Act III: The Sunder & Escape",
      name: "The Leaping Escape",
      summary: "Korvath scoops up Natari and leaps from the collapsing balcony into the night air toward a passing hay wagon in the street below."
    },
    action: "High dynamic action leap. Amid tumbling marble debris, Korvath swings Natari into his arm and leaps from the shattered second-story palace balustrade into the midnight air toward an open merchant wagon in the cobblestone alley below.",
    caption: "A leap into the dark—trusting only strength and fortune.",
    dialogue: [
      {
        speaker: "Korvath",
        text: "Hold tight, girl!"
      },
      {
        speaker: "Natari",
        text: "I have the ruby!"
      }
    ],
    characters: ["korvath", "natari"],
    objects: ["broadsword", "blood_ruby"],
    focalSubject: "korvath",
    camera: {
      shotType: "Midair Escape Tracking Shot",
      angle: "Dramatic Downward Perspective",
      lighting: "Silhouetted figures against roaring palace fire, moonlit cobblestones below"
    }
  },
  {
    panelId: 19,
    beat: {
      beat: 19,
      act: "Act III: The Sunder & Escape",
      name: "Breaching the Southern Gate",
      summary: "Crashing through the city gates on stolen war horses, Korvath and Natari scatter the stunned city guards beneath the stars."
    },
    action: "Dynamic galloping action shot. Korvath and Natari, riding hard on two black desert stallions, charge straight through the splintered southern wooden gate of Valkash, broadsword swinging to scatter the panicked city guards into the night.",
    caption: "Behind them lay a burning palace, a dead merchant, and the wrath of an entire city.",
    dialogue: [],
    characters: ["korvath", "natari"],
    objects: ["broadsword"],
    focalSubject: "korvath",
    camera: {
      shotType: "Low-Angle Gallop Action Shot",
      angle: "Dynamic Ground-Level Tracking Angle",
      lighting: "Torch glare from gatehouse, flying sparks, starry night sky"
    }
  },
  {
    panelId: 20,
    beat: {
      beat: 20,
      act: "Act III: The Sunder & Escape",
      name: "Riders of the Midnight Dunes",
      summary: "Triumphant climax: Korvath and Natari rein in their stallions atop a high desert dune beneath a sea of stars, looking toward the open frontier."
    },
    action: "Epic panoramic hero shot. Korvath and Natari rein in their desert horses atop a towering windswept sand dune beneath a magnificent canopy of brilliant desert stars. Korvath rests his blood-notched broadsword on his shoulder, while Natari, stunning in her hammered bronze scale bikini, holds aloft the pulsing Blood-Ruby of Sarkath, both gazing into the boundless wild unknown.",
    caption: "The road was long, and the world was wide. But wherever men built thrones of gold and deceit, the barbarian would come to break them.",
    dialogue: [],
    characters: ["korvath", "natari"],
    objects: ["broadsword", "blood_ruby"],
    focalSubject: "korvath",
    camera: {
      shotType: "Epic Panoramic Moonlit Climax Shot",
      angle: "Low Heroic Upward Perspective",
      lighting: "Cool silver starlight washing over bronze skin, brilliant crimson pulse from the Blood-Ruby, endless sand dune horizon"
    }
  }
];

// Build full prompt strings for each panel (with native in-image comic lettering!)
PANELS_EPISODE_02.forEach(p => {
  let promptParts = [
    BASE_STYLE,
    p.camera.shotType,
    p.camera.angle,
    p.camera.lighting,
    p.action
  ];

  p.characters.forEach(c => {
    if (charPrompts[c]) promptParts.push(charPrompts[c]);
  });

  p.objects.forEach(o => {
    if (objPrompts[o]) promptParts.push(objPrompts[o]);
  });

  // Native In-Image Comic Lettering Injection
  if (p.caption) {
    promptParts.push(`At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "${p.caption}"`);
  }
  if (p.dialogue && p.dialogue.length > 0) {
    p.dialogue.forEach(d => {
      promptParts.push(`Include an authentic white comic book speech balloon with black ink outline and directional pointer pointing toward ${d.speaker} with the text: "${d.text}"`);
    });
  }

  p.prompt = promptParts.join(', ');
  p.avoidTokens = AVOID;
  p.status = 'pending_render';
});

// Save to 01_Script/episodes/episode_02.json and active storyboard.json
const ep2Path = path.join(__dirname, '..', '01_Script', 'episodes', 'episode_02.json');
const activeSbPath = path.join(__dirname, '..', '01_Script', 'storyboard.json');

fs.mkdirSync(path.dirname(ep2Path), { recursive: true });
fs.writeFileSync(ep2Path, JSON.stringify(PANELS_EPISODE_02, null, 2), 'utf8');
fs.writeFileSync(activeSbPath, JSON.stringify(PANELS_EPISODE_02, null, 2), 'utf8');

console.log(`✅ Episode 2 Storyboard created: Exactly ${PANELS_EPISODE_02.length} panels compiled! -> ${ep2Path}`);

