class GeneticAlgorithm {
  constructor({ popSize, mutationRate, mutationStrength, eliteCount }) {
    this.popSize = popSize;
    this.mutationRate = mutationRate;
    this.mutationStrength = mutationStrength;
    this.eliteCount = eliteCount;
  }

  // Returns a new population evolved from the old one using fitness scores
  evolve(population, fitnesses) {
    const ranked = population
      .map((nn, i) => ({ nn, f: fitnesses[i] }))
      .sort((a, b) => b.f - a.f);

    const best = ranked[0].f;
    const avg = fitnesses.reduce((s, v) => s + v, 0) / fitnesses.length;

    // Adaptive mutation: when the population has converged (all scores similar),
    // boost mutation strength to escape the local optimum.
    // cv (coefficient of variation) = stddev / mean. Low cv = tight cluster = converged.
    // At cv=0 (identical scores) → 4× strength; scales linearly back to 1× at cv=0.15+.
    const variance = fitnesses.reduce((s, v) => s + (v - avg) ** 2, 0) / fitnesses.length;
    const cv = Math.sqrt(variance) / (avg + 1e-6);
    const strengthBoost   = cv < 0.15 ? (4 - (cv / 0.15) * 3) : 1;
    const effectiveStrength = this.mutationStrength * strengthBoost;

    const newPop = [];

    // Elitism – carry forward the best unchanged
    for (let i = 0; i < this.eliteCount; i++) newPop.push(ranked[i].nn.clone());

    while (newPop.length < this.popSize) {
      const p1 = this._tournament(ranked);
      const p2 = this._tournament(ranked);
      const child = this._crossover(p1, p2);
      this._mutate(child, effectiveStrength);
      newPop.push(child);
    }

    return { population: newPop, best, avg };
  }

  _tournament(ranked, k = 4) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const c = ranked[Math.floor(Math.random() * ranked.length)];
      if (!best || c.f > best.f) best = c;
    }
    return best.nn;
  }

  _crossover(p1, p2) {
    const w1 = p1.getWeights();
    const w2 = p2.getWeights();
    const child = p1.clone();
    // Uniform crossover
    const childW = w1.map((v, i) => (Math.random() < 0.5 ? v : w2[i]));
    child.setWeights(childW);
    return child;
  }

  _mutate(nn, strength = this.mutationStrength) {
    const w = nn.getWeights();
    for (let i = 0; i < w.length; i++) {
      if (Math.random() < this.mutationRate) {
        const u1 = Math.random() || 1e-10;
        const u2 = Math.random();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        w[i] += gauss * strength;
      }
    }
    nn.setWeights(w);
  }
}
