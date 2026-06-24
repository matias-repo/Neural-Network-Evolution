class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;  // keep pixels crisp
    this.showGrid = false;

    // Pixels per sprite pixel.  Prey = 2 (20×20), Predator = 3 (30×30).
    this.PREY_SCALE  = 2;
    this.PRED_SCALE  = 3;

    // Distance thresholds for animation state switches
    this.FEAR_DIST  = 160;  // prey shows fear below this
    this.CHASE_DIST = 200;  // predator shows chase below this

    // Animation speed (game frames per sprite frame)
    this.WALK_DUR  = 10;
    this.FEAR_DUR  = 4;
    this.CHASE_DUR = 4;
  }

  render(maze, sim, mode) {
    this.ctx.imageSmoothingEnabled = false;
    this._drawMaze(maze, mode);

    if (mode !== 'edit') {
      const dist = sim.predator && sim.prey
        ? Math.hypot(sim.predator.x - sim.prey.x, sim.predator.y - sim.prey.y)
        : Infinity;

      // Prey drawn first so predator appears on top
      this._drawCharacter(sim.prey,     dist, sim.totalFrames);
      this._drawCharacter(sim.predator, dist, sim.totalFrames);
    }
  }

  // ── Maze ──────────────────────────────────────────────────────────────────

  _drawMaze(maze, mode) {
    const ctx = this.ctx;
    const cs  = maze.cellSize;

    // Floor – subtle two-tone checkerboard at cell level
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#0d0d1a' : '#0f101e';
        ctx.fillRect(c * cs, r * cs, cs, cs);
      }
    }

    // Walls with pixel-art brick shading
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (!maze.grid[r][c]) continue;
        const x = c * cs, y = r * cs;

        // Base wall
        ctx.fillStyle = '#1a2460';
        ctx.fillRect(x, y, cs, cs);

        // Top-left bevel highlight (1 px)
        ctx.fillStyle = '#3050a8';
        ctx.fillRect(x,     y,     cs, 1);
        ctx.fillStyle = '#243490';
        ctx.fillRect(x,     y + 1, 1, cs - 1);

        // Bottom-right shadow (1 px)
        ctx.fillStyle = '#0c1438';
        ctx.fillRect(x,     y + cs - 1, cs, 1);
        ctx.fillRect(x + cs - 1, y,     1, cs);

        // Horizontal mortar line offset per column for brick illusion
        const mortarY = y + (c % 2 === 0 ? Math.floor(cs / 2) : Math.floor(cs / 3));
        ctx.fillStyle = '#111a50';
        ctx.fillRect(x + 1, mortarY, cs - 2, 1);
      }
    }

    // Grid overlay (edit mode or option)
    if (this.showGrid || mode === 'edit') {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (let c = 0; c <= maze.cols; c++) ctx.fillRect(c * cs, 0, 1, CONFIG.CANVAS_H);
      for (let r = 0; r <= maze.rows; r++) ctx.fillRect(0, r * cs, CONFIG.CANVAS_W, 1);
    }
  }

  // ── Characters ────────────────────────────────────────────────────────────

  _drawCharacter(agent, distToOpponent, totalFrames) {
    if (!agent) return;
    const isPrey = agent.type === 'prey';

    // Pick animation set and timing
    let frames, pal, dur;
    if (isPrey) {
      const scared = distToOpponent < this.FEAR_DIST;
      frames = scared ? SPRITES.prey.fear  : SPRITES.prey.walk;
      pal    = SPRITES.prey.pal;
      dur    = scared ? this.FEAR_DUR : this.WALK_DUR;
    } else {
      const chasing = distToOpponent < this.CHASE_DIST;
      frames = chasing ? SPRITES.predator.chase : SPRITES.predator.walk;
      pal    = SPRITES.predator.pal;
      dur    = chasing ? this.CHASE_DUR : this.WALK_DUR;
    }

    // Slow animation down when barely moving
    const movingFast = agent.speed > CONFIG.MAX_SPEED * 0.25;
    const effectiveDur = movingFast ? dur : dur * 3;

    const frameIdx = Math.floor(totalFrames / effectiveDur) % frames.length;
    const frame    = frames[frameIdx];
    const scale    = isPrey ? this.PREY_SCALE : this.PRED_SCALE;
    const flip     = agent.facingLeft;

    const cx = Math.round(agent.x);
    const cy = Math.round(agent.y);

    // 1-pixel dark drop shadow (offset 1 sprite-pixel = scale screen pixels)
    drawSpriteShadow(this.ctx, frame, cx + scale, cy + scale, scale, flip, '#000010', 0.45);

    // Character sprite
    drawSprite(this.ctx, frame, pal, cx, cy, scale, flip);
  }

  // ── Fitness chart ─────────────────────────────────────────────────────────

  drawChart(canvas, history) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#08081a';
    ctx.fillRect(0, 0, W, H);

    if (history.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px monospace';
      ctx.fillText('Waiting for data…', 6, H / 2 + 4);
      return;
    }

    const maxVal = Math.max(
      CONFIG.EPISODE_FRAMES * 1.5,
      ...history.map(h => Math.max(h.predBest, h.preyBest))
    );
    const pad = { t: 4, b: 14, l: 4, r: 4 };
    const cW = W - pad.l - pad.r;
    const cH = H - pad.t - pad.b;
    const toX = i => pad.l + (i / (history.length - 1)) * cW;
    const toY = v => pad.t + cH - (v / maxVal) * cH;

    const line = (key, color, alpha) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = alpha;
      history.forEach((h, i) => {
        i === 0 ? ctx.moveTo(toX(i), toY(h[key])) : ctx.lineTo(toX(i), toY(h[key]));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    line('predAvg',  '#ff4444', 0.35);
    line('preyAvg',  '#00ff88', 0.35);
    line('predBest', '#ff4444', 1);
    line('preyBest', '#00ff88', 1);

    ctx.fillStyle  = 'rgba(255,255,255,0.25)';
    ctx.font       = '9px monospace';
    ctx.textAlign  = 'left';
    ctx.fillText(`Gen ${history[0].gen}`, pad.l, H - 2);
    ctx.textAlign  = 'right';
    ctx.fillText(`Gen ${history[history.length - 1].gen}`, W - pad.r, H - 2);
    ctx.textAlign  = 'left';
  }
}
