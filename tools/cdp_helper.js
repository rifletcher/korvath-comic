const fs = require('fs');
const path = require('path');

async function getMetaTab() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const metaTab = tabs.find(t => t.url && t.url.includes('meta.ai'));
  if (!metaTab) throw new Error('No Meta AI tab found on port 9222');
  return metaTab;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    return res && res.result ? res.result.value : null;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getRecentHistory() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const history = await client.evaluate(`
    (() => {
      const allDivs = Array.from(document.querySelectorAll('div[dir="auto"], p, h1, h2, h3'));
      const texts = allDivs.map(d => d.innerText.trim()).filter(t => t.length > 30);
      const unique = Array.from(new Set(texts));
      return unique.slice(-10);
    })()
  `);

  console.log('Recent texts in chat:\n', JSON.stringify(history, null, 2));
  client.close();
  return history;
}

async function downloadLatestImage(outputPath) {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const latestImgUrl = await client.evaluate(`
    (() => {
      const imgs = Array.from(document.querySelectorAll('img[src*="fbcdn.net"]'));
      if (imgs.length === 0) return null;
      return imgs[imgs.length - 1].src;
    })()
  `);

  if (!latestImgUrl) {
    console.log('No generated image found in chat.');
    client.close();
    return false;
  }

  console.log('Downloading image from:', latestImgUrl);
  const resp = await fetch(latestImgUrl);
  const buffer = await resp.arrayBuffer();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log('Saved image to:', outputPath);
  client.close();
  return true;
}

async function injectPromptAndSend(promptText) {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const res = await client.evaluate(`
    (async () => {
      const prompt = ${JSON.stringify(promptText)};
      
      // Look for the textarea or contenteditable div
      let inputEl = document.querySelector('div[role="textbox"][contenteditable="true"]');
      if (!inputEl) {
        inputEl = document.querySelector('textarea[placeholder*="Ask Meta AI"]');
      }

      if (!inputEl) {
        return { success: false, error: 'Could not find input element' };
      }

      // Focus
      inputEl.focus();

      if (inputEl.isContentEditable) {
        // Select all and replace with prompt text
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, prompt);
      } else {
        inputEl.value = prompt;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Wait a moment for UI to register
      await new Promise(r => setTimeout(r, 400));

      // Find the Send button
      const buttons = Array.from(document.querySelectorAll('button'));
      const sendBtn = buttons.find(b => b.getAttribute('aria-label') === 'Send' || b.innerText.trim() === 'Send');

      if (!sendBtn) {
        return { success: false, error: 'Send button not found' };
      }

      if (sendBtn.disabled) {
        // Try triggering an InputEvent or keydown Enter
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: ' ' }));
        await new Promise(r => setTimeout(r, 300));
      }

      if (sendBtn.disabled) {
        return { success: false, error: 'Send button is disabled', promptInjected: true };
      }

      sendBtn.click();
      return { success: true };
    })()
  `);

  console.log('Injection Result:', res);
  client.close();
  return res;
}

if (require.main === module) {
  const mode = process.argv[2] || 'history';
  if (mode === 'history') {
    getRecentHistory().catch(console.error);
  } else if (mode === 'download' && process.argv[3]) {
    downloadLatestImage(process.argv[3]).catch(console.error);
  }
}

module.exports = { getMetaTab, CDPClient, getRecentHistory, downloadLatestImage, injectPromptAndSend };
