importScripts('config.js', 'NeuralNetwork.js', 'Maze.js', 'Agent.js');

// Stateless episode runner. Receives one 'run' message via its MessageChannel
// port, simulates the full episode, and returns a 'result'. If display=true,
// also sends 'frame' messages every ~16 ms for rendering.
//
// The maze is read from a SharedArrayBuffer (zero-copy) when the page is
// cross-origin isolated; otherwise it falls back to the mazeGrid clone sent
// in the run message.

let port       = null;
let mazeShared = null;  // Uint8Array view of coordinator's SharedArrayBuffer
let mazeCols   = 0;

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'init') {
    port = msg.port;
    port.onmessage = ({ data }) => {
      if (data.type === 'run')             runEpisode(data);
      else if (data.type === 'sharedMaze') { mazeShared = new Uint8Array(data.sab); mazeCols = data.cols; }
    };
  }
};

async function runEpisode({ idx, genId, predW, prey1W, prey2W, mazeGrid, config, display, stepsPerFrame }) {
  if (config) Object.assign(CONFIG, config);

  // Reconstruct maze — from SAB (zero-copy) if available, else from cloned grid
  const maze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
  if (mazeShared) {
    for (let r = 0; r < maze.rows; r++)
      for (let c = 0; c < maze.cols; c++)
        maze.grid[r][c] = mazeShared[r * mazeCols + c];
  } else {
    for (let r = 0; r < maze.rows; r++)
      for (let c = 0; c < maze.cols; c++)
        maze.grid[r][c] = mazeGrid[r][c];
  }

  // Wire up neural networks
  const predNN  = new NeuralNetwork(CONFIG.PRED_NN_LAYERS);
  const prey1NN = new NeuralNetwork(CONFIG.PREY_NN_LAYERS);
  const prey2NN = new NeuralNetwork(CONFIG.PREY_NN_LAYERS);
  predNN.setWeights(predW);
  prey1NN.setWeights(prey1W);
  prey2NN.setWeights(prey2W);

  const predator = new Agent('predator', predNN);
  const prey1    = new Agent('prey', prey1NN);
  const prey2    = new Agent('prey', prey2NN);

  const predPos  = maze.randomOpenPos(null, 0);
  const prey1Pos = maze.randomOpenPos(predPos, CONFIG.MIN_START_DIST);
  const prey2Pos = maze.randomOpenPos(predPos, CONFIG.MIN_START_DIST);
  predator.reset(predPos.x, predPos.y);
  prey1.reset(prey1Pos.x, prey1Pos.y);
  prey2.reset(prey2Pos.x, prey2Pos.y);

  let frame = 0;
  let catch1Frame = null, catch2Frame = null;
  let minDist = Infinity, prey1MinDist = Infinity, prey2MinDist = Infinity;
  let lastPost = 0;
  let stepsSincePost = 0;
  const throttled = display && stepsPerFrame > 0;

  while (frame < CONFIG.EPISODE_FRAMES) {
    frame++;
    predator.update(maze, prey1, prey2);
    prey1.update(maze, predator, prey2);
    prey2.update(maze, predator, prey1);

    if (prey1.alive) {
      const d = Math.hypot(predator.x - prey1.x, predator.y - prey1.y);
      if (d < prey1MinDist) prey1MinDist = d;
      if (d < minDist)      minDist      = d;
      if (d <= CONFIG.CATCH_DIST) {
        prey1.alive = false; prey1.vx = prey1.vy = 0; catch1Frame = frame;
      }
    }
    if (prey2.alive) {
      const d = Math.hypot(predator.x - prey2.x, predator.y - prey2.y);
      if (d < prey2MinDist) prey2MinDist = d;
      if (d < minDist)      minDist      = d;
      if (d <= CONFIG.CATCH_DIST) {
        prey2.alive = false; prey2.vx = prey2.vy = 0; catch2Frame = frame;
      }
    }
    if (!prey1.alive && !prey2.alive) break;

    if (throttled) {
      // Slow mode: run stepsPerFrame steps, post a frame, then sleep 16 ms
      if (++stepsSincePost >= stepsPerFrame) {
        stepsSincePost = 0;
        port.postMessage({ type: 'frame', idx, frame,
          pred: snap(predator), prey: snap(prey1), prey2: snap(prey2) });
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    } else if (display) {
      // Turbo: post at wall-clock ~60 fps, no sleep
      const now = Date.now();
      if (now - lastPost >= 16) {
        port.postMessage({ type: 'frame', idx, frame,
          pred: snap(predator), prey: snap(prey1), prey2: snap(prey2) });
        lastPost = now;
      }
    }
  }

  // ── Fitness (mirrors Simulation._endEpisode logic) ────────────────────────
  const maxT     = CONFIG.EPISODE_FRAMES;
  const MAX_DIST = Math.hypot(CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  const closeness = Math.max(0, 1 - minDist / MAX_DIST);

  let predFit = closeness * maxT * CONFIG.PRED_PROXIMITY_WEIGHT;
  if (catch1Frame !== null) predFit += (maxT - catch1Frame) + maxT * 0.25;
  if (catch2Frame !== null) predFit += (maxT - catch2Frame) + maxT * 0.25;

  const prey1Fit = (catch1Frame ?? maxT) + Math.min(1, prey1MinDist / MAX_DIST) * maxT * 0.15;
  const prey2Fit = (catch2Frame ?? maxT) + Math.min(1, prey2MinDist / MAX_DIST) * maxT * 0.15;

  port.postMessage({ type: 'result', idx, genId, predFit, prey1Fit, prey2Fit, frame,
    pred: snap(predator), prey: snap(prey1), prey2: snap(prey2) });
}

function snap(a) {
  return { type: a.type, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
           speed: a.speed, facingLeft: a.facingLeft,
           carryingWall: a.carryingWall, alive: a.alive };
}
