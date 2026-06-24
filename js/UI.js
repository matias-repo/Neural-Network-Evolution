class UI {
  constructor(maze, sim, renderer) {
    this.maze = maze;
    this.sim = sim;
    this.renderer = renderer;

    this.mode = 'play';       // 'play' | 'edit' | 'pause'
    this.editTool = 'draw';   // 'draw' | 'erase'
    this.speedIndex = 0;      // index into SPEEDS
    this.SPEEDS = [1, 5, 20, 100];

    this._mouseDown = false;
    this._lastCell = null;
    this._hoverCell = null;

    this._bindControls();
    this._bindCanvasEvents();
    this.updateStats();
  }

  get stepsPerFrame() {
    return this.SPEEDS[this.speedIndex];
  }

  // ── Control bindings ──────────────────────────────────────────────────────

  _bindControls() {
    this._on('btn-play-pause', 'click', () => this._togglePlayPause());
    this._on('btn-reset', 'click', () => { this.sim.reset(); this._setMode('play'); });
    this._on('btn-edit', 'click', () => this._toggleEdit());
    this._on('btn-speed', 'click', () => this._cycleSpeed());

    this._on('tool-draw', 'click', () => this._setTool('draw'));
    this._on('tool-erase', 'click', () => this._setTool('erase'));
    this._on('btn-clear', 'click', () => { this.maze.clear(); this.sim.onMazeChanged(); });

    this._on('chk-grid', 'change', e => { this.renderer.showGrid = e.target.checked; });

    this._on('btn-save-maze', 'click', () => {
      localStorage.setItem('nn-evo-maze', this.maze.serialize());
      this._flash('btn-save-maze', 'Saved!');
    });
    this._on('btn-load-maze', 'click', () => {
      const str = localStorage.getItem('nn-evo-maze');
      if (str) { this.maze.deserialize(str); this.sim.onMazeChanged(); }
    });

    // Preset buttons
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.maze.loadPreset(btn.dataset.preset);
        this.sim.onMazeChanged();
      });
    });
  }

  _bindCanvasEvents() {
    const canvas = document.getElementById('gameCanvas');

    canvas.addEventListener('mousedown', e => {
      if (this.mode !== 'edit') return;
      this._mouseDown = true;
      this._applyTool(e);
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { col, row } = this.maze.getCellAt(mx, my);
      this._hoverCell = { col, row };

      if (this._mouseDown && this.mode === 'edit') this._applyTool(e);
      this._drawHoverHighlight(mx, my);
    });

    canvas.addEventListener('mouseup', () => { this._mouseDown = false; this._lastCell = null; });
    canvas.addEventListener('mouseleave', () => { this._mouseDown = false; this._hoverCell = null; this._lastCell = null; });

    canvas.addEventListener('contextmenu', e => {
      if (this.mode === 'edit') { e.preventDefault(); this._setTool(this.editTool === 'draw' ? 'erase' : 'draw'); }
    });
  }

  _applyTool(e) {
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { col, row } = this.maze.getCellAt(mx, my);

    const key = `${col},${row}`;
    if (key === this._lastCell) return;
    this._lastCell = key;

    this.maze.setCell(col, row, this.editTool === 'draw' ? 1 : 0);
    this.sim.onMazeChanged();
  }

  _drawHoverHighlight(mx, my) {
    if (this.mode !== 'edit' || !this._hoverCell) return;
    const overlay = document.getElementById('editOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const cs = this.maze.cellSize;
    const { col, row } = this._hoverCell;
    ctx.fillStyle = this.editTool === 'draw' ? 'rgba(100,140,255,0.35)' : 'rgba(255,80,80,0.35)';
    ctx.fillRect(col * cs, row * cs, cs, cs);
  }

  // ── Mode & tool helpers ───────────────────────────────────────────────────

  _togglePlayPause() {
    if (this.mode === 'edit') return;
    if (this.mode === 'play') { this._setMode('pause'); }
    else { this._setMode('play'); }
  }

  _toggleEdit() {
    if (this.mode === 'edit') { this._setMode('play'); }
    else { this._setMode('edit'); }
  }

  _setMode(m) {
    this.mode = m;
    this.sim.paused = (m !== 'play');

    const canvas = document.getElementById('gameCanvas');
    canvas.style.cursor = m === 'edit' ? 'crosshair' : 'default';

    const overlay = document.getElementById('editOverlay');
    if (overlay) { overlay.style.display = m === 'edit' ? 'block' : 'none'; }
    if (overlay && m !== 'edit') {
      overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    }

    this._syncButtons();
  }

  _setTool(tool) {
    this.editTool = tool;
    ['draw', 'erase'].forEach(t => {
      const el = document.getElementById(`tool-${t}`);
      if (el) el.classList.toggle('active', t === tool);
    });
  }

  _cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.SPEEDS.length;
    const btn = document.getElementById('btn-speed');
    if (btn) btn.textContent = `Speed: ${this.SPEEDS[this.speedIndex]}×`;
  }

  _syncButtons() {
    const pp = document.getElementById('btn-play-pause');
    if (pp) pp.textContent = this.mode === 'play' ? '⏸ Pause' : '▶ Play';

    const edit = document.getElementById('btn-edit');
    if (edit) edit.classList.toggle('active', this.mode === 'edit');

    const editTools = document.getElementById('edit-tools');
    if (editTools) editTools.style.display = this.mode === 'edit' ? 'flex' : 'none';
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  updateStats() {
    const sim = this.sim;
    this._setText('stat-gen', sim.generation);
    this._setText('stat-episode', `${sim.episode + 1} / ${CONFIG.POP_SIZE}`);
    this._setText('stat-frame', `${sim.frame} / ${CONFIG.EPISODE_FRAMES}`);

    const predBest = sim.bestFitnessThisGen('predator').toFixed(0);
    const predAvg = sim.avgFitnessThisGen('predator').toFixed(0);
    const preyBest = sim.bestFitnessThisGen('prey').toFixed(0);
    const preyAvg = sim.avgFitnessThisGen('prey').toFixed(0);

    this._setText('stat-pred-best', predBest);
    this._setText('stat-pred-avg', predAvg);
    this._setText('stat-prey-best', preyBest);
    this._setText('stat-prey-avg', preyAvg);

    // Episode progress bar
    const bar = document.getElementById('ep-progress');
    if (bar) bar.style.width = `${sim.episodeProgress * 100}%`;

    // Chart
    const chartCanvas = document.getElementById('fitnessChart');
    if (chartCanvas) this.renderer.drawChart(chartCanvas, sim.history);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  _flash(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    const orig = el.textContent;
    el.textContent = text;
    setTimeout(() => { el.textContent = orig; }, 1200);
  }
}
