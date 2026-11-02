const { renderPromptVenice } = require('./render_panel_venice');

const testPrompt = `classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork. Ultra-Wide Panoramic View of a barbarian standing on a desert dune at sunrise. At the top left of the image, include a clean yellow vintage comic book narrative caption box with black border containing the exact readable English text: "BEFORE THE FIRST IRON TOWERS ROSE".`;

renderPromptVenice(testPrompt, '02_Assets/pipeline_comparison/test_text_render.webp')
  .then(() => console.log('✅ Text test complete! Saved to 02_Assets/pipeline_comparison/test_text_render.webp'))
  .catch(err => console.error('Error:', err.message));

