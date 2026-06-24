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
  RAY_STEP: 6,           // coarser but 2× faster ray marching

  // Episode
  EPISODE_FRAMES: 500,   // fewer frames → faster generations
  MIN_START_DIST: 150,   // scaled for narrower canvas
  CATCH_DIST: 20,

  // Evolution
  POP_SIZE: 20,          // fewer episodes per gen → faster evolution cycles
  MUTATION_RATE: 0.12,
  MUTATION_STRENGTH: 0.25,
  ELITE_COUNT: 2,

  // Neural-network layer sizes
  // inputs 0-7:   8 wall rays (wall sensing / block navigation)
  // inputs 8-11:  own x/y + opponent x/y (all normalized 0-1, always exact)
  // inputs 12-15: own vx/vy + opponent vx/vy (normalized, for movement prediction)
  // input  16:    carryingWall (0 or 1)
  // outputs 0-1: ax, ay   output 2: interact (tanh > 0.5 = pickup or place)
  NN_LAYERS: [17, 24, 14, 3],

  // Fitness shaping
  // Predator gets a proximity bonus proportional to its closest approach,
  // so it has a gradient to climb even when it doesn't catch the prey.
  PRED_PROXIMITY_WEIGHT: 0.4,   // closest-approach bonus = weight × EPISODE_FRAMES

  // Wall interaction
  WALL_INTERACT_COOLDOWN: 20,   // sim-frames between pickups / placements
  WALL_CARRY_SPEED: 0.65,       // max-speed multiplier while holding a wall
  WALL_PICKUP_BONUS: 0,         // direct bonus removed — strategic use earns fitness through primary objectives

  // Canvas
  CANVAS_W: 360,
  CANVAS_H: 600,
};
