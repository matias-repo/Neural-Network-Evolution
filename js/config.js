const VERSION = '1.0.10';

const CONFIG = {
  // Grid – portrait 18×30 at 20 px = 360×600
  COLS: 18,
  ROWS: 30,
  CELL_SIZE: 20,

  // Agent physics
  AGENT_RADIUS: 7,
  PRED_MAX_SPEED: 4.2,   // predator is faster so it can actually catch prey
  PREY_MAX_SPEED: 3.5,
  MAX_SPEED: 4.2,        // normalization reference for NN velocity inputs (= pred top speed)
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
  POP_SIZE: 100,         // larger pop = better weight-space coverage per generation
  MUTATION_RATE: 0.12,
  MUTATION_STRENGTH: 0.25,
  ELITE_COUNT: 5,        // ~5% elitism (was 10% at pop 30) — more room for diversity

  // Neural-network layer sizes — predator and prey have different input counts
  // Predator (21 inputs): rays[0-7],
  //                       rel(prey1) x/y, rel(prey2) x/y,   ← relative, not absolute
  //                       own vx/vy, prey1 vx/vy, prey2 vx/vy,
  //                       prey1_alive, prey2_alive, carryingWall
  // Prey (20 inputs):     rays[0-7],
  //                       rel(predator) x/y, rel(ally) x/y, ← relative, not absolute
  //                       own vx/vy, predator vx/vy, ally vx/vy,
  //                       ally_alive, carryingWall
  // Outputs (both): ax, ay, interact
  // Relative positions mean "direction to target" is directly readable by a single
  // linear layer — the NN no longer needs to learn subtraction from absolute coords.
  PRED_NN_LAYERS: [21, 12, 6, 3],
  PREY_NN_LAYERS: [20, 12, 6, 3],

  // Fitness shaping
  // Predator gets a proximity bonus proportional to its closest approach.
  // Weight kept small (0.15) so any catch is always worth more than proximity alone —
  // avoids the local optimum of "orbit near prey without committing to the catch."
  //   proximity @ 50px  = 0.15 × 0.93 × 500 ≈  70  (always < slowest catch ≈ 135)
  //   catch at frame 490 = (500-490) + 125    = 135
  PRED_PROXIMITY_WEIGHT: 0.15,

  // Wall interaction
  WALL_INTERACT_COOLDOWN: 20,    // sim-frames between pickups / placements
  WALL_CARRY_SPEED: 0.65,        // max-speed multiplier while holding a wall
  WALL_INTERACT_THRESHOLD: 0.9,  // NN interact output must exceed this to trigger — prevents noise-driven pickups
  WALL_PICKUP_BONUS: 0,          // direct bonus removed — strategic use earns fitness through primary objectives

  // Canvas
  CANVAS_W: 360,
  CANVAS_H: 600,
};
