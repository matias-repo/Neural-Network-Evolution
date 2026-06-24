class NeuralNetwork {
  constructor(layerSizes) {
    this.layerSizes = layerSizes;
    this.weights = [];
    this.biases = [];
    // Pre-allocated activation buffers — one per layer, reused every forward pass.
    // Eliminates ~3 heap allocations per call (previously `const next = []` per layer).
    this._bufs = layerSizes.map(n => new Float32Array(n));
    this._initRandom();
  }

  _initRandom() {
    for (let i = 1; i < this.layerSizes.length; i++) {
      const rows = this.layerSizes[i];
      const cols = this.layerSizes[i - 1];
      // Xavier initialization
      const scale = Math.sqrt(2 / (rows + cols));
      this.weights.push(
        Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
        )
      );
      this.biases.push(new Array(rows).fill(0));
    }
  }

  forward(inputs) {
    const bufs = this._bufs;
    // Write inputs into the first buffer (no heap allocation)
    const inp = bufs[0];
    for (let i = 0; i < inp.length; i++) inp[i] = inputs[i];
    // Propagate through layers, writing each result into the next pre-allocated buffer
    for (let L = 0; L < this.weights.length; L++) {
      const W   = this.weights[L];
      const b   = this.biases[L];
      const src = bufs[L];
      const dst = bufs[L + 1];
      for (let j = 0; j < W.length; j++) {
        let sum = b[j];
        const row = W[j];
        for (let k = 0; k < row.length; k++) sum += row[k] * src[k];
        dst[j] = Math.tanh(sum);
      }
    }
    // Return reference to last buffer — caller must read values before the next forward() call
    return bufs[bufs.length - 1];
  }

  // Flatten all parameters into a single array
  getWeights() {
    const flat = [];
    for (let i = 0; i < this.weights.length; i++) {
      for (const row of this.weights[i]) for (const v of row) flat.push(v);
      for (const v of this.biases[i]) flat.push(v);
    }
    return flat;
  }

  setWeights(flat) {
    let idx = 0;
    for (let i = 0; i < this.weights.length; i++) {
      for (const row of this.weights[i]) for (let k = 0; k < row.length; k++) row[k] = flat[idx++];
      for (let j = 0; j < this.biases[i].length; j++) this.biases[i][j] = flat[idx++];
    }
  }

  clone() {
    const nn = new NeuralNetwork(this.layerSizes);
    nn.setWeights(this.getWeights());
    return nn;
  }

  // Serialize for localStorage
  serialize() {
    return JSON.stringify({ layerSizes: this.layerSizes, weights: this.getWeights() });
  }

  static deserialize(str) {
    const { layerSizes, weights } = JSON.parse(str);
    const nn = new NeuralNetwork(layerSizes);
    nn.setWeights(weights);
    return nn;
  }
}
