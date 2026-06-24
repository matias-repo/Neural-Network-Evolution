function init() {
  const canvas = document.getElementById('gameCanvas');
  canvas.width  = CONFIG.CANVAS_W;
  canvas.height = CONFIG.CANVAS_H;

  const overlay = document.getElementById('editOverlay');
  if (overlay) { overlay.width = CONFIG.CANVAS_W; overlay.height = CONFIG.CANVAS_H; }

  const localMaze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
  const renderer  = new Renderer(canvas);
  const worker    = new Worker('js/worker.js');

  let lastState = null;

  worker.onmessage = ({ data }) => {
    if (data.type === 'frame') {
      lastState = data;
      if (data.maze) {
        for (let r = 0; r < localMaze.rows; r++)
          for (let c = 0; c < localMaze.cols; c++)
            localMaze.grid[r][c] = data.maze[r][c];
      }
    } else if (data.type === 'save') {
      try {
        if (data.simState === null) {
          localStorage.removeItem('nn-evo-state');
        } else {
          localStorage.setItem('nn-evo-state', JSON.stringify(data.simState));
        }
      } catch (_) {}
    }
  };

  const ui = new UI(localMaze, worker, renderer);

  // Send any saved state to the worker
  const simState = (() => {
    try { return JSON.parse(localStorage.getItem('nn-evo-state')); } catch (_) { return null; }
  })();
  const mazeState = localStorage.getItem('nn-evo-maze');
  worker.postMessage({ type: 'restore', simState, mazeState });
  worker.postMessage({ type: 'setSpeed', steps: ui.SPEEDS[ui.speedIndex] });

  function loop() {
    requestAnimationFrame(loop);
    try {
      if (!lastState) return;

      const makeAgent = (s) => s ? {
        type: s.type, x: s.x, y: s.y,
        vx: s.vx, vy: s.vy, speed: s.speed,
        facingLeft: s.facingLeft, carryingWall: s.carryingWall,
      } : null;

      const simProxy = {
        predator:        makeAgent(lastState.pred),
        prey:            makeAgent(lastState.prey),
        generation:      lastState.generation,
        episode:         lastState.episode,
        episodeProgress: lastState.episodeProgress,
        totalFrames:     lastState.totalFrames,
      };

      renderer.render(localMaze, simProxy, ui.mode);
    } catch (err) {
      console.error('Render loop error:', err);
    }
  }

  requestAnimationFrame(loop);
}

window.addEventListener('load', init);
