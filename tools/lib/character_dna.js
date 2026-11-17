const fs = require('fs');
const path = require('path');

function loadCharacterPrompts(rootDir, projectId) {
  const merged = {};
  const candidates = [
    path.join(rootDir, '00_Reference', 'character_prompts.json'),
    projectId ? path.join(rootDir, 'projects', projectId, '00_Reference', 'character_prompts.json') : ''
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        Object.assign(merged, data);
      } catch (_) {}
    }
  }
  return merged;
}

function resolvePanelCharacterAnchors(panel, project = {}, rootDir = process.cwd()) {
  const projectId = project.id || project.projectId || '';
  const prompts = loadCharacterPrompts(rootDir, projectId);
  const chars = Array.isArray(panel.characters) ? panel.characters.map(c => String(c).toLowerCase()) : [];
  const text = `${panel.name || ''} ${panel.summary || ''} ${panel.prompt || ''}`.toLowerCase();
  const isKorvathSeries = (projectId || '').includes('korvath') || /korvath|natari|hyborian/i.test(`${project.title || ''} ${text}`);

  const matched = [];
  const addMatch = (key, signatureSnippet) => {
    if (prompts[key] && !matched.some(m => m.key === key)) {
      matched.push({ key, anchor: prompts[key], signatureSnippet });
    }
  };

  if (chars.includes('protagonist') || /\bkorvath\b/.test(text) || (isKorvathSeries && /\bbarbarian\b/.test(text))) {
    addMatch('korvath', 'wolf-fur mantle');
  }
  if (chars.includes('companion') || /\bnatari\b|\bvalka\b|\bthe girl\b/.test(text) || (isKorvathSeries && /\bgirl\b|\bmaiden\b/.test(text))) {
    addMatch('natari', 'hammered bronze scale-mail');
  }
  if (chars.includes('antagonist') && /\bkheshat\b/.test(text)) {
    addMatch('kheshat', 'obsidian black silk robes');
  }
  for (const key of Object.keys(prompts)) {
    if (key !== 'korvath' && key !== 'conan' && key !== 'natari' && key !== 'kheshat') {
      if (chars.includes(key.toLowerCase()) || text.includes(key.toLowerCase())) {
        addMatch(key, prompts[key].slice(0, 32));
      }
    }
  }
  return matched;
}

function ensureWardrobeDnaInPrompt(prompt, panel, project = {}, rootDir = process.cwd()) {
  let out = prompt || '';
  const anchors = resolvePanelCharacterAnchors(panel, project, rootDir);
  for (const item of anchors) {
    if (item.signatureSnippet && !out.toLowerCase().includes(item.signatureSnippet.toLowerCase())) {
      out += `, ${item.anchor}`;
    }
  }
  return out;
}

module.exports = {
  loadCharacterPrompts,
  resolvePanelCharacterAnchors,
  ensureWardrobeDnaInPrompt
};

