const { getMetaTab, CDPClient } = require('./cdp_helper');

async function main() {
  const tab = await getMetaTab();
  const client = new CDPClient(tab.webSocketDebuggerUrl);
  await client.connect();

  const details = await client.evaluate(`
    (() => {
      const textbox = document.querySelector('div[role="textbox"]');
      const textarea = document.querySelector('textarea');
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText,
        label: b.getAttribute('aria-label'),
        disabled: b.disabled,
        html: b.outerHTML.substring(0, 100)
      }));

      return {
        textbox: textbox ? {
          outerHTML: textbox.outerHTML.substring(0, 150),
          isContentEditable: textbox.isContentEditable,
          innerText: textbox.innerText
        } : null,
        textarea: textarea ? {
          outerHTML: textarea.outerHTML.substring(0, 150),
          value: textarea.value
        } : null,
        buttons: buttons.filter(b => b.label && (b.label.includes('Send') || b.label.includes('More') || b.label.includes('Share') || b.label.includes('Voice')))
      };
    })()
  `);

  console.log(JSON.stringify(details, null, 2));
  client.close();
}

main().catch(console.error);

