/**
 * ONNX-based gesture classifier using ONNX Runtime Web.
 * Supports both airmouse-3 (LSTM) and airmouse-4 (TCN) models.
 * ~2-3x faster than hand-written JS inference.
 */
// Use dynamic import to avoid TypeScript processing huge onnxruntime-web types
// This prevents OOM during CI builds
let ort: any = null;
let ortImportPromise: Promise<any> | null = null;

const sharedNormalizerCache = new Map<
  string,
  Promise<{ mean: Float32Array; scale: Float32Array }>
>();
const sharedModelBytesCache = new Map<string, Promise<Uint8Array>>();

import { HandLandmark, PoseName, PoseProbabilities } from "../core/types";
import { getPoseNames, toPoseProbabilities } from "./poseMapping";
import { extractAirmouse885ToBuffer } from "./airmouse885Features";

// Constants
const SEQUENCE_LENGTH = 5;
// Feature counts by model version
// Feature counts by model version
const MODEL_FEATURES: Record<string, number> = {
  "airmouse-4.1": 885,
  "airmouse-4.2": 885,
  "airmouse-4.3": 885,
};

function resolveOrtWasmBasePath(basePath: string): string {
  if (typeof window === "undefined") {
    return basePath.endsWith("/") ? basePath : `${basePath}/`;
  }

  const normalizedPath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return new URL(normalizedPath, window.location.href).toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  responseType: "json" | "arrayBuffer",
  retries = 3,
  timeoutMs = 30000,
): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: attempt === 1 ? "force-cache" : "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (responseType === "json") {
        return await response.json();
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(200 * attempt);
      }
    } finally {
      window.clearTimeout(timerId);
    }
  }
  throw lastError ?? new Error(`Failed to fetch resource: ${url}`);
}

export interface ONNXPrediction {
  pose: PoseName;
  poseProbabilities: PoseProbabilities;
  confidence: "high" | "medium" | "low";
  /** @deprecated Use pose instead. */
  gesture?: PoseName;
  /** @deprecated Use poseProbabilities instead. */
  probabilities?: PoseProbabilities;
}

type MlTimingSink = {
  addFeatureExtraction: (ms: number) => void;
  addGestureML: (ms: number) => void;
};

export interface ONNXGestureClassifierAssetOverrides {
  modelPath?: string;
  normalizerPath?: string;
}

export class ONNXGestureClassifier {
  private session: any = null;
  private isLoading = false;

  // Normalizer
  private mean: Float32Array;
  private scale: Float32Array;

  // Frame buffer
  private frameBuffer: Float32Array[] = [];

  // Pre-allocated input tensor data
  private inputData: Float32Array;

  // Model ID for loading
  private modelId: string;
  private modelPath: string;
  private normalizerPath: string;
  private numFeatures: number;
  private numClasses: number;
  private poseNames: PoseName[];
  private lastProbs: Float32Array;
  private ortWasmBasePath: string;

  constructor(
    modelId: "airmouse-4.1" | "airmouse-4.2" | "airmouse-4.3",
    modelBasePath: string = "/models",
    normalizerBasePath: string = "/normalizers",
    ortWasmBasePath: string = "/",
    assetOverrides: ONNXGestureClassifierAssetOverrides = {},
  ) {
    this.modelId = modelId;
    this.modelPath =
      assetOverrides.modelPath ?? `${modelBasePath}/${modelId}.onnx`;
    this.normalizerPath =
      assetOverrides.normalizerPath ??
      `${normalizerBasePath}/${modelId}-normalizer.json`;
    this.ortWasmBasePath = ortWasmBasePath;
    this.numFeatures = MODEL_FEATURES[modelId] ?? 885;
    this.poseNames = getPoseNames(modelId);
    this.numClasses = this.poseNames.length;

    // Pre-allocate
    this.inputData = new Float32Array(1 * SEQUENCE_LENGTH * this.numFeatures);
    this.lastProbs = new Float32Array(this.numClasses).fill(0);
    this.mean = new Float32Array(this.numFeatures);
    this.scale = new Float32Array(this.numFeatures).fill(1);

    // Start loading
    this.load();
  }

  private async load(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }
    if (this.isLoading || this.session) return;
    this.isLoading = true;

    try {
      // Dynamic import - onnxruntime-web is a peerDependency so TypeScript
      // won't process its types during engine build (prevents OOM)
      // Use /wasm subpath to load non-JSEP bundle (avoids WebKit 26.2 JIT bug)
      // See: https://github.com/microsoft/onnxruntime/issues/26827
      if (!ortImportPromise) {
        ortImportPromise = import("onnxruntime-web/wasm");
      }
      ort = await ortImportPromise;

      // Configure ONNX Runtime for WASM
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.logLevel = "error";

      ort.env.wasm.wasmPaths = resolveOrtWasmBasePath(this.ortWasmBasePath);

      // Load normalizer
      const normalizerKey = `${this.modelId}:${this.normalizerPath}`;
      if (!sharedNormalizerCache.has(normalizerKey)) {
        sharedNormalizerCache.set(
          normalizerKey,
          (async () => {
            const normalizer = await fetchWithRetry(
              this.normalizerPath,
              "json",
              3,
              15000,
            );
            return {
              mean: new Float32Array(normalizer.mean),
              scale: new Float32Array(normalizer.scale),
            };
          })(),
        );
      }
      const normalizer = await sharedNormalizerCache.get(normalizerKey)!;
      this.mean = normalizer.mean;
      this.scale = normalizer.scale;

      // Load ONNX model bytes once and reuse across classifier instances
      const modelKey = `${this.modelId}:${this.modelPath}`;
      if (!sharedModelBytesCache.has(modelKey)) {
        sharedModelBytesCache.set(
          modelKey,
          fetchWithRetry(this.modelPath, "arrayBuffer", 3, 45000),
        );
      }
      const modelBytes = await sharedModelBytesCache.get(modelKey)!;

      this.session = await ort.InferenceSession.create(modelBytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      console.log(`[ONNX] Loaded ${this.modelId} successfully`);
    } catch (error) {
      console.error(`[ONNX] Failed to load ${this.modelId}:`, error);
    } finally {
      this.isLoading = false;
    }
  }

  async waitForLoad(): Promise<boolean> {
    while (this.isLoading) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return this.session !== null;
  }

  isReady(): boolean {
    return this.session !== null;
  }

  resetState(): void {
    this.frameBuffer = [];
  }

  /**
   * Extract 822 raw-geoboth features from landmarks (for airmouse-3/4).
   */

  /**
   * Extract 885 raw-geoboth features with FULL z-depth (for airmouse-3.1/4.1).
   */
  private extractFeatures885(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
    out: Float32Array,
  ): void {
    extractAirmouse885ToBuffer(landmarks2D, landmarks3D, out);
  }

  /**
   * Extract features based on model version.
   */
  private extractFeatures(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
    out: Float32Array,
  ): void {
    // Always use 885 features (airmouse-4.1 / airmouse-4.2)
    this.extractFeatures885(landmarks2D, landmarks3D, out);
  }

  /**
   * Main prediction method (async version).
   * For real-time use, call predictSync() which uses cached results.
   */
  async predictAsync(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
    timing?: MlTimingSink,
  ): Promise<ONNXPrediction> {
    const useTiming = Boolean(timing);
    const featureStart = useTiming ? performance.now() : 0;

    // Extract features
    const features = new Float32Array(this.numFeatures);
    this.extractFeatures(landmarks2D, landmarks3D, features);

    // Normalize
    for (let i = 0; i < this.numFeatures; i++) {
      features[i] = (features[i] - this.mean[i]) / this.scale[i];
    }

    if (timing) {
      timing.addFeatureExtraction(performance.now() - featureStart);
    }

    const mlStart = useTiming ? performance.now() : 0;

    // Add to frame buffer
    this.frameBuffer.push(features);
    if (this.frameBuffer.length > SEQUENCE_LENGTH) {
      this.frameBuffer.shift();
    }

    // If not ready or not enough frames, return idle
    if (!this.session || this.frameBuffer.length < SEQUENCE_LENGTH) {
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

    // Build input tensor: [1, 5, numFeatures]
    for (let t = 0; t < SEQUENCE_LENGTH; t++) {
      const frame = this.frameBuffer[t];
      for (let f = 0; f < this.numFeatures; f++) {
        this.inputData[t * this.numFeatures + f] = frame[f];
      }
    }

    // Run inference
    const inputTensor = new ort.Tensor("float32", this.inputData, [
      1,
      SEQUENCE_LENGTH,
      this.numFeatures,
    ]);
    const outputs = await this.session.run({ input: inputTensor });
    const logits = outputs.logits.data as Float32Array;

    // Softmax
    let maxLogit = logits[0];
    for (let i = 1; i < this.numClasses; i++) {
      if (logits[i] > maxLogit) maxLogit = logits[i];
    }
    let sumExp = 0;
    const probs = new Float32Array(this.numClasses);
    for (let i = 0; i < this.numClasses; i++) {
      probs[i] = Math.exp(logits[i] - maxLogit);
      sumExp += probs[i];
    }
    for (let i = 0; i < this.numClasses; i++) {
      probs[i] /= sumExp;
    }

    // Cache result for sync access
    this.lastProbs.set(probs);

    // Map to pose probabilities
    const poseProbabilities: PoseProbabilities = toPoseProbabilities(
      Array.from(probs),
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

    const confidence: "high" | "medium" | "low" =
      maxPoseProb > 0.8 ? "high" : maxPoseProb > 0.6 ? "medium" : "low";

    if (timing) {
      timing.addGestureML(performance.now() - mlStart);
    }

    return {
      pose: maxPose,
      poseProbabilities,
      confidence,
      gesture: maxPose,
      probabilities: poseProbabilities,
    };
  }

  // Cached probabilities for sync access
  /**
   * Synchronous prediction - calls predictAsync and returns current frame result.
   * Note: This actually runs async internally but the caller should await if possible.
   * For sync callers, use the cached result approach.
   */
  predict(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[],
    timing?: MlTimingSink,
  ): ONNXPrediction {
    // For sync API, kick off async and return cached
    // The timing will be reported by predictAsync
    this.predictAsync(landmarks2D, landmarks3D, timing).catch(() => {});

    // Return cached result from previous frame
    const probs = this.lastProbs;
    const probsArray = Array.from(probs);
    const normalizedProbs = probsArray.every((value) => value === 0)
      ? probsArray.map((value, index) => (index === 0 ? 1 : value))
      : probsArray;
    const poseProbabilities: PoseProbabilities = toPoseProbabilities(
      normalizedProbs,
      this.poseNames,
    );

    let maxPose: PoseName = "idle";
    let maxPoseProb = poseProbabilities.idle;
    for (const pose of this.poseNames) {
      const prob = poseProbabilities[pose];
      if (prob > maxPoseProb) {
        maxPoseProb = prob;
        maxPose = pose;
      }
    }

    const confidence: "high" | "medium" | "low" =
      maxPoseProb > 0.8 ? "high" : maxPoseProb > 0.6 ? "medium" : "low";

    return {
      pose: maxPose,
      poseProbabilities,
      confidence,
      gesture: maxPose,
      probabilities: poseProbabilities,
    };
  }

  reset(): void {
    this.resetState();
  }
}
