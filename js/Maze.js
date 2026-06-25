class Maze {
  constructor(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    this.dirty = false;
    this.addBorderWalls();
  }

  addBorderWalls() {
    for (let c = 0; c < this.cols; c++) {
      this.grid[0][c] = 1;
      this.grid[this.rows - 1][c] = 1;
    }
    for (let r = 0; r < this.rows; r++) {
      this.grid[r][0] = 1;
      this.grid[r][this.cols - 1] = 1;
    }
  }

  setCell(col, row, value) {
    if (row <= 0 || row >= this.rows - 1 || col <= 0 || col >= this.cols - 1) return; // border protected
    this.grid[row][col] = value;
  }

  toggleCell(col, row) {
    this.setCell(col, row, this.grid[row]?.[col] ? 0 : 1);
  }

  getCellAt(px, py) {
    return {
      col: Math.floor(px / this.cellSize),
      row: Math.floor(py / this.cellSize),
    };
  }

  isWall(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
    return this.grid[row][col] === 1;
  }

  isWallAt(px, py) {
    const { col, row } = this.getCellAt(px, py);
    return this.isWall(col, row);
  }

  // Circle vs grid collision – returns true if the circle's bounding box overlaps any wall cell.
  // Checks every cell in the bounding box rather than 8 sampled points, so diagonal approaches
  // and thin walls are handled correctly. With r=7 and cellSize=20 this is at most a 2×2 scan.
  isBlocked(x, y, r) {
    const cs = this.cellSize;
    const c0 = Math.floor((x - r) / cs);
    const c1 = Math.floor((x + r) / cs);
    const r0 = Math.floor((y - r) / cs);
    const r1 = Math.floor((y + r) / cs);
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++)
        if (this.isWall(col, row)) return true;
    return false;
  }

  // Cast a ray from (x,y) in direction `angle` and return normalised hit distance [0,1]
  castRay(x, y, angle, maxDist, step) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let d = step; d <= maxDist; d += step) {
      if (this.isWallAt(x + dx * d, y + dy * d)) return d / maxDist;
    }
    return 1.0;
  }

  // Return a random non-wall centre position, optionally far from `avoid`
  randomOpenPos(avoid = null, minDist = 0) {
    const cs = this.cellSize;
    let attempts = 0;
    while (attempts++ < 2000) {
      const col = 1 + Math.floor(Math.random() * (this.cols - 2));
      const row = 1 + Math.floor(Math.random() * (this.rows - 2));
      if (this.grid[row][col]) continue;
      const x = col * cs + cs / 2;
      const y = row * cs + cs / 2;
      if (!avoid || Math.hypot(x - avoid.x, y - avoid.y) >= minDist) return { x, y };
    }
    // Fallback to centre if maze is too cluttered
    return { x: cs * 2 + cs / 2, y: cs * 2 + cs / 2 };
  }

  // Pick up a non-border wall cell. Returns true on success.
  tryPickupWall(col, row) {
    if (row <= 0 || row >= this.rows - 1 || col <= 0 || col >= this.cols - 1) return false;
    if (!this.grid[row][col]) return false;
    this.grid[row][col] = 0;
    this.dirty = true;
    return true;
  }

  // Place a wall on an empty non-border cell. Returns true on success.
  tryPlaceWall(col, row) {
    if (row <= 0 || row >= this.rows - 1 || col <= 0 || col >= this.cols - 1) return false;
    if (this.grid[row][col]) return false;
    this.grid[row][col] = 1;
    this.dirty = true;
    return true;
  }

  clear() {
    for (let r = 1; r < this.rows - 1; r++)
      for (let c = 1; c < this.cols - 1; c++)
        this.grid[r][c] = 0;
  }

  // ── Preset mazes ──────────────────────────────────────────────────────────

  loadPreset(name) {
    this.clear();
    switch (name) {
      case 'cross': this._presetCross(); break;
      case 'rooms': this._presetRooms(); break;
      case 'spiral': this._presetSpiral(); break;
      case 'zigzag': this._presetZigzag(); break;
      default: break; // 'empty' – no extra walls
    }
  }

  _wall(r1, c1, r2, c2) {
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    let r = r1, c = c1;
    while (true) {
      this.grid[r][c] = 1;
      if (r === r2 && c === c2) break;
      if (r !== r2) r += dr;
      if (c !== c2) c += dc;
    }
  }

  _gap(r, c, len, horiz) {
    // Carve a gap in an existing wall segment
    for (let i = 0; i < len; i++) {
      if (horiz) this.grid[r][c + i] = 0;
      else this.grid[r + i][c] = 0;
    }
  }

  _presetCross() {
    const midR = Math.floor(this.rows / 2);
    const midC = Math.floor(this.cols / 2);
    this._wall(midR, 1, midR, this.cols - 2);
    this._wall(1, midC, this.rows - 2, midC);
    // Gaps so agents can pass
    this._gap(midR, midC - 3, 7, true);
    this._gap(midR - 3, midC, 7, false);
  }

  _presetRooms() {
    const { cols: C, rows: R } = this;
    // Horizontal dividers
    this._wall(Math.floor(R * 0.4), 1, Math.floor(R * 0.4), Math.floor(C * 0.5));
    this._wall(Math.floor(R * 0.6), Math.floor(C * 0.5), Math.floor(R * 0.6), C - 2);
    // Vertical divider
    this._wall(1, Math.floor(C * 0.5), R - 2, Math.floor(C * 0.5));
    // Doorways
    const vd = Math.floor(C * 0.5);
    const hd1 = Math.floor(R * 0.4);
    const hd2 = Math.floor(R * 0.6);
    this._gap(hd1, Math.floor(C * 0.15), 4, true);
    this._gap(hd2, Math.floor(C * 0.65), 4, true);
    this._gap(Math.floor(R * 0.25), vd, 4, false);
    this._gap(Math.floor(R * 0.75), vd, 4, false);
  }

  _presetSpiral() {
    // Central ring sized to fill the middle ~45% of the grid on each axis.
    // All coordinates are derived from grid dimensions so this works at any size.
    const { cols: C, rows: R } = this;
    const t = Math.round(R * 0.27), b = Math.round(R * 0.72);
    const l = Math.round(C * 0.28), r = Math.round(C * 0.72);
    if (b - t < 6 || r - l < 4) return; // grid too small
    this._wall(t, l, t, r); // top edge
    this._wall(b, l, b, r); // bottom edge
    this._wall(t, l, b, l); // left edge
    this._wall(t, r, b, r); // right edge
    // 3-cell doorways centred on each side
    const midC = Math.round((l + r) / 2);
    const midR = Math.round((t + b) / 2);
    this._gap(t, midC - 1, 3, true);   // top door
    this._gap(b, midC - 1, 3, true);   // bottom door
    this._gap(midR - 1, l, 3, false);  // left door
    this._gap(midR - 1, r, 3, false);  // right door
  }

  _presetZigzag() {
    const { cols: C, rows: R } = this;
    const step = Math.floor(R / 5);
    for (let i = 0; i < 4; i++) {
      const row = step + i * step;
      if (i % 2 === 0) {
        this._wall(row, 1, row, C - 8);
      } else {
        this._wall(row, 7, row, C - 2);
      }
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  serialize() {
    return JSON.stringify(this.grid);
  }

  deserialize(str) {
    const g = JSON.parse(str);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        this.grid[r][c] = g[r]?.[c] ?? 0;
    this.addBorderWalls();
  }
}
