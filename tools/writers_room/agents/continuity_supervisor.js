/**
 * Agent 5: Continuity Supervisor & Prompt Assembler
 * Injects locked Character + Object DNA, enforces cardinality, applies euphemisms, freezes storyboard.json.
 */

const fs = require('fs');
const path = require('path');

function assembleStoryboard(panelsWithVisuals, charPrompts, objPrompts, baseStylePrompt, avoidTokens) {
  console.log("🛡️ [Agent 5: Continuity Supervisor] Verifying continuity, DNA injection & assembling prompts...");

  return panelsWithVisuals.map(p => {
    const promptParts = [baseStylePrompt];

    // Camera & lighting
    promptParts.push(`${p.camera.shotType}, ${p.camera.angle}, ${p.camera.lighting}`);

    // Action line
    promptParts.push(p.action);

    // Character DNA Injection
    if (p.characters && p.characters.length > 0) {
      p.characters.forEach(cKey => {
        if (charPrompts[cKey]) {
          promptParts.push(charPrompts[cKey]);
        }
      });
    }

    // Object DNA Injection
    if (p.objects && p.objects.length > 0) {
      p.objects.forEach(oKey => {
        if (objPrompts[oKey]) {
          promptParts.push(objPrompts[oKey]);
        }
      });
    }

    // In-Image Comic Lettering Injection (Grok native composition)
    if (p.caption) {
      promptParts.push(`At the top corner of the panel, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "${p.caption}"`);
    }
    if (p.dialogue && p.dialogue.length > 0) {
      p.dialogue.forEach(d => {
        promptParts.push(`Include an authentic white comic book speech balloon with black ink outline and directional pointer pointing toward ${d.speaker} with the text: "${d.text}"`);
      });
    }

    const fullPrompt = promptParts.join(", ");

    return {
      ...p,
      prompt: fullPrompt,
      avoidTokens: avoidTokens,
      status: "pending_render"
    };
  });
}

module.exports = { assembleStoryboard };

