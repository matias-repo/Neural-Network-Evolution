importScripts('config.js', 'NeuralNetwork.js', 'GeneticAlgorithm.js', 'Maze.js');

// Coordinator worker.  Episode workers are spawned by the MAIN THREAD
// (to avoid nested-worker restrictions).  Each episode worker gets a
// MessageChannel port so coordinator ↔ episode workers communicate directly
// without any main-thread routing overhead.

// ── Genetic algorithm ─────────────────────────────────────────────────────
const ga = new GeneticAlgorithm({
  popSize:          CONFIG.POP_SIZE,
  mutationRate:     CONFIG.MUTATION_RATE,
  mutationStrength: CONFIG.MUTATION_STRENGTH,
  eliteCount:       CONFIG.ELITE_COUNT,
});

// ── Population state ──────────────────────────────────────────────────────
let predPop   = [];
let predPop2  = [];
let preyPop   = [];
let preyPop2  = [];
let predFitness  = [];
let pred2Fitness = [];
let preyFitness  = [];
let prey2Fitness = [];
let generation   = 0;
let totalFrames  = 0;
let history      = [];

// ── Generation bookkeeping ────────────────────────────────────────────────
let episodeQueue      = [];   // episode indices not yet dispatched this gen
let completedEpisodes = 0;    // results received so far this gen
let genId             = 0;    // bumped on reset so stale results are discarded

// ── Worker pool ───────────────────────────────────────────────────────────────
let NUM_WORKERS = 1;
let workerBusy  = [false];
let ports       = [];   // direct MessagePort to each episode worker

// ── Render / maze state ───────────────────────────────────────────────────
let lastSnap    = null;        // { pred, pred2, prey, prey2 } from last display-worker frame
let displayEp   = 0;           // episode index worker-0 is currently rendering
let mazeSave    = null;         // baseline grid (2-D number array) — canonical source of truth for episodes
let displayMaze = null;         // mid-episode view: diverges from mazeSave when agents pick up/place walls
let mazeDirty   = false;
let mazeSAB     = null;         // SharedArrayBuffer for maze (one alloc, zero per-dispatch clones)
let mazeShared  = null;         // Uint8Array view of mazeSAB
let cfgOverride = null;         // layout config forwarded to episode workers
let episodeCfg  = null;         // cfgOverride + current EPISODE_FRAMES (set each generation)
let lastSaveMs  = 0;            // timestamp of last save; throttles saves to ≤1 per 5 s

// ── Speed ─────────────────────────────────────────────────────────────────
// 0 = turbo (no delay); positive = sim-steps to run before each 16 ms sleep
// on the display worker. Background workers always run at full speed.
let speedSteps  = 0;

// ── Control ───────────────────────────────────────────────────────────────
let paused      = true;
let initialized = false;
let tickStarted = false;
let lastFlushMs = 0;

// ═══════════════════════════════════════════════════════════════════════════
// Main-thread message handler
// ═══════════════════════════════════════════════════════════════════════════
self.onmessage = ({ data: msg }) => {
  try { _handleMessage(msg); } catch (err) { console.error('[coordinator] onmessage error:', err); }
};

function _handleMessage(msg) {
  switch (msg.type) {

    // Control messages from the main thread
    case 'restore':
      // Wire up direct MessagePorts to episode workers
      if (msg.ports && msg.ports.length) {
        ports = msg.ports;
        ports.forEach((port, i) => {
          port.onmessage = ({ data }) => {
            try { _onEpisodeMsg(i, data); } catch (err) { console.error('[coordinator] port onmessage error:', err); }
          };
        });
      }
      _initCoord(msg.config, msg.simState, msg.mazeState);
      paused = false;
      break;

    case 'setSpeed':
      speedSteps = msg.steps ?? 0;
      break;

    case 'pause':
      paused = true;
      break;

    case 'resume':
      if (paused) {
        paused = false;
        if (initialized) _dispatchIdle();
      }
      break;

    case 'reset':
      _reset();
      break;

    case 'syncMaze':
      if (!mazeSave) break;
      for (let r = 0; r < mazeSave.length; r++)
        for (let c = 0; c < mazeSave[r].length; c++)
          mazeSave[r][c] = msg.grid[r][c];
      _syncSharedMaze();
      mazeDirty = true;
      _resetGeneration();
      break;

    case 'setAgentCount':
      if (!cfgOverride) cfgOverride = {};
      if (msg.numPredators !== undefined) cfgOverride.NUM_PREDATORS = msg.numPredators;
      if (msg.numPrey      !== undefined) cfgOverride.NUM_PREY      = msg.numPrey;
      _resetGeneration();
      break;

  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Episode-worker message handler (called from port.onmessage — direct channel)
// ═══════════════════════════════════════════════════════════════════════════
function _onEpisodeMsg(wIdx, data) {
  if (data.type === 'frame') {
    if (wIdx === 0) {
      lastSnap = { pred: data.pred, pred2: data.pred2, prey: data.prey, prey2: data.prey2 };
      if (data.maze) { displayMaze = data.maze; mazeDirty = true; }
    }
    return;
  }
  if (data.type !== 'result') return;
  if (data.genId !== genId) return;  // stale result from a superseded generation

  predFitness[data.idx]  = data.predFit;
  pred2Fitness[data.idx] = data.pred2Fit;
  preyFitness[data.idx]  = data.prey1Fit;
  prey2Fitness[data.idx] = data.prey2Fit;
  totalFrames += data.frame;
  completedEpisodes++;

  if (wIdx === 0) lastSnap = { pred: data.pred, pred2: data.pred2, prey: data.prey, prey2: data.prey2 };

  if (completedEpisodes >= CONFIG.POP_SIZE) {
    _evolve();
  } else if (!paused) {
    _dispatch(wIdx);
  } else {
    workerBusy[wIdx] = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialisation
// ═══════════════════════════════════════════════════════════════════════════
function _initCoord(config, simState, mazeState) {
  if (config) {
    Object.assign(CONFIG, config);
    cfgOverride = config;
    if (config.NUM_WORKERS) {
      NUM_WORKERS = config.NUM_WORKERS;
      workerBusy  = new Array(NUM_WORKERS).fill(false);
      if (!ports.length) ports = new Array(NUM_WORKERS).fill(null);
    }
  }

  const tmpMaze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
  if (mazeState) { try { tmpMaze.deserialize(mazeState); } catch (_) {} }
  mazeSave  = tmpMaze.grid.map(r => r.slice());
  mazeDirty = true;

  _initPopulations();
  if (simState) _tryRestore(simState);
  _createSharedMaze();

  initialized = true;
  _startGeneration();

  if (!tickStarted) { tickStarted = true; tick(); }
}

// Allocate a SharedArrayBuffer for the maze so episode workers read it
// directly with zero per-dispatch cloning. Falls back gracefully if the
// page is not cross-origin isolated (e.g. before SW activates on first load).
function _createSharedMaze() {
  if (typeof SharedArrayBuffer === 'undefined') return;
  mazeSAB    = new SharedArrayBuffer(CONFIG.ROWS * CONFIG.COLS);
  mazeShared = new Uint8Array(mazeSAB);
  _syncSharedMaze();
  ports.forEach(p => {
    if (p) p.postMessage({ type: 'sharedMaze', sab: mazeSAB, rows: CONFIG.ROWS, cols: CONFIG.COLS });
  });
}

function _syncSharedMaze() {
  if (!mazeShared || !mazeSave) return;
  for (let r = 0; r < CONFIG.ROWS; r++)
    for (let c = 0; c < CONFIG.COLS; c++)
      mazeShared[r * CONFIG.COLS + c] = mazeSave[r][c];
}

function _initPopulations() {
  predPop  = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PRED_NN_LAYERS));
  predPop2 = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PRED_NN_LAYERS));
  preyPop  = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PREY_NN_LAYERS));
  preyPop2 = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PREY_NN_LAYERS));
  predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  pred2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
}

function _tryRestore(data) {
  try {
    if (!data) return false;
    if (!data.predPop  || data.predPop.length  !== CONFIG.POP_SIZE) return false;
    if (!data.predPop2 || data.predPop2.length !== CONFIG.POP_SIZE) return false;
    if (!data.preyPop  || data.preyPop.length  !== CONFIG.POP_SIZE) return false;
    if (!data.preyPop2 || data.preyPop2.length !== CONFIG.POP_SIZE) return false;
    const expPredLen = predPop[0].getWeights().length;
    const expPreyLen = preyPop[0].getWeights().length;
    if (data.predPop[0].length  !== expPredLen) return false;
    if (data.predPop2[0].length !== expPredLen) return false;
    if (data.preyPop[0].length  !== expPreyLen) return false;
    if (data.preyPop2[0].length !== expPreyLen) return false;
    generation = data.generation || 0;
    history    = data.history    || [];
    data.predPop.forEach( (w, i) => predPop[i].setWeights(w));
    data.predPop2.forEach((w, i) => predPop2[i].setWeights(w));
    data.preyPop.forEach( (w, i) => preyPop[i].setWeights(w));
    data.preyPop2.forEach((w, i) => preyPop2[i].setWeights(w));
    predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    pred2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
    preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
    return true;
  } catch (_) { return false; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Generation management
// ═══════════════════════════════════════════════════════════════════════════

// Episode length ramps linearly from MIN to MAX over RAMP_GENS generations
function _currentEpisodeFrames() {
  const frac = Math.min(1, generation / CONFIG.EPISODE_FRAMES_RAMP_GENS);
  return Math.round(CONFIG.MIN_EPISODE_FRAMES + (CONFIG.MAX_EPISODE_FRAMES - CONFIG.MIN_EPISODE_FRAMES) * frac);
}

function _startGeneration() {
  episodeCfg = Object.assign({}, cfgOverride, { EPISODE_FRAMES: _currentEpisodeFrames() });
  completedEpisodes = 0;
  episodeQueue = Array.from({ length: CONFIG.POP_SIZE }, (_, i) => i);
  displayEp = 0;
  lastSnap  = null;
  _dispatchIdle();
}

function _resetGeneration() {
  genId++;
  episodeCfg = Object.assign({}, cfgOverride, { EPISODE_FRAMES: _currentEpisodeFrames() });
  workerBusy = new Array(NUM_WORKERS).fill(false);
  predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  pred2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  completedEpisodes = 0;
  episodeQueue = Array.from({ length: CONFIG.POP_SIZE }, (_, i) => i);
  displayEp = 0;
  lastSnap  = null;
  displayMaze = null;
  mazeDirty = true;
  if (!paused) _dispatchIdle();
}

function _reset() {
  genId++;
  generation  = 0;
  totalFrames = 0;
  history     = [];
  workerBusy  = new Array(NUM_WORKERS).fill(false);
  _initPopulations();
  completedEpisodes = 0;
  episodeQueue = Array.from({ length: CONFIG.POP_SIZE }, (_, i) => i);
  displayEp = 0;
  lastSnap  = null;
  _postSave(null, true);
  if (!paused && initialized) _dispatchIdle();
}

function _dispatch(wIdx) {
  if (episodeQueue.length === 0) { workerBusy[wIdx] = false; return; }
  const epIdx = episodeQueue.shift();
  if (wIdx === 0) {
    displayEp = epIdx;
    // New episode: reset display maze to canonical so any wall changes from the
    // previous episode are cleared before the next one begins.
    displayMaze = null;
    mazeDirty = true;
  }
  workerBusy[wIdx] = true;
  ports[wIdx].postMessage({
    type:          'run',
    idx:           epIdx,
    genId,
    predW:         predPop[epIdx].getWeights(),
    pred2W:        predPop2[epIdx].getWeights(),
    prey1W:        preyPop[epIdx].getWeights(),
    prey2W:        preyPop2[epIdx].getWeights(),
    mazeGrid:      mazeShared ? null : mazeSave,
    config:        episodeCfg,
    display:       wIdx === 0,
    stepsPerFrame: wIdx === 0 ? speedSteps : 0,  // only throttle the display worker
  });
}

function _dispatchIdle() {
  for (let i = 0; i < NUM_WORKERS; i++) {
    if (!workerBusy[i]) _dispatch(i);
  }
}

function _evolve() {
  const nPred = (cfgOverride?.NUM_PREDATORS) ?? CONFIG.NUM_PREDATORS ?? 2;
  const nPrey = (cfgOverride?.NUM_PREY)      ?? CONFIG.NUM_PREY      ?? 2;

  const predResult  = ga.evolve(predPop, predFitness);
  // Freeze inactive populations: preserve weights unchanged, report zero fitness
  const pred2Result = nPred >= 2
    ? ga.evolve(predPop2, pred2Fitness)
    : { population: predPop2, best: 0, avg: 0 };
  const preyResult  = ga.evolve(preyPop, preyFitness);
  const prey2Result = nPrey >= 2
    ? ga.evolve(preyPop2, prey2Fitness)
    : { population: preyPop2, best: 0, avg: 0 };

  history.push({
    gen:      generation,
    predBest: nPred >= 2 ? Math.max(predResult.best, pred2Result.best) : predResult.best,
    predAvg:  nPred >= 2 ? (predResult.avg + pred2Result.avg) / 2      : predResult.avg,
    preyBest: nPrey >= 2 ? Math.max(preyResult.best, prey2Result.best) : preyResult.best,
    preyAvg:  nPrey >= 2 ? (preyResult.avg + prey2Result.avg) / 2      : preyResult.avg,
  });

  predPop  = predResult.population;
  predPop2 = pred2Result.population;
  preyPop  = preyResult.population;
  preyPop2 = prey2Result.population;
  generation++;

  _postSave({
    generation,
    predPop:  predPop.map(nn  => nn.getWeights()),
    predPop2: predPop2.map(nn => nn.getWeights()),
    preyPop:  preyPop.map(nn  => nn.getWeights()),
    preyPop2: preyPop2.map(nn => nn.getWeights()),
    history,
  });

  // Prepare next generation; dispatch only when not paused.
  // Reset workerBusy: the worker that sent the final result goes straight to
  // _evolve() without passing through _dispatch(), so its busy flag is never
  // cleared otherwise — causing a leak of one slot per generation.
  workerBusy   = new Array(NUM_WORKERS).fill(false);
  predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  pred2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
  prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  completedEpisodes = 0;
  episodeQueue = Array.from({ length: CONFIG.POP_SIZE }, (_, i) => i);
  displayEp = 0;
  lastSnap  = null;

  _startGeneration();
}

// ═══════════════════════════════════════════════════════════════════════════
// Flush / render loop
// ═══════════════════════════════════════════════════════════════════════════
function _postSave(data, force = false) {
  const now = Date.now();
  // Throttle saves: JSON.stringify of the full state is expensive.  Running it
  // every generation at 10+ gens/sec blocks the main thread long enough to
  // back up the dispatch queue and stall the simulation.  Null saves (reset)
  // are always sent immediately.
  if (data !== null && !force && now - lastSaveMs < 5000) return;
  lastSaveMs = now;
  self.postMessage({ type: 'save', simState: data });
}

function tick() {
  const now = Date.now();
  if (now - lastFlushMs >= 16) {
    _flush();
    lastFlushMs = now;
  }
  setTimeout(tick, 0);
}

function _flush() {
  const msg = {
    type:            'frame',
    pred:            lastSnap ? lastSnap.pred  : null,
    pred2:           lastSnap ? lastSnap.pred2 : null,
    prey:            lastSnap ? lastSnap.prey  : null,
    prey2:           lastSnap ? lastSnap.prey2 : null,
    generation,
    episode:         displayEp,
    episodeProgress: CONFIG.POP_SIZE > 0 ? completedEpisodes / CONFIG.POP_SIZE : 0,
    totalFrames,
    history,
  };
  const mazeForDisplay = displayMaze || mazeSave;
  if (mazeDirty && mazeForDisplay) {
    msg.maze = mazeForDisplay.map(r => r.slice());
    mazeDirty = false;
  }
  self.postMessage(msg);
}
