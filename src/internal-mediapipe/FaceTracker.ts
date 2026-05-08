import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  FaceLandmark,
  FaceTrackerOptions,
  FaceTrackerResult,
  TrackerClassificationGroup,
  TrackerTransformationMatrix,
} from "./types";
import {
  loadTaskModelBytes,
  MEDIAPIPE_DEFAULT_WASM_PATH,
  nextMonotonicTimestamp,
} from "./shared";

export type { FaceTrackerOptions, FaceTrackerResult };

export const FACE_MEDIAPIPE_DEFAULTS = {
  wasmPath: MEDIAPIPE_DEFAULT_WASM_PATH,
  modelPath: "/mediapipe/models/face_landmarker.task",
  hostedModelUrl:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
};

export class FaceTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private delegate: "CPU" | "GPU" = "CPU";
  private options: Required<FaceTrackerOptions>;
  private pendingOptionsUpdate: Promise<void> | null = null;
  private optionsDebounceTimer: number | null = null;
  private lastOptionsState = {
    numFaces: 0,
    detectionConfidence: 0,
    presenceConfidence: 0,
    trackingConfidence: 0,
    outputBlendshapes: false,
    outputTransformationMatrices: false,
  };
  private lastTimestampMs = 0;

  constructor(options: FaceTrackerOptions = {}) {
    this.options = {
      numFaces: options.numFaces ?? 1,
      detectionConfidence: options.detectionConfidence ?? 0.5,
      presenceConfidence: options.presenceConfidence ?? 0.5,
      trackingConfidence: options.trackingConfidence ?? 0.5,
      outputBlendshapes: options.outputBlendshapes ?? true,
      outputTransformationMatrices:
        options.outputTransformationMatrices ?? false,
      delegate: options.delegate ?? "GPU",
      wasmPath: options.wasmPath ?? FACE_MEDIAPIPE_DEFAULTS.wasmPath,
      modelPath: options.modelPath ?? FACE_MEDIAPIPE_DEFAULTS.modelPath,
    };
    this.lastOptionsState = {
      numFaces: this.options.numFaces,
      detectionConfidence: this.options.detectionConfidence,
      presenceConfidence: this.options.presenceConfidence,
      trackingConfidence: this.options.trackingConfidence,
      outputBlendshapes: this.options.outputBlendshapes,
      outputTransformationMatrices: this.options.outputTransformationMatrices,
    };
  }

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(this.options.wasmPath);
    const modelBytes = await loadTaskModelBytes([
      this.options.modelPath,
      FACE_MEDIAPIPE_DEFAULTS.hostedModelUrl,
    ]);

    const preferredDelegate = this.options.delegate;
    try {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: modelBytes,
          delegate: preferredDelegate,
        },
        runningMode: "VIDEO",
        numFaces: this.options.numFaces,
        minFaceDetectionConfidence: this.options.detectionConfidence,
        minFacePresenceConfidence: this.options.presenceConfidence,
        minTrackingConfidence: this.options.trackingConfidence,
        outputFaceBlendshapes: this.options.outputBlendshapes,
        outputFacialTransformationMatrixes:
          this.options.outputTransformationMatrices,
      });
      this.delegate = preferredDelegate;
    } catch (error) {
      if (preferredDelegate !== "GPU") {
        throw error;
      }

      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: modelBytes, delegate: "CPU" },
        runningMode: "VIDEO",
        numFaces: this.options.numFaces,
        minFaceDetectionConfidence: this.options.detectionConfidence,
        minFacePresenceConfidence: this.options.presenceConfidence,
        minTrackingConfidence: this.options.trackingConfidence,
        outputFaceBlendshapes: this.options.outputBlendshapes,
        outputFacialTransformationMatrixes:
          this.options.outputTransformationMatrices,
      });
      this.delegate = "CPU";
    }
  }

  getDelegate(): "CPU" | "GPU" {
    return this.delegate;
  }

  getOptions(): Readonly<Required<FaceTrackerOptions>> {
    return this.options;
  }

  detect(video: HTMLVideoElement, timestamp: number): FaceTrackerResult {
    if (!this.faceLandmarker) {
      throw new Error("FaceTracker not initialized. Call initialize() first.");
    }

    const mpTs = this.toMonotonicTimestamp(timestamp);
    const result = this.faceLandmarker.detectForVideo(video, mpTs);
    return this.adaptResult(result, timestamp);
  }

  scheduleOptionsUpdate(options: Partial<FaceTrackerOptions>): void {
    if (!this.faceLandmarker) return;

    const nextState = {
      numFaces: options.numFaces ?? this.lastOptionsState.numFaces,
      detectionConfidence:
        options.detectionConfidence ?? this.lastOptionsState.detectionConfidence,
      presenceConfidence:
        options.presenceConfidence ?? this.lastOptionsState.presenceConfidence,
      trackingConfidence:
        options.trackingConfidence ?? this.lastOptionsState.trackingConfidence,
      outputBlendshapes:
        options.outputBlendshapes ?? this.lastOptionsState.outputBlendshapes,
      outputTransformationMatrices:
        options.outputTransformationMatrices ??
        this.lastOptionsState.outputTransformationMatrices,
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
      if (this.pendingOptionsUpdate || !this.faceLandmarker) return;

      Object.assign(this.options, nextState);
      this.pendingOptionsUpdate = this.faceLandmarker
        .setOptions({
          numFaces: nextState.numFaces,
          minFaceDetectionConfidence: nextState.detectionConfidence,
          minFacePresenceConfidence: nextState.presenceConfidence,
          minTrackingConfidence: nextState.trackingConfidence,
          outputFaceBlendshapes: nextState.outputBlendshapes,
          outputFacialTransformationMatrixes:
            nextState.outputTransformationMatrices,
        })
        .catch(() => {})
        .finally(() => {
          this.pendingOptionsUpdate = null;
        });
    }, 120) as unknown as number;
  }

  async updateOptions(options: Partial<FaceTrackerOptions>): Promise<void> {
    if (!this.faceLandmarker || this.pendingOptionsUpdate) return;

    const newOptions: Partial<
      Parameters<FaceLandmarker["setOptions"]>[0]
    > = {};

    if (options.numFaces !== undefined) {
      this.options.numFaces = options.numFaces;
      newOptions.numFaces = options.numFaces;
    }
    if (options.detectionConfidence !== undefined) {
      this.options.detectionConfidence = options.detectionConfidence;
      newOptions.minFaceDetectionConfidence = options.detectionConfidence;
    }
    if (options.presenceConfidence !== undefined) {
      this.options.presenceConfidence = options.presenceConfidence;
      newOptions.minFacePresenceConfidence = options.presenceConfidence;
    }
    if (options.trackingConfidence !== undefined) {
      this.options.trackingConfidence = options.trackingConfidence;
      newOptions.minTrackingConfidence = options.trackingConfidence;
    }
    if (options.outputBlendshapes !== undefined) {
      this.options.outputBlendshapes = options.outputBlendshapes;
      newOptions.outputFaceBlendshapes = options.outputBlendshapes;
    }
    if (options.outputTransformationMatrices !== undefined) {
      this.options.outputTransformationMatrices =
        options.outputTransformationMatrices;
      newOptions.outputFacialTransformationMatrixes =
        options.outputTransformationMatrices;
    }

    if (Object.keys(newOptions).length === 0) return;

    this.pendingOptionsUpdate = this.faceLandmarker
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
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
  }

  private toMonotonicTimestamp(candidateMs: number): number {
    const ts = nextMonotonicTimestamp(this.lastTimestampMs, candidateMs);
    this.lastTimestampMs = ts;
    return ts;
  }

  private adaptResult(
    result: FaceLandmarkerResult,
    timestamp: number,
  ): FaceTrackerResult {
    const landmarks = (result.faceLandmarks ?? []) as unknown as FaceLandmark[][];
    const blendshapes = (result.faceBlendshapes ??
      []) as unknown as TrackerClassificationGroup[];
    const transformationMatrices = (result.facialTransformationMatrixes ??
      []) as unknown as TrackerTransformationMatrix[];

    return {
      landmarks,
      blendshapes,
      transformationMatrices,
      timestamp,
    };
  }
}
