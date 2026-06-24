function computeLayout() {
  const cs      = CONFIG.CELL_SIZE;
  const headerH = 46; // top-bar height (buttons + padding + border)
  const cols = Math.max(12, Math.min(28, Math.floor(window.innerWidth  / cs)));
  const rows = Math.max(20, Math.min(42, Math.floor((window.innerHeight - headerH) / cs)));
  CONFIG.COLS     = cols;
  CONFIG.ROWS     = rows;
  CONFIG.CANVAS_W = cols * cs;
  CONFIG.CANVAS_H = rows * cs;
  // Propagate computed width to CSS so top-bar / edit-bar / canvas-wrap all match
  document.documentElement.style.setProperty('--w', `${CONFIG.CANVAS_W}px`);
}

function init() {
  computeLayout();

  const canvas = document.getElementById('gameCanvas');
  canvas.width  = CONFIG.CANVAS_W;
  canvas.height = CONFIG.CANVAS_H;

  const overlay = document.getElementById('editOverlay');
  if (overlay) { overlay.width = CONFIG.CANVAS_W; overlay.height = CONFIG.CANVAS_H; }

  const localMaze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
  const renderer  = new Renderer(canvas);

  // Spawn episode workers from the main thread to avoid nested-worker restrictions.
  // Worker 0 is the display worker (sends render frames); others run silently.
  const NUM_WORKERS = Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1);
  const coordinator = new Worker('js/worker.js');

  const epWorkers = Array.from({ length: NUM_WORKERS }, (_, i) => {
    const w = new Worker('js/episode-worker.js');
    // Forward episode results/frames to the coordinator, tagging with workerIdx
    w.onmessage = ({ data }) => coordinator.postMessage({ ...data, workerIdx: i });
    w.onerror   = (e) => console.error(`[epWorker ${i}] error:`, e.message, e);
    return w;
  });

  let lastState = null;

  coordinator.onerror = (e) => console.error('[coordinator] error:', e.message, e);

  coordinator.onmessage = ({ data }) => {
    if (data.type === 'dispatch') {
      // Route a 'run' command from the coordinator to the right episode worker
      const w = epWorkers[data.workerIdx];
      if (!w) { console.error('[main] dispatch to unknown workerIdx', data.workerIdx); return; }
      w.postMessage(data.run);
      return;
    }
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

  // UI posts control messages (pause/resume/reset/syncMaze) directly to coordinator
  const ui = new UI(localMaze, coordinator, renderer);

  // Send layout config + worker count + any saved state to the coordinator
  const simState = (() => {
    try { return JSON.parse(localStorage.getItem('nn-evo-state')); } catch (_) { return null; }
  })();
  const mazeState = localStorage.getItem('nn-evo-maze');
  coordinator.postMessage({
    type: 'restore',
    config: {
      COLS: CONFIG.COLS, ROWS: CONFIG.ROWS,
      CANVAS_W: CONFIG.CANVAS_W, CANVAS_H: CONFIG.CANVAS_H,
      CELL_SIZE: CONFIG.CELL_SIZE,
      NUM_WORKERS,
    },
    simState,
    mazeState,
  });
  coordinator.postMessage({ type: 'setSpeed', steps: ui.SPEEDS[ui.speedIndex] });

  function loop() {
    requestAnimationFrame(loop);
    try {
      if (!lastState) return;

      const makeAgent = (s) => s ? {
        type: s.type, x: s.x, y: s.y,
        vx: s.vx, vy: s.vy, speed: s.speed,
        facingLeft: s.facingLeft, carryingWall: s.carryingWall,
        alive: s.alive !== false,
      } : null;

      const simProxy = {
        predator:        makeAgent(lastState.pred),
        prey:            makeAgent(lastState.prey),
        prey2:           makeAgent(lastState.prey2),
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
