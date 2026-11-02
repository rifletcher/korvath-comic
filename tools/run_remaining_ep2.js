const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { renderPanel, getStoryboard } = require('./render_panel_venice');
const { exportForVercel } = require('./export_for_vercel');

async function main() {
  console.log('🚀 Starting Episode 2 batch rendering from Panel 7 to 20...');
  const { storyboard } = getStoryboard(2);

  for (let id = 7; id <= 20; id++) {
    console.log(`\n-----------------------------------------`);
    console.log(`Rendering Episode 2, Panel ${id} of 20...`);
    await renderPanel(id, { episode: 2, promote: true });
  }

  console.log('\n🎉 Episode 2 all 20 panels fully rendered and promoted!');

  console.log('\n📦 Re-exporting for Vercel...');
  exportForVercel();

  console.log('\n🐙 Pushing to GitHub...');
  try {
    execSync('git add 01_Script/ 02_Assets/ docs/ tools/', { stdio: 'inherit' });
    execSync('git commit -m "Complete Episode 2: The Blood-Thieves of Valkash (20 panels) & multi-issue reader"', { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('✅ Successfully pushed to GitHub!');
  } catch (err) {
    console.warn('⚠️ Git push note:', err.message);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal batch render error:', err);
    process.exit(1);
  });
}

