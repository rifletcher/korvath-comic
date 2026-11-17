const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { inspectPanelImageWithGemini, refinePromptWithGemini } = require('../../ai_director');
const { renderPanelWithProvider, getPromptSentForEngine } = require('../providers');
const { ensureWardrobeDnaInPrompt } = require('../../lib/character_dna');

/**
 * Runs 1-to-2 attempts of rendering + 8-Point Visual Director QA.
 * Saves every rendered image into `panels/candidates/` and emits `panel_candidate_saved`.
 * If Attempt 2 still fails QA, marks `NEEDS_REVIEW` (with failed rubric points & fixInstruction)
 * instead of blocking/crashing the queue.
 */
async function renderAndInspectPanel(ctx) {
  const {
    rootDir,
    projectId,
    episodeId,
    panelId,
    panel,
    previousPanel,
    project,
    manifest,
    manifestPath,
    activeEngine,
    initialPrompt,
    refinementTrace: initialTrace,
    readJsonWithRetry,
    updateManifestLocked,
    invalidateGatesFrom,
    emitEvent,
    managedByGo
  } = ctx;

  let targetPrompt = ensureWardrobeDnaInPrompt(initialPrompt, panel, project, rootDir);
  let refinementTrace = initialTrace;
  const pad = String(panelId).padStart(2, '0');
  const projectPanelRel = `projects/${projectId}/episodes/${episodeId}/panels/panel_${pad}.webp`;
  const outPath = path.join(rootDir, projectPanelRel);
  const candidatesDirRel = `projects/${projectId}/episodes/${episodeId}/panels/candidates`;
  const candidatesDirAbs = path.join(rootDir, candidatesDirRel);

  let lastResult = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let downloadedBuf = null;
    let referenceSheets = [];
    let museWording = [];
    let generatorPromptSent = getPromptSentForEngine(activeEngine, targetPrompt);

    try {
      const rendered = await renderPanelWithProvider(activeEngine, targetPrompt, {
        projectId,
        episodeId,
        panelId,
        manifest,
        manifestPath,
        emitEvent,
        updateManifestLocked: managedByGo ? null : updateManifestLocked,
        panel
      });
      downloadedBuf = rendered.buffer;
      generatorPromptSent = rendered.promptSent;
      referenceSheets = rendered.referenceSheets || [];
      museWording = rendered.museWording || [];
    } catch (err) {
      if (!managedByGo && typeof updateManifestLocked === 'function') {
        const existingAbs = panel.imagePath ? path.join(rootDir, panel.imagePath) : '';
        const hasExistingValidImage = existingAbs && fs.existsSync(existingAbs) && fs.statSync(existingAbs).size > 1024;
        updateManifestLocked(manifestPath, (latest) => {
          const lp = (latest.panels || []).find(x => Number(x.panelId) === Number(panelId));
          if (lp) {
            lp.imageStatus = hasExistingValidImage ? 'VERIFIED' : 'FAILED';
            lp.error = err.message;
          }
        });
      }
      emitEvent('panel_failed', {
        projectId,
        episodeId,
        panelId: Number(panelId),
        engine: activeEngine,
        promptSent: generatorPromptSent,
        refinementTrace,
        error: err.message
      });
      throw err;
    }

    const hash = crypto.createHash('md5').update(downloadedBuf).digest('hex').slice(0, 8);
    const sizeKB = Math.round((downloadedBuf.length / 1024) * 10) / 10;

    // Save candidate copy so A/B model comparison never loses an earlier good image
    const safeEngine = activeEngine.replace(/[^a-z0-9_-]/gi, '_');
    const candFileName = `panel_${pad}_${safeEngine}_${hash}.webp`;
    const candRel = `${candidatesDirRel}/${candFileName}`;
    const candAbs = path.join(candidatesDirAbs, candFileName);
    fs.mkdirSync(candidatesDirAbs, { recursive: true });
    fs.writeFileSync(candAbs, downloadedBuf);

    // Also write active panel path
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, downloadedBuf);


    // Guard against duplicate of another panel's image in the same episode
    const latestBeforeSave = readJsonWithRetry(manifestPath);
    const dupPanel = (latestBeforeSave.panels || []).find(
      x => Number(x.panelId) !== Number(panelId) && x.hash && x.hash.toLowerCase() === hash.toLowerCase()
    );
    if (dupPanel) {
      const dupErr = `Duplicate image detected (hash ${hash} matches Panel #${dupPanel.panelId}) — marking FAILED so it can be re-rendered cleanly.`;
      if (!managedByGo && typeof updateManifestLocked === 'function') {
        updateManifestLocked(manifestPath, (latest) => {
          const lp = (latest.panels || []).find(x => Number(x.panelId) === Number(panelId));
          if (lp) {
            lp.imageStatus = 'FAILED';
            lp.error = dupErr;
          }
        });
      }
      emitEvent('panel_failed', {
        projectId,
        episodeId,
        panelId: Number(panelId),
        engine: activeEngine,
        promptSent: generatorPromptSent,
        refinementTrace,
        error: dupErr
      });
      throw new Error(dupErr);
    }

    emitEvent('panel_progress', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      status: 'VISUAL_QA_INSPECTING',
      engine: activeEngine,
      message: `[AI Visual Director] Inspecting Panel #${panelId} (attempt ${attempt}/2) against 8-Point QA & script...`
    });

    // Keep image attachments <= 2 (current + previousPanel) so agy.exe finishes reliably
    const qa = await inspectPanelImageWithGemini(outPath, panel, project, { previousPanel, sheetPaths: [] });
    const candId = `${safeEngine}-${hash}`;

    emitEvent('panel_candidate_saved', {
      projectId,
      episodeId,
      panelId: Number(panelId),
      candidateId: candId,
      imagePath: candRel,
      hash,
      sizeKB,
      engine: activeEngine,
      promptSent: generatorPromptSent || targetPrompt,
      referenceSheets,
      museWording,
      qaPassed: Boolean(qa.passed),
      qaScore: Number(qa.score) || 0,
      qaSummary: qa.summary || '',
      qaFixInstruction: qa.fixInstruction || ''
    });

    lastResult = {
      qa,
      hash,
      sizeKB,
      generatorPromptSent,
      targetPrompt
    };

    if (qa.passed) {
      break;
    }

    if (attempt === 1) {
      emitEvent('panel_progress', {
        projectId,
        episodeId,
        panelId: Number(panelId),
        status: 'VISUAL_QA_RETRY',
        engine: activeEngine,
        message: `[AI Visual Director] Panel #${panelId} failed QA (${qa.summary}) — refining prompt & re-rendering (attempt 2/2)...`
      });
      try {
        let retryTrace = null;
        const refinedPrompt = await refinePromptWithGemini(
          targetPrompt,
          qa.fixInstruction || qa.summary,
          {
            engine: activeEngine,
            invariants: project.invariants || [],
            screenshotPath: outPath,
            onTrace: (t) => { retryTrace = t; }
          }
        );
        if (typeof refinedPrompt === 'string' && refinedPrompt.trim()) {
          targetPrompt = refinedPrompt.trim();
          panel.prompt = targetPrompt;
          if (!refinementTrace) refinementTrace = retryTrace;
        }
      } catch (_) {}
    } else {
      // Attempt 2 still failed: non-blocking NEEDS_REVIEW so queue moves cleanly to the next panel
      const reviewMsg = `Needs Review (QA ${qa.score || 0}/10): ${qa.summary}`;
      if (!managedByGo && typeof updateManifestLocked === 'function') {
        updateManifestLocked(manifestPath, (latest) => {
          const lp = (latest.panels || []).find(x => Number(x.panelId) === Number(panelId));
          if (lp) {
            lp.imageStatus = 'NEEDS_REVIEW';
            lp.imagePath = projectPanelRel;
            lp.webPreviewUrl = projectPanelRel;
            lp.hash = hash;
            lp.sizeKB = sizeKB;
            lp.imageEngine = activeEngine;
            lp.prompt = targetPrompt;
            lp.error = reviewMsg;
            lp.qaNotes = qa.summary;
            lp.qaScore = Number(qa.score) || 0;
            lp.qaFixInstruction = qa.fixInstruction || '';
          }
          invalidateGatesFrom(latest, 'VISUAL_QA_GATE', `Panel #${panelId} flagged NEEDS_REVIEW by Visual Director`);
        });
      }

      emitEvent('panel_needs_review', {
        projectId,
        episodeId,
        panelId: Number(panelId),
        engine: activeEngine,
        status: 'NEEDS_REVIEW',
        hash,
        sizeKB,
        imagePath: projectPanelRel,
        promptSent: generatorPromptSent,
        refinementTrace,
        qaReport: qa,
        error: reviewMsg,
        message: `[AI Visual Director] Panel #${panelId} saved as NEEDS_REVIEW — ${qa.summary}`
      });

      return { status: 'NEEDS_REVIEW', imagePath: projectPanelRel, hash, sizeKB, qaReport: qa };
    }
  }

  const { qa, hash, sizeKB, generatorPromptSent } = lastResult;
  const qaSummary = qa ? qa.summary : '';

  if (!managedByGo && typeof updateManifestLocked === 'function') {
    updateManifestLocked(manifestPath, (latest) => {
      const lp = (latest.panels || []).find(x => Number(x.panelId) === Number(panelId));
      if (lp) {
        lp.imageStatus = 'VERIFIED';
        lp.imagePath = projectPanelRel;
        lp.webPreviewUrl = projectPanelRel;
        lp.hash = hash;
        lp.sizeKB = sizeKB;
        lp.imageEngine = activeEngine;
        lp.prompt = targetPrompt;
        lp.error = '';
        lp.qaNotes = qaSummary;
        lp.qaScore = Number(qa && qa.score) || 8;
        lp.qaFixInstruction = '';
      }
      invalidateGatesFrom(latest, 'VISUAL_QA_GATE', `Panel #${panelId} rendered & verified — awaiting visual director re-inspection`);
    });
  }

  emitEvent('panel_complete', {
    projectId,
    episodeId,
    panelId: Number(panelId),
    engine: activeEngine,
    status: 'VERIFIED',
    hash,
    sizeKB,
    imagePath: projectPanelRel,
    promptSent: generatorPromptSent,
    refinementTrace,
    qaReport: qa,
    responseReceived: {
      engine: activeEngine,
      status: 'VERIFIED',
      imagePath: projectPanelRel,
      hash,
      sizeKB,
      qaReport: qa
    }
  });

  return { status: 'VERIFIED', imagePath: projectPanelRel, hash, sizeKB, qaReport: qa };
}

module.exports = {
  renderAndInspectPanel
};

