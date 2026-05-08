/**
 * TCN-based gesture classifier (airmouse-4.1 / airmouse-4.3) with FULL z-depth features.
 * Implements dilated causal convolutions for temporal sequence processing.
 * Uses 885 raw-geoboth features (compared to 822 in airmouse-4).
 *
 * Feature breakdown (885 total):
 *   - Raw 3D landmarks: 63 (21 × 3)
 *   - Raw 2D landmarks with z: 63 (21 × 3) [was 42 in v4]
 *   - Wrist-relative 3D: 63 (21 × 3)
 *   - Wrist-relative 2D with z: 63 (21 × 3) [was 42 in v4]
 *   - Palm-normalized with z: 63 (21 × 3) [was 42 in v4]
 *   - "2D" geometry (now using z): 285
 *   - 3D geometry: 285
 */
import { HandLandmark, PoseName, PoseProbabilities } from "../core/types";
import { getPoseNames, toPoseProbabilities } from "./poseMapping";

type TCNModelId = "airmouse-4.1" | "airmouse-4.2" | "airmouse-4.3";

export interface TCNGestureClassifierAssetOverrides {
  normalizerPath?: string;
  weightsPath?: string;
}

// Constants
const SEQUENCE_LENGTH = 5;
const FEATURES_PER_FRAME = 885; // Full z-depth features

// Bone pairs for geometry features (same as LSTM)
const BONE_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

// Angle triplets for joint angles
const ANGLE_TRIPLETS: [number, number, number][] = [
  [1, 2, 3],
  [2, 3, 4],
  [5, 6, 7],
  [6, 7, 8],
  [9, 10, 11],
  [10, 11, 12],
  [13, 14, 15],
  [14, 15, 16],
  [17, 18, 19],
  [18, 19, 20],
  [0, 5, 6],
  [0, 9, 10],
  [0, 13, 14],
  [0, 17, 18],
  [0, 1, 2],
];

export interface TCNFullPrediction {
  pose: PoseName;
  poseProbabilities: PoseProbabilities;
  confidence: "high" | "medium" | "low";
  /** @deprecated Use pose instead. */
  gesture?: PoseName;
  /** @deprecated Use poseProbabilities instead. */
  probabilities?: PoseProbabilities;
}

interface Conv1DWeights {
  weight: number[][][]; // [out_channels][in_channels][kernel_size]
  bias: number[];
}

interface TCNBlockWeights {
  conv1: Conv1DWeights;
  conv2: Conv1DWeights;
  dilation: number;
  padding: number;
  downsample?: Conv1DWeights;
}

interface TCNWeights {
  tcn_blocks: TCNBlockWeights[];
  classifier: {
    weight: number[][];
    bias: number[];
  };
}

type MlTimingSink = {
  addFeatureExtraction: (ms: number) => void;
  addGestureML: (ms: number) => void;
};

async function fetchJson<T>(url: string | URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url.toString()}: ${response.status}`);
  }
  return (await response.json()) as T;
}

function getModelAssets(
  modelId: TCNModelId,
  weightBasePath: string,
  normalizerBasePath: string,
  assetOverrides: TCNGestureClassifierAssetOverrides = {},
) {
  return {
    normalizer:
      assetOverrides.normalizerPath ??
      `${normalizerBasePath}/${modelId}-normalizer.json`,
    weights: assetOverrides.weightsPath ?? `${weightBasePath}/${modelId}.json`,
  };
}

interface TCNSharedWeights {
  tcnBlocks: TCNBlockWeights[];
  classifierWeight: number[][];
  classifierBias: number[];
  mean: number[];
  scale: number[];
}

export class TCNGestureClassifierFull {
  private static sharedLoad: Map<string, Promise<TCNSharedWeights>> = new Map();

  private modelId: TCNModelId;
  private poseNames: PoseName[];
  private numClasses: number;

  // Normalizer parameters
  private mean: number[] = [];
  private scale: number[] = [];

  // Frame buffer for sequence processing
  private frameBuffer: number[][] = [];

  // TCN weights
  private tcnBlocks: TCNBlockWeights[] = [];
  private classifierWeight: number[][] = [];
  private classifierBias: number[] = [];

  private weightsLoaded = false;
  private loadError: Error | null = null;
  private warned = false;
  private weightBasePath: string;
  private normalizerBasePath: string;
  private assetOverrides: TCNGestureClassifierAssetOverrides;

  constructor(
    modelId: TCNModelId = "airmouse-4.3",
    weightBasePath: string = "/weights",
    normalizerBasePath: string = "/normalizers",
    assetOverrides: TCNGestureClassifierAssetOverrides = {},
  ) {
    this.modelId = modelId;
    this.weightBasePath = weightBasePath;
    this.normalizerBasePath = normalizerBasePath;
    this.assetOverrides = assetOverrides;
    this.poseNames = getPoseNames(modelId);
    this.numClasses = this.poseNames.length;
    void this.loadWeights();
  }

  private static loadSharedWeights(
    modelId: TCNModelId,
    weightBasePath: string,
    normalizerBasePath: string,
    assetOverrides: TCNGestureClassifierAssetOverrides,
  ): Promise<TCNSharedWeights> {
    const assets = getModelAssets(
      modelId,
      weightBasePath,
      normalizerBasePath,
      assetOverrides,
    );
    const cacheKey = `${modelId}:${assets.weights}:${assets.normalizer}`;
    const cached = TCNGestureClassifierFull.sharedLoad.get(cacheKey);
    if (cached) return cached;

    const loader = (async () => {
      const [weights, normalizer] = await Promise.all([
        fetchJson<TCNWeights>(assets.weights),
        fetchJson<{ mean: number[]; scale: number[] }>(assets.normalizer),
      ]);

      return {
        tcnBlocks: weights.tcn_blocks,
        classifierWeight: weights.classifier.weight,
        classifierBias: weights.classifier.bias,
        mean: normalizer.mean,
        scale: normalizer.scale,
      };
    })();

    TCNGestureClassifierFull.sharedLoad.set(cacheKey, loader);
    return loader;
  }

  private async loadWeights(): Promise<void> {
    try {
      const shared = await TCNGestureClassifierFull.loadSharedWeights(
        this.modelId,
        this.weightBasePath,
        this.normalizerBasePath,
        this.assetOverrides,
      );

      this.tcnBlocks = shared.tcnBlocks;
      this.classifierWeight = shared.classifierWeight;
      this.classifierBias = shared.classifierBias;
      this.mean = shared.mean;
      this.scale = shared.scale;

      this.weightsLoaded = true;
      console.log(
        `[TCN ${this.modelId}] Loaded: mean=${this.mean.length}, scale=${this.scale.length}`,
      );
    } catch (error) {
      this.loadError =
        error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to load TCN weights (${this.modelId}):`, error);
    }
  }

  private createIdlePrediction(): TCNFullPrediction {
    const idleProbs = new Array(this.numClasses).fill(0);
    idleProbs[0] = 1;
    const poseProbabilities: PoseProbabilities = toPoseProbabilities(
      idleProbs,
      this.poseNames,
    );
    return {
      pose: "idle",
      poseProbabilities,
      confidence: "low",
      gesture: "idle",
      probabilities: poseProbabilities,
    };
  }

  resetState() {
    this.frameBuffer = [];
  }

  /**
   * Extract 885 features from landmarks using FULL z-depth.
   */
  private extractFeatures(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
  ): number[] {
    const features: number[] = [];

    const wrist3D = landmarks3D[0];
    const wrist2D = landmarks2D[0];
    const indexMcp2D = landmarks2D[5];

    // Palm size for normalization
    const palmSize = Math.max(
      Math.sqrt(
        Math.pow(wrist2D.x - indexMcp2D.x, 2) +
          Math.pow(wrist2D.y - indexMcp2D.y, 2),
      ),
      1e-6,
    );

    // 1. Raw 3D landmarks (63)
    for (const lm of landmarks3D) {
      features.push(lm.x, lm.y, lm.z);
    }

    // 2. Raw 2D landmarks WITH z (63) - was 42 in v4
    for (const lm of landmarks2D) {
      features.push(lm.x, lm.y, lm.z);
    }

    // 3. Wrist-relative 3D (63)
    for (const lm of landmarks3D) {
      features.push(lm.x - wrist3D.x, lm.y - wrist3D.y, lm.z - wrist3D.z);
    }

    // 4. Wrist-relative 2D WITH z (63) - was 42 in v4
    for (const lm of landmarks2D) {
      features.push(lm.x - wrist2D.x, lm.y - wrist2D.y, lm.z - wrist2D.z);
    }

    // 5. Palm-normalized WITH z (63) - was 42 in v4
    for (const lm of landmarks3D) {
      features.push(
        (lm.x - wrist3D.x) / palmSize,
        (lm.y - wrist3D.y) / palmSize,
        (lm.z - wrist3D.z) / palmSize, // NEW: include z
      );
    }

    // 6. "2D" geometry - now using full 3D (285)
    features.push(...this.computeGeometry3D(landmarks2D));

    // 7. 3D geometry (285)
    features.push(...this.computeGeometry3D(landmarks3D));

    return features;
  }

  /**
   * Compute geometry features using FULL 3D coordinates (no more zero z).
   */
  private computeGeometry3D(landmarks: HandLandmark[]): number[] {
    const features: number[] = [];

    // Pairwise distances (210)
    for (let i = 0; i < 21; i++) {
      for (let j = i + 1; j < 21; j++) {
        const a = landmarks[i];
        const b = landmarks[j];
        features.push(
          Math.sqrt(
            Math.pow(a.x - b.x, 2) +
              Math.pow(a.y - b.y, 2) +
              Math.pow(a.z - b.z, 2),
          ),
        );
      }
    }

    // Bone vectors (60) - full 3D
    for (const [i, j] of BONE_PAIRS) {
      const a = landmarks[i];
      const b = landmarks[j];
      features.push(b.x - a.x, b.y - a.y, b.z - a.z);
    }

    // Joint angles (15) - full 3D
    for (const [i, j, k] of ANGLE_TRIPLETS) {
      const a = landmarks[i];
      const b = landmarks[j];
      const c = landmarks[k];

      const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
      const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];

      const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
      const n1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
      const n2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);

      if (n1 > 1e-6 && n2 > 1e-6) {
        features.push(Math.acos(Math.max(-1, Math.min(1, dot / (n1 * n2)))));
      } else {
        features.push(0);
      }
    }

    return features;
  }

  private normalize(features: number[]): number[] {
    const normalized = new Array(features.length);
    for (let i = 0; i < features.length; i++) {
      normalized[i] = (features[i] - this.mean[i]) / (this.scale[i] || 1);
    }
    return normalized;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TCN forward pass
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 1D Convolution with causal padding.
   * Input shape: [in_channels][seq_len]
   * Output shape: [out_channels][seq_len]
   */
  private conv1d(
    input: number[][],
    weights: Conv1DWeights,
    dilation: number,
    padding: number,
  ): number[][] {
    const outChannels = weights.weight.length;
    const inChannels = weights.weight[0].length;
    const kernelSize = weights.weight[0][0].length;
    const seqLen = input[0].length;

    // Left-pad for causal convolution
    const paddedLen = seqLen + padding;
    const padded: number[][] = new Array(inChannels);
    for (let c = 0; c < inChannels; c++) {
      padded[c] = new Array(paddedLen).fill(0);
      for (let t = 0; t < seqLen; t++) {
        padded[c][padding + t] = input[c][t];
      }
    }

    // Compute convolution
    const output: number[][] = new Array(outChannels);
    for (let oc = 0; oc < outChannels; oc++) {
      output[oc] = new Array(seqLen);
      for (let t = 0; t < seqLen; t++) {
        let sum = weights.bias[oc];
        for (let ic = 0; ic < inChannels; ic++) {
          for (let k = 0; k < kernelSize; k++) {
            const idx = padding + t - (kernelSize - 1 - k) * dilation;
            if (idx >= 0 && idx < paddedLen) {
              sum += padded[ic][idx] * weights.weight[oc][ic][k];
            }
          }
        }
        output[oc][t] = sum;
      }
    }

    return output;
  }

  private relu(x: number[][]): number[][] {
    for (let c = 0; c < x.length; c++) {
      for (let t = 0; t < x[c].length; t++) {
        x[c][t] = Math.max(0, x[c][t]);
      }
    }
    return x;
  }

  /**
   * TCN temporal block with residual connection.
   */
  private tcnBlock(input: number[][], block: TCNBlockWeights): number[][] {
    const dilation = block.dilation;
    const padding = block.padding;

    // First conv + ReLU
    let out = this.conv1d(input, block.conv1, dilation, padding);
    out = this.relu(out);

    // Second conv + ReLU
    out = this.conv1d(out, block.conv2, dilation, padding);
    out = this.relu(out);

    // Residual connection
    let residual = input;
    if (block.downsample) {
      residual = this.conv1d(input, block.downsample, 1, 0);
    }

    // Add residual + ReLU
    for (let c = 0; c < out.length; c++) {
      for (let t = 0; t < out[c].length; t++) {
        out[c][t] = Math.max(0, out[c][t] + residual[c][t]);
      }
    }

    return out;
  }

  /**
   * Full TCN forward pass.
   */
  private tcnForward(sequence: number[][]): number[] {
    const seqLen = sequence.length;
    const numFeatures = sequence[0].length;

    // Transpose: [seq_len][features] -> [features][seq_len]
    let x: number[][] = new Array(numFeatures);
    for (let f = 0; f < numFeatures; f++) {
      x[f] = new Array(seqLen);
      for (let t = 0; t < seqLen; t++) {
        x[f][t] = sequence[t][f];
      }
    }

    // Pass through TCN blocks
    for (const block of this.tcnBlocks) {
      x = this.tcnBlock(x, block);
    }

    // Take last timestep (causal: only uses past)
    const lastTimestep = new Array(x.length);
    for (let c = 0; c < x.length; c++) {
      lastTimestep[c] = x[c][x[c].length - 1];
    }

    // Classifier (linear layer)
    const logits = new Array(this.numClasses);
    for (let i = 0; i < this.numClasses; i++) {
      let sum = this.classifierBias[i];
      for (let j = 0; j < lastTimestep.length; j++) {
        sum += lastTimestep[j] * this.classifierWeight[i][j];
      }
      logits[i] = sum;
    }

    return logits;
  }

  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sumExps);
  }

  /**
   * Main prediction method (streaming - processes one frame at a time).
   */
  predict(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
    timing?: MlTimingSink,
  ): TCNFullPrediction {
    const useTiming = Boolean(timing);
    const featureStart = useTiming ? performance.now() : 0;

    if (!this.weightsLoaded) {
      if (this.loadError && !this.warned) {
        console.warn(
          "TCNGestureClassifierFull: weights not loaded, returning idle",
        );
        this.warned = true;
      }
      return this.createIdlePrediction();
    }

    // Extract features for this frame
    const features = this.extractFeatures(landmarks2D, landmarks3D);
    if (features.length !== FEATURES_PER_FRAME) {
      console.warn(
        `Expected ${FEATURES_PER_FRAME} features, got ${features.length}`,
      );
      return this.createIdlePrediction();
    }

    if (timing) {
      timing.addFeatureExtraction(performance.now() - featureStart);
    }

    const mlStart = useTiming ? performance.now() : 0;
    const normalized = this.normalize(features);

    // Add to frame buffer
    this.frameBuffer.push(normalized);
    if (this.frameBuffer.length > SEQUENCE_LENGTH) {
      this.frameBuffer.shift();
    }

    // If we don't have enough frames yet, return idle
    if (this.frameBuffer.length < SEQUENCE_LENGTH) {
      return this.createIdlePrediction();
    }

    // Run TCN forward pass
    const logits = this.tcnForward(this.frameBuffer);
    const probs = this.softmax(logits);

    // Map to pose probabilities (same order as training)
    const poseProbabilities: PoseProbabilities = toPoseProbabilities(
      probs,
      this.poseNames,
    );

    // Find max probability pose
    let maxPose: PoseName = "idle";
    let maxPoseProb = poseProbabilities.idle;
    for (const pose of this.poseNames) {
      const prob = poseProbabilities[pose];
      if (prob > maxPoseProb) {
        maxPoseProb = prob;
        maxPose = pose;
      }
    }

    const pose = maxPose;
    const confidence: "high" | "medium" | "low" =
      maxPoseProb > 0.8 ? "high" : maxPoseProb > 0.6 ? "medium" : "low";

    if (timing) {
      timing.addGestureML(performance.now() - mlStart);
    }

    return {
      pose,
      poseProbabilities,
      confidence,
      gesture: pose,
      probabilities: poseProbabilities,
    };
  }

  reset() {
    this.resetState();
  }
}
