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

    this._drawHUD(sim);
  }

  // ── HUD overlay (top-right corner of canvas) ───────────────────────────────

  _drawHUD(sim) {
    const ctx = this.ctx;
    const W   = CONFIG.CANVAS_W;

    const padX = 7, padY = 7;
    const boxW = 96, boxH = 38;
    const x = W - boxW - padX;
    const y = padY;

    // Dark background
    ctx.fillStyle = 'rgba(4, 4, 14, 0.88)';
    ctx.fillRect(x, y, boxW, boxH);

    // Accent bar on top (blue glow strip)
    ctx.fillStyle = '#2a40a0';
    ctx.fillRect(x, y, boxW, 2);
    ctx.fillStyle = '#4060cc';
    ctx.fillRect(x, y, boxW, 1);

    // Border lines
    ctx.fillStyle = '#1a2458';
    ctx.fillRect(x,          y + 2, 1,    boxH - 2);   // left
    ctx.fillRect(x + boxW-1, y + 2, 1,    boxH - 2);   // right
    ctx.fillRect(x,          y + boxH-1, boxW, 1);      // bottom

    // Generation
    ctx.font      = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#ccd4ff';
    ctx.fillText(`GEN ${sim.generation}`, x + 7, y + 16);

    // Episode
    ctx.font      = '9px "Courier New", monospace';
    ctx.fillStyle = '#3a4468';
    ctx.fillText(`EP ${sim.episode + 1} / ${CONFIG.POP_SIZE}`, x + 7, y + 27);

    // Episode progress bar
    const bx = x + 1, by = y + boxH - 5, bw = boxW - 2, bh = 3;
    ctx.fillStyle = '#080e28';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#2848b8';
    ctx.fillRect(bx, by, Math.floor(bw * sim.episodeProgress), bh);
    // Highlight on progress fill
    ctx.fillStyle = 'rgba(100,140,255,0.4)';
    ctx.fillRect(bx, by, Math.floor(bw * sim.episodeProgress), 1);
  }

  // ── Maze ──────────────────────────────────────────────────────────────────

  _drawMaze(maze, mode) {
    const ctx = this.ctx;
    const cs  = maze.cellSize;

    // Floor – dark stone tiles with faint corner insets for depth
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#07070e' : '#09091a';
        ctx.fillRect(c * cs, r * cs, cs, cs);
        // Subtle 1-px inset shadow on top-left of each tile
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(c * cs, r * cs, cs, 1);
        ctx.fillRect(c * cs, r * cs, 1, cs);
        // Tiny highlight on bottom-right
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(c * cs + cs - 1, r * cs, 1, cs);
        ctx.fillRect(c * cs, r * cs + cs - 1, cs, 1);
      }
    }

    // Walls – dark crystal/stone blocks
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (!maze.grid[r][c]) continue;
        const x = c * cs, y = r * cs;

        // Base
        ctx.fillStyle = '#182058';
        ctx.fillRect(x, y, cs, cs);

        // Top highlight
        ctx.fillStyle = '#2c4090';
        ctx.fillRect(x, y, cs, 1);
        // Left highlight
        ctx.fillStyle = '#1e2e78';
        ctx.fillRect(x, y + 1, 1, cs - 2);

        // Bottom shadow
        ctx.fillStyle = '#080e28';
        ctx.fillRect(x, y + cs - 1, cs, 1);
        // Right shadow
        ctx.fillStyle = '#0a1030';
        ctx.fillRect(x + cs - 1, y, 1, cs);

        // Staggered brick mortar lines
        const mortarY = y + (r % 2 === 0 ? Math.floor(cs * 0.45) : Math.floor(cs * 0.55));
        ctx.fillStyle = '#0d1440';
        ctx.fillRect(x + 1, mortarY, cs - 2, 1);
        // Vertical mortar (offset per row for staggered bricks)
        const mortarX = x + (r % 2 === 0 ? Math.floor(cs * 0.5) : Math.floor(cs * 0.25));
        ctx.fillRect(mortarX, y + 1, 1, mortarY - y - 1);
      }
    }

    // Grid overlay (edit mode or option)
    if (this.showGrid || mode === 'edit') {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
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

    // Drop shadow offset by 1 sprite-pixel
    drawSpriteShadow(this.ctx, frame, cx + scale, cy + scale, scale, flip, '#00000e', 0.5);

    // Character sprite
    drawSprite(this.ctx, frame, pal, cx, cy, scale, flip);

    // Carried-wall indicator: mini block hovering in front of the agent
    if (agent.carryingWall) {
      const front  = agent.facingLeft ? -1 : 1;
      const bw     = scale * 4, bh = scale * 4;
      const bx     = cx + front * (scale * 5 + 1) - Math.floor(bw / 2);
      const by     = cy - Math.floor(bh / 2);
      this.ctx.fillStyle = '#182058';
      this.ctx.fillRect(bx, by, bw, bh);
      // Highlights
      this.ctx.fillStyle = '#2c4090';
      this.ctx.fillRect(bx, by, bw, 1);
      this.ctx.fillStyle = '#1e2e78';
      this.ctx.fillRect(bx, by, 1, bh);
      // Shadows
      this.ctx.fillStyle = '#080e28';
      this.ctx.fillRect(bx, by + bh - 1, bw, 1);
      this.ctx.fillRect(bx + bw - 1, by, 1, bh);
      // Mortar crack
      this.ctx.fillStyle = '#0d1440';
      this.ctx.fillRect(bx + 1, by + Math.floor(bh / 2), bw - 2, 1);
    }
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
