(async () => {
  const projs = await fetch('http://127.0.0.1:8484/api/projects').then(r => r.json());
  console.log('=== LIVE STUDIO SERIES & EPISODE PANEL CONFIGURATION ===');
  projs.forEach(({ project, episodes }) => {
    console.log(` * ${project.title} [Arc: ${episodes.length}/${project.targetEpisodeCount} Episodes | Default: ${project.defaultPanelsPerEpisode} Panels/Ep]`);
    episodes.forEach(ep => {
      console.log(`    - ${ep.episodeId}: "${ep.title}" -> ${ep.panels.length}/${ep.targetPanelCount} Panels | Stage: ${ep.currentStage}`);
    });
  });

  // Test resizing Kull Episode 1 panel count from 12 -> 15 and back to 12
  const resized = await fetch('http://127.0.0.1:8484/api/episode/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'kull-iron-reaver', episodeId: 'ep01', targetPanelCount: 15 })
  }).then(r => r.json());
  console.log(` * Verified dynamic resize on kull-iron-reaver/ep01 -> ${resized.panels.length}/${resized.targetPanelCount} Panels`);

  const restored = await fetch('http://127.0.0.1:8484/api/episode/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'kull-iron-reaver', episodeId: 'ep01', targetPanelCount: 12 })
  }).then(r => r.json());
  console.log(` * Restored kull-iron-reaver/ep01 -> ${restored.panels.length}/${restored.targetPanelCount} Panels`);
})();
