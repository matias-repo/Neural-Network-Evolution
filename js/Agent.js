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
    this.stamina = 1.0;

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
    this.stamina = 1.0;
    this.rays.fill(1);
    this.carryingWall    = false;
    this._wallCooldown   = 0;
    this.wallInteractions = 0;
  }

  // ── Sensors ───────────────────────────────────────────────────────────────
  // Predator inputs [26]: rays[0-7],
  //   rel(prey1) x/y, rel(prey2) x/y, rel(ally_pred) x/y,
  //   own vx/vy, prey1 vx/vy, prey2 vx/vy, ally_pred vx/vy,
  //   prey1_alive, prey2_alive, stamina, carryingWall
  //
  // Prey inputs [25]: rays[0-7],
  //   rel(pred1) x/y, rel(pred2) x/y, rel(ally_prey) x/y,
  //   own vx/vy, pred1 vx/vy, pred2 vx/vy, ally_prey vx/vy,
  //   ally_alive, stamina, carryingWall
  sense(maze, agent1, agent2, agent3) {
    const rc  = CONFIG.RAY_COUNT;
    const inp = this._inputs;
    let   n   = 0;

    for (let i = 0; i < rc; i++) {
      const angle = (i / rc) * Math.PI * 2;
      const d = maze.castRay(this.x, this.y, angle, CONFIG.RAY_MAX_DIST, CONFIG.RAY_STEP);
      this.rays[i] = d;
      inp[n++] = d;
    }

    // Relative positions (agent1=primary target, agent2=secondary target, agent3=ally)
    inp[n++] = (agent1.x - this.x) / CONFIG.CANVAS_W;
    inp[n++] = (agent1.y - this.y) / CONFIG.CANVAS_H;
    inp[n++] = (agent2.x - this.x) / CONFIG.CANVAS_W;
    inp[n++] = (agent2.y - this.y) / CONFIG.CANVAS_H;
    inp[n++] = (agent3.x - this.x) / CONFIG.CANVAS_W;
    inp[n++] = (agent3.y - this.y) / CONFIG.CANVAS_H;

    // Velocities: own, agent1, agent2, agent3
    inp[n++] = this.vx    / CONFIG.MAX_SPEED;
    inp[n++] = this.vy    / CONFIG.MAX_SPEED;
    inp[n++] = agent1.vx  / CONFIG.MAX_SPEED;
    inp[n++] = agent1.vy  / CONFIG.MAX_SPEED;
    inp[n++] = agent2.vx  / CONFIG.MAX_SPEED;
    inp[n++] = agent2.vy  / CONFIG.MAX_SPEED;
    inp[n++] = agent3.vx  / CONFIG.MAX_SPEED;
    inp[n++] = agent3.vy  / CONFIG.MAX_SPEED;

    if (this.type === 'predator') {
      inp[n++] = agent1.alive ? 1 : 0;  // prey1_alive
      inp[n++] = agent2.alive ? 1 : 0;  // prey2_alive
    } else {
      inp[n++] = agent3.alive ? 1 : 0;  // ally_alive
    }

    inp[n++] = this.stamina;
    inp[n++] = this.carryingWall ? 1 : 0;

    return inp;
  }

  // ── Physics update ────────────────────────────────────────────────────────
  // agent1/agent2: opposing team targets; agent3: same-team ally
  update(maze, agent1, agent2, agent3) {
    if (!this.alive) return;

    const inputs = this.sense(maze, agent1, agent2, agent3);
    const [ax, ay, interact] = this.nn.forward(inputs);
    this.lastOutputs = [ax, ay, interact];

    this.vx = (this.vx + ax * CONFIG.ACCELERATION) * CONFIG.FRICTION;
    this.vy = (this.vy + ay * CONFIG.ACCELERATION) * CONFIG.FRICTION;

    const topSpeed = this.type === 'predator' ? CONFIG.PRED_MAX_SPEED : CONFIG.PREY_MAX_SPEED;
    const maxSpd   = topSpeed * (this.carryingWall ? CONFIG.WALL_CARRY_SPEED : 1) * this.stamina;
    let spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd > maxSpd) {
      const ratio = maxSpd / spd;
      this.vx *= ratio; this.vy *= ratio; spd = maxSpd;
    }
    // Stamina drains proportionally to speed, regenerates passively
    this.stamina = Math.max(CONFIG.STAMINA_MIN, Math.min(1,
      this.stamina - (spd / topSpeed) * CONFIG.STAMINA_DRAIN + CONFIG.STAMINA_REGEN
    ));

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
