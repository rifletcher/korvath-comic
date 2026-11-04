/**
 * Agent 6: Voice Director (Audio Expression & Performance Architect)
 * 
 * Analyzes narrative action, cinematographer framing, and character psychological state
 * to author emotional performance cues, actor prompt formatting, and acoustic staging.
 */

function directVoicePerformances(panels) {
  console.log("🎙️ [Agent 6: Voice Director] Scoring emotional intensity & authoring performance cues...");

  return panels.map(p => {
    // Determine acoustic environment from cinematographer lighting / setting
    let acousticEnv = 'dry_exterior';
    const actionText = (p.action || '').toLowerCase();
    const lightingText = (p.camera?.lighting || '').toLowerCase();

    if (actionText.includes('vault') || actionText.includes('crypt') || actionText.includes('tomb') || actionText.includes('cave')) {
      acousticEnv = 'stone_vault_reverberant';
    } else if (actionText.includes('tavern') || actionText.includes('interior') || actionText.includes('alcove')) {
      acousticEnv = 'cramped_tavern_warm';
    } else if (actionText.includes('rooftop') || actionText.includes('balcony') || actionText.includes('chasm') || actionText.includes('dunes')) {
      acousticEnv = 'windy_exterior_open';
    }

    // Direct each dialogue line
    const directedDialogue = (p.dialogue || []).map(d => {
      const spk = (d.speaker || '').toLowerCase();
      const txt = (d.text || '').trim();
      const isCombat = actionText.includes('strike') || actionText.includes('cleave') || actionText.includes('attack') || actionText.includes('trap') || actionText.includes('spider');

      let delivery = 'measured';
      let emotion = 'steady';
      let performanceText = txt;
      let stability = 0.50;
      let style = 0.50;
      let sfxTriggers = [];

      // --- Natari ---
      if (spk.includes('natari')) {
        if (actionText.includes('trap') || txt.toLowerCase().includes('acid') || txt.toLowerCase().includes('burn') || txt.toLowerCase().includes('webs')) {
          delivery = 'screaming_terror';
          emotion = 'mortal_panic';
          performanceText = "Korvath! It's a trap! The webs... they burn like acid! No, get them off me! GET THEM OFF ME! AAAAAAAHHH!";
          stability = 0.18;
          style = 0.90;
          sfxTriggers = ['acid_sizzle', 'vault_slam'];
        } else if (actionText.includes('spider') || txt.toLowerCase().includes('above us') || isCombat) {
          delivery = 'panicked_shout';
          emotion = 'terror';
          performanceText = "Look out, Korvath! Above us! It's on me! Ahhh!";
          stability = 0.22;
          style = 0.85;
          sfxTriggers = ['spider_hiss'];
        } else if (actionText.includes('leap') || txt.toLowerCase().includes('jump')) {
          delivery = 'adrenaline_shout';
          emotion = 'fierce_triumph';
          performanceText = "I have the ruby! Jump, Korvath, jump!";
          stability = 0.35;
          style = 0.70;
          sfxTriggers = ['chasm_wind'];
        } else {
          delivery = 'sensual_streetwise';
          emotion = 'cunning_cautious';
          stability = 0.55;
          style = 0.45;
        }
      }

      // --- Korvath ---
      else if (spk.includes('korvath')) {
        if (actionText.includes('cleave') || txt.toLowerCase().includes('die') || txt.toLowerCase().includes('pit')) {
          delivery = 'berserker_roar';
          emotion = 'battle_rage';
          performanceText = "Die, vermin! Back to the pit that spat you!";
          stability = 0.25;
          style = 0.80;
          sfxTriggers = ['sword_cleave'];
        } else if (actionText.includes('torch') || txt.toLowerCase().includes('fire')) {
          delivery = 'warrior_shout';
          emotion = 'defiant_fury';
          performanceText = "Taste Crom's fire, beast!";
          stability = 0.30;
          style = 0.75;
          sfxTriggers = ['torch_whoosh'];
        } else if (txt.toLowerCase().includes('copper') || txt.toLowerCase().includes('tongue')) {
          delivery = 'lethal_threat';
          emotion = 'cold_contempt';
          performanceText = "Offer me copper for blood again, dog... and I will feed you your own tongue.";
          stability = 0.65;
          style = 0.40;
        } else if (actionText.includes('leap') || txt.toLowerCase().includes('hold tight')) {
          delivery = 'commanding_shout';
          emotion = 'urgency';
          performanceText = "Hold tight, girl! Jump!";
          stability = 0.35;
          style = 0.70;
          sfxTriggers = ['chasm_wind'];
        } else {
          delivery = 'guttural_calm';
          emotion = 'brooding_danger';
          stability = 0.60;
          style = 0.45;
        }
      }

      // --- Lord Malakor ---
      else if (spk.includes('malakor')) {
        delivery = 'aristocratic_gloating';
        emotion = 'cruel_mockery';
        stability = 0.38;
        style = 0.70;
      }

      // --- Assassin ---
      else if (spk.includes('assassin')) {
        delivery = 'venomous_hiss';
        emotion = 'fanatic_ambush';
        stability = 0.35;
        style = 0.65;
      }

      return {
        ...d,
        audioDirection: {
          delivery,
          emotion,
          performanceText,
          stability,
          style,
          acousticEnv,
          sfxTriggers
        }
      };
    });

    return {
      ...p,
      acousticEnv,
      dialogue: directedDialogue
    };
  });
}

module.exports = { directVoicePerformances };

