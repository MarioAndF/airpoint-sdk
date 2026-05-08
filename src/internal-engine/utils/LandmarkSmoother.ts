import { OneEuroFilter } from "./OneEuroFilter";

/**
 * LandmarkSmoother applies OneEuro filtering to all 21 hand landmarks.
 * This smooths out jitter in MediaPipe's raw landmark output before
 * it reaches the HandCursorEngine.
 *
 * Two-stage filtering approach:
 * 1. LandmarkSmoother (this) - smooths raw landmarks (x,y,z for all 21 points)
 * 2. HandState filters - smooths final cursor position (filterX, filterY)
 */
export class LandmarkSmoother {
  // Map<HandLabel, Array<[FilterX, FilterY, FilterZ]>>
  private filters: Map<string, OneEuroFilter[][]>;

  constructor(
    private minCutoff = 0.5, // Lower = more smoothing at low speed
    private beta = 1.0, // Higher = less lag at high speed
    private dCutoff = 1.0
  ) {
    this.filters = new Map();
  }

  updateConfig(minCutoff: number, beta: number) {
    if (this.minCutoff !== minCutoff || this.beta !== beta) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.reset(); // Reset filters to apply new parameters
    }
  }

  reset() {
    this.filters.clear();
  }

  smooth(
    landmarks: { x: number; y: number; z: number; visibility?: number }[],
    label: string,
    timestamp: number,
    skipIndices: number[] = []
  ) {
    if (!this.filters.has(label)) {
      this.initFilters(label);
    }

    const handFilters = this.filters.get(label)!;
    const len = Math.min(landmarks.length, handFilters.length);

    const skipSingle = skipIndices.length === 1 ? skipIndices[0] : null;
    const skipSet = skipIndices.length > 1 ? new Set(skipIndices) : null;

    for (let i = 0; i < len; i++) {
      const lm = landmarks[i];
      const [fx, fy, fz] = handFilters[i];

      const skip = skipSingle === i || (skipSet ? skipSet.has(i) : false);
      if (skip) {
        // Keep the raw landmark, but update the filter state to preserve continuity.
        fx.filter(lm.x, timestamp);
        fy.filter(lm.y, timestamp);
        fz.filter(lm.z, timestamp);
        continue;
      }

      lm.x = fx.filter(lm.x, timestamp);
      lm.y = fy.filter(lm.y, timestamp);
      lm.z = fz.filter(lm.z, timestamp);
    }

    return landmarks;
  }

  private initFilters(label: string) {
    const handFilters: OneEuroFilter[][] = [];
    for (let i = 0; i < 21; i++) {
      handFilters.push([
        new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff),
        new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff),
        new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff),
      ]);
    }
    this.filters.set(label, handFilters);
  }
}
