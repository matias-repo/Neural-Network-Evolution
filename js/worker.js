importScripts(
  'config.js',
  'NeuralNetwork.js',
  'GeneticAlgorithm.js',
  'Maze.js',
  'Agent.js',
  'Simulation.js'
);

const maze = new Maze(CONFIG.COLS, CONFIG.ROWS, CONFIG.CELL_SIZE);
const sim  = new Simulation(maze);

sim.onSave = (data) => self.postMessage({ type: 'save', simState: data });

let paused        = true;
let stepsPerBatch = 1;
let lastPostMs    = 0;
let lastTickMs    = 0;

self.onmessage = ({ data: msg }) => {
  switch (msg.type) {

    case 'restore':
      if (msg.mazeState) {
        try { maze.deserialize(msg.mazeState); } catch (_) {}
      }
      sim._snapshotMaze();         // lock in this maze as the permanent baseline
      if (msg.simState) sim.tryRestore(msg.simState);
      paused = false;
      flush(true);
      break;

    case 'setSpeed':
      stepsPerBatch = msg.steps;
      break;

    case 'pause':
      paused = true;
      break;

    case 'resume':
      paused = false;
      break;

    case 'reset':
      sim.reset();
      flush(true);
      break;

    case 'syncMaze':
      for (let r = 0; r < maze.rows; r++)
        for (let c = 0; c < maze.cols; c++)
          maze.grid[r][c] = msg.grid[r][c];
      sim.onMazeChanged();
      flush(true);
      break;
  }
};

function agentSnap(agent) {
  if (!agent) return null;
  return {
    type:         agent.type,
    x:            agent.x,
    y:            agent.y,
    vx:           agent.vx,
    vy:           agent.vy,
    speed:        agent.speed,
    facingLeft:   agent.facingLeft,
    carryingWall: agent.carryingWall,
    alive:        agent.alive,
  };
}

function flush(includeMaze) {
  const msg = {
    type:            'frame',
    pred:            agentSnap(sim.predator),
    prey:            agentSnap(sim.prey),
    prey2:           agentSnap(sim.prey2),
    generation:      sim.generation,
    episode:         sim.episode,
    episodeProgress: sim.episodeProgress,
    totalFrames:     sim.totalFrames,
    history:         sim.history,
  };
  if (includeMaze || maze.dirty) {
    msg.maze = maze.grid.map(row => row.slice());
    maze.dirty = false;
  }
  self.postMessage(msg);
}

function tick() {
  const now = Date.now();
  if (!paused) {
    // Speeds < 100 are rate-limited to ~60 batches/sec to match the old RAF cadence.
    // Speeds >= 100 run as fast as the CPU allows (the whole point of the worker).
    const throttled = stepsPerBatch < 100;
    if (!throttled || now - lastTickMs >= 16) {
      for (let i = 0; i < stepsPerBatch; i++) sim._step();
      lastTickMs = now;
    }
  }
  if (now - lastPostMs >= 16) {
    flush(false);
    lastPostMs = now;
  }
  setTimeout(tick, 0);
}

tick();
