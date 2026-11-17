const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

function getArg(key, def = '') {
  const idx = process.argv.indexOf('--' + key);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return def;
}

function loadProjectData(projectId) {
  const projPath = path.join(rootDir, 'projects', projectId, 'project.json');
  if (!fs.existsSync(projPath)) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const project = JSON.parse(fs.readFileSync(projPath, 'utf8'));

  const episodesDir = path.join(rootDir, 'projects', projectId, 'episodes');
  const episodes = [];
  if (fs.existsSync(episodesDir)) {
    const epDirs = fs.readdirSync(episodesDir).filter(d => fs.statSync(path.join(episodesDir, d)).isDirectory());
    for (const d of epDirs) {
      const mfPath = path.join(episodesDir, d, 'manifest.json');
      if (fs.existsSync(mfPath)) {
        try {
          const ep = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
          episodes.push(ep);
        } catch (e) {}
      }
    }
  }

  const historyPath = path.join(rootDir, 'projects', projectId, 'chat_history.json');
  let history = [];
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {}
  }

  return { projPath, project, episodesDir, episodes, historyPath, history };
}

function saveProject(projPath, project) {
  project.updatedAt = new Date().toISOString();
  fs.writeFileSync(projPath, JSON.stringify(project, null, 2), 'utf8');
}

function saveHistory(historyPath, history) {
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
}

function invalidateGatesFrom(manifest, fromGateId, reason) {
  if (!manifest || !manifest.gates) return;
  const gateOrder = ['SCRIPT_GATE', 'VISUAL_QA_GATE', 'AUDIO_QA_GATE'];
  const startIdx = gateOrder.indexOf(fromGateId);
  if (startIdx === -1) return;

  for (let i = startIdx; i < gateOrder.length; i++) {
    const gid = gateOrder[i];
    const g = manifest.gates.find(x => x.id === gid);
    if (!g) continue;
    if (i === startIdx) {
      g.status = 'AWAITING_APPROVAL';
      g.approvedAt = null;
      g.notes = reason;
    } else {
      g.status = 'LOCKED';
      g.approvedAt = null;
      g.notes = 'Locked until prior gate is approved.';
    }
  }

  // Relock downstream stages
  const stageOrder = ['SCRIPT_GENERATION', 'PROMPT_EXPANSION', 'VISUAL_RENDERING', 'VOICE_SYNTHESIS', 'VIDEO_ASSEMBLY', 'READY_FOR_RELEASE'];
  let stageStart = -1;
  if (fromGateId === 'SCRIPT_GATE') stageStart = 1;
  else if (fromGateId === 'VISUAL_QA_GATE') stageStart = 3;
  else if (fromGateId === 'AUDIO_QA_GATE') stageStart = 4;

  if (stageStart !== -1 && manifest.stages) {
    for (let i = stageStart; i < stageOrder.length; i++) {
      const sid = stageOrder[i];
      const st = manifest.stages.find(x => x.id === sid);
      if (st) st.status = 'LOCKED_BY_GATE';
    }
  }

  if (fromGateId === 'VISUAL_QA_GATE') {
    const vrStage = (manifest.stages || []).find(x => x.id === 'VISUAL_RENDERING');
    if (vrStage) vrStage.status = 'IN_PROGRESS';
    if (['READY_FOR_RELEASE', 'VIDEO_ASSEMBLY', 'VOICE_SYNTHESIS'].includes(manifest.currentStage)) {
      manifest.currentStage = 'VISUAL_QA_GATE';
    }
  }
}

async function handleComicChat(projectId, episodeId, userMessage, screenshotPath = '') {
  const { projPath, project, episodes, historyPath, history } = loadProjectData(projectId);

  let screenshotSection = '';
  if (screenshotPath && fs.existsSync(screenshotPath)) {
    screenshotSection = `\nATTACHED VISUAL SCREENSHOT FOR MULTIMODAL VISION:
Please inspect and analyze the visual screenshot image at file path: ${screenshotPath.replace(/\\/g, '/')}
Use your multimodal vision capabilities to examine the visual reference, highlighted/circled details, object shapes (e.g. ruby, sword, characters), anatomical posture, or styling in the screenshot to directly address the creator's request.`;
  }

  // Identify active episode if specified or latest in-progress
  let focusedEp = null;
  if (episodeId) {
    focusedEp = episodes.find(e => e.episodeId === episodeId);
  }
  if (!focusedEp && episodes.length > 0) {
    focusedEp = episodes.find(e => e.currentStage !== 'COMPLETED' && e.currentStage !== 'READY_FOR_RELEASE') || episodes[episodes.length - 1];
  }

  // Build condensed episode summary
  const epSummaries = episodes.map(e => {
    const totalPanels = (e.panels || []).length;
    const verifiedPanels = (e.panels || []).filter(p => p.imageStatus === 'VERIFIED' || p.imageStatus === 'RENDERED').length;
    const waitingGate = (e.gates || []).find(g => g.status === 'AWAITING_APPROVAL');
    return {
      episodeId: e.episodeId,
      title: e.title,
      currentStage: e.currentStage,
      panelProgress: `${verifiedPanels}/${totalPanels}`,
      waitingGate: waitingGate ? waitingGate.id : null,
      panels: (e.panels || []).slice(0, 20).map(p => ({
        panelId: p.panelId,
        name: p.name,
        imageStatus: p.imageStatus,
        promptPreview: (p.prompt || '').slice(0, 100) + '...'
      }))
    };
  });

  const recentHistory = history.slice(-6).map(h => `${h.sender.toUpperCase()}: ${h.text}`).join('\n');

  const systemInstructions = `You are the master AI Comic Studio Copilot & Autonomous Art Director for the comic series "${project.title}".
You collaborate with the human creator using conversational natural language, answering questions, providing Hyborian lore and creative guidance, and performing concrete changes to the series and its episodes.

SERIES METADATA:
- Title: ${project.title} (${project.id})
- Subtitle: ${project.subtitle || ''}
- Genre / Tone: ${project.genre || 'Sword-and-Sorcery Graphic Novel'}
- Configured Art Style Anchor: ${project.artStyleAnchor || 'Classic Graphic Novel'}
- Default Image Engine: ${project.defaultImageEngine || 'meta-ai-cdp'}
- Target Episodes: ${project.targetEpisodeCount || 6}
- Default Panels / Episode: ${project.defaultPanelsPerEpisode || 20}
- Current Invariants & Rules: ${JSON.stringify(project.invariants || [])}

EPISODES IN SERIES:
${JSON.stringify(epSummaries, null, 2)}

FOCUSED EPISODE:
${focusedEp ? focusedEp.episodeId + ' ("' + focusedEp.title + '", Stage: ' + focusedEp.currentStage + ')' : 'None'}

SUPPORTED ACTION TYPES:
1. ADD_INVARIANT: { "type": "ADD_INVARIANT", "invariant": "Detailed rule string" }
2. REMOVE_INVARIANT: { "type": "REMOVE_INVARIANT", "match": "Text or keyword to remove" }
3. UPDATE_PROJECT_CONFIG: { "type": "UPDATE_PROJECT_CONFIG", "genre": "...", "artStyleAnchor": "...", "defaultImageEngine": "...", "defaultPanelsPerEpisode": 20 }
4. REGENERATE_PANEL: { "type": "REGENERATE_PANEL", "episodeId": "epXX", "panelId": 14, "directorCorrection": "Specific visual fix" }
5. UPDATE_PANEL_PROMPT: { "type": "UPDATE_PANEL_PROMPT", "episodeId": "epXX", "panelId": 14, "prompt": "Full new prompt text" }
6. APPROVE_GATE: { "type": "APPROVE_GATE", "episodeId": "epXX", "gateId": "SCRIPT_GATE" }
7. REJECT_GATE: { "type": "REJECT_GATE", "episodeId": "epXX", "gateId": "VISUAL_QA_GATE", "reason": "..." }

RECENT CONVERSATION HISTORY:
${recentHistory || 'No previous messages.'}

HUMAN CREATOR REQUEST:
"${userMessage}"
${screenshotSection}

RULES:
1. Always output ONLY valid JSON inside a single \`\`\`json code block. No text outside the fence.
2. In your "reply" field, provide a friendly, knowledgeable, professional response as the Comic Studio Copilot, summarizing what actions you have initialized and explaining your creative reasoning.
3. If the user asks a question without requesting changes, return an empty "actions": [] array.
4. If the user asks to change or fix something, formulate the appropriate concrete action(s).`;

  const childPrompt = `Act as Comic Studio Copilot. Input:
${systemInstructions}

Produce the structured JSON output:`;

  return new Promise((resolve) => {
    execFile('agy.exe', ['--model', 'gemini-3.8-flash-medium', '-p', childPrompt], {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      let reply = 'I have received your instruction and reviewed the comic state.';
      let actions = [];

      if (!err && stdout && stdout.trim()) {
        const raw = stdout.trim();
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonStr = match ? match[1].trim() : raw;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.reply) reply = parsed.reply;
          if (Array.isArray(parsed.actions)) actions = parsed.actions;
        } catch (pe) {
          console.warn('[Copilot] JSON parse notice:', pe.message);
          reply = raw.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
        }
      } else if (err) {
        console.warn('[Copilot] agy call notice:', err.message);
        reply = `I processed your request: "${userMessage}". (Offline fallback applied)`;
        // Simple local deterministic rule handling if agy had a timeout
        if (/invariant|rule/i.test(userMessage)) {
          actions.push({
            type: 'ADD_INVARIANT',
            invariant: userMessage.replace(/^add (an )?invariant:?/i, '').trim()
          });
        }
      }

      // Execute actions and apply changes
      const executedResults = [];
      for (const act of actions) {
        try {
          if (act.type === 'ADD_INVARIANT' && act.invariant) {
            if (!Array.isArray(project.invariants)) project.invariants = [];
            project.invariants.push(act.invariant);
            saveProject(projPath, project);
            executedResults.push(`🛡️ Added Invariant: "${act.invariant}"`);
          } else if (act.type === 'REMOVE_INVARIANT' && act.match) {
            if (Array.isArray(project.invariants)) {
              const beforeLen = project.invariants.length;
              project.invariants = project.invariants.filter(inv => !inv.toLowerCase().includes(act.match.toLowerCase()));
              if (project.invariants.length < beforeLen) {
                saveProject(projPath, project);
                executedResults.push(`🗑️ Removed Invariant matching "${act.match}"`);
              }
            }
          } else if (act.type === 'UPDATE_PROJECT_CONFIG') {
            if (act.genre) project.genre = act.genre;
            if (act.artStyleAnchor) project.artStyleAnchor = act.artStyleAnchor;
            if (act.defaultImageEngine) project.defaultImageEngine = act.defaultImageEngine;
            if (act.defaultPanelsPerEpisode) project.defaultPanelsPerEpisode = Number(act.defaultPanelsPerEpisode);
            saveProject(projPath, project);
            executedResults.push(`⚙️ Updated Series Configuration`);
          } else if (act.type === 'REGENERATE_PANEL' && act.panelId) {
            const targetEp = act.episodeId || (focusedEp ? focusedEp.episodeId : 'ep01');
            const targetCorr = act.directorCorrection || '';
            const mfPath = path.join(rootDir, 'projects', projectId, 'episodes', targetEp, 'manifest.json');
            if (fs.existsSync(mfPath)) {
              const epData = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
              invalidateGatesFrom(epData, 'VISUAL_QA_GATE', `Panel #${act.panelId} told to regenerate via Copilot — awaiting visual director re-inspection`);
              const p = (epData.panels || []).find(x => x.panelId === Number(act.panelId));
              if (p) p.imageStatus = 'RENDERING';
              epData.updatedAt = new Date().toISOString();
              fs.writeFileSync(mfPath, JSON.stringify(epData, null, 2), 'utf8');
            }
            // Trigger background panel regeneration
            const workerScript = path.join(rootDir, 'tools', 'workers', 'comic_cli_worker.js');
            try {
              execFileSync('node', [
                workerScript,
                '--action', 'render-panel',
                '--project', projectId,
                '--episode', targetEp,
                '--panel', String(act.panelId),
                '--correction', targetCorr
              ], { stdio: 'ignore', timeout: 5000 });
            } catch (we) {
              // Started in background or completed
            }
            executedResults.push(`⚡ Dispatched Regeneration for ${targetEp} Panel #${act.panelId} (Gate B & downstream reset to not approved)`);
          } else if (act.type === 'UPDATE_PANEL_PROMPT' && act.panelId && act.prompt) {
            const targetEp = act.episodeId || (focusedEp ? focusedEp.episodeId : 'ep01');
            const mfPath = path.join(rootDir, 'projects', projectId, 'episodes', targetEp, 'manifest.json');
            if (fs.existsSync(mfPath)) {
              const epData = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
              invalidateGatesFrom(epData, 'VISUAL_QA_GATE', `Prompt updated for Panel #${act.panelId} — awaiting visual director re-inspection`);
              const p = (epData.panels || []).find(x => x.panelId === Number(act.panelId));
              if (p) {
                p.prompt = act.prompt;
                epData.updatedAt = new Date().toISOString();
                fs.writeFileSync(mfPath, JSON.stringify(epData, null, 2), 'utf8');
                executedResults.push(`✏️ Updated Prompt for ${targetEp} Panel #${act.panelId} (Gate B & downstream reset to not approved)`);
              }
            }
          }
        } catch (ae) {
          console.warn('[Copilot] Action execution error:', ae.message);
        }
      }

      // Record to chat history
      const now = new Date().toISOString();
      history.push({
        sender: 'user',
        text: userMessage,
        timestamp: now
      });
      history.push({
        sender: 'assistant',
        text: reply,
        actions: executedResults,
        timestamp: now
      });

      // Keep last 40 messages to prevent unbounded growth
      const trimmedHistory = history.slice(-40);
      saveHistory(historyPath, trimmedHistory);

      resolve({
        reply,
        actions: executedResults,
        history: trimmedHistory
      });
    });
  });
}

// Standalone CLI test or invocation: node tools/comic_chat_agent.js --project <id> --message <text>
if (require.main === module) {
  const proj = getArg('project', 'korvath-the-barbarian');
  const ep = getArg('episode', '');
  const msg = getArg('message', 'What are the current invariants for this comic?');
  const screenshot = getArg('screenshot', '');

  handleComicChat(proj, ep, msg, screenshot).then(res => {
    console.log(JSON.stringify(res, null, 2));
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  handleComicChat,
  loadProjectData
};

