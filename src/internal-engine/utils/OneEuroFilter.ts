export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  xPrev: number | null;
  dxPrev: number;
  tPrev: number | null;
  teSmoothed: number; // Smoothed time delta to reduce timing jitter (especially in Chrome)

  constructor(minCutoff = 1.0, beta = 0.5, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
    this.teSmoothed = 0;
  }

  smoothingFactor(te: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  exponentialSmoothing(a: number, x: number, xPrev: number): number {
    return a * x + (1 - a) * xPrev;
  }

  filter(x: number, timestamp: number): number {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = timestamp;
      return x;
    }

    // Use actual time delta with reasonable minimum to prevent instability
    const te = Math.max(0.001, (timestamp - this.tPrev) / 1000);

    // Estimate derivative
    const dx = (x - this.xPrev!) / te;
    const edx = this.exponentialSmoothing(
      this.smoothingFactor(te, this.dCutoff),
      dx,
      this.dxPrev
    );
    this.dxPrev = edx;

    // Compute cutoff based on derivative (speed)
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter the value
    const result = this.exponentialSmoothing(
      this.smoothingFactor(te, cutoff),
      x,
      this.xPrev!
    );

    this.xPrev = result;
    this.tPrev = timestamp;
    return result;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
    this.teSmoothed = 0;
  }
}
