const fs = require('fs');
const path = require('path');

function auditEpisode(epNum) {
  const file = path.join(__dirname, '..', '01_Script', 'episodes', `episode_${String(epNum).padStart(2, '0')}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Episode file not found: ${file}`);
    process.exit(1);
  }

  const ep = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(ep) ? ep : Object.values(ep);

  console.log(`\n======================================================`);
  console.log(`🔍 VISUAL DIRECTOR CONTINUITY AUDIT: EPISODE ${epNum}`);
  console.log(`Total Panels: ${list.length}`);
  console.log(`======================================================\n`);

  let failures = 0;
  let warnings = 0;

  list.forEach((p, idx) => {
    const id = p.panelId || (idx + 1);
    const prompt = p.prompt || '';
    const chars = p.characters || [];
    const hasKorvath = chars.includes('korvath') || /korvath,\s*towering/i.test(prompt);

    const issues = [];

    if (hasKorvath) {
      // 1. Wardrobe & Cape/Mantle Check
      const hasMantle = /wolf-fur mantle|fur mantle|ragged shaggy wolf-fur/i.test(prompt);
      const hasHarness = /cross-chest harness|chest harness/i.test(prompt);
      const hasKilt = /war kilt|loincloth/i.test(prompt);
      const hasBoots = /combat boots/i.test(prompt);

      if (!hasMantle) issues.push('❌ WARDROBE: Missing heavy wolf-fur mantle / cape anchor');
      if (!hasHarness) issues.push('⚠️ WARDROBE: Missing leather harness specification');
      if (!hasKilt) issues.push('⚠️ WARDROBE: Missing war kilt / loincloth specification');
      if (!hasBoots) issues.push('⚠️ WARDROBE: Missing boots specification');

      // 2. Facial & Anatomy Negative Constraints
      const hasApeGuard = /NO Neanderthal ape brow/i.test(prompt);
      const hasBangsGuard = /NO jagged bangs/i.test(prompt);
      const hasNormalFace = /normal human facial anatomy/i.test(prompt);

      if (!hasApeGuard || !hasBangsGuard || !hasNormalFace) {
        issues.push('❌ FACIAL DNA: Missing anti-ape-brow / normal facial anatomy negative constraints');
      }

      // 3. Broadsword Consistency (if sword in scene)
      if (/sword|blade|iron/i.test(prompt)) {
        const hasStraight = /straight double-edged|straight blade|straight iron broadsword/i.test(prompt);
        const hasFuller = /central.*fuller/i.test(prompt);
        const hasCrossguard = /crossguard/i.test(prompt);
        if (!hasStraight) issues.push('⚠️ OBJECT: Broadsword missing "straight double-edged" descriptor (risk of curve drift)');
        if (!hasFuller) issues.push('⚠️ OBJECT: Broadsword missing "central fuller" descriptor');
        if (!hasCrossguard) issues.push('⚠️ OBJECT: Broadsword missing crossguard specification');
      }
    }

    // 4. Carried Relic Consistency (Blood-Ruby)
    if (/\bthe blood-ruby\b/i.test(prompt)) {
      const hasClawSetting = /talon|claw|serpent talon/i.test(prompt);
      if (!hasClawSetting) {
        issues.push('⚠️ RELIC: Blood-Ruby mentioned without specifying serpent talon claw setting');
      }
    }

    // 5. Anti-Ghost Constraint for Multi-Character Scenes
    if (/burst.*through|escape|running|burst side-by-side/i.test(prompt) && /natari/i.test(prompt)) {
      const hasGhostGuard = /strictly two people|no other background|no background figures/i.test(prompt);
      if (!hasGhostGuard) {
        issues.push('⚠️ GHOST ACTOR: Missing multi-character anti-ghost/duplicate guard');
      }
    }

    if (issues.length > 0) {
      console.log(`Panel #${id} ("${p.beat?.name || 'Scene'}"):`);
      issues.forEach(iss => {
        console.log(`   ${iss}`);
        if (iss.startsWith('❌')) failures++;
        else warnings++;
      });
      console.log('');
    }
  });

  console.log(`------------------------------------------------------`);
  if (failures === 0 && warnings === 0) {
    console.log(`🎉 100% AUDIT PASS: All panels adhere strictly to wardrobe, object, and anatomical continuity!`);
  } else {
    console.log(`Audit Finished: ${failures} Hard Failures, ${warnings} Warnings detected.`);
  }
  console.log(`------------------------------------------------------\n`);

  return { failures, warnings };
}

const epNum = parseInt(process.argv[2] || '1', 10);
auditEpisode(epNum);
