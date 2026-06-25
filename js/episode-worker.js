importScripts('config.js', 'NeuralNetwork.js', 'Maze.js', 'Agent.js');

// Stateless episode runner. Receives one 'run' message via its MessageChannel
// port, simulates the full episode, and returns a 'result'. If display=true,
// also sends 'frame' messages every ~16 ms for rendering.
//
// Supports variable agent counts (1 or 2 per side) via CONFIG.NUM_PREDATORS /
// CONFIG.NUM_PREY. Inactive slots receive a static dummy agent (alive=false)
// so NN inputs remain well-defined regardless of active count.

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

async function runEpisode({ idx, genId, predW, pred2W, prey1W, prey2W, mazeGrid, config, display, stepsPerFrame }) {
  if (config) Object.assign(CONFIG, config);

  const nPred = CONFIG.NUM_PREDATORS ?? 2;
  const nPrey = CONFIG.NUM_PREY ?? 2;

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

  // Wire up neural networks for active agents
  const predNN1 = new NeuralNetwork(CONFIG.PRED_NN_LAYERS);
  predNN1.setWeights(predW);
  const predator1 = new Agent('predator', predNN1);

  let predator2 = null;
  if (nPred >= 2) {
    const predNN2 = new NeuralNetwork(CONFIG.PRED_NN_LAYERS);
    predNN2.setWeights(pred2W);
    predator2 = new Agent('predator', predNN2);
  }

  const prey1NN = new NeuralNetwork(CONFIG.PREY_NN_LAYERS);
  prey1NN.setWeights(prey1W);
  const prey1 = new Agent('prey', prey1NN);

  let prey2 = null;
  if (nPrey >= 2) {
    const prey2NN = new NeuralNetwork(CONFIG.PREY_NN_LAYERS);
    prey2NN.setWeights(prey2W);
    prey2 = new Agent('prey', prey2NN);
  }

  // Place active agents, then build effective references for sense() calls.
  // Inactive slots get a static dummy (alive=false) at their active partner's
  // start position — the NN learns to ignore dead agents via the alive input.
  const pred1Pos = maze.randomOpenPos(null, 0);
  predator1.reset(pred1Pos.x, pred1Pos.y);
  if (predator2) {
    const pred2Pos = maze.randomOpenPos(pred1Pos, CONFIG.MIN_START_DIST * 0.5);
    predator2.reset(pred2Pos.x, pred2Pos.y);
  }

  const prey1Pos = maze.randomOpenPos(pred1Pos, CONFIG.MIN_START_DIST);
  prey1.reset(prey1Pos.x, prey1Pos.y);
  if (prey2) {
    const prey2Pos = maze.randomOpenPos(pred1Pos, CONFIG.MIN_START_DIST);
    prey2.reset(prey2Pos.x, prey2Pos.y);
  }

  // eff_pred2 / eff_prey2: real agent when active, else static dummy
  const eff_pred2 = predator2 || { x: pred1Pos.x, y: pred1Pos.y, vx: 0, vy: 0, alive: false, speed: 0, carryingWall: false, stamina: 1 };
  const eff_prey2 = prey2     || { x: prey1Pos.x, y: prey1Pos.y, vx: 0, vy: 0, alive: false, speed: 0, carryingWall: false, stamina: 1 };

  const maxT     = CONFIG.EPISODE_FRAMES;
  const MAX_DIST = Math.hypot(CONFIG.CANVAS_W, CONFIG.CANVAS_H);

  let frame = 0;
  let catch1Frame = null, catch2Frame = null;
  let catch1ByPred = 0, catch2ByPred = 0;  // 1 or 2
  let pred1ProxSum = 0, pred2ProxSum = 0;
  let prey1MinDist = Infinity, prey2MinDist = Infinity;
  let lastPost = 0;
  let stepsSincePost = 0;
  let pendingMaze = null;
  const throttled = display && stepsPerFrame > 0;

  while (frame < CONFIG.EPISODE_FRAMES) {
    frame++;

    // Update only active agents; pass eff_ references so inactive slots
    // appear as dead allies/opponents at a fixed position
    predator1.update(maze, prey1, eff_prey2, eff_pred2);
    if (predator2) predator2.update(maze, prey1, eff_prey2, predator1);
    prey1.update(maze, predator1, eff_pred2, eff_prey2);
    if (prey2) prey2.update(maze, predator1, eff_pred2, prey1);

    if (display && maze.dirty) {
      pendingMaze = maze.grid.map(r => r.slice());
      maze.dirty = false;
    }

    // Check catches — first predator to reach catch distance wins credit
    let d1a = Infinity, d1b = Infinity, d2a = Infinity, d2b = Infinity;
    if (prey1.alive) {
      d1a = Math.hypot(predator1.x - prey1.x, predator1.y - prey1.y);
      if (d1a < prey1MinDist) prey1MinDist = d1a;
      if (d1a <= CONFIG.CATCH_DIST) {
        prey1.alive = false; prey1.vx = prey1.vy = 0; catch1Frame = frame; catch1ByPred = 1;
      } else if (predator2) {
        d1b = Math.hypot(predator2.x - prey1.x, predator2.y - prey1.y);
        if (d1b < prey1MinDist) prey1MinDist = d1b;
        if (d1b <= CONFIG.CATCH_DIST) {
          prey1.alive = false; prey1.vx = prey1.vy = 0; catch1Frame = frame; catch1ByPred = 2;
        }
      }
    }
    if (prey2 && prey2.alive) {
      d2a = Math.hypot(predator1.x - prey2.x, predator1.y - prey2.y);
      if (d2a < prey2MinDist) prey2MinDist = d2a;
      if (d2a <= CONFIG.CATCH_DIST) {
        prey2.alive = false; prey2.vx = prey2.vy = 0; catch2Frame = frame; catch2ByPred = 1;
      } else if (predator2) {
        d2b = Math.hypot(predator2.x - prey2.x, predator2.y - prey2.y);
        if (d2b < prey2MinDist) prey2MinDist = d2b;
        if (d2b <= CONFIG.CATCH_DIST) {
          prey2.alive = false; prey2.vx = prey2.vy = 0; catch2Frame = frame; catch2ByPred = 2;
        }
      }
    }

    // Per-frame proximity reward (nearest living prey for each active predator)
    const near1 = Math.min(
      prey1.alive ? d1a : Infinity,
      prey2 && prey2.alive ? d2a : Infinity
    );
    const near2 = predator2 ? Math.min(
      prey1.alive ? d1b : Infinity,
      prey2 && prey2.alive ? d2b : Infinity
    ) : Infinity;
    if (near1 < Infinity) pred1ProxSum += Math.max(0, 1 - near1 / MAX_DIST);
    if (near2 < Infinity) pred2ProxSum += Math.max(0, 1 - near2 / MAX_DIST);

    const allPreyCaught = !prey1.alive && (!prey2 || !prey2.alive);
    if (allPreyCaught) break;

    if (throttled) {
      if (++stepsSincePost >= stepsPerFrame) {
        stepsSincePost = 0;
        port.postMessage({ type: 'frame', idx, frame,
          pred: snap(predator1), pred2: predator2 ? snap(predator2) : null,
          prey: snap(prey1),     prey2: prey2     ? snap(prey2)     : null,
          maze: pendingMaze });
        pendingMaze = null;
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    } else if (display) {
      const now = Date.now();
      if (now - lastPost >= 16) {
        port.postMessage({ type: 'frame', idx, frame,
          pred: snap(predator1), pred2: predator2 ? snap(predator2) : null,
          prey: snap(prey1),     prey2: prey2     ? snap(prey2)     : null,
          maze: pendingMaze });
        pendingMaze = null;
        lastPost = now;
      }
    }
  }

  // ── Fitness ───────────────────────────────────────────────────────────────
  let pred1Fit = pred1ProxSum * CONFIG.PRED_PROXIMITY_WEIGHT;
  let pred2Fit = pred2ProxSum * CONFIG.PRED_PROXIMITY_WEIGHT;

  if (catch1Frame !== null) {
    const bonus = (maxT - catch1Frame) + maxT * 0.25;
    if (catch1ByPred === 1) pred1Fit += bonus; else pred2Fit += bonus;
  }
  if (catch2Frame !== null) {
    const bonus = (maxT - catch2Frame) + maxT * 0.25;
    if (catch2ByPred === 1) pred1Fit += bonus; else pred2Fit += bonus;
  }

  const prey1Fit = (catch1Frame ?? maxT) + Math.min(1, prey1MinDist / MAX_DIST) * maxT * 0.15;
  const prey2Fit = prey2
    ? (catch2Frame ?? maxT) + Math.min(1, prey2MinDist / MAX_DIST) * maxT * 0.15
    : 0;

  port.postMessage({ type: 'result', idx, genId,
    predFit: pred1Fit, pred2Fit, prey1Fit, prey2Fit, frame,
    pred: snap(predator1), pred2: predator2 ? snap(predator2) : null,
    prey: snap(prey1),     prey2: prey2     ? snap(prey2)     : null });
}

function snap(a) {
  return { type: a.type, x: a.x, y: a.y, vx: a.vx, vy: a.vy,
           speed: a.speed, facingLeft: a.facingLeft,
           carryingWall: a.carryingWall, alive: a.alive, stamina: a.stamina };
}
