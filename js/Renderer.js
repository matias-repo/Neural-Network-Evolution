class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showRays = true;
    this.showGrid = false;
  }

  render(maze, sim, mode) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    this._drawMaze(maze, mode);
    if (mode === 'play' || mode === 'pause') {
      this._drawAgentRays(sim.prey, '#00ff88');
      this._drawAgentRays(sim.predator, '#ff4444');
      this._drawAgent(sim.prey, '#00ff88', '#00cc66');
      this._drawAgent(sim.predator, '#ff4444', '#cc2222');
      this._drawCatchRadius(sim);
    }
    if (mode === 'edit') {
      this._drawEditCursor(maze);
    }
  }

  _drawMaze(maze, mode) {
    const ctx = this.ctx;
    const cs = maze.cellSize;

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    // Walls
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        if (maze.grid[r][c]) {
          const x = c * cs, y = r * cs;
          // Wall base
          ctx.fillStyle = '#1e2a5e';
          ctx.fillRect(x, y, cs, cs);
          // Wall top highlight
          ctx.fillStyle = '#2d3f8a';
          ctx.fillRect(x, y, cs, 2);
          ctx.fillStyle = '#162050';
          ctx.fillRect(x, y + cs - 2, cs, 2);
        }
      }
    }

    // Grid lines (optional, always shown in edit mode)
    if (this.showGrid || mode === 'edit') {
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      for (let c = 0; c <= maze.cols; c++) {
        ctx.beginPath(); ctx.moveTo(c * cs, 0); ctx.lineTo(c * cs, CONFIG.CANVAS_H); ctx.stroke();
      }
      for (let r = 0; r <= maze.rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * cs); ctx.lineTo(CONFIG.CANVAS_W, r * cs); ctx.stroke();
      }
    }
  }

  _drawAgentRays(agent, color) {
    if (!this.showRays || !agent) return;
    const ctx = this.ctx;
    const rc = CONFIG.RAY_COUNT;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    for (let i = 0; i < rc; i++) {
      const angle = (i / rc) * Math.PI * 2;
      const d = agent.rays[i] * CONFIG.RAY_MAX_DIST;
      // Rays near a wall appear brighter
      ctx.globalAlpha = 0.10 + (1 - agent.rays[i]) * 0.35;
      ctx.beginPath();
      ctx.moveTo(agent.x, agent.y);
      ctx.lineTo(agent.x + Math.cos(angle) * d, agent.y + Math.sin(angle) * d);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawAgent(agent, fillColor, strokeColor) {
    if (!agent) return;
    const ctx = this.ctx;
    const R = CONFIG.AGENT_RADIUS;

    // Shadow / glow
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 12;

    // Body
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, R, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Outline
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Direction indicator
    const heading = agent.heading;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(agent.x, agent.y);
    ctx.lineTo(agent.x + Math.cos(heading) * R * 1.4, agent.y + Math.sin(heading) * R * 1.4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _drawCatchRadius(sim) {
    if (!sim.predator || !sim.prey) return;
    const dist = Math.hypot(sim.predator.x - sim.prey.x, sim.predator.y - sim.prey.y);
    const closeRatio = Math.max(0, 1 - dist / (CONFIG.CATCH_DIST * 6));
    if (closeRatio < 0.05) return;

    const ctx = this.ctx;
    ctx.globalAlpha = closeRatio * 0.3;
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(sim.predator.x, sim.predator.y, CONFIG.CATCH_DIST, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  _drawEditCursor(maze) {
    // Cursor highlight is drawn by UI on mousemove; this just ensures grid is visible
  }

  // ── Fitness chart ─────────────────────────────────────────────────────────
  drawChart(canvas, history) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(0, 0, W, H);

    if (history.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '11px monospace';
      ctx.fillText('Waiting for data…', 8, H / 2);
      return;
    }

    const maxVal = Math.max(
      CONFIG.EPISODE_FRAMES * 1.5,
      ...history.map(h => Math.max(h.predBest, h.preyBest))
    );
    const pad = { t: 4, b: 14, l: 4, r: 4 };
    const chartW = W - pad.l - pad.r;
    const chartH = H - pad.t - pad.b;

    const toX = i => pad.l + (i / (history.length - 1)) * chartW;
    const toY = v => pad.t + chartH - (v / maxVal) * chartH;

    const drawLine = (key, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      history.forEach((h, i) => {
        const x = toX(i), y = toY(h[key]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    ctx.globalAlpha = 0.4;
    drawLine('predAvg', '#ff4444');
    drawLine('preyAvg', '#00ff88');
    ctx.globalAlpha = 1;
    drawLine('predBest', '#ff4444');
    drawLine('preyBest', '#00ff88');

    // x-axis label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px monospace';
    ctx.fillText(`Gen ${history[0].gen}`, pad.l, H - 2);
    ctx.textAlign = 'right';
    ctx.fillText(`Gen ${history[history.length - 1].gen}`, W - pad.r, H - 2);
    ctx.textAlign = 'left';
  }
}
