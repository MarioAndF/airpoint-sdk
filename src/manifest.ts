import type { HandConfig, Handedness, PoseName } from "./types";
import type { AirpointSdkAssetPaths } from "./assetPaths";

export type AirpointIntentId = string;
export type AirpointIntentBinding = AirpointIntentId | AirpointIntentConfig;
export type AirpointIntentPhase =
  | "enter"
  | "exit"
  | "tap"
  | "hold_start"
  | "hold_end";

export type AirpointIntentConfig = {
  allowWhenBlocked?: boolean;
  id: AirpointIntentId;
  metadata?: Record<string, unknown>;
  target?: string;
};

export type AirpointIntentBindingMap = Partial<
  Record<PoseName, Partial<Record<AirpointIntentPhase, AirpointIntentBinding>>>
>;

export type AirpointDomTargetRules = {
  blockedSelectors: string[];
  dismissSelectors: string[];
  ignoreSelectors: string[];
  targets: Record<string, string>;
};

export type AirpointPluginMetadata = {
  appId?: string;
  appName?: string;
  profile?: string;
};

export type AirpointPluginRuntimeManifest = {
  assets?: AirpointSdkAssetPaths;
  coords?: {
    mirror?: boolean;
    space?: "normalized" | "pixels";
    width?: number;
    height?: number;
  };
  emitPoseForAllHands?: boolean;
  emitRawLandmarks?: boolean;
  enablePalmWheel?: boolean;
  source?: "mediapipe" | "raw";
  throttleFps?: number;
};

export type AirpointPluginTrackingManifest = {
  config?: Partial<HandConfig>;
  clickHand?: Handedness | "Both";
  cursorHand?: Handedness | "Both";
};

export type AirpointPluginManifest = {
  dom?: Partial<AirpointDomTargetRules>;
  intents?: AirpointIntentBindingMap;
  metadata?: AirpointPluginMetadata;
  runtime?: AirpointPluginRuntimeManifest;
  tracking?: AirpointPluginTrackingManifest;
};

export type NormalizedAirpointPluginManifest = {
  dom: AirpointDomTargetRules;
  intents: NormalizedAirpointIntentBindingMap;
  metadata: AirpointPluginMetadata;
  runtime: AirpointPluginRuntimeManifest;
  tracking: AirpointPluginTrackingManifest;
};

export type NormalizedAirpointIntentBindingMap = Partial<
  Record<PoseName, Partial<Record<AirpointIntentPhase, AirpointIntentConfig>>>
>;

const DEFAULT_MANIFEST: NormalizedAirpointPluginManifest = {
  dom: {
    blockedSelectors: [],
    dismissSelectors: [],
    ignoreSelectors: [],
    targets: {},
  },
  intents: {},
  metadata: {},
  runtime: {},
  tracking: {},
};

function normalizeIntentBinding(
  binding: AirpointIntentBinding | undefined,
): AirpointIntentConfig | undefined {
  if (!binding) {
    return undefined;
  }
  if (typeof binding === "string") {
    return { id: binding };
  }
  return {
    allowWhenBlocked: binding.allowWhenBlocked ?? false,
    id: binding.id,
    metadata: binding.metadata,
    target: binding.target,
  };
}

export function normalizeAirpointManifest(
  manifest: AirpointPluginManifest = {},
): NormalizedAirpointPluginManifest {
  const intents: NormalizedAirpointIntentBindingMap = {};
  for (const [poseName, phases] of Object.entries(manifest.intents ?? {})) {
    if (!phases) {
      continue;
    }
    const normalizedPhases: Partial<Record<AirpointIntentPhase, AirpointIntentConfig>> =
      {};
    for (const [phase, binding] of Object.entries(phases)) {
      const normalizedBinding = normalizeIntentBinding(binding);
      if (!normalizedBinding) {
        continue;
      }
      normalizedPhases[phase as AirpointIntentPhase] = normalizedBinding;
    }
    intents[poseName as PoseName] = normalizedPhases;
  }

  return {
    dom: {
      blockedSelectors: manifest.dom?.blockedSelectors ?? [],
      dismissSelectors: manifest.dom?.dismissSelectors ?? [],
      ignoreSelectors: manifest.dom?.ignoreSelectors ?? [],
      targets: manifest.dom?.targets ?? {},
    },
    intents,
    metadata: manifest.metadata ?? {},
    runtime: manifest.runtime ?? {},
    tracking: manifest.tracking ?? {},
  };
}

export function validateAirpointManifest(
  manifest: AirpointPluginManifest,
): NormalizedAirpointPluginManifest {
  const normalized = normalizeAirpointManifest(manifest);

  for (const [poseName, phases] of Object.entries(normalized.intents)) {
    if (!phases || typeof phases !== "object") {
      throw new Error(`Invalid intent bindings for pose "${poseName}".`);
    }
    for (const [phase, intentId] of Object.entries(phases)) {
      if (!intentId) {
        continue;
      }
      if (
        phase !== "enter" &&
        phase !== "exit" &&
        phase !== "tap" &&
        phase !== "hold_start" &&
        phase !== "hold_end"
      ) {
        throw new Error(`Unsupported intent phase "${phase}" for pose "${poseName}".`);
      }
      const normalizedBinding = normalizeIntentBinding(intentId);
      if (!normalizedBinding?.id?.trim()) {
        throw new Error(`Invalid intent id for ${poseName}.${phase}.`);
      }
      if (
        normalizedBinding.target !== undefined &&
        (typeof normalizedBinding.target !== "string" ||
          !normalizedBinding.target.trim())
      ) {
        throw new Error(`Invalid target for ${poseName}.${phase}.`);
      }
    }
  }

  for (const [name, selector] of Object.entries(normalized.dom.targets)) {
    if (typeof selector !== "string" || !selector.trim()) {
      throw new Error(`Invalid target selector for "${name}".`);
    }
  }

  return {
    ...DEFAULT_MANIFEST,
    ...normalized,
    dom: {
      ...DEFAULT_MANIFEST.dom,
      ...normalized.dom,
    },
  };
}
