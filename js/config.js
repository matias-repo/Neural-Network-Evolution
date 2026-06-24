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

  // Neural-network layer sizes — predator and prey have different input counts
  // Predator (23 inputs): rays[0-7], own x/y, prey1 x/y, prey2 x/y,
  //                       own vx/vy, prey1 vx/vy, prey2 vx/vy,
  //                       prey1_alive, prey2_alive, carryingWall
  // Prey (22 inputs):     rays[0-7], own x/y, predator x/y, ally x/y,
  //                       own vx/vy, predator vx/vy, ally vx/vy,
  //                       ally_alive, carryingWall
  // Outputs (both): ax, ay, interact
  PRED_NN_LAYERS: [23, 28, 16, 3],
  PREY_NN_LAYERS: [22, 28, 16, 3],

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
