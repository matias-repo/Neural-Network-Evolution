let maze, sim, renderer, ui;

function init() {
  const canvas = document.getElementById('gameCanvas');
  canvas.width = CONFIG.CANVAS_W;
  canvas.height = CONFIG.CANVAS_H;

  const overlay = document.getElementById('editOverlay');
  if (overlay) { overlay.width = CONFIG.CANVAS_W; overlay.height = CONFIG.CANVAS_H; }

  maze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
  sim = new Simulation(maze);
  renderer = new Renderer(canvas);
  ui = new UI(maze, sim, renderer);

  // Restore saved maze if any
  const saved = localStorage.getItem('nn-evo-maze');
  if (saved) { try { maze.deserialize(saved); sim.onMazeChanged(); } catch (_) {} }

  requestAnimationFrame(loop);
}

function loop() {
  requestAnimationFrame(loop);

  if (ui.mode === 'play') {
    sim.update(ui.stepsPerFrame);
    ui.updateStats();
  }

  renderer.render(maze, sim, ui.mode);
}

window.addEventListener('load', init);
