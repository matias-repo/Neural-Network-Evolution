const CONFIG = {
  // Grid – portrait 18×30 at 20 px = 360×600
  COLS: 18,
  ROWS: 30,
  CELL_SIZE: 20,

  // Agent physics
  AGENT_RADIUS: 7,
  MAX_SPEED: 3.5,
  ACCELERATION: 0.55,
  FRICTION: 0.80,

  // Sensors
  RAY_COUNT: 8,
  RAY_MAX_DIST: 150,
  RAY_STEP: 3,

  // Episode
  EPISODE_FRAMES: 900,
  MIN_START_DIST: 150,   // scaled for narrower canvas
  CATCH_DIST: 14,

  // Evolution
  POP_SIZE: 30,
  MUTATION_RATE: 0.12,
  MUTATION_STRENGTH: 0.25,
  ELITE_COUNT: 2,

  // Neural-network layer sizes
  NN_LAYERS: [13, 20, 12, 2],

  // Canvas
  CANVAS_W: 360,
  CANVAS_H: 600,
};
