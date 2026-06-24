class Simulation {
  constructor(maze) {
    this.maze = maze;
    this.ga = new GeneticAlgorithm({
      popSize: CONFIG.POP_SIZE,
      mutationRate: CONFIG.MUTATION_RATE,
      mutationStrength: CONFIG.MUTATION_STRENGTH,
      eliteCount: CONFIG.ELITE_COUNT,
    });

    // Populations: arrays of NeuralNetwork
    this.predPop = [];
    this.preyPop = [];

    // Fitness accumulators for current generation
    this.predFitness = [];
    this.preyFitness = [];

    // Stats history [{gen, predBest, predAvg, preyBest, preyAvg}]
    this.history = [];

    // Active agents
    this.predator = null;
    this.prey = null;

    // Counters
    this.generation = 0;
    this.episode = 0;       // index within current generation
    this.frame = 0;         // frame within current episode
    this.totalFrames = 0;   // global frame counter

    this.paused = false;
    this.caught = false;    // whether prey was caught this episode

    this._initPopulations();
    this._startEpisode(0);
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  _initPopulations() {
    this.predPop = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.NN_LAYERS));
    this.preyPop = Array.from({ length: CONFIG.POP_SIZE }, () => new NeuralNetwork(CONFIG.NN_LAYERS));
    this.predFitness = new Array(CONFIG.POP_SIZE).fill(0);
    this.preyFitness = new Array(CONFIG.POP_SIZE).fill(0);
  }

  _startEpisode(idx) {
    this.episode = idx;
    this.frame = 0;
    this.caught = false;

    const predPos = this.maze.randomOpenPos(null, 0);
    const preyPos = this.maze.randomOpenPos(predPos, CONFIG.MIN_START_DIST);

    this.predator = new Agent('predator', this.predPop[idx]);
    this.prey = new Agent('prey', this.preyPop[idx]);

    this.predator.reset(predPos.x, predPos.y);
    this.prey.reset(preyPos.x, preyPos.y);
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

    this.predator.update(this.maze, this.prey);
    this.prey.update(this.maze, this.predator);

    const dist = Math.hypot(this.predator.x - this.prey.x, this.predator.y - this.prey.y);
    const episodeDone = dist <= CONFIG.CATCH_DIST || this.frame >= CONFIG.EPISODE_FRAMES;

    if (episodeDone) {
      this.caught = dist <= CONFIG.CATCH_DIST;
      this._endEpisode();
    }
  }

  _endEpisode() {
    const t = this.frame;
    const maxT = CONFIG.EPISODE_FRAMES;

    // Prey rewarded for surviving longer
    this.preyFitness[this.episode] = t;

    // Predator rewarded for catching quickly; zero if it never caught prey
    this.predFitness[this.episode] = this.caught ? (maxT - t) + maxT * 0.5 : 0;

    const nextEp = this.episode + 1;
    if (nextEp >= CONFIG.POP_SIZE) {
      this._evolve();
    } else {
      this._startEpisode(nextEp);
    }
  }

  _evolve() {
    const predResult = this.ga.evolve(this.predPop, this.predFitness);
    const preyResult = this.ga.evolve(this.preyPop, this.preyFitness);

    this.history.push({
      gen: this.generation,
      predBest: predResult.best,
      predAvg: predResult.avg,
      preyBest: preyResult.best,
      preyAvg: preyResult.avg,
    });

    this.predPop = predResult.population;
    this.preyPop = preyResult.population;
    this.predFitness = new Array(CONFIG.POP_SIZE).fill(0);
    this.preyFitness = new Array(CONFIG.POP_SIZE).fill(0);

    this.generation++;
    this._startEpisode(0);
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  reset() {
    this.generation = 0;
    this.episode = 0;
    this.frame = 0;
    this.totalFrames = 0;
    this.history = [];
    this._initPopulations();
    this._startEpisode(0);
  }

  // Call when the maze changes so start positions are refreshed
  onMazeChanged() {
    this._startEpisode(this.episode);
  }

  get episodeProgress() {
    return this.frame / CONFIG.EPISODE_FRAMES;
  }

  get currentPredFitness() {
    return this.predFitness.slice(0, this.episode);
  }

  get currentPreyFitness() {
    return this.preyFitness.slice(0, this.episode);
  }

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
