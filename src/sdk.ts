import {
  type HandConfig,
  type HandLandmark,
  type Handedness,
  type HandednessInfo,
  type PoseName,
  type PoseProbabilities,
} from "./types";
import {
  HandCursorEngine,
  LandmarkSmoother,
  PalmWheelDetector,
  type PalmWheelAction,
  adaptMediaPipeToFrameInputs,
  getCameraStream,
  type CameraMode,
  type HandCursorEngineAssetPaths,
  type PalmWheelOutput,
} from "./internal-engine";
import { HandTracker } from "./internal-mediapipe";
import {
  AirpointEventEmitter,
  type AirpointSdkEventMap,
  type AirpointSdkEventType,
} from "./events";
import { PoseTracker } from "./poseTracker";
import {
  resolveAirpointSdkAssetPaths,
  type AirpointSdkAssetPaths,
} from "./assetPaths";
import { validateAirpointSdkAssets } from "./assetValidation";
import { buildConfig } from "./config";
import {
  prepareAirpointPremiumAssets,
  type AirpointPreparedPremiumAssets,
  type AirpointPremiumOptions,
} from "./premium";

type AirpointSdkSource = "mediapipe" | "raw";

export type AirpointSDKOptions = {
  source?: AirpointSdkSource;
  video?: HTMLVideoElement;
  config?: Partial<HandConfig>;
  assets?: AirpointSdkAssetPaths;
  /** Airpoint license token. When provided, the SDK automatically fetches and decrypts premium AirMouse models from the license server. */
  apiKey?: string;
  /** Override the license server URL (defaults to https://license.airpoint.app). */
  licenseServerUrl?: string;
  /** @deprecated Use `apiKey` instead. Manual premium options for advanced use cases. */
  premium?: AirpointPremiumOptions;
  coords?: {
    mirror?: boolean;
    space?: "normalized" | "pixels";
    width?: number;
    height?: number;
  };
  throttleFps?: number;
  emitRawLandmarks?: boolean;
  /** Emit pose events for all detected hands instead of only the active cursor hand. */
  emitPoseForAllHands?: boolean;
  /** Enable palm wheel detection and emit 'airpoint:palmWheel' DOM events */
  enablePalmWheel?: boolean;
};

export type RawFrameInput = {
  landmarks: HandLandmark[][];
  worldLandmarks?: HandLandmark[][];
  handedness: HandednessInfo[];
  timestamp: number;
};

export type AirpointSDK = {
  /** Prepare premium assets and gesture engine without opening the camera. */
  prepare(): Promise<void>;
  start(): Promise<void>;
  /** Pause frame processing without unloading models, trackers, or prepared premium assets. */
  pause(): void;
  stop(): void;
  /** Open the camera using global config (aspect ratio, quality, frameRate, deviceId) and attach to a video element. */
  startCamera(
    video: HTMLVideoElement,
  ): Promise<{ stream: MediaStream; mode: CameraMode }>;
  /** Stop the camera stream attached by startCamera(). */
  stopCamera(): void;
  /** Read the current resolved config. */
  getConfig(): HandConfig;
  updateConfig(next: Partial<HandConfig>): void;
  setVideo(video: HTMLVideoElement): void;
  processFrame(frame: RawFrameInput): Promise<void>;
  on<T extends AirpointSdkEventType>(
    event: T,
    cb: (e: AirpointSdkEventMap[T]) => void,
  ): () => void;
  getState(): { running: boolean; lastFrameMs: number };
};

type MediaPipeLikeResult = {
  multiHandLandmarks: HandLandmark[][];
  multiHandWorldLandmarks?: HandLandmark[][];
  multiHandedness: HandednessInfo[];
};

const AIRPOINT_LICENSE_SERVER_URL = "https://license.airpoint.app";
const LICENSE_FETCH_TIMEOUT_MS = 15_000;
const VIDEO_PLAY_TIMEOUT_MS = 10_000;

interface PremiumServerResponse {
  bundleId: string;
  bundlePath: string;
  decryptionKey: string;
  license: AirpointPremiumOptions["license"];
  licensePublicKey: JsonWebKey;
  error?: string;
}

async function fetchAndPreparePremiumAssets(
  apiKey: string,
  licenseServerUrl?: string,
): Promise<AirpointPreparedPremiumAssets> {
  const baseUrl =
    licenseServerUrl?.replace(/\/+$/u, "") ?? AIRPOINT_LICENSE_SERVER_URL;
  const url = `${baseUrl}/api/license/premium-airmouse`;

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    LICENSE_FETCH_TIMEOUT_MS,
  );
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Airpoint: license server request timed out.");
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Airpoint: failed to reach license server: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      // ignore parse failure
    }
    if (response.status === 401) {
      throw new Error(
        `Airpoint: invalid API key.${detail ? ` ${detail}` : ""}`,
      );
    }
    if (response.status === 403) {
      throw new Error(
        `Airpoint: API key does not include premium AirMouse access.${detail ? ` ${detail}` : ""}`,
      );
    }
    throw new Error(
      `Airpoint: license server error (HTTP ${response.status}).${detail ? ` ${detail}` : ""}`,
    );
  }

  const data = (await response.json()) as PremiumServerResponse;

  return prepareAirpointPremiumAssets({
    bundlePath: data.bundlePath,
    decryptionKey: data.decryptionKey,
    license: data.license,
    licensePublicKey: data.licensePublicKey,
    requiredEntitlements: ["airmouse-premium"],
  });
}

export function createAirpointSDK(
  options: AirpointSDKOptions = {},
): AirpointSDK {
  const emitter = new AirpointEventEmitter();
  const poseTrackers: Record<Handedness, PoseTracker> = {
    Left: new PoseTracker(),
    Right: new PoseTracker(),
  };
  const lastCursorByHand = new Map<Handedness, { x: number; y: number }>();
  const activeHands = new Set<Handedness>();

  let config = buildConfig(options.config ?? {});
  let handTracker: HandTracker | null = null;
  let video = options.video ?? null;
  let managedStream: MediaStream | null = null;
  let cameraRequestToken = 0;
  let running = false;
  let initialized = false;
  let preparePromise: Promise<void> | null = null;
  let lastFrameMs = 0;
  let rafId: number | null = null;
  let rvfcId: number | null = null;
  let processing = false;
  const resolvedAssets = resolveAirpointSdkAssetPaths(options.assets);
  let premiumAssets: AirpointPreparedPremiumAssets | null = null;

  const resolvePremiumAssetUrl = (
    assetUrls: Record<string, string>,
    candidates: string[],
  ) => {
    for (const candidate of candidates) {
      const resolved = assetUrls[candidate];
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  };

  const buildEngineAssetPaths = (
    preparedPremiumAssets: AirpointPreparedPremiumAssets | null,
  ): HandCursorEngineAssetPaths => {
    const assetPaths: HandCursorEngineAssetPaths = {
      gestureModelBasePath: resolvedAssets.gestureModelBasePath,
      gestureWeightBasePath: resolvedAssets.gestureWeightBasePath,
      normalizerBasePath: resolvedAssets.normalizerBasePath,
      ortWasmBasePath: resolvedAssets.ortWasmBasePath,
    };

    if (!preparedPremiumAssets) {
      return assetPaths;
    }

    assetPaths.gestureAssetUrls = {
      normalizerPaths: {
        "airmouse-4.1": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          [
            "normalizers/airmouse-4.1-normalizer.json",
            "weights/airmouse-4.1-normalizer.json",
          ],
        ),
        "airmouse-4.3": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          [
            "normalizers/airmouse-4.3-normalizer.json",
            "normalizers/airmouse-4.2-normalizer.json",
            "weights/airmouse-4.3-normalizer.json",
            "weights/airmouse-4.2-normalizer.json",
          ],
        ),
      },
      onnxModelPaths: {
        "airmouse-4.1": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          ["models/airmouse-4.1.onnx"],
        ),
        "airmouse-4.3": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          ["models/airmouse-4.3.onnx", "models/airmouse-4.2.onnx"],
        ),
      },
      tcnNormalizerPaths: {
        "airmouse-4.1": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          [
            "normalizers/airmouse-4.1-normalizer.json",
            "weights/airmouse-4.1-normalizer.json",
          ],
        ),
        "airmouse-4.3": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          [
            "normalizers/airmouse-4.3-normalizer.json",
            "normalizers/airmouse-4.2-normalizer.json",
            "weights/airmouse-4.3-normalizer.json",
            "weights/airmouse-4.2-normalizer.json",
          ],
        ),
      },
      tcnWeightPaths: {
        "airmouse-4.1": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          ["weights/airmouse-4.1.json"],
        ),
        "airmouse-4.3": resolvePremiumAssetUrl(
          preparedPremiumAssets.assetUrls,
          ["weights/airmouse-4.3.json", "weights/airmouse-4.2.json"],
        ),
      },
    };

    return assetPaths;
  };

  let engine: HandCursorEngine | null = options.apiKey
    ? null
    : new HandCursorEngine(config, buildEngineAssetPaths(null));
  const smoother = new LandmarkSmoother(
    config.landmarkMinCutoff,
    config.landmarkBeta,
  );

  // Palm wheel detectors for both hands
  const palmWheelDetectors: Record<Handedness, PalmWheelDetector> = {
    Left: new PalmWheelDetector({
      enabled: config.palmWheelEnabled?.Left ?? true,
      palmFacingDotThreshold: config.palmWheelPalmFacingDotThreshold,
      pressUpThreshold: config.palmWheelPressUpThreshold,
      palmFacingDotHysteresis: config.palmWheelOpenPalmHysteresis,
      openPalmGraceMs: config.palmWheelOpenPalmGraceMs,
    }),
    Right: new PalmWheelDetector({
      enabled: config.palmWheelEnabled?.Right ?? true,
      palmFacingDotThreshold: config.palmWheelPalmFacingDotThreshold,
      pressUpThreshold: config.palmWheelPressUpThreshold,
      palmFacingDotHysteresis: config.palmWheelOpenPalmHysteresis,
      openPalmGraceMs: config.palmWheelOpenPalmGraceMs,
    }),
  };

  const resolveAction = (id: string | any): PalmWheelAction | null => {
    if (!id || id === "unassigned") return null;

    // Handle submenu objects
    if (typeof id === "object" && id.type === "submenu") {
      // For now, treat submenu as simple action that opens submenu logic (not fully implemented here yet)
      // or simplistic mapping if we just want label/icon
      return {
        id: "submenu", // SDK doesn't fully handle submenu navigation yet, just pass through label
        label: id.label ?? "Submenu",
        icon: id.icon ?? "chevron-right",
        isSubmenu: true,
        onSelect: () => {},
      };
    }

    const actionMap: Record<string, { label: string; icon: string }> = {
      tracking_toggle: { label: "Pause", icon: "pause" },
      recenter: { label: "Recenter", icon: "circle-plus" },
      // Game Actions
      game_start: { label: "Start", icon: "play" },
      game_pause: { label: "Pause", icon: "pause" },
      game_select: { label: "Select", icon: "minus" },
      game_menu: { label: "Menu", icon: "layout-grid" },
      game_camera: { label: "Camera", icon: "camera" },
      action_r1: { label: "R1", icon: "circle" },
      action_r2: { label: "R2", icon: "circle" },
      action_r3: { label: "R3", icon: "circle" },
      action_r4: { label: "R4", icon: "circle" },
      action_r5: { label: "R5", icon: "circle" },
    };

    const def = actionMap[id];
    return {
      id,
      label: def?.label ?? id,
      icon: def?.icon,
      onSelect: () => {}, // Handled by event listener
    };
  };

  const updatePalmWheelDetectorConfig = () => {
    const hands: Handedness[] = ["Left", "Right"];
    for (const hand of hands) {
      palmWheelDetectors[hand].updateConfig({
        enabled: config.palmWheelEnabled?.[hand] ?? true,
        palmFacingDotThreshold: config.palmWheelPalmFacingDotThreshold,
        pressUpThreshold: config.palmWheelPressUpThreshold,
        palmFacingDotHysteresis: config.palmWheelOpenPalmHysteresis,
        openPalmGraceMs: config.palmWheelOpenPalmGraceMs,
      });
    }
  };

  const updatePalmWheelSlots = () => {
    const hands: Handedness[] = ["Left", "Right"];
    for (const hand of hands) {
      const detector = palmWheelDetectors[hand];
      const prefix = hand === "Left" ? "L" : "R";
      const fingers = ["thumb", "index", "middle", "ring", "pinky"] as const;

      const bindings = config.palmWheelBindings ?? {};

      for (let i = 0; i < fingers.length; i++) {
        const finger = fingers[i];
        const slotKey = `${prefix}${i + 1}`;
        const binding = (bindings as any)[slotKey] ?? "unassigned";

        // Check overrides if needed, but bindings is primary source here
        detector.setSlotAction(finger, resolveAction(binding));
      }
    }
  };

  // Initial update
  updatePalmWheelDetectorConfig();
  updatePalmWheelSlots();

  const source: AirpointSdkSource = options.source ?? "mediapipe";

  const emit = <T extends AirpointSdkEventType>(
    type: T,
    event: AirpointSdkEventMap[T],
  ) => emitter.emit(type, event);

  // Emit palm wheel DOM event for host overlays that visualize the palm wheel.
  const emitPalmWheelEvent = (
    palmWheels: Array<{
      palmWheel: PalmWheelOutput | null;
      cursorX?: number;
      cursorY?: number;
      handLabel: Handedness;
    }>,
  ) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("airpoint:palmWheel", {
          detail: { palmWheels },
        }),
      );
    }
  };

  const selectCursorHandId = (
    cursorOutputs: Array<{
      id: string;
      isGrabbing?: boolean;
      isClicking?: boolean;
    }>,
    gestureOutputs: Array<{
      id: string;
      isGrabbing?: boolean;
      isClicking?: boolean;
    }>,
  ): Handedness | undefined => {
    if (cursorOutputs.length === 0) return undefined;

    const mode = config.cursorHand ?? "Both";
    if (mode === "Left" || mode === "Right") {
      return cursorOutputs.find((output) => output.id === mode)?.id as
        | Handedness
        | undefined;
    }

    const grabbingGesture = gestureOutputs.find(
      (gesture) =>
        gesture.isGrabbing &&
        cursorOutputs.some((output) => output.id === gesture.id),
    );

    const clickingGesture = gestureOutputs.find(
      (gesture) =>
        gesture.isClicking &&
        cursorOutputs.some((output) => output.id === gesture.id),
    );

    return (grabbingGesture?.id ||
      clickingGesture?.id ||
      cursorOutputs.find((output) => output.id === "Right")?.id ||
      cursorOutputs[0].id) as Handedness;
  };

  // Fixed virtual canvas — all apps (desktop, labs, playground) use 1920×1080
  // as a consistent reference frame for cursor movement translation.
  const VIRTUAL_WIDTH = 1920;
  const VIRTUAL_HEIGHT = 1080;

  const resolveFrameSize = () => {
    const width = options.coords?.width ?? VIRTUAL_WIDTH;
    const height = options.coords?.height ?? VIRTUAL_HEIGHT;
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  };

  const toOutputCoords = (
    xPx: number,
    yPx: number,
    width: number,
    height: number,
  ) => {
    const space = options.coords?.space ?? "normalized";
    const mirror = options.coords?.mirror ?? false;
    let x = xPx;
    let y = yPx;

    if (space === "normalized") {
      x = width > 0 ? xPx / width : 0;
      y = height > 0 ? yPx / height : 0;
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      if (mirror) x = 1 - x;
    } else if (mirror) {
      x = width - x;
    }

    return { x, y };
  };

  const emitHandTransitions = (
    currentHands: Set<Handedness>,
    timestamp: number,
  ) => {
    for (const hand of currentHands) {
      if (!activeHands.has(hand)) {
        activeHands.add(hand);
        emit("hand_found", { type: "hand_found", hand, timestamp });
      }
    }

    for (const hand of Array.from(activeHands)) {
      if (!currentHands.has(hand)) {
        activeHands.delete(hand);
        poseTrackers[hand].reset();
        lastCursorByHand.delete(hand);
        emit("hand_lost", { type: "hand_lost", hand, timestamp });
      }
    }
  };

  const processPoseTransitions = (
    hand: Handedness,
    poseProbabilities: PoseProbabilities | undefined,
    timestamp: number,
    motionDeltaPx: number,
    coords?: { x?: number; y?: number },
  ) => {
    const tracker = poseTrackers[hand];
    const events = tracker.update(
      poseProbabilities,
      timestamp,
      config,
      motionDeltaPx,
    );

    for (const evt of events) {
      if (evt.type === "pose_enter" || evt.type === "pose_exit") {
        emit(evt.type, {
          type: evt.type,
          hand,
          timestamp,
          pose: evt.pose,
          x: coords?.x,
          y: coords?.y,
        } as AirpointSdkEventMap[typeof evt.type]);
      }
    }
  };

  const emitPoseFrame = (
    hand: Handedness,
    timestamp: number,
    pose: PoseName,
    poseProbabilities: PoseProbabilities,
    coords?: { x?: number; y?: number },
    confidence?: number,
  ) => {
    emit("pose", {
      type: "pose",
      hand,
      timestamp,
      pose,
      poseProbabilities,
      x: coords?.x,
      y: coords?.y,
      confidence,
    });
  };

  const processResults = async (
    results: MediaPipeLikeResult,
    timestamp: number,
  ) => {
    if (!engine) {
      throw new Error("Airpoint SDK: tracking engine is not initialized.");
    }

    const { width, height } = resolveFrameSize();

    if (
      config.enableLandmarkSmoothing &&
      results.multiHandLandmarks &&
      results.multiHandedness
    ) {
      smoother.updateConfig(config.landmarkMinCutoff, config.landmarkBeta);
      const excludeJoints = config.landmarkSmoothingExcludeJoints ?? [];
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i]?.label || "Unknown";
        results.multiHandLandmarks[i] = smoother.smooth(
          results.multiHandLandmarks[i],
          label,
          timestamp,
          excludeJoints,
        );
      }
    }

    const inputs = adaptMediaPipeToFrameInputs(results, timestamp);

    // Process palm wheel FIRST to determine which hands are active
    // This must happen before processCursor so cursor can track palm center during palm wheel
    let palmWheelActiveHands: Set<Handedness> | undefined;
    const palmWheelOutputs = new Map<Handedness, PalmWheelOutput>();

    if (options.enablePalmWheel) {
      palmWheelActiveHands = new Set<Handedness>();

      // Build a map of hand label to landmarks index
      const handIndexMap = new Map<Handedness, number>();
      for (let i = 0; i < (results.multiHandedness?.length ?? 0); i++) {
        const label = results.multiHandedness?.[i]?.label;
        if (label === "Left" || label === "Right") {
          handIndexMap.set(label, i);
        }
      }

      // Process palm wheel detection for each hand
      for (const handLabel of ["Left", "Right"] as Handedness[]) {
        const idx = handIndexMap.get(handLabel);
        const landmarks =
          idx !== undefined
            ? (results.multiHandLandmarks?.[idx] ?? null)
            : null;

        const output = palmWheelDetectors[handLabel].process(
          landmarks,
          timestamp,
          handLabel,
        );

        palmWheelOutputs.set(handLabel, output);

        // Mark hand as palm wheel active if in active or confirmed state
        if (output.state === "active" || output.state === "confirmed") {
          palmWheelActiveHands.add(handLabel);
        }
      }
    }

    // Process cursor - pass palmWheelActiveHands so cursor tracks palm during palm wheel
    const cursorOutputs = engine.processCursor(
      inputs,
      timestamp,
      width,
      height,
      palmWheelActiveHands ?? false,
    );
    const gestureOutputs = await engine.processGestures(
      inputs,
      timestamp,
      width,
      height,
    );

    const currentHands = new Set<Handedness>();
    const confidenceByHand = new Map<Handedness, number>();

    for (const handInfo of results.multiHandedness ?? []) {
      const hand = handInfo.label === "Left" ? "Left" : ("Right" as Handedness);
      currentHands.add(hand);
      confidenceByHand.set(hand, handInfo.score);
    }

    emitHandTransitions(currentHands, timestamp);

    const cursorByHand = new Map<Handedness, (typeof cursorOutputs)[number]>();
    for (const cursor of cursorOutputs) {
      cursorByHand.set(cursor.id as Handedness, cursor);
    }

    const gestureByHand = new Map<
      Handedness,
      (typeof gestureOutputs)[number]
    >();
    for (const gesture of gestureOutputs) {
      gestureByHand.set(gesture.id as Handedness, gesture);
    }

    const activeHand = selectCursorHandId(cursorOutputs, gestureOutputs);
    if (activeHand) {
      const cursor = cursorByHand.get(activeHand);
      if (cursor) {
        const coords = toOutputCoords(cursor.x, cursor.y, width, height);
        const gesture = gestureByHand.get(activeHand);
        emit("move", {
          type: "move",
          hand: activeHand,
          timestamp,
          x: coords.x,
          y: coords.y,
          speed: cursor.speed,
          fingerSpeed: cursor.fingerSpeed,
          clicking: gesture?.isClicking,
          rightClicking: gesture?.isRightClicking,
          grabbing: gesture?.isGrabbing,
          handednessScore: cursor.handednessScore,
          confidence: confidenceByHand.get(activeHand),
          scroll: gesture?.scroll,
        });
      }
    }

    for (const [hand, gesture] of gestureByHand.entries()) {
      if (!options.emitPoseForAllHands && activeHand && hand !== activeHand) {
        continue;
      }
      const cursor = cursorByHand.get(hand);
      const coords = cursor
        ? toOutputCoords(cursor.x, cursor.y, width, height)
        : undefined;
      const confidence = confidenceByHand.get(hand);

      if (gesture.pose && gesture.poseProbabilities) {
        emitPoseFrame(
          hand,
          timestamp,
          gesture.pose,
          gesture.poseProbabilities,
          coords,
          confidence,
        );
      }

      let motionDeltaPx = 0;
      if (cursor) {
        const prev = lastCursorByHand.get(hand);
        if (prev) {
          motionDeltaPx = Math.hypot(cursor.x - prev.x, cursor.y - prev.y);
        }
        lastCursorByHand.set(hand, { x: cursor.x, y: cursor.y });
      }

      processPoseTransitions(
        hand,
        gesture.poseProbabilities,
        timestamp,
        motionDeltaPx,
        coords,
      );
    }

    if (options.emitRawLandmarks && results.multiHandLandmarks) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const handInfo = results.multiHandedness?.[i];
        const hand =
          handInfo?.label === "Left" ? "Left" : ("Right" as Handedness);
        emit("raw_landmarks", {
          type: "raw_landmarks",
          hand,
          timestamp,
          landmarks: results.multiHandLandmarks[i],
          worldLandmarks: results.multiHandWorldLandmarks?.[i],
          confidence: handInfo?.score,
        });
      }
    }

    // Palm wheel DOM event emission (palm wheel was already processed above)
    if (options.enablePalmWheel && palmWheelOutputs.size > 0) {
      const palmWheels: Array<{
        palmWheel: PalmWheelOutput | null;
        cursorX?: number;
        cursorY?: number;
        handLabel: Handedness;
      }> = [];

      for (const handLabel of ["Left", "Right"] as Handedness[]) {
        const output = palmWheelOutputs.get(handLabel);

        // Use cursor position - it now tracks palm center during palm wheel
        const cursor = cursorByHand.get(handLabel);
        const coords = cursor
          ? toOutputCoords(cursor.x, cursor.y, width, height)
          : undefined;

        palmWheels.push({
          palmWheel: output ?? null,
          // Emit normalized coordinates (0-1) - overlay converts to pixels
          cursorX: coords?.x,
          cursorY: coords?.y,
          handLabel,
        });
      }

      emitPalmWheelEvent(palmWheels);
    }
  };

  const scheduleNext = () => {
    if (!running || source !== "mediapipe") return;
    const maybeRvfc = (video as any)?.requestVideoFrameCallback as
      | ((cb: (now: DOMHighResTimeStamp) => void) => number)
      | undefined;
    if (typeof maybeRvfc === "function") {
      rvfcId = maybeRvfc.call(video, (now: DOMHighResTimeStamp) => {
        void tick(now);
      });
      return;
    }
    rafId = requestAnimationFrame((now) => {
      void tick(now);
    });
  };

  const tick = async (now: number) => {
    if (!running || source !== "mediapipe") return;
    if (processing) {
      scheduleNext();
      return;
    }

    const throttleFps = options.throttleFps ?? 0;
    if (throttleFps > 0 && lastFrameMs > 0) {
      const minInterval = 1000 / throttleFps;
      if (now - lastFrameMs < minInterval) {
        scheduleNext();
        return;
      }
    }

    if (!handTracker || !video) {
      scheduleNext();
      return;
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      scheduleNext();
      return;
    }

    processing = true;
    lastFrameMs = now;
    try {
      handTracker.scheduleOptionsUpdate({
        maxHands: config.maxHands,
        detectionConfidence: config.detectionConfidence,
        trackingConfidence: config.trackingConfidence,
      });

      const result = handTracker.detect(video, now);
      const adapted: MediaPipeLikeResult = {
        multiHandLandmarks: result.landmarks,
        multiHandWorldLandmarks: result.worldLandmarks,
        multiHandedness: result.handedness,
      };

      await processResults(adapted, now);
    } finally {
      processing = false;
      scheduleNext();
    }
  };

  const cancelScheduledFrame = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (rvfcId !== null) {
      const maybeCancelRvfc = (video as any)?.cancelVideoFrameCallback as
        | ((id: number) => void)
        | undefined;
      if (typeof maybeCancelRvfc === "function") {
        maybeCancelRvfc.call(video, rvfcId);
      }
      rvfcId = null;
    }
  };

  const resetTrackingState = () => {
    activeHands.clear();
    lastCursorByHand.clear();
    poseTrackers.Left.reset();
    poseTrackers.Right.reset();
    smoother.reset();
  };

  const ensurePremiumAssets = async () => {
    if (!config.enableMLClassifier || premiumAssets) {
      return;
    }

    if (options.apiKey) {
      premiumAssets = await fetchAndPreparePremiumAssets(
        options.apiKey,
        options.licenseServerUrl,
      );
      return;
    }

    if (options.premium) {
      premiumAssets = await prepareAirpointPremiumAssets({
        ...options.premium,
        bundlePath:
          options.premium.bundlePath ?? resolvedAssets.premiumBundlePath,
      });
    }
  };

  const ensureEngine = () => {
    if (
      engine &&
      (!config.enableMLClassifier ||
        premiumAssets ||
        (!options.apiKey && !options.premium))
    ) {
      return;
    }

    engine = new HandCursorEngine(config, buildEngineAssetPaths(premiumAssets));
  };

  const prepare = async () => {
    preparePromise ??= (async () => {
      await ensurePremiumAssets();
      ensureEngine();
    })().catch((error) => {
      preparePromise = null;
      throw error;
    });

    await preparePromise;
  };

  const initialize = async () => {
    if (initialized) {
      return;
    }

    await prepare();

    if (source === "mediapipe") {
      if (!video) {
        throw new Error(
          "Airpoint SDK: video element is required for mediapipe source.",
        );
      }

      await validateAirpointSdkAssets(options.assets, {
        enableMLClassifier: config.enableMLClassifier,
        gestureModel: config.gestureModel,
        hasPremiumBundle: Boolean(premiumAssets),
        premiumBundlePath: premiumAssets
          ? undefined
          : (options.premium?.bundlePath ?? resolvedAssets.premiumBundlePath),
      });

      handTracker = new HandTracker({
        maxHands: config.maxHands,
        detectionConfidence: config.detectionConfidence,
        trackingConfidence: config.trackingConfidence,
        delegate: config.handTrackingDelegate ?? "GPU",
        wasmPath: resolvedAssets.mediapipeWasmPath,
        modelPath: resolvedAssets.mediapipeModelPath,
      });

      await handTracker.initialize();
    }

    initialized = true;
  };

  const start = async () => {
    if (running) return;
    running = true;

    try {
      await initialize();
      scheduleNext();
    } catch (error) {
      running = false;
      handTracker?.close();
      handTracker = null;
      initialized = false;
      premiumAssets?.revoke();
      premiumAssets = null;
      throw error;
    }
  };

  const pause = () => {
    if (!running) return;
    running = false;
    processing = false;
    cancelScheduledFrame();
    resetTrackingState();
  };

  const stop = () => {
    pause();

    handTracker?.close();
    handTracker = null;
    initialized = false;
    resetTrackingState();
    premiumAssets?.revoke();
    premiumAssets = null;

    // Also stop managed camera
    stopCamera();
  };

  const updateConfig = (next: Partial<HandConfig>) => {
    config = buildConfig({ ...config, ...next });
    engine?.updateConfig(config);
    smoother.updateConfig(config.landmarkMinCutoff, config.landmarkBeta);
    updatePalmWheelDetectorConfig();
    // Update palm wheel slots on config change
    updatePalmWheelSlots();
  };

  const setVideo = (nextVideo: HTMLVideoElement) => {
    video = nextVideo;
  };

  // ── Camera management ──────────────────────────────────────────────────────

  const ASPECT_RATIOS: Record<string, number> = {
    "16:9": 16 / 9,
    "4:3": 4 / 3,
    "1:1": 1,
    "9:16": 9 / 16,
  };

  const buildCameraOptions = () => {
    const opts: {
      idealFrameRate?: number;
      idealWidth?: number;
      idealHeight?: number;
    } = {};

    if (config.cameraFrameRate > 0) {
      opts.idealFrameRate = config.cameraFrameRate;
    }

    if (config.cameraQuality > 0) {
      const height = config.cameraQuality;
      const ar = config.cameraAspectRatio;
      if (ar && ar !== "auto" && ASPECT_RATIOS[ar]) {
        opts.idealWidth = Math.round(height * ASPECT_RATIOS[ar]);
        opts.idealHeight = height;
      } else {
        opts.idealHeight = height;
      }
    }

    return opts;
  };

  const startCamera = async (
    videoEl: HTMLVideoElement,
  ): Promise<{ stream: MediaStream; mode: CameraMode }> => {
    stopCamera();
    const requestToken = ++cameraRequestToken;

    const aspectRatio = config.cameraAspectRatio || "auto";
    const deviceId = config.cameraDeviceId || undefined;

    const { stream, actualMode } = await getCameraStream(
      aspectRatio,
      deviceId,
      buildCameraOptions(),
    );

    if (requestToken !== cameraRequestToken) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Airpoint SDK: camera start was cancelled.");
    }

    try {
      videoEl.srcObject = stream;
      await Promise.race([
        videoEl.play(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Airpoint SDK: video playback timed out.")),
            VIDEO_PLAY_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoEl.srcObject === stream) {
        videoEl.srcObject = null;
      }
      throw error;
    }

    if (requestToken !== cameraRequestToken) {
      stream.getTracks().forEach((track) => track.stop());
      if (videoEl.srcObject === stream) {
        videoEl.srcObject = null;
      }
      throw new Error("Airpoint SDK: camera start was cancelled.");
    }

    managedStream = stream;
    video = videoEl;

    return { stream, mode: actualMode };
  };

  const stopCamera = () => {
    cameraRequestToken++;
    if (managedStream) {
      managedStream.getTracks().forEach((t) => t.stop());
      managedStream = null;
    }
  };

  const processFrame = async (frame: RawFrameInput) => {
    if (source !== "raw") {
      throw new Error(
        "Airpoint SDK: processFrame is only available for raw source.",
      );
    }
    if (!running) {
      throw new Error("Airpoint SDK: call start() before processFrame().");
    }
    const adapted: MediaPipeLikeResult = {
      multiHandLandmarks: frame.landmarks,
      multiHandWorldLandmarks: frame.worldLandmarks,
      multiHandedness: frame.handedness,
    };
    await processResults(adapted, frame.timestamp);
  };

  const on = <T extends AirpointSdkEventType>(
    event: T,
    cb: (e: AirpointSdkEventMap[T]) => void,
  ) => emitter.on(event, cb);

  const getState = () => ({ running, lastFrameMs });

  const getConfig = (): HandConfig => ({ ...config });

  return {
    prepare,
    start,
    pause,
    stop,
    startCamera,
    stopCamera,
    getConfig,
    updateConfig,
    setVideo,
    processFrame,
    on,
    getState,
  };
}
