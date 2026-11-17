// Modular Visual Panel Controls: Per-Panel Model Selector, Candidate History, NEEDS_REVIEW & Queue Controls
window.SUPPORTED_IMAGE_MODELS = [
  { id: 'meta-ai-cdp', label: 'Meta AI (Chrome CDP)' },
  { id: 'meta-muse-image', label: 'Meta Muse Image (fal API)' },
  { id: 'grok-imagine-image-2-0', label: 'Grok Imagine 2.0 (API)' },
  { id: 'flux-2-pro', label: 'Flux 2 Pro (API)' },
  { id: 'recraft-v4', label: 'Recraft v4 (API)' },
  { id: 'lustify-v8', label: 'Lustify v8 (API)' }
];

window.renderModelSelectorHtml = function (projectId, episodeId, panel, fallbackEngine) {
  const current = (panel.imageEngine || fallbackEngine || 'meta-ai-cdp').toLowerCase();
  const opts = window.SUPPORTED_IMAGE_MODELS.map(m =>
    `<option value="${m.id}" ${current === m.id ? 'selected' : ''}>${m.label}</option>`
  ).join('');
  return `
    <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
      <label style="font-size:11px; color:var(--text-muted); font-weight:600; white-space:nowrap;">Model:</label>
      <select id="model-${projectId}-${episodeId}-${panel.panelId}" style="flex:1; background:#141824; border:1px solid var(--border); color:#e2e8f0; font-size:11px; padding:4px 8px; border-radius:4px;">
        ${opts}
      </select>
    </div>
  `;
};

window.renderNeedsReviewBannerHtml = function (projectId, episodeId, panel) {
  if ((panel.imageStatus || '').toUpperCase() !== 'NEEDS_REVIEW') return '';
  const scoreBadge = panel.qaScore ? ` (${panel.qaScore}/10)` : '';
  return `
    <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.45); color:#fde68a; font-size:11px; padding:8px; border-radius:6px; margin-top:6px;">
      <div style="font-weight:700; margin-bottom:4px;">⚠️ AI Director Flagged Needs Review${scoreBadge}</div>
      <div style="margin-bottom:6px; color:#fef3c7;">${escapeHtml(panel.qaNotes || panel.error || 'Visual QA flagged an issue.')}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn-gold" style="padding:5px 10px; font-size:11px;" onclick="applyDirectorFixAndRerender('${projectId}', '${episodeId}', ${panel.panelId})">
          ✨ Apply Director Fix & Re-render
        </button>
        <button class="btn-subtle" style="padding:5px 10px; font-size:11px; border-color:#10b981; color:#6ee7b7;" onclick="acceptPanelReview('${projectId}', '${episodeId}', ${panel.panelId})">
          ✅ Accept Image Anyway
        </button>
      </div>
    </div>
  `;
};

window.renderCandidatesStripHtml = function (projectId, episodeId, panel) {
  const cands = Array.isArray(panel.candidates) ? panel.candidates : [];
  // Muse renders: show which character sheets and word swaps produced the current image
  const cur = cands.find(c => c.hash && panel.hash && c.hash === panel.hash);
  let museNote = '';
  if (cur && (cur.engine === 'meta-muse-image') && (Array.isArray(cur.referenceSheets) || Array.isArray(cur.museWording))) {
    const sheets = (cur.referenceSheets || []).map(r => escapeHtml(r.character || '')).filter(Boolean);
    const swaps = cur.museWording || [];
    museNote = `<div style="margin-top:6px; font-size:11px; color:#a5b4fc;" title="${escapeHtml(swaps.join('\n'))}">` +
      `📎 Muse used ${sheets.length ? `character sheet${sheets.length > 1 ? 's' : ''}: <strong>${sheets.join(', ')}</strong>` : 'no character sheets'}` +
      `${swaps.length ? ` · ${swaps.length} Muse word swap${swaps.length > 1 ? 's' : ''} (hover to see)` : ''}</div>`;
  } else if (cur && cur.engine === 'meta-muse-image') {
    museNote = `<div style="margin-top:6px; font-size:11px; color:#94a3b8;">📎 Muse: no character sheets were sent</div>`;
  }
  if (cands.length <= 1) return museNote;
  const thumbs = cands.slice().reverse().map(c => {
    const active = c.hash && panel.hash && c.hash === panel.hash;
    const src = c.imagePath ? `/workspace-${c.imagePath.replace(/^\/+/, '')}?t=${c.hash || ''}` : '';
    const border = active ? '2px solid #f59e0b' : '1px solid rgba(148,163,184,0.3)';
    const qaTag = c.qaPassed ? `✓${c.qaScore || ''}` : `⚠${c.qaScore || ''}`;
    return `
      <div onclick="selectPanelCandidate('${projectId}', '${episodeId}', ${panel.panelId}, '${escapeHtml(c.id)}')"
           title="${escapeHtml(c.engine || '')} • ${qaTag} • Click to use this render"
           style="cursor:pointer; width:76px; flex-shrink:0; border:${border}; border-radius:4px; overflow:hidden; background:#0f172a;">
        ${src ? `<img src="${src}" style="width:100%; height:44px; object-fit:cover; display:block;" />` : ''}
        <div style="font-size:9px; padding:2px 4px; color:#cbd5e1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${escapeHtml((c.engine || '').replace('grok-imagine-image-2-0', 'grok-2').replace('meta-ai-cdp', 'meta').replace('meta-muse-image', 'muse'))} ${qaTag}
        </div>
      </div>
    `;
  }).join('');

  return museNote + `
    <div style="margin-top:6px;">
      <div style="font-size:10px; color:var(--text-muted); font-weight:600; margin-bottom:4px;">Candidate History (${cands.length} renders — click to switch):</div>
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px;">${thumbs}</div>
    </div>
  `;
};

window.selectPanelCandidate = async function (projectId, episodeId, panelId, candidateId) {
  const res = await fetch('/api/panel/select-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, episodeId, panelId: Number(panelId), candidateId })
  });
  const data = await res.json();
  if (data && data.error) { alert(data.error); return; }
  await openInspector(projectId, episodeId);
  await renderProjects();
};

window.acceptPanelReview = async function (projectId, episodeId, panelId) {
  const res = await fetch('/api/panel/accept-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, episodeId, panelId: Number(panelId) })
  });
  const data = await res.json();
  if (data && data.error) { alert(data.error); return; }
  await openInspector(projectId, episodeId);
  await renderProjects();
};

window.applyDirectorFixAndRerender = async function (projectId, episodeId, panelId) {
  const panel = cachedInspectorEp && (cachedInspectorEp.panels || []).find(x => Number(x.panelId) === Number(panelId));
  const fix = (panel && (panel.qaFixInstruction || panel.qaNotes)) || 'Fix the 8-Point Visual QA defects.';
  const modelEl = document.getElementById(`model-${projectId}-${episodeId}-${panelId}`);
  const engine = modelEl ? modelEl.value : '';
  const res = await StudioBridge.regeneratePanel(projectId, episodeId, panelId, panel ? panel.prompt : '', fix, '', engine);
  if (res && res.error) { alert(res.error); return; }
  await renderPoolStatus();
  await openInspector(projectId, episodeId);
};

window.pauseRenderQueue = async function () {
  await fetch('/api/queue/pause', { method: 'POST' });
  await renderPoolStatus();
  await renderProjects();
};

window.resumeRenderQueue = async function () {
  await fetch('/api/queue/resume', { method: 'POST' });
  await renderPoolStatus();
  await renderProjects();
};

window.cancelEpisodeRenderQueue = async function (projectId, episodeId) {
  await fetch('/api/queue/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, episodeId })
  });
  await renderPoolStatus();
  await renderProjects();
  if (activeInspectorTarget && activeInspectorTarget.episodeId === episodeId) {
    await openInspector(projectId, episodeId);
  }
};

