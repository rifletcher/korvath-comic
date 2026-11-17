const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Shared Headless AI client used across Visual Director, Script Rework,
 * Audio Feedback interpretation, and Workshop/Chat.
 *
 * Uses `agy.exe` by default (leveraging the user's Antigravity session) and
 * cleanly extracts fenced text or JSON responses with standardized trace metadata.
 */
function runHeadlessPrompt(prompt, options = {}) {
  const model = options.model || process.env.CONAN_AI_MODEL || 'gemini-3.8-flash-medium';
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 90000;
  const label = options.label || 'Headless AI';

  return new Promise((resolve) => {
    console.error(`[${label}] Calling Antigravity CLI (${model})...`);
    execFile('agy.exe', ['--model', model, '-p', prompt], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (!err && stdout && stdout.trim()) {
        return resolve({
          ok: true,
          text: stdout.trim(),
          model,
          source: model
        });
      }
      let errMsg = err ? err.message : (stderr ? stderr.trim() : 'Empty stdout');
      if (err && (err.killed || err.signal === 'SIGTERM') ) {
        errMsg = `the AI (${model}) did not answer within ${Math.round(timeoutMs / 1000)}s`;
      } else if (err && err.code === 'ENOENT') {
        errMsg = 'agy.exe (Antigravity CLI) was not found on this computer';
      } else if (errMsg.startsWith('Command failed:')) {
        const detail = (stderr || '').trim().split('\n').slice(-2).join(' ').slice(0, 200);
        errMsg = `the AI command failed${detail ? ': ' + detail : ''}`;
      }
      console.warn(`[${label}] CLI notice: ${errMsg}`);
      resolve({
        ok: false,
        text: '',
        error: errMsg,
        model,
        source: 'unavailable'
      });
    });
  });
}

function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (_) {
    return null;
  }
}

function extractFencedText(text) {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/```(?:text)?\s*([\s\S]*?)```/i);
  if (match && match[1]) return match[1].trim();
  return text.trim();
}

function resolveExistingFile(filePath, rootDir = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') return '';
  if (fs.existsSync(filePath)) return filePath.replace(/\\/g, '/');
  const joined = path.join(rootDir, filePath);
  if (fs.existsSync(joined)) return joined.replace(/\\/g, '/');
  return '';
}

module.exports = {
  runHeadlessPrompt,
  extractJsonFromText,
  extractFencedText,
  resolveExistingFile
};

