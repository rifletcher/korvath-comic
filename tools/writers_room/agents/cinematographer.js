/**
 * Agent 4: Cinematographer & Visual Director
 * Enforces Frank Frazetta / John Buscema graphic novel visual framing, chiaroscuro lighting, and dynamic angles.
 */

const CAMERA_SETTINGS = {
  1: {
    shotType: "Ultra-Wide Panoramic Establishing Shot",
    angle: "Low Horizon-Level View",
    lighting: "Blood-orange setting sun casting long razor shadows across crimson dunes"
  },
  2: {
    shotType: "Medium Kneeling Hero Shot",
    angle: "Three-Quarter Low Ground Perspective",
    lighting: "Harsh rim-lighting on muscular shoulders, dusty golden desert haze"
  },
  3: {
    shotType: "Low-Angle Entrance Shot",
    angle: "Dramatic upward tilt looking into the crypt portal",
    lighting: "Harsh flickering orange torchlight carving deep chiaroscuro ink shadows against black basalt"
  },
  4: {
    shotType: "Long Corridor Tracking Shot",
    angle: "Deep vanishing-point perspective",
    lighting: "Flickering amber torchlight against cavernous velvet blackness"
  },
  5: {
    shotType: "Dynamic Three-Shot Composition",
    angle: "High Dutch Angle (Tension & Surprise)",
    lighting: "Gleaming bronze reflections on cobra masks, deep shadow pockets between granite columns"
  },
  6: {
    shotType: "Dynamic Action Freeze-Frame",
    angle: "Low-Angle Diagonal Tracking Perspective",
    lighting: "Stark theatrical spotlighting, high-contrast ink cross-hatching, flying bronze splinters and blood droplets"
  },
  7: {
    shotType: "Wide Cavern High-Angle View",
    angle: "Down-tilt looking over temple dais",
    lighting: "Warm flickering brazier fire mixed with eerie green luminescence, heavy incense haze"
  },
  8: {
    shotType: "Medium Close Heroine Portrait",
    angle: "Low-Angle Dutch Tilt",
    lighting: "Gleaming bronze reflections on scale bikini, warm amber rim lighting on sun-kissed shoulders"
  },
  9: {
    shotType: "Wide Ritual Colonnade View",
    angle: "Elevated Altar Perspective",
    lighting: "Sickly emerald sorcerous glow emanating from stone brazier, deep void darkness above"
  },
  10: {
    shotType: "Dynamic Low-Angle Impact Shot",
    angle: "Dynamic Upward Diagonal Tilt",
    lighting: "Explosion of bright orange fire and flying sparks clashing against emerald sorcerous haze"
  },
  11: {
    shotType: "Colossal Creature Reveal Shot",
    angle: "Extreme Low Ground-Level Worm's Eye View",
    lighting: "Iridescent scales shimmering with sickly green luminescence, twin ruby eye glows"
  },
  12: {
    shotType: "Wide Cataclysmic Destruction Shot",
    angle: "Dutch Angle Ground Level",
    lighting: "Falling debris, billowing dust clouds lit by flickering brazier coals and green mystic flame"
  },
  13: {
    shotType: "Dramatic Lethal Strike Shot",
    angle: "Mid-Level Tracking Angle",
    lighting: "Harsh chiaroscuro silhouette, bloody impact highlighted by flickering green flame"
  },
  14: {
    shotType: "Tight Chiaroscuro Hero Portrait",
    angle: "Straight-on Intimate Confrontation Angle",
    lighting: "Split lighting: half face illuminated by green eldritch flame, half swallowed in pure black ink"
  },
  15: {
    shotType: "Dynamic Low-Angle Action Evasion",
    angle: "Floor-Level Tracking Angle",
    lighting: "Sizzling venom clouds illuminated by sorcerous glow, heavy shadows under serpent belly"
  },
  16: {
    shotType: "Peak Climax Midair Action Shot",
    angle: "Dramatic Dynamic Dutch Angle",
    lighting: "Blinding flash of impact spark, silhouetted muscular barbarian form against dark serpent bulk"
  },
  17: {
    shotType: "Full Catastrophe Wide Shot",
    angle: "High Dutch Angle",
    lighting: "Thick dust obscuring dying green flame, dramatic shafts of sunlight piercing cracked ceiling"
  },
  18: {
    shotType: "Medium Dynamic Hero Duo Shot",
    angle: "Low-Angle Tracking View",
    lighting: "Flickering amber fire and ruby glow lighting their muscular, bronze-clad bodies"
  },
  19: {
    shotType: "Exterior Action Breakthrough Shot",
    angle: "Dynamic Ground-Level Tracking Angle",
    lighting: "Blinding white desert sunlight clashing against billowing black smoke plumes erupting from the tomb"
  },
  20: {
    shotType: "Epic Panoramic Sunset/Sunrise Hero Shot",
    angle: "Low Heroic Upward Perspective",
    lighting: "Warm golden dawn sunlight washing over their bronze sun-kissed skin and glittering scale armor, long dramatic shadows across the red dunes"
  }
};

function directVisuals(scriptPanels) {
  console.log("🎥 [Agent 4: Cinematographer] Applying Frank Frazetta & John Buscema visual framing...");

  return scriptPanels.map(p => {
    const cam = CAMERA_SETTINGS[p.panelId] || {
      shotType: "Cinematic Graphic Novel Panel",
      angle: "Dynamic Low-Angle",
      lighting: "Dramatic high-contrast chiaroscuro lighting"
    };

    return {
      ...p,
      camera: cam
    };
  });
}

module.exports = { directVisuals, CAMERA_SETTINGS };
