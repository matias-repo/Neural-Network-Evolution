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
  // inputs 0-12: 8 wall rays + opponent dx/dy/dist + own vx/vy
  // input  13:   carryingWall (0 or 1)
  // outputs 0-1: ax, ay   output 2: interact (tanh > 0.5 = pickup or place)
  NN_LAYERS: [14, 20, 12, 3],

  // Wall interaction
  WALL_INTERACT_COOLDOWN: 20,   // sim-frames between pickups / placements
  WALL_CARRY_SPEED: 0.65,       // max-speed multiplier while holding a wall
  WALL_PICKUP_BONUS: 10,        // fitness bonus per successful pickup or placement

  // Canvas
  CANVAS_W: 360,
  CANVAS_H: 600,
};
