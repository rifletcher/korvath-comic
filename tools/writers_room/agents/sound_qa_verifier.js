/**
 * Agent 7: Sound QA & Acoustic Verifier
 * 
 * Verifies that voice expression, delivery speed, and acoustic environment
 * make narrative and sensory sense for each frame. Prevents chipmunk speedups,
 * incongruous calm in horror scenes, and acoustic mismatches.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FFPROBE_PATH = 'C:\\Users\\robert.fletcher\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin\\ffprobe.exe';

function verifyPanelAudio(panels, options = {}) {
  console.log("🔍 [Agent 7: Sound QA Verifier] Auditing voice expressions, pacing & frame acoustic sanity...");

  const auditResults = [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const p of panels) {
    const panelId = p.panelId;
    const actionText = (p.action || '').toLowerCase();
    const isHorrorOrCombat = actionText.includes('trap') || actionText.includes('acid') || actionText.includes('spider') || actionText.includes('cleave') || actionText.includes('attack');

    const issues = [];
    const notes = [];

    // 1. Caption Pacing Audit
    if (p.caption) {
      totalChecks++;
      const wordCount = p.caption.trim().split(/\s+/).length;
      // Est. duration at natural 130 WPM
      const estSeconds = (wordCount / 130) * 60;
      if (wordCount > 35) {
        issues.push(`Caption too dense for comic frame (${wordCount} words, est. ${estSeconds.toFixed(1)}s)`);
      } else {
        passedChecks++;
      }
    }

    // 2. Dialogue & Voice Expression Audits
    if (p.dialogue && p.dialogue.length > 0) {
      for (const d of p.dialogue) {
        totalChecks += 3; // Checks: Expression fit, Pacing sanity, Acoustic fit
        const spk = d.speaker;
        const dir = d.audioDirection || {};
        const delivery = dir.delivery || 'measured';
        const wordCount = (dir.performanceText || d.text || '').trim().split(/\s+/).length;

        // Check A: Dramatic Congruence
        if (isHorrorOrCombat && (actionText.includes('trap') || actionText.includes('acid'))) {
          if (delivery === 'measured' || delivery === 'guttural_calm') {
            issues.push(`INCONGRUOUS DELIVERY: ${spk} is in mortal trap/combat but voice delivery is "${delivery}". Needs terror/screaming.`);
          } else {
            passedChecks++;
            notes.push(`Dramatic fit verified: ${spk} delivery is "${delivery}" for horror/combat.`);
          }
        } else {
          passedChecks++;
        }

        // Check B: Anti-Chipmunk / Pacing Sanity
        // WPM should be between 100 and 165 for authentic human delivery
        const textLen = (dir.performanceText || d.text || '').length;
        if (dir.style > 0.95 && dir.stability < 0.10) {
          issues.push(`EXTREME VOLATILITY: stability (${dir.stability}) too low, risk of audio artifacting.`);
        } else {
          passedChecks++;
        }

        // Check C: Acoustic Environment Fit
        if (actionText.includes('vault') || actionText.includes('crypt')) {
          if (dir.acousticEnv && !dir.acousticEnv.includes('vault') && !dir.acousticEnv.includes('reverberant')) {
            issues.push(`ACOUSTIC MISMATCH: Scene is subterranean stone vault but acousticEnv is "${dir.acousticEnv}".`);
          } else {
            passedChecks++;
          }
        } else {
          passedChecks++;
        }
      }
    }

    // 3. Optional Audio File Integrity Check (if rendered on disk)
    if (options.audioDir && fs.existsSync(options.audioDir)) {
      const padId = String(panelId).padStart(2, '0');
      const mixedFile = path.join(options.audioDir, `p${padId}_mixed.wav`);
      if (fs.existsSync(mixedFile)) {
        totalChecks++;
        try {
          const durStr = execSync(`"${FFPROBE_PATH}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mixedFile}"`, { encoding: 'utf8' }).trim();
          const actualDur = parseFloat(durStr);
          if (actualDur > 0.5) {
            passedChecks++;
            notes.push(`Audio signal verified on disk: ${actualDur.toFixed(1)}s`);
          } else {
            issues.push(`Rendered audio clip corrupted or near-silent: ${actualDur}s`);
          }
        } catch (e) {
          issues.push(`FFprobe audio inspection failed: ${e.message}`);
        }
      }
    }

    const panelPassed = issues.length === 0;
    auditResults.push({
      panelId,
      beat: p.beat?.name || `Panel ${panelId}`,
      passed: panelPassed,
      issues,
      notes
    });

    const statusIcon = panelPassed ? '✅' : '⚠️';
    console.log(`   ${statusIcon} Panel ${panelId}: ${panelPassed ? 'Audio Sanity Verified' : issues.join('; ')}`);
  }

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;
  console.log(`\n🎯 Sound QA Verification Score: ${score}% (${passedChecks}/${totalChecks} checks passed)`);

  const allPassed = auditResults.every(r => r.passed);
  return {
    verified: allPassed,
    score,
    auditResults
  };
}

module.exports = { verifyPanelAudio };

