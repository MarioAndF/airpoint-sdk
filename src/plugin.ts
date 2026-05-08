import type { HandConfig, Handedness, PoseName } from "./types";
import type {
  AirpointHandEvent,
  AirpointMoveEvent,
  AirpointPoseEvent,
  AirpointSdkEventMap,
  AirpointSdkEventType,
  AirpointPoseEnterEvent,
  AirpointPoseExitEvent,
  AirpointRawLandmarksEvent,
  AirpointTimingEvent,
} from "./events";
import type { AirpointSdkAssetPaths } from "./assetPaths";
import type { AirpointPremiumOptions } from "./premium";
import { createAirpointSDK, type RawFrameInput } from "./sdk";
import {
  validateAirpointManifest,
  type AirpointIntentConfig,
  type AirpointIntentId,
  type AirpointIntentPhase,
  type AirpointPluginManifest,
  type NormalizedAirpointPluginManifest,
} from "./manifest";

type PoseState = {
  enteredAt: number;
  holdActive: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  pose: PoseName;
};

export type AirpointIntent = {
  allowWhenBlocked?: boolean;
  id: AirpointIntentId;
  metadata?: Record<string, unknown>;
  phase: AirpointIntentPhase;
  pose: PoseName;
  target?: string;
};

export type AirpointIntentEvent = {
  blocked: boolean;
  point?: { space: "pixels"; x: number; y: number };
  target?: Element | null;
  targetName?: string;
  type: "intent";
  timestamp: number;
  hand: Handedness;
  intent: AirpointIntent;
  x?: number;
  y?: number;
};

export type AirpointPluginEventType = AirpointSdkEventType | "intent";

export type AirpointPluginEventMap = AirpointSdkEventMap & {
  intent: AirpointIntentEvent;
};

export type AirpointDebugEvent =
  | AirpointMoveEvent
  | AirpointPoseEvent
  | AirpointPoseEnterEvent
  | AirpointPoseExitEvent
  | AirpointHandEvent
  | AirpointRawLandmarksEvent
  | AirpointTimingEvent;

export type AirpointHostAdapter = {
  getViewport?: () => { height: number; width: number };
  isBlockedAtPoint?: (x: number, y: number) => boolean;
  onPluginEvent?: <T extends AirpointPluginEventType>(
    event: AirpointPluginEventMap[T],
  ) => void;
  performIntent?: (event: AirpointIntentEvent) => void | Promise<void>;
  resolveTarget?: (
    targetName: string,
    context: {
      event: AirpointIntentEvent;
      manifest: NormalizedAirpointPluginManifest;
    },
  ) => Element | null;
};

export type AirpointPluginOptions = {
  adapter?: AirpointHostAdapter;
  /** Airpoint license token. When provided, the SDK automatically fetches and decrypts premium AirMouse models. */
  apiKey?: string;
  /** Override the license server URL (defaults to https://license.airpoint.app). */
  licenseServerUrl?: string;
  manifest?: AirpointPluginManifest;
  /** @deprecated Use `apiKey` instead. */
  premium?: AirpointPremiumOptions;
  video?: HTMLVideoElement;
};

export type AirpointPlugin = {
  start(): Promise<void>;
  stop(): void;
  startCamera(video: HTMLVideoElement): Promise<{
    stream: MediaStream;
    mode: import("./internal-engine").CameraMode;
  }>;
  stopCamera(): void;
  getConfig(): HandConfig;
  updateConfig(next: Partial<HandConfig>): void;
  getManifest(): NormalizedAirpointPluginManifest;
  updateManifest(next: AirpointPluginManifest): void;
  setVideo(video: HTMLVideoElement): void;
  processFrame(frame: RawFrameInput): Promise<void>;
  on<T extends AirpointPluginEventType>(
    event: T,
    cb: (e: AirpointPluginEventMap[T]) => void,
  ): () => void;
  getState(): { running: boolean; lastFrameMs: number };
};

class PluginEmitter {
  private listeners = new Map<
    AirpointPluginEventType,
    Set<(event: AirpointPluginEventMap[AirpointPluginEventType]) => void>
  >();

  on<T extends AirpointPluginEventType>(
    type: T,
    cb: (event: AirpointPluginEventMap[T]) => void,
  ): () => void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(
      cb as (event: AirpointPluginEventMap[AirpointPluginEventType]) => void,
    );
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(
        cb as (event: AirpointPluginEventMap[AirpointPluginEventType]) => void,
      );
    };
  }

  emit<T extends AirpointPluginEventType>(
    type: T,
    event: AirpointPluginEventMap[T],
  ) {
    const bucket = this.listeners.get(type);
    if (!bucket) {
      return;
    }
    for (const cb of bucket) {
      cb(event as AirpointPluginEventMap[AirpointPluginEventType]);
    }
  }
}

function mergeManifests(
  base: NormalizedAirpointPluginManifest,
  next: AirpointPluginManifest,
): NormalizedAirpointPluginManifest {
  const normalized = validateAirpointManifest(next);
  return {
    dom: {
      ...base.dom,
      ...normalized.dom,
      targets: {
        ...base.dom.targets,
        ...normalized.dom.targets,
      },
    },
    intents: {
      ...base.intents,
      ...normalized.intents,
    },
    metadata: {
      ...base.metadata,
      ...normalized.metadata,
    },
    runtime: {
      ...base.runtime,
      ...normalized.runtime,
      assets: {
        ...base.runtime.assets,
        ...normalized.runtime.assets,
      },
      coords: {
        ...base.runtime.coords,
        ...normalized.runtime.coords,
      },
    },
    tracking: {
      ...base.tracking,
      ...normalized.tracking,
      config: {
        ...base.tracking.config,
        ...normalized.tracking.config,
      },
    },
  };
}

function buildSdkOptions(
  manifest: NormalizedAirpointPluginManifest,
  pluginOptions: {
    apiKey?: string;
    licenseServerUrl?: string;
    premium?: AirpointPremiumOptions;
  },
  video?: HTMLVideoElement,
): {
  apiKey?: string;
  assets?: AirpointSdkAssetPaths;
  config?: Partial<HandConfig>;
  coords?: {
    mirror?: boolean;
    space?: "normalized" | "pixels";
    width?: number;
    height?: number;
  };
  emitPoseForAllHands?: boolean;
  emitRawLandmarks?: boolean;
  enablePalmWheel?: boolean;
  licenseServerUrl?: string;
  source?: "mediapipe" | "raw";
  throttleFps?: number;
  premium?: AirpointPremiumOptions;
  video?: HTMLVideoElement;
} {
  const config: Partial<HandConfig> = {
    ...manifest.tracking.config,
  };

  if (manifest.tracking.clickHand) {
    config.clickHand = manifest.tracking.clickHand;
  }
  if (manifest.tracking.cursorHand) {
    config.cursorHand = manifest.tracking.cursorHand;
  }

  return {
    apiKey: pluginOptions.apiKey,
    assets: manifest.runtime.assets,
    config,
    coords: manifest.runtime.coords,
    emitPoseForAllHands: manifest.runtime.emitPoseForAllHands,
    emitRawLandmarks: manifest.runtime.emitRawLandmarks,
    enablePalmWheel: manifest.runtime.enablePalmWheel,
    licenseServerUrl: pluginOptions.licenseServerUrl,
    premium: pluginOptions.premium,
    source: manifest.runtime.source,
    throttleFps: manifest.runtime.throttleFps,
    video,
  };
}

function getBinding(
  manifest: NormalizedAirpointPluginManifest,
  pose: PoseName,
  phase: AirpointIntentPhase,
) {
  return manifest.intents[pose]?.[phase] ?? null;
}

function createPoseKey(hand: Handedness, pose: PoseName) {
  return `${hand}:${pose}`;
}

function getViewport(adapter?: AirpointHostAdapter) {
  return (
    adapter?.getViewport?.() ??
    (typeof window !== "undefined"
      ? { height: window.innerHeight, width: window.innerWidth }
      : null)
  );
}

function resolvePixelPoint(
  event: Pick<AirpointPoseEnterEvent, "x" | "y">,
  manifest: NormalizedAirpointPluginManifest,
  adapter?: AirpointHostAdapter,
) {
  if (typeof event.x !== "number" || typeof event.y !== "number") {
    return null;
  }
  if (manifest.runtime.coords?.space === "pixels") {
    return { space: "pixels" as const, x: event.x, y: event.y };
  }

  const viewport = getViewport(adapter);
  if (!viewport) {
    return null;
  }

  return {
    space: "pixels" as const,
    x: event.x * viewport.width,
    y: event.y * viewport.height,
  };
}

function matchesAnySelector(element: Element, selectors: string[]) {
  return selectors.some((selector) => Boolean(element.closest(selector)));
}

function isBlockedAtPoint(
  x: number,
  y: number,
  manifest: NormalizedAirpointPluginManifest,
  adapter?: AirpointHostAdapter,
) {
  const adapterDecision = adapter?.isBlockedAtPoint?.(x, y);
  if (typeof adapterDecision === "boolean") {
    return adapterDecision;
  }

  if (
    typeof document === "undefined" ||
    typeof document.elementsFromPoint !== "function"
  ) {
    return false;
  }

  const elements = document.elementsFromPoint(x, y);
  return elements.some((element) => {
    if (matchesAnySelector(element, manifest.dom.ignoreSelectors)) {
      return false;
    }
    return matchesAnySelector(element, manifest.dom.blockedSelectors);
  });
}

function resolveTarget(
  binding: AirpointIntentConfig,
  intentEvent: AirpointIntentEvent,
  manifest: NormalizedAirpointPluginManifest,
  adapter?: AirpointHostAdapter,
) {
  const targetName = binding.target;
  if (!targetName) {
    return { target: null, targetName: undefined };
  }

  const adapterTarget = adapter?.resolveTarget?.(targetName, {
    event: intentEvent,
    manifest,
  });
  if (adapterTarget) {
    return { target: adapterTarget, targetName };
  }

  const selector = manifest.dom.targets[targetName];
  if (!selector || typeof document === "undefined") {
    return { target: null, targetName };
  }

  return {
    target: document.querySelector(selector),
    targetName,
  };
}

export function createAirpointPlugin(
  options: AirpointPluginOptions = {},
): AirpointPlugin {
  let manifest = validateAirpointManifest(options.manifest ?? {});
  const sdk = createAirpointSDK(
    buildSdkOptions(manifest, options, options.video),
  );
  const adapter = options.adapter;
  const emitter = new PluginEmitter();
  const poseStates = new Map<string, PoseState>();

  const passthroughEventTypes: AirpointSdkEventType[] = [
    "move",
    "pose",
    "pose_enter",
    "pose_exit",
    "hand_found",
    "hand_lost",
    "raw_landmarks",
    "timing",
  ];

  const removePassthroughListeners = passthroughEventTypes.map((type) =>
    sdk.on(type, (event) => {
      emitter.emit(type, event);
      adapter?.onPluginEvent?.(event);
    }),
  );

  const emitIntent = (
    event: AirpointPoseEnterEvent | AirpointPoseExitEvent,
    phase: AirpointIntentPhase,
  ) => {
    const binding = getBinding(manifest, event.pose, phase);
    if (!binding) {
      return;
    }

    const point = resolvePixelPoint(event, manifest, adapter);
    const blocked = point
      ? isBlockedAtPoint(point.x, point.y, manifest, adapter)
      : false;

    const intentEvent: AirpointIntentEvent = {
      blocked,
      point: point ?? undefined,
      type: "intent",
      timestamp: event.timestamp,
      hand: event.hand,
      intent: {
        allowWhenBlocked: binding.allowWhenBlocked,
        id: binding.id,
        metadata: binding.metadata,
        phase,
        pose: event.pose,
        target: binding.target,
      },
      x: event.x,
      y: event.y,
    };

    const { target, targetName } = resolveTarget(
      binding,
      intentEvent,
      manifest,
      adapter,
    );
    intentEvent.target = target;
    intentEvent.targetName = targetName;

    emitter.emit("intent", intentEvent);
    adapter?.onPluginEvent?.(intentEvent);
    if (!blocked || binding.allowWhenBlocked) {
      void adapter?.performIntent?.(intentEvent);
    }
  };

  sdk.on("pose_enter", (event) => {
    emitIntent(event, "enter");

    const tapId = getBinding(manifest, event.pose, "tap");
    const holdStartId = getBinding(manifest, event.pose, "hold_start");
    const holdEndId = getBinding(manifest, event.pose, "hold_end");
    if (!tapId && !holdStartId && !holdEndId) {
      return;
    }

    const key = createPoseKey(event.hand, event.pose);
    const holdThresholdMs = sdk.getConfig().poseHoldThresholdMs;
    const poseState: PoseState = {
      enteredAt: event.timestamp,
      holdActive: false,
      holdTimer: null,
      pose: event.pose,
    };

    if (holdStartId || holdEndId) {
      poseState.holdTimer = setTimeout(() => {
        const currentState = poseStates.get(key);
        if (!currentState) {
          return;
        }
        currentState.holdActive = true;
        emitIntent(event, "hold_start");
      }, holdThresholdMs);
    }

    poseStates.set(key, poseState);
  });

  sdk.on("pose_exit", (event) => {
    const key = createPoseKey(event.hand, event.pose);
    const poseState = poseStates.get(key);

    if (poseState?.holdTimer) {
      clearTimeout(poseState.holdTimer);
    }

    if (poseState?.holdActive) {
      emitIntent(event, "hold_end");
    } else {
      emitIntent(event, "tap");
    }

    poseStates.delete(key);
    emitIntent(event, "exit");
  });

  return {
    start: () => sdk.start(),
    stop: () => {
      for (const state of poseStates.values()) {
        if (state.holdTimer) {
          clearTimeout(state.holdTimer);
        }
      }
      for (const removeListener of removePassthroughListeners) {
        removeListener();
      }
      poseStates.clear();
      sdk.stop();
    },
    startCamera: (video) => sdk.startCamera(video),
    stopCamera: () => sdk.stopCamera(),
    getConfig: () => sdk.getConfig(),
    updateConfig: (next) => sdk.updateConfig(next),
    getManifest: () => manifest,
    updateManifest: (next) => {
      manifest = mergeManifests(manifest, next);
      if (next.tracking?.config) {
        sdk.updateConfig(next.tracking.config);
      }
      if (next.tracking?.clickHand || next.tracking?.cursorHand) {
        sdk.updateConfig({
          clickHand: next.tracking.clickHand,
          cursorHand: next.tracking.cursorHand,
        });
      }
    },
    setVideo: (video) => sdk.setVideo(video),
    processFrame: (frame) => sdk.processFrame(frame),
    on: (type, cb) =>
      emitter.on(type, cb as (e: AirpointPluginEventMap[typeof type]) => void),
    getState: () => sdk.getState(),
  };
}
