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

    // Wall interaction
    this.carryingWall   = false;
    this._wallCooldown  = 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.fitness = 0;
    this.rays = new Array(CONFIG.RAY_COUNT).fill(1);
    this.carryingWall  = false;
    this._wallCooldown = 0;
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
    inputs.push(this.carryingWall ? 1 : 0);

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

    // Clamp to max speed (reduced while carrying a wall)
    const maxSpd = CONFIG.MAX_SPEED * (this.carryingWall ? CONFIG.WALL_CARRY_SPEED : 1);
    const spd    = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > maxSpd) {
      this.vx = (this.vx / spd) * maxSpd;
      this.vy = (this.vy / spd) * maxSpd;
    }

    // Track facing direction for sprite flip
    if (Math.abs(this.vx) > 0.15) this.facingLeft = this.vx < 0;

    // Axis-separated collision resolution
    const R = CONFIG.AGENT_RADIUS;
    this.x += this.vx;
    if (maze.isBlocked(this.x, this.y, R)) { this.x -= this.vx; this.vx *= -0.3; }
    this.y += this.vy;
    if (maze.isBlocked(this.x, this.y, R)) { this.y -= this.vy; this.vy *= -0.3; }

    // Wall interaction (output index 2)
    if (this._wallCooldown > 0) {
      this._wallCooldown--;
    } else if ((this.lastOutputs[2] || 0) > 0.5) {
      const spd   = this.speed;
      const angle = spd > 0.3 ? Math.atan2(this.vy, this.vx) : (this.facingLeft ? Math.PI : 0);
      const { col, row } = maze.getCellAt(
        this.x + Math.cos(angle) * maze.cellSize,
        this.y + Math.sin(angle) * maze.cellSize
      );
      if (!this.carryingWall) {
        if (maze.tryPickupWall(col, row)) {
          this.carryingWall  = true;
          this._wallCooldown = CONFIG.WALL_INTERACT_COOLDOWN;
        }
      } else {
        if (maze.tryPlaceWall(col, row)) {
          this.carryingWall  = false;
          this._wallCooldown = CONFIG.WALL_INTERACT_COOLDOWN;
        }
      }
    }
  }

  get speed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }
}
