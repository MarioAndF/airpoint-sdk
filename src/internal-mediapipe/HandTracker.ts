import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  HandLandmark,
  HandednessInfo,
  HandTrackerOptions,
  HandTrackerResult,
} from "./types";
import {
  loadTaskModelBytes,
  MEDIAPIPE_DEFAULT_WASM_PATH,
  nextMonotonicTimestamp,
} from "./shared";

export type { HandTrackerOptions, HandTrackerResult };

/**
 * Default WASM and model paths for MediaPipe
 */
export const MEDIAPIPE_DEFAULTS = {
  wasmPath: MEDIAPIPE_DEFAULT_WASM_PATH,
  modelPath: "/mediapipe/models/hand_landmarker.task",
};

/**
 * HandTracker - Wraps MediaPipe HandLandmarker for easy integration
 *
 * Features:
 * - GPU → CPU fallback
 * - .task file validation
 * - Debounced options updates
 * - Safari-compatible monotonic timestamps
 */
export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private delegate: "CPU" | "GPU" = "CPU";
  private options: Required<HandTrackerOptions>;
  private pendingOptionsUpdate: Promise<void> | null = null;
  private optionsDebounceTimer: number | null = null;
  private lastOptionsState = {
    maxHands: 0,
    detectionConfidence: 0,
    trackingConfidence: 0,
  };

  // Safari/WebKit timestamp handling - must be strictly monotonically increasing
  private lastTimestampMs = 0;

  constructor(options: HandTrackerOptions = {}) {
    this.options = {
      maxHands: options.maxHands ?? 2,
      detectionConfidence: options.detectionConfidence ?? 0.95,
      trackingConfidence: options.trackingConfidence ?? 0.95,
      delegate: options.delegate ?? "GPU",
      wasmPath: options.wasmPath ?? MEDIAPIPE_DEFAULTS.wasmPath,
      modelPath: options.modelPath ?? MEDIAPIPE_DEFAULTS.modelPath,
    };
    this.lastOptionsState = {
      maxHands: this.options.maxHands,
      detectionConfidence: this.options.detectionConfidence,
      trackingConfidence: this.options.trackingConfidence,
    };
  }

  /**
   * Initialize the hand tracker. Must be called before detect().
   */
  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(this.options.wasmPath);

    const modelBytes = await loadTaskModelBytes([this.options.modelPath]);

    // Prefer GPU delegate for smoother realtime tracking on consumer desktops.
    // Fall back to CPU if the GPU delegate isn't supported.
    const preferredDelegate = this.options.delegate;
    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: modelBytes,
          delegate: preferredDelegate,
        },
        runningMode: "VIDEO",
        numHands: this.options.maxHands,
        minHandDetectionConfidence: this.options.detectionConfidence,
        minTrackingConfidence: this.options.trackingConfidence,
      });
      this.delegate = preferredDelegate;
    } catch (e) {
      if (preferredDelegate === "GPU") {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: modelBytes, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: this.options.maxHands,
          minHandDetectionConfidence: this.options.detectionConfidence,
          minTrackingConfidence: this.options.trackingConfidence,
        });
        this.delegate = "CPU";
      } else {
        throw e;
      }
    }
  }

  /**
   * Returns which delegate (CPU/GPU) is being used
   */
  getDelegate(): "CPU" | "GPU" {
    return this.delegate;
  }

  /**
   * Returns current options
   */
  getOptions(): Readonly<Required<HandTrackerOptions>> {
    return this.options;
  }

  /**
   * Detect hands in a video frame.
   * Handles Safari timestamp quirks automatically.
   */
  detect(video: HTMLVideoElement, timestamp: number): HandTrackerResult {
    if (!this.handLandmarker) {
      throw new Error("HandTracker not initialized. Call initialize() first.");
    }

    // MediaPipe requires strictly monotonically increasing timestamps for VIDEO mode.
    // Safari/WebKit can report timestamps starting at 0 or repeating.
    const mpTs = this.toMonotonicTimestamp(timestamp);

    const result = this.handLandmarker.detectForVideo(video, mpTs);
    return this.adaptResult(result, timestamp);
  }

  /**
   * Ensure timestamp is strictly monotonically increasing (Safari fix)
   */
  private toMonotonicTimestamp(candidateMs: number): number {
    const ts = nextMonotonicTimestamp(this.lastTimestampMs, candidateMs);
    this.lastTimestampMs = ts;
    return ts;
  }

  /**
   * Schedule an options update. Debounced to avoid stalling during rapid slider changes.
   * Call this every frame if you have live UI controls.
   */
  scheduleOptionsUpdate(options: Partial<HandTrackerOptions>): void {
    if (!this.handLandmarker) return;

    const newMaxHands = options.maxHands ?? this.lastOptionsState.maxHands;
    const newDetection =
      options.detectionConfidence ?? this.lastOptionsState.detectionConfidence;
    const newTracking =
      options.trackingConfidence ?? this.lastOptionsState.trackingConfidence;

    const changed =
      newMaxHands !== this.lastOptionsState.maxHands ||
      newDetection !== this.lastOptionsState.detectionConfidence ||
      newTracking !== this.lastOptionsState.trackingConfidence;

    if (!changed) return;

    this.lastOptionsState = {
      maxHands: newMaxHands,
      detectionConfidence: newDetection,
      trackingConfidence: newTracking,
    };

    if (this.optionsDebounceTimer !== null) {
      clearTimeout(this.optionsDebounceTimer);
    }

    // Debounce rapid slider changes so we don't stall the main loop.
    this.optionsDebounceTimer = setTimeout(() => {
      if (this.pendingOptionsUpdate) return;

      this.options.maxHands = newMaxHands;
      this.options.detectionConfidence = newDetection;
      this.options.trackingConfidence = newTracking;

      this.pendingOptionsUpdate = this.handLandmarker!.setOptions({
        numHands: newMaxHands,
        minHandDetectionConfidence: newDetection,
        minTrackingConfidence: newTracking,
      })
        .catch(() => {})
        .finally(() => {
          this.pendingOptionsUpdate = null;
        });
    }, 120) as unknown as number;
  }

  /**
   * Update tracker options immediately (async). Use scheduleOptionsUpdate() for live UI.
   */
  async updateOptions(options: Partial<HandTrackerOptions>): Promise<void> {
    if (!this.handLandmarker) return;
    if (this.pendingOptionsUpdate) return;

    const newOptions: Partial<Parameters<HandLandmarker["setOptions"]>[0]> = {};

    if (options.maxHands !== undefined) {
      this.options.maxHands = options.maxHands;
      newOptions.numHands = options.maxHands;
    }
    if (options.detectionConfidence !== undefined) {
      this.options.detectionConfidence = options.detectionConfidence;
      newOptions.minHandDetectionConfidence = options.detectionConfidence;
    }
    if (options.trackingConfidence !== undefined) {
      this.options.trackingConfidence = options.trackingConfidence;
      newOptions.minTrackingConfidence = options.trackingConfidence;
    }

    if (Object.keys(newOptions).length === 0) return;

    this.pendingOptionsUpdate = this.handLandmarker
      .setOptions(newOptions)
      .catch(() => {})
      .finally(() => {
        this.pendingOptionsUpdate = null;
      });

    await this.pendingOptionsUpdate;
  }

  /**
   * Clean up resources
   */
  close(): void {
    if (this.optionsDebounceTimer !== null) {
      clearTimeout(this.optionsDebounceTimer);
      this.optionsDebounceTimer = null;
    }
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
  }

  /**
   * Adapt MediaPipe result to our types
   */
  private adaptResult(
    result: HandLandmarkerResult,
    timestamp: number,
  ): HandTrackerResult {
    // Avoid per-frame object allocation: MediaPipe landmarks already match our shape.
    const landmarks = (result.landmarks ?? []) as unknown as HandLandmark[][];
    const worldLandmarks = (result.worldLandmarks ??
      []) as unknown as HandLandmark[][];

    const handedness: HandednessInfo[] = (result.handednesses ?? []).map(
      (handCats) => {
        const top = handCats?.[0];
        return {
          label: top?.categoryName || top?.displayName || "Unknown",
          score: top?.score ?? 0,
        };
      },
    );

    return {
      landmarks,
      worldLandmarks,
      handedness,
      timestamp,
    };
  }
}
