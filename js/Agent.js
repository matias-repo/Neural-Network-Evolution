class Agent {
  constructor(type, nn) {
    this.type = type; // 'predator' | 'prey'
    this.nn = nn;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.fitness = 0;

    // Cached sensor data (rays still used for NN inputs, not rendered)
    this.rays = new Array(CONFIG.RAY_COUNT).fill(1);
    this.lastInputs = [];
    this.lastOutputs = [0, 0];

    // Sprite state
    this.facingLeft = false;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.fitness = 0;
    this.rays = new Array(CONFIG.RAY_COUNT).fill(1);
  }

  // ── Sensors → 13 inputs ──────────────────────────────────────────────────
  //  [0..7]  wall ray distances (1 = clear, 0 = wall right here)
  //  [8]     relative x to opponent (clamped to [-1,1])
  //  [9]     relative y to opponent (clamped to [-1,1])
  //  [10]    distance to opponent normalised
  //  [11]    own vx / MAX_SPEED
  //  [12]    own vy / MAX_SPEED
  sense(maze, opponent) {
    const rc = CONFIG.RAY_COUNT;
    const inputs = [];

    for (let i = 0; i < rc; i++) {
      const angle = (i / rc) * Math.PI * 2;
      const d = maze.castRay(this.x, this.y, angle, CONFIG.RAY_MAX_DIST, CONFIG.RAY_STEP);
      this.rays[i] = d;
      inputs.push(d);
    }

    const MAX_DIST = Math.hypot(CONFIG.CANVAS_W, CONFIG.CANVAS_H);
    const dx = (opponent.x - this.x) / MAX_DIST;
    const dy = (opponent.y - this.y) / MAX_DIST;
    const dist = Math.hypot(dx, dy); // already normalised

    inputs.push(Math.max(-1, Math.min(1, dx * 4)));  // amplify for sensitivity
    inputs.push(Math.max(-1, Math.min(1, dy * 4)));
    inputs.push(Math.min(1, dist * 4));
    inputs.push(this.vx / CONFIG.MAX_SPEED);
    inputs.push(this.vy / CONFIG.MAX_SPEED);

    this.lastInputs = inputs;
    return inputs;
  }

  // ── Physics update ────────────────────────────────────────────────────────
  update(maze, opponent) {
    const inputs = this.sense(maze, opponent);
    const [ax, ay] = this.nn.forward(inputs);
    this.lastOutputs = [ax, ay];

    this.vx = (this.vx + ax * CONFIG.ACCELERATION) * CONFIG.FRICTION;
    this.vy = (this.vy + ay * CONFIG.ACCELERATION) * CONFIG.FRICTION;

    // Clamp to max speed
    const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > CONFIG.MAX_SPEED) {
      this.vx = (this.vx / spd) * CONFIG.MAX_SPEED;
      this.vy = (this.vy / spd) * CONFIG.MAX_SPEED;
    }

    // Track facing direction for sprite flip
    if (Math.abs(this.vx) > 0.15) this.facingLeft = this.vx < 0;

    // Axis-separated collision: try to push the wall before bouncing
    const R  = CONFIG.AGENT_RADIUS;
    const cs = maze.cellSize;

    this.x += this.vx;
    if (maze.isBlocked(this.x, this.y, R)) {
      const sx  = Math.sign(this.vx);
      const col = Math.floor((this.x + sx * R) / cs);
      const row = Math.floor(this.y / cs);
      if (!maze.tryPushWall(col, row, col + sx, row) || maze.isBlocked(this.x, this.y, R)) {
        this.x -= this.vx; this.vx *= -0.3;
      }
    }

    this.y += this.vy;
    if (maze.isBlocked(this.x, this.y, R)) {
      const sy  = Math.sign(this.vy);
      const col = Math.floor(this.x / cs);
      const row = Math.floor((this.y + sy * R) / cs);
      if (!maze.tryPushWall(col, row, col, row + sy) || maze.isBlocked(this.x, this.y, R)) {
        this.y -= this.vy; this.vy *= -0.3;
      }
    }
  }

  get speed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }
}
