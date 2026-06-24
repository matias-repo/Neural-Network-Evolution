class Agent {
  constructor(type, nn) {
    this.type = type; // 'predator' | 'prey'
    this.nn = nn;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.fitness = 0;
    this.alive = true;

    // Pre-allocated buffers — reused every frame to avoid per-call heap allocations.
    this.rays       = new Float32Array(CONFIG.RAY_COUNT).fill(1);
    this._inputs    = new Float32Array(type === 'predator' ? CONFIG.PRED_NN_LAYERS[0] : CONFIG.PREY_NN_LAYERS[0]);
    this.lastInputs = this._inputs;
    this.lastOutputs = [0, 0, 0];

    this.facingLeft = false;

    this.carryingWall    = false;
    this._wallCooldown   = 0;
    this.wallInteractions = 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.fitness = 0;
    this.alive = true;
    this.rays.fill(1);
    this.carryingWall    = false;
    this._wallCooldown   = 0;
    this.wallInteractions = 0;
  }

  // ── Sensors ───────────────────────────────────────────────────────────────
  // agent1: primary target  (predator → prey1,    prey → predator)
  // agent2: secondary agent (predator → prey2,    prey → ally prey)
  //
  // Predator inputs [23]:
  //   [0-7]   wall rays
  //   [8-9]   own x/y          [10-11] agent1 x/y   [12-13] agent2 x/y
  //   [14-15] own vx/vy        [16-17] agent1 vx/vy [18-19] agent2 vx/vy
  //   [20]    agent1 alive      [21]    agent2 alive  [22]    carryingWall
  //
  // Prey inputs [22]:
  //   [0-7]   wall rays
  //   [8-9]   own x/y          [10-11] agent1 x/y   [12-13] agent2 x/y
  //   [14-15] own vx/vy        [16-17] agent1 vx/vy [18-19] agent2 vx/vy
  //   [20]    agent2 alive      [21]    carryingWall
  sense(maze, agent1, agent2) {
    const rc  = CONFIG.RAY_COUNT;
    const inp = this._inputs;
    let   n   = 0;

    for (let i = 0; i < rc; i++) {
      const angle = (i / rc) * Math.PI * 2;
      const d = maze.castRay(this.x, this.y, angle, CONFIG.RAY_MAX_DIST, CONFIG.RAY_STEP);
      this.rays[i] = d;
      inp[n++] = d;
    }

    // Own position
    inp[n++] = this.x / CONFIG.CANVAS_W;
    inp[n++] = this.y / CONFIG.CANVAS_H;

    // Agent1 position
    inp[n++] = agent1.x / CONFIG.CANVAS_W;
    inp[n++] = agent1.y / CONFIG.CANVAS_H;

    // Agent2 position
    inp[n++] = agent2.x / CONFIG.CANVAS_W;
    inp[n++] = agent2.y / CONFIG.CANVAS_H;

    // Own velocity
    inp[n++] = this.vx / CONFIG.MAX_SPEED;
    inp[n++] = this.vy / CONFIG.MAX_SPEED;

    // Agent1 velocity
    inp[n++] = agent1.vx / CONFIG.MAX_SPEED;
    inp[n++] = agent1.vy / CONFIG.MAX_SPEED;

    // Agent2 velocity
    inp[n++] = agent2.vx / CONFIG.MAX_SPEED;
    inp[n++] = agent2.vy / CONFIG.MAX_SPEED;

    if (this.type === 'predator') {
      inp[n++] = agent1.alive ? 1 : 0;
      inp[n++] = agent2.alive ? 1 : 0;
    } else {
      inp[n++] = agent2.alive ? 1 : 0;
    }

    inp[n++] = this.carryingWall ? 1 : 0;

    return inp;
  }

  // ── Physics update ────────────────────────────────────────────────────────
  // agent1/agent2 same convention as sense()
  update(maze, agent1, agent2) {
    if (!this.alive) return;

    const inputs = this.sense(maze, agent1, agent2);
    const [ax, ay, interact] = this.nn.forward(inputs);
    this.lastOutputs = [ax, ay, interact];

    this.vx = (this.vx + ax * CONFIG.ACCELERATION) * CONFIG.FRICTION;
    this.vy = (this.vy + ay * CONFIG.ACCELERATION) * CONFIG.FRICTION;

    const topSpeed = this.type === 'predator' ? CONFIG.PRED_MAX_SPEED : CONFIG.PREY_MAX_SPEED;
    const maxSpd = topSpeed * (this.carryingWall ? CONFIG.WALL_CARRY_SPEED : 1);
    const spd    = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > maxSpd) {
      this.vx = (this.vx / spd) * maxSpd;
      this.vy = (this.vy / spd) * maxSpd;
    }

    if (Math.abs(this.vx) > 0.15) this.facingLeft = this.vx < 0;

    const R = CONFIG.AGENT_RADIUS;
    this.x += this.vx;
    if (maze.isBlocked(this.x, this.y, R)) { this.x -= this.vx; this.vx = 0; }
    this.y += this.vy;
    if (maze.isBlocked(this.x, this.y, R)) { this.y -= this.vy; this.vy = 0; }

    if (this._wallCooldown > 0) {
      this._wallCooldown--;
    } else if (interact > CONFIG.WALL_INTERACT_THRESHOLD) {
      const spd   = this.speed;
      const angle = spd > 0.3 ? Math.atan2(this.vy, this.vx) : (this.facingLeft ? Math.PI : 0);
      const { col, row } = maze.getCellAt(
        this.x + Math.cos(angle) * maze.cellSize,
        this.y + Math.sin(angle) * maze.cellSize
      );
      if (!this.carryingWall) {
        if (maze.tryPickupWall(col, row)) {
          this.carryingWall    = true;
          this._wallCooldown   = CONFIG.WALL_INTERACT_COOLDOWN;
          this.wallInteractions++;
        }
      } else {
        if (maze.tryPlaceWall(col, row)) {
          if (maze.isBlocked(this.x, this.y, R)) {
            // Revert: wall would overlap agent's own body
            maze.grid[row][col] = 0;
            maze.dirty = true;
          } else {
            this.carryingWall  = false;
            this._wallCooldown = CONFIG.WALL_INTERACT_COOLDOWN;
            this.wallInteractions++;
          }
        }
      }
    }
  }

  get speed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }
}
