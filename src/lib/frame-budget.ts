type FrameBudgetOptions = {
  sampleSize?: number;
  downshiftThresholdMs?: number;
  restoreThresholdMs?: number;
  cooldownMs?: number;
  maxTier?: number;
};

export class FrameBudget {
  private samples: number[] = [];
  private cursor = 0;
  private filled = 0;
  private avg = 16;
  private tier = 0;
  private lastTierChangeAt = 0;

  private readonly sampleSize: number;
  private readonly downshiftThresholdMs: number;
  private readonly restoreThresholdMs: number;
  private readonly cooldownMs: number;
  private readonly maxTier: number;

  constructor(options: FrameBudgetOptions = {}) {
    this.sampleSize = Math.max(12, options.sampleSize ?? 90);
    this.downshiftThresholdMs = Math.max(8, options.downshiftThresholdMs ?? 22);
    this.restoreThresholdMs = Math.max(6, options.restoreThresholdMs ?? 16.5);
    this.cooldownMs = Math.max(100, options.cooldownMs ?? 1200);
    this.maxTier = Math.max(0, options.maxTier ?? 2);
    this.samples = new Array(this.sampleSize).fill(16);
  }

  getTier() {
    return this.tier;
  }

  getAverageMs() {
    return this.avg;
  }

  reset() {
    this.cursor = 0;
    this.filled = 0;
    this.avg = 16;
    this.tier = 0;
    this.lastTierChangeAt = 0;
    this.samples.fill(16);
  }

  push(frameMs: number, now = performance.now()) {
    const clamped = Math.max(1, Math.min(1000, frameMs));
    this.samples[this.cursor] = clamped;
    this.cursor = (this.cursor + 1) % this.sampleSize;
    this.filled = Math.min(this.sampleSize, this.filled + 1);

    let sum = 0;
    for (let i = 0; i < this.filled; i += 1) sum += this.samples[i];
    this.avg = sum / Math.max(1, this.filled);

    if (now - this.lastTierChangeAt < this.cooldownMs) return this.tier;

    if (this.avg > this.downshiftThresholdMs && this.tier < this.maxTier) {
      this.tier += 1;
      this.lastTierChangeAt = now;
      return this.tier;
    }

    if (this.avg < this.restoreThresholdMs && this.tier > 0) {
      this.tier -= 1;
      this.lastTierChangeAt = now;
      return this.tier;
    }

    return this.tier;
  }
}
