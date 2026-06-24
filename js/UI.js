class UI {
  constructor(maze, worker, renderer) {
    this.maze = maze;
    this.worker = worker;
    this.renderer = renderer;

    this.mode = 'play';        // 'play' | 'edit' | 'pause'
    this.speedIndex = 0;       // index into SPEEDS
    this.SPEEDS = [1, 5, 20, 100, 500, 2000, 10000, 50000, 200000];
    this._dragAction = null;   // 'draw' | 'erase', determined on each mousedown

    this._mouseDown = false;
    this._lastCell = null;
    this._hoverCell = null;

    this._bindControls();
    this._bindCanvasEvents();
    this.updateStats();
  }

  // ── Control bindings ──────────────────────────────────────────────────────

  _bindControls() {
    this._on('btn-play-pause', 'click', () => this._togglePlayPause());
    this._on('btn-reset',   'click', () => this._showResetModal());
    this._on('modal-cancel',  'click', () => this._hideResetModal());
    this._on('modal-confirm', 'click', () => { this._hideResetModal(); this.worker.postMessage({ type: 'reset' }); });
    document.getElementById('modal-reset').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._hideResetModal();
    });
    this._on('btn-edit', 'click', () => this._toggleEdit());
    this._on('btn-speed', 'click', () => this._cycleSpeed());

    this._on('btn-clear', 'click', () => { this.maze.clear(); });

    this._on('chk-grid', 'change', e => { this.renderer.showGrid = e.target.checked; });

    this._on('btn-save-maze', 'click', () => {
      localStorage.setItem('nn-evo-maze', this.maze.serialize());
      this._flash('btn-save-maze', 'Saved!');
    });
    this._on('btn-load-maze', 'click', () => {
      const str = localStorage.getItem('nn-evo-maze');
      if (str) { this.maze.deserialize(str); }
    });

    // Preset buttons
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.maze.loadPreset(btn.dataset.preset);
      });
    });
  }

  _bindCanvasEvents() {
    const canvas = document.getElementById('gameCanvas');

    // ── Mouse ──────────────────────────────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
      if (this.mode !== 'edit') return;
      this._mouseDown = true;
      const { col, row } = this._eventCell(e);
      this._dragAction = this.maze.isWall(col, row) ? 'erase' : 'draw';
      this._applyTool(e);
    });

    canvas.addEventListener('mousemove', e => {
      this._handleMove(e, canvas);
    });

    canvas.addEventListener('mouseup',    () => { this._mouseDown = false; this._lastCell = null; this._dragAction = null; });
    canvas.addEventListener('mouseleave', () => { this._mouseDown = false; this._hoverCell = null; this._lastCell = null; this._dragAction = null; });

    canvas.addEventListener('contextmenu', e => {
      if (this.mode === 'edit') e.preventDefault();
    });

    // ── Touch ──────────────────────────────────────────────────────────────
    canvas.addEventListener('touchstart', e => {
      if (this.mode !== 'edit') return;
      e.preventDefault();
      this._mouseDown = true;
      const te = this._touchEvt(e, canvas);
      const { col, row } = this._eventCell(te);
      this._dragAction = this.maze.isWall(col, row) ? 'erase' : 'draw';
      this._applyTool(te);
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      if (this.mode !== 'edit') return;
      e.preventDefault();
      this._handleMove(this._touchEvt(e, canvas), canvas);
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      this._mouseDown = false;
      this._lastCell = null;
      this._dragAction = null;
    }, { passive: false });
  }

  // Convert a TouchEvent's first touch into a mouse-like {clientX, clientY} object.
  // Accounts for canvas CSS scaling (canvas pixel coords ≠ CSS pixel coords on mobile).
  _touchEvt(e, canvas) {
    const t = e.touches[0] || e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = CONFIG.CANVAS_W / rect.width;
    const scaleY = CONFIG.CANVAS_H / rect.height;
    return {
      clientX: rect.left + (t.clientX - rect.left) / scaleX * scaleX,
      clientY: rect.top  + (t.clientY - rect.top)  / scaleY * scaleY,
    };
  }

  _handleMove(e, canvas) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = CONFIG.CANVAS_W / rect.width;
    const scaleY = CONFIG.CANVAS_H / rect.height;
    // Map CSS pixel position to canvas pixel position
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const { col, row } = this.maze.getCellAt(mx, my);
    this._hoverCell = { col, row };
    if (this._mouseDown && this.mode === 'edit') this._applyTool(e);
    this._drawHoverHighlight(mx, my);
  }

  _eventCell(e) {
    const canvas = document.getElementById('gameCanvas');
    const rect   = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CONFIG.CANVAS_W / rect.width);
    const my = (e.clientY - rect.top)  * (CONFIG.CANVAS_H / rect.height);
    return this.maze.getCellAt(mx, my);
  }

  _applyTool(e) {
    const { col, row } = this._eventCell(e);
    const key = `${col},${row}`;
    if (key === this._lastCell) return;
    this._lastCell = key;
    this.maze.setCell(col, row, this._dragAction === 'draw' ? 1 : 0);
  }

  _drawHoverHighlight(mx, my) {
    if (this.mode !== 'edit' || !this._hoverCell) return;
    const overlay = document.getElementById('editOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const cs = this.maze.cellSize;
    const { col, row } = this._hoverCell;
    // Preview action: red if hovering a wall (would erase), blue if empty (would draw)
    const wouldErase = this._dragAction
      ? this._dragAction === 'erase'
      : this.maze.isWall(col, row);
    ctx.fillStyle = wouldErase ? 'rgba(255,80,80,0.35)' : 'rgba(100,140,255,0.35)';
    ctx.fillRect(col * cs, row * cs, cs, cs);
  }

  // ── Reset modal ───────────────────────────────────────────────────────────

  _showResetModal() {
    const wasPaused = this.mode === 'pause';
    if (!wasPaused) this._setMode('pause');
    this._modalWasPaused = wasPaused;
    document.getElementById('modal-reset').hidden = false;
    document.getElementById('modal-confirm').focus();
  }

  _hideResetModal() {
    document.getElementById('modal-reset').hidden = true;
    if (!this._modalWasPaused) this._setMode('play');
  }

  // ── Mode & tool helpers ───────────────────────────────────────────────────

  _togglePlayPause() {
    if (this.mode === 'edit') { this._exitEdit(); return; }
    if (this.mode === 'play') { this._setMode('pause'); }
    else { this._setMode('play'); }
  }

  _toggleEdit() {
    if (this.mode === 'edit') { this._exitEdit(); }
    else { this._setMode('edit'); }
  }

  _exitEdit() {
    this.worker.postMessage({ type: 'syncMaze', grid: this.maze.grid });
    this._setMode('play');
  }

  _setMode(m) {
    this.mode = m;
    if (m === 'play') this.worker.postMessage({ type: 'resume' });
    else this.worker.postMessage({ type: 'pause' });

    const canvas = document.getElementById('gameCanvas');
    canvas.style.cursor = m === 'edit' ? 'crosshair' : 'default';

    const overlay = document.getElementById('editOverlay');
    if (overlay) { overlay.style.display = m === 'edit' ? 'block' : 'none'; }
    if (overlay && m !== 'edit') {
      overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
    }

    this._syncButtons();
  }

  _cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % this.SPEEDS.length;
    const btn = document.getElementById('btn-speed');
    if (btn) btn.textContent = `${this.SPEEDS[this.speedIndex]}×`;
    this.worker.postMessage({ type: 'setSpeed', steps: this.SPEEDS[this.speedIndex] });
  }

  _syncButtons() {
    const pp = document.getElementById('btn-play-pause');
    if (pp) pp.textContent = this.mode === 'play' ? '⏸' : '▶';

    const edit = document.getElementById('btn-edit');
    if (edit) edit.classList.toggle('active', this.mode === 'edit');

    const bar = document.getElementById('edit-bar');
    if (bar) bar.classList.toggle('visible', this.mode === 'edit');
  }

  // Stats are now rendered as a HUD overlay on the canvas; nothing to update in DOM.
  updateStats() {}

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
