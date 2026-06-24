class Simulation {
  constructor(maze) {
    this.maze = maze;
    this.ga = new GeneticAlgorithm({
      popSize: CONFIG.POP_SIZE,
      mutationRate: CONFIG.MUTATION_RATE,
      mutationStrength: CONFIG.MUTATION_STRENGTH,
      eliteCount: CONFIG.ELITE_COUNT,
    });

    // Three populations: one predator, two independent prey lineages
    this.predPop   = [];
    this.preyPop   = [];
    this.preyPop2  = [];

    this.predFitness  = [];
    this.preyFitness  = [];
    this.prey2Fitness = [];

    // Stats history [{gen, predBest, predAvg, preyBest, preyAvg}]
    this.history = [];

    // Active agents
    this.predator = null;
    this.prey     = null;
    this.prey2    = null;

    // Counters
    this.generation  = 0;
    this.episode     = 0;
    this.frame       = 0;
    this.totalFrames = 0;

    this.paused = false;

    // Per-episode tracking
    this._catch1Frame  = null;   // frame when prey1 was caught (null = not caught)
    this._catch2Frame  = null;   // frame when prey2 was caught
    this._minDist      = Infinity; // predator → nearest alive prey (for proximity shaping)
    this._prey1MinDist = Infinity; // closest predator got to prey1 (for prey1 shaping)
    this._prey2MinDist = Infinity;

    this.onSave    = null;
    this._mazeSave = null;
    this._initPopulations();
    this._startEpisode(0);
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  _initPopulations() {
    this.predPop  = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PRED_NN_LAYERS));
    this.preyPop  = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PREY_NN_LAYERS));
    this.preyPop2 = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.PREY_NN_LAYERS));
    this.predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    this.preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    this.prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
  }

  _snapshotMaze() {
    this._mazeSave = this.maze.grid.map(r => r.slice());
  }

  _restoreMaze() {
    if (!this._mazeSave) return;
    for (let r = 0; r < this.maze.rows; r++)
      for (let c = 0; c < this.maze.cols; c++)
        this.maze.grid[r][c] = this._mazeSave[r][c];
    this.maze.dirty = true;
  }

  _startEpisode(idx) {
    this.episode = idx;
    this.frame   = 0;

    this._catch1Frame  = null;
    this._catch2Frame  = null;
    this._minDist      = Infinity;
    this._prey1MinDist = Infinity;
    this._prey2MinDist = Infinity;

    this._restoreMaze();

    const predPos  = this.maze.randomOpenPos(null, 0);
    const prey1Pos = this.maze.randomOpenPos(predPos, CONFIG.MIN_START_DIST);
    const prey2Pos = this.maze.randomOpenPos(predPos, CONFIG.MIN_START_DIST);

    this.predator = new Agent('predator', this.predPop[idx]);
    this.prey     = new Agent('prey',     this.preyPop[idx]);
    this.prey2    = new Agent('prey',     this.preyPop2[idx]);

    this.predator.reset(predPos.x,  predPos.y);
    this.prey.reset(prey1Pos.x,  prey1Pos.y);
    this.prey2.reset(prey2Pos.x, prey2Pos.y);
  }

  // ── Main update ───────────────────────────────────────────────────────────

  update(steps = 1) {
    if (this.paused) return;
    for (let s = 0; s < steps; s++) this._step();
  }

  _step() {
    if (this.paused) return;
    this.frame++;
    this.totalFrames++;

    // Each agent senses both opponents simultaneously:
    //   predator: agent1=prey1, agent2=prey2
    //   prey1:    agent1=predator, agent2=prey2 (ally)
    //   prey2:    agent1=predator, agent2=prey1 (ally)
    this.predator.update(this.maze, this.prey,     this.prey2);
    this.prey.update(    this.maze, this.predator, this.prey2);
    this.prey2.update(   this.maze, this.predator, this.prey);

    const MAX_DIST = Math.hypot(CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    if (this.prey.alive) {
      const d1 = Math.hypot(this.predator.x - this.prey.x, this.predator.y - this.prey.y);
      if (d1 < this._prey1MinDist) this._prey1MinDist = d1;
      if (d1 < this._minDist)      this._minDist      = d1;
      if (d1 <= CONFIG.CATCH_DIST) {
        this.prey.alive = false;
        this.prey.vx    = 0;
        this.prey.vy    = 0;
        this._catch1Frame = this.frame;
      }
    }

    if (this.prey2.alive) {
      const d2 = Math.hypot(this.predator.x - this.prey2.x, this.predator.y - this.prey2.y);
      if (d2 < this._prey2MinDist) this._prey2MinDist = d2;
      if (d2 < this._minDist)      this._minDist      = d2;
      if (d2 <= CONFIG.CATCH_DIST) {
        this.prey2.alive = false;
        this.prey2.vx   = 0;
        this.prey2.vy   = 0;
        this._catch2Frame = this.frame;
      }
    }

    const bothCaught = !this.prey.alive && !this.prey2.alive;
    if (bothCaught || this.frame >= CONFIG.EPISODE_FRAMES) {
      this._endEpisode();
    }
  }

  _endEpisode() {
    const maxT     = CONFIG.EPISODE_FRAMES;
    const MAX_DIST = Math.hypot(CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    // ── Predator fitness ─────────────────────────────────────────────────────
    // Catch-speed bonus per prey. When neither caught, use proximity shaping so
    // the GA has a gradient to climb from generation 1.
    const closeness      = Math.max(0, 1 - this._minDist / MAX_DIST);
    const proximityBonus = closeness * maxT * CONFIG.PRED_PROXIMITY_WEIGHT;

    let predFit = 0;
    if (this._catch1Frame !== null) predFit += (maxT - this._catch1Frame) + maxT * 0.25;
    if (this._catch2Frame !== null) predFit += (maxT - this._catch2Frame) + maxT * 0.25;
    // Proximity shaping only when no catches — avoids diluting the catch signal
    if (predFit === 0) predFit = proximityBonus;
    this.predFitness[this.episode] = predFit;

    // ── Prey fitness ──────────────────────────────────────────────────────────
    // Survival time dominates; small distance-maintenance bonus helps
    // differentiate prey that actively fled from ones that got cornered.
    const prey1Survival  = this._catch1Frame ?? maxT;
    const prey1Far       = Math.min(1, this._prey1MinDist / MAX_DIST);
    this.preyFitness[this.episode] = prey1Survival + prey1Far * maxT * 0.15;

    const prey2Survival  = this._catch2Frame ?? maxT;
    const prey2Far       = Math.min(1, this._prey2MinDist / MAX_DIST);
    this.prey2Fitness[this.episode] = prey2Survival + prey2Far * maxT * 0.15;

    const nextEp = this.episode + 1;
    if (nextEp >= CONFIG.POP_SIZE) {
      this._evolve();
    } else {
      this._startEpisode(nextEp);
    }
  }

  _evolve() {
    const predResult  = this.ga.evolve(this.predPop,  this.predFitness);
    const preyResult  = this.ga.evolve(this.preyPop,  this.preyFitness);
    const prey2Result = this.ga.evolve(this.preyPop2, this.prey2Fitness);

    // Combine the two prey lineages into single chart entries
    this.history.push({
      gen:      this.generation,
      predBest: predResult.best,
      predAvg:  predResult.avg,
      preyBest: Math.max(preyResult.best, prey2Result.best),
      preyAvg:  (preyResult.avg + prey2Result.avg) / 2,
    });

    this.predPop  = predResult.population;
    this.preyPop  = preyResult.population;
    this.preyPop2 = prey2Result.population;

    this.predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    this.preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
    this.prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);

    this.generation++;
    this.save();
    this._startEpisode(0);
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  reset() {
    this.generation  = 0;
    this.episode     = 0;
    this.frame       = 0;
    this.totalFrames = 0;
    this.history     = [];
    if (this.onSave) this.onSave(null);
    this._initPopulations();
    this._startEpisode(0);
  }

  save() {
    if (!this.onSave) return;
    this.onSave({
      generation: this.generation,
      predPop:   this.predPop.map(nn  => nn.getWeights()),
      preyPop:   this.preyPop.map(nn  => nn.getWeights()),
      preyPop2:  this.preyPop2.map(nn => nn.getWeights()),
      history:   this.history,
    });
  }

  tryRestore(data) {
    try {
      if (!data) return false;
      if (!data.predPop  || data.predPop.length  !== CONFIG.POP_SIZE) return false;
      if (!data.preyPop  || data.preyPop.length  !== CONFIG.POP_SIZE) return false;
      if (!data.preyPop2 || data.preyPop2.length !== CONFIG.POP_SIZE) return false;
      const expectedPredLen = this.predPop[0].getWeights().length;
      const expectedPreyLen = this.preyPop[0].getWeights().length;
      if (data.predPop[0].length  !== expectedPredLen) return false;
      if (data.preyPop[0].length  !== expectedPreyLen) return false;
      if (data.preyPop2[0].length !== expectedPreyLen) return false;
      this.generation = data.generation || 0;
      this.history    = data.history    || [];
      data.predPop.forEach((w, i)  => this.predPop[i].setWeights(w));
      data.preyPop.forEach((w, i)  => this.preyPop[i].setWeights(w));
      data.preyPop2.forEach((w, i) => this.preyPop2[i].setWeights(w));
      this.predFitness  = new Array(CONFIG.POP_SIZE).fill(0);
      this.preyFitness  = new Array(CONFIG.POP_SIZE).fill(0);
      this.prey2Fitness = new Array(CONFIG.POP_SIZE).fill(0);
      this._startEpisode(0);
      return true;
    } catch (_) {
      return false;
    }
  }

  onMazeChanged() {
    this._snapshotMaze();
    this._startEpisode(this.episode);
  }

  get episodeProgress() {
    // Progress = fraction of prey catches + time fraction
    // Smoothly reflects both catches and time remaining
    const catches = (this._catch1Frame !== null ? 1 : 0) + (this._catch2Frame !== null ? 1 : 0);
    return (catches / 2) * 0.5 + (this.frame / CONFIG.EPISODE_FRAMES) * 0.5;
  }

  get currentPredFitness() { return this.predFitness.slice(0, this.episode); }
  get currentPreyFitness()  { return this.preyFitness.slice(0, this.episode); }

  bestFitnessThisGen(type) {
    const arr = type === 'predator' ? this.predFitness : this.preyFitness;
    return Math.max(...arr.slice(0, Math.max(1, this.episode)));
  }

  avgFitnessThisGen(type) {
    const arr = type === 'predator' ? this.predFitness : this.preyFitness;
    const slice = arr.slice(0, Math.max(1, this.episode));
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  }
}
