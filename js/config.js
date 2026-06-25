const VERSION = '1.1.0';

const CONFIG = {
  // Grid – portrait 18×30 at 20 px = 360×600
  COLS: 18,
  ROWS: 30,
  CELL_SIZE: 20,

  // Agent physics
  AGENT_RADIUS: 7,
  PRED_MAX_SPEED: 4.2,
  PREY_MAX_SPEED: 3.5,
  MAX_SPEED: 4.2,        // normalization reference for NN velocity inputs
  ACCELERATION: 0.55,
  FRICTION: 0.80,

  // Stamina — agents tire at high speed and recover at rest
  STAMINA_DRAIN: 0.004,  // deducted per frame × (speed / topSpeed)
  STAMINA_REGEN: 0.001,  // added per frame passively
  STAMINA_MIN:   0.2,    // floor — agents never fully stop

  // Sensors
  RAY_COUNT: 8,
  RAY_MAX_DIST: 150,
  RAY_STEP: 6,

  // Episode — length ramps from MIN to MAX over RAMP_GENS generations
  EPISODE_FRAMES: 200,            // initial value; overridden per-generation by coordinator
  MIN_EPISODE_FRAMES: 200,
  MAX_EPISODE_FRAMES: 800,
  EPISODE_FRAMES_RAMP_GENS: 500,  // generations to reach MAX
  MIN_START_DIST: 150,
  CATCH_DIST: 20,

  // Evolution
  POP_SIZE: 100,
  MUTATION_RATE: 0.12,
  MUTATION_STRENGTH: 0.25,
  ELITE_COUNT: 5,

  // Neural-network layer sizes — 2 predators vs 2 prey, with stamina
  //
  // Predator (26 inputs): rays[0-7],
  //   rel(prey1) x/y, rel(prey2) x/y, rel(ally_pred) x/y,
  //   own vx/vy, prey1 vx/vy, prey2 vx/vy, ally_pred vx/vy,
  //   prey1_alive, prey2_alive, stamina, carryingWall
  //
  // Prey (25 inputs): rays[0-7],
  //   rel(pred1) x/y, rel(pred2) x/y, rel(ally) x/y,
  //   own vx/vy, pred1 vx/vy, pred2 vx/vy, ally vx/vy,
  //   ally_alive, stamina, carryingWall
  //
  // Outputs (both): ax, ay, interact
  PRED_NN_LAYERS: [26, 14, 7, 3],
  PREY_NN_LAYERS: [25, 14, 7, 3],

  // Fitness shaping
  PRED_PROXIMITY_WEIGHT: 0.15,

  // Wall interaction
  WALL_INTERACT_COOLDOWN: 20,
  WALL_CARRY_SPEED: 0.65,
  WALL_INTERACT_THRESHOLD: 0.9,
  WALL_PICKUP_BONUS: 0,

  // Canvas
  CANVAS_W: 360,
  CANVAS_H: 600,
};
