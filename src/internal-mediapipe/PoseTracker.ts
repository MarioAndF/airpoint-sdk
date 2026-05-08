import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  PoseLandmark,
  PoseSegmentationMask,
  PoseTrackerOptions,
  PoseTrackerResult,
} from "./types";
import {
  loadTaskModelBytes,
  MEDIAPIPE_DEFAULT_WASM_PATH,
  nextMonotonicTimestamp,
} from "./shared";

export type { PoseTrackerOptions, PoseTrackerResult };

export const POSE_MEDIAPIPE_DEFAULTS = {
  wasmPath: MEDIAPIPE_DEFAULT_WASM_PATH,
  modelPath: "/mediapipe/models/pose_landmarker_lite.task",
  hostedModelUrl:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private delegate: "CPU" | "GPU" = "CPU";
  private options: Required<PoseTrackerOptions>;
  private pendingOptionsUpdate: Promise<void> | null = null;
  private optionsDebounceTimer: number | null = null;
  private lastOptionsState = {
    numPoses: 0,
    detectionConfidence: 0,
    presenceConfidence: 0,
    trackingConfidence: 0,
    outputSegmentationMasks: false,
  };
  private lastTimestampMs = 0;

  constructor(options: PoseTrackerOptions = {}) {
    this.options = {
      numPoses: options.numPoses ?? 1,
      detectionConfidence: options.detectionConfidence ?? 0.5,
      presenceConfidence: options.presenceConfidence ?? 0.5,
      trackingConfidence: options.trackingConfidence ?? 0.5,
      outputSegmentationMasks: options.outputSegmentationMasks ?? false,
      delegate: options.delegate ?? "GPU",
      wasmPath: options.wasmPath ?? POSE_MEDIAPIPE_DEFAULTS.wasmPath,
      modelPath: options.modelPath ?? POSE_MEDIAPIPE_DEFAULTS.modelPath,
    };
    this.lastOptionsState = {
      numPoses: this.options.numPoses,
      detectionConfidence: this.options.detectionConfidence,
      presenceConfidence: this.options.presenceConfidence,
      trackingConfidence: this.options.trackingConfidence,
      outputSegmentationMasks: this.options.outputSegmentationMasks,
    };
  }

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(this.options.wasmPath);
    const modelBytes = await loadTaskModelBytes([
      this.options.modelPath,
      POSE_MEDIAPIPE_DEFAULTS.hostedModelUrl,
    ]);

    const preferredDelegate = this.options.delegate;
    try {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: modelBytes,
          delegate: preferredDelegate,
        },
        runningMode: "VIDEO",
        numPoses: this.options.numPoses,
        minPoseDetectionConfidence: this.options.detectionConfidence,
        minPosePresenceConfidence: this.options.presenceConfidence,
        minTrackingConfidence: this.options.trackingConfidence,
        outputSegmentationMasks: this.options.outputSegmentationMasks,
      });
      this.delegate = preferredDelegate;
    } catch (error) {
      if (preferredDelegate !== "GPU") {
        throw error;
      }

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: modelBytes, delegate: "CPU" },
        runningMode: "VIDEO",
        numPoses: this.options.numPoses,
        minPoseDetectionConfidence: this.options.detectionConfidence,
        minPosePresenceConfidence: this.options.presenceConfidence,
        minTrackingConfidence: this.options.trackingConfidence,
        outputSegmentationMasks: this.options.outputSegmentationMasks,
      });
      this.delegate = "CPU";
    }
  }

  getDelegate(): "CPU" | "GPU" {
    return this.delegate;
  }

  getOptions(): Readonly<Required<PoseTrackerOptions>> {
    return this.options;
  }

  detect(video: HTMLVideoElement, timestamp: number): PoseTrackerResult {
    if (!this.poseLandmarker) {
      throw new Error("PoseTracker not initialized. Call initialize() first.");
    }

    const mpTs = this.toMonotonicTimestamp(timestamp);
    const result = this.poseLandmarker.detectForVideo(video, mpTs);
    try {
      return this.adaptResult(result, timestamp);
    } finally {
      result.close();
    }
  }

  scheduleOptionsUpdate(options: Partial<PoseTrackerOptions>): void {
    if (!this.poseLandmarker) return;

    const nextState = {
      numPoses: options.numPoses ?? this.lastOptionsState.numPoses,
      detectionConfidence:
        options.detectionConfidence ?? this.lastOptionsState.detectionConfidence,
      presenceConfidence:
        options.presenceConfidence ?? this.lastOptionsState.presenceConfidence,
      trackingConfidence:
        options.trackingConfidence ?? this.lastOptionsState.trackingConfidence,
      outputSegmentationMasks:
        options.outputSegmentationMasks ??
        this.lastOptionsState.outputSegmentationMasks,
    };

    const changed = Object.keys(nextState).some(
      (key) =>
        nextState[key as keyof typeof nextState] !==
        this.lastOptionsState[key as keyof typeof this.lastOptionsState],
    );
    if (!changed) return;

    this.lastOptionsState = nextState;

    if (this.optionsDebounceTimer !== null) {
      clearTimeout(this.optionsDebounceTimer);
    }

    this.optionsDebounceTimer = setTimeout(() => {
      if (this.pendingOptionsUpdate || !this.poseLandmarker) return;

      Object.assign(this.options, nextState);
      this.pendingOptionsUpdate = this.poseLandmarker
        .setOptions({
          numPoses: nextState.numPoses,
          minPoseDetectionConfidence: nextState.detectionConfidence,
          minPosePresenceConfidence: nextState.presenceConfidence,
          minTrackingConfidence: nextState.trackingConfidence,
          outputSegmentationMasks: nextState.outputSegmentationMasks,
        })
        .catch(() => {})
        .finally(() => {
          this.pendingOptionsUpdate = null;
        });
    }, 120) as unknown as number;
  }

  async updateOptions(options: Partial<PoseTrackerOptions>): Promise<void> {
    if (!this.poseLandmarker || this.pendingOptionsUpdate) return;

    const newOptions: Partial<
      Parameters<PoseLandmarker["setOptions"]>[0]
    > = {};

    if (options.numPoses !== undefined) {
      this.options.numPoses = options.numPoses;
      newOptions.numPoses = options.numPoses;
    }
    if (options.detectionConfidence !== undefined) {
      this.options.detectionConfidence = options.detectionConfidence;
      newOptions.minPoseDetectionConfidence = options.detectionConfidence;
    }
    if (options.presenceConfidence !== undefined) {
      this.options.presenceConfidence = options.presenceConfidence;
      newOptions.minPosePresenceConfidence = options.presenceConfidence;
    }
    if (options.trackingConfidence !== undefined) {
      this.options.trackingConfidence = options.trackingConfidence;
      newOptions.minTrackingConfidence = options.trackingConfidence;
    }
    if (options.outputSegmentationMasks !== undefined) {
      this.options.outputSegmentationMasks = options.outputSegmentationMasks;
      newOptions.outputSegmentationMasks = options.outputSegmentationMasks;
    }

    if (Object.keys(newOptions).length === 0) return;

    this.pendingOptionsUpdate = this.poseLandmarker
      .setOptions(newOptions)
      .catch(() => {})
      .finally(() => {
        this.pendingOptionsUpdate = null;
      });

    await this.pendingOptionsUpdate;
  }

  close(): void {
    if (this.optionsDebounceTimer !== null) {
      clearTimeout(this.optionsDebounceTimer);
      this.optionsDebounceTimer = null;
    }
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
  }

  private toMonotonicTimestamp(candidateMs: number): number {
    const ts = nextMonotonicTimestamp(this.lastTimestampMs, candidateMs);
    this.lastTimestampMs = ts;
    return ts;
  }

  private adaptResult(
    result: PoseLandmarkerResult,
    timestamp: number,
  ): PoseTrackerResult {
    const segmentationMasks = (result.segmentationMasks ?? []).map((mask) =>
      mask.clone(),
    ) as unknown as PoseSegmentationMask[];

    return {
      landmarks: (result.landmarks ?? []) as unknown as PoseLandmark[][],
      worldLandmarks: (result.worldLandmarks ?? []) as unknown as PoseLandmark[][],
      segmentationMasks,
      timestamp,
    };
  }
}
