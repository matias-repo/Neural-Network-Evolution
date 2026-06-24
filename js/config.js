const CONFIG = {
  // Grid dimensions
  COLS: 40,
  ROWS: 30,
  CELL_SIZE: 20,

  // Agent physics
  AGENT_RADIUS: 7,
  MAX_SPEED: 3.5,
  ACCELERATION: 0.55,
  FRICTION: 0.80,

  // Sensors (8 rays equally spaced around agent)
  RAY_COUNT: 8,
  RAY_MAX_DIST: 200,
  RAY_STEP: 3,

  // Episode
  EPISODE_FRAMES: 900,   // 15 s at 60 fps
  MIN_START_DIST: 220,   // px between pred/prey spawn
  CATCH_DIST: 14,        // px – predator catches prey within this distance

  // Evolution
  POP_SIZE: 30,
  MUTATION_RATE: 0.12,
  MUTATION_STRENGTH: 0.25,
  ELITE_COUNT: 2,

  // Neural-network layer sizes  [inputs, ...hidden, outputs]
  NN_LAYERS: [13, 20, 12, 2],

  // Canvas
  CANVAS_W: 800,
  CANVAS_H: 600,
};
