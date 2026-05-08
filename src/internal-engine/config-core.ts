/**
 * Shared Config Utilities
 *
 * Single source of truth for config loading and persistence.
 *
 * KEY DESIGN: We store only USER OVERRIDES, not the full config.
 * This means:
 * - DEFAULT_CONFIG can be updated anytime without migrations
 * - User customizations are never lost
 * - No version numbers or migration code needed
 */

import { DEFAULT_CONFIG, type HandConfig } from "./shared-types";

export const STORAGE_KEY = "airpoint-config";
export const GAME_STORAGE_KEY_PREFIX = `${STORAGE_KEY}:game:`;
export const DEFAULT_GAME_SCOPED_KEYS: (keyof HandConfig)[] = [
  "palmWheelEnabled",
  "palmWheelBindings",
  "palmWheelAppBindings",
  "palmWheelIconOverrides",
  "palmWheelPalmFacingDotThreshold",
  "palmWheelPressUpThreshold",
  "palmWheelOpenPalmHysteresis",
  "palmWheelOpenPalmGraceMs",
  "palmWheelFixed",
  "gameVirtualControls",
  "showGameHud",
  "showCameraHud",
];

export interface ScopedConfigOptions {
  platformOverrides?: Partial<HandConfig>;
  gameId?: string;
  gameScopedKeys?: (keyof HandConfig)[];
}

function normalizeGestureModel(
  model: HandConfig["gestureModel"] | string | undefined,
): HandConfig["gestureModel"] {
  if (model === "airmouse-4.2") return "airmouse-4.3";
  if (model === "airmouse-4.2-onnx") return "airmouse-4.3-onnx";
  return (model as HandConfig["gestureModel"]) ?? DEFAULT_CONFIG.gestureModel;
}

/**
 * Deep merge for nested objects (poseThresholds, palmWheelBindings, etc.)
 */
function deepMerge<T extends Record<string, any>>(
  base: T,
  override: Partial<T> | undefined,
): T {
  if (!override) return base;

  const result = { ...base };
  for (const key in override) {
    const baseVal = base[key];
    const overrideVal = override[key];

    if (
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal)
    ) {
      // Recursively merge nested objects
      (result as any)[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      (result as any)[key] = overrideVal;
    }
  }
  return result;
}

/**
 * Extract only the values that differ from defaults.
 * This is what we store in localStorage.
 */
function extractOverrides(
  config: HandConfig,
  defaults: HandConfig = DEFAULT_CONFIG,
): Partial<HandConfig> {
  const overrides: Partial<HandConfig> = {};

  for (const key of Object.keys(config) as Array<keyof HandConfig>) {
    const configVal = config[key];
    const defaultVal = defaults[key];

    if (configVal === undefined) continue;

    // Handle nested objects specially
    if (
      defaultVal &&
      typeof defaultVal === "object" &&
      !Array.isArray(defaultVal) &&
      configVal &&
      typeof configVal === "object" &&
      !Array.isArray(configVal)
    ) {
      const nestedOverrides = extractNestedOverrides(
        configVal as Record<string, any>,
        defaultVal as Record<string, any>,
      );
      if (Object.keys(nestedOverrides).length > 0) {
        (overrides as any)[key] = nestedOverrides;
      }
    } else if (!isEqual(configVal, defaultVal)) {
      (overrides as any)[key] = configVal;
    }
  }

  return overrides;
}

function extractNestedOverrides(
  config: Record<string, any>,
  defaults: Record<string, any>,
): Record<string, any> {
  const overrides: Record<string, any> = {};

  for (const key of Object.keys(config)) {
    const configVal = config[key];
    const defaultVal = defaults[key];

    if (configVal === undefined) continue;

    if (
      defaultVal &&
      typeof defaultVal === "object" &&
      !Array.isArray(defaultVal) &&
      configVal &&
      typeof configVal === "object" &&
      !Array.isArray(configVal)
    ) {
      const nested = extractNestedOverrides(configVal, defaultVal);
      if (Object.keys(nested).length > 0) {
        overrides[key] = nested;
      }
    } else if (!isEqual(configVal, defaultVal)) {
      overrides[key] = configVal;
    }
  }

  return overrides;
}

function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isEqual(v, b[i]));
  }
  if (typeof a === "object" && a !== null && b !== null) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => isEqual(a[k], b[k]));
  }
  return false;
}

function extractScopedOverrides(
  current: HandConfig,
  base: HandConfig,
  keys: readonly (keyof HandConfig)[],
): Partial<HandConfig> {
  const overrides: Partial<HandConfig> = {};
  for (const key of keys) {
    const currentVal = current[key];
    const baseVal = base[key];
    if (
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal) &&
      currentVal &&
      typeof currentVal === "object" &&
      !Array.isArray(currentVal)
    ) {
      const nested = extractNestedOverrides(
        currentVal as Record<string, any>,
        baseVal as Record<string, any>,
      );
      if (Object.keys(nested).length > 0) {
        (overrides as any)[key] = nested;
      }
    } else if (!isEqual(currentVal, baseVal)) {
      (overrides as any)[key] = currentVal;
    }
  }
  return overrides;
}

function readStoredOverrides(storageKey: string): Partial<HandConfig> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<HandConfig>;
  } catch {
    return {};
  }
}

function resolveScopedOptions(
  input?: Partial<HandConfig> | ScopedConfigOptions,
): Required<Pick<ScopedConfigOptions, "platformOverrides" | "gameScopedKeys">> &
  Pick<ScopedConfigOptions, "gameId"> {
  if (
    input &&
    typeof input === "object" &&
    ("platformOverrides" in input ||
      "gameId" in input ||
      "gameScopedKeys" in input)
  ) {
    const options = input as ScopedConfigOptions;
    return {
      platformOverrides: options.platformOverrides ?? {},
      gameId: options.gameId,
      gameScopedKeys: options.gameScopedKeys ?? DEFAULT_GAME_SCOPED_KEYS,
    };
  }

  return {
    platformOverrides: (input as Partial<HandConfig>) ?? {},
    gameId: undefined,
    gameScopedKeys: DEFAULT_GAME_SCOPED_KEYS,
  };
}

export function getGameStorageKey(gameId: string): string {
  return `${GAME_STORAGE_KEY_PREFIX}${gameId}`;
}

/**
 * Build a complete HandConfig from user overrides.
 *
 * Priority: DEFAULT_CONFIG < platformOverrides < userOverrides
 *
 * @param userOverrides - User's saved customizations (from localStorage)
 * @param platformOverrides - Platform-specific defaults (e.g., DESKTOP_OVERRIDES)
 */
export function buildConfig(
  userOverrides: Partial<HandConfig> = {},
  platformOverrides: Partial<HandConfig> = {},
): HandConfig {
  // Start with defaults, apply platform overrides, then user overrides
  let config = deepMerge(DEFAULT_CONFIG, platformOverrides);
  config = deepMerge(config, userOverrides);
  config.gestureModel = normalizeGestureModel(config.gestureModel);
  return config;
}

/**
 * Load config from localStorage.
 * Handles migration from old format (with _configVersion) to new format (overrides only).
 *
 * @param platformOverrides - Platform-specific overrides (e.g., DESKTOP_OVERRIDES)
 */
export function loadConfig(
  optionsOrPlatformOverrides: Partial<HandConfig> | ScopedConfigOptions = {},
): HandConfig {
  const { platformOverrides, gameId, gameScopedKeys } =
    resolveScopedOptions(optionsOrPlatformOverrides);

  try {
    const globalSaved = localStorage.getItem(STORAGE_KEY);
    if (globalSaved) {
      const parsed = JSON.parse(globalSaved);
      if (parsed && typeof parsed === "object" && "_configVersion" in parsed) {
        return normalizeConfig(parsed, platformOverrides);
      }
    }
  } catch (e) {
    console.warn("Failed to load config", e);
  }

  const globalOverrides = readStoredOverrides(STORAGE_KEY);
  let merged = buildConfig(globalOverrides, platformOverrides);

  if (!gameId) {
    return merged;
  }

  const gameOverrides = readStoredOverrides(getGameStorageKey(gameId));
  const filteredGameOverrides: Partial<HandConfig> = {};
  for (const key of gameScopedKeys) {
    const value = gameOverrides[key];
    if (value !== undefined) {
      (filteredGameOverrides as any)[key] = value;
    }
  }
  merged = deepMerge(merged, filteredGameOverrides);
  return merged;
}

/**
 * Save config to localStorage.
 * Only stores values that differ from defaults (user overrides).
 */
export function saveConfig(
  config: HandConfig,
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): void {
  const { platformOverrides, gameId, gameScopedKeys } =
    resolveScopedOptions(optionsOrPlatformOverrides);

  try {
    if (!gameId) {
      const overrides = extractOverrides(config);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      return;
    }

    const globalOverridesBefore = readStoredOverrides(STORAGE_KEY);
    const baseWithoutGame = buildConfig(globalOverridesBefore, platformOverrides);
    const gameKeySet = new Set<keyof HandConfig>(gameScopedKeys);

    const globalConfigSnapshot = { ...config };
    for (const key of gameKeySet) {
      (globalConfigSnapshot as any)[key] = baseWithoutGame[key];
    }

    const nextGlobalOverrides = extractOverrides(globalConfigSnapshot);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGlobalOverrides));

    const updatedBaseWithoutGame = buildConfig(
      nextGlobalOverrides,
      platformOverrides,
    );
    const gameOverrides = extractScopedOverrides(
      config,
      updatedBaseWithoutGame,
      gameScopedKeys,
    );
    const gameStorageKey = getGameStorageKey(gameId);
    if (Object.keys(gameOverrides).length === 0) {
      localStorage.removeItem(gameStorageKey);
    } else {
      localStorage.setItem(gameStorageKey, JSON.stringify(gameOverrides));
    }
  } catch (e) {
    console.warn("Failed to save config", e);
  }
}

/**
 * Get the current per-game overrides from localStorage.
 */
export function getGameUserOverrides(gameId: string): Partial<HandConfig> {
  return readStoredOverrides(getGameStorageKey(gameId));
}

/**
 * Clear only a game's customizations, preserving global settings.
 */
export function resetGameConfig(gameId: string): void {
  try {
    localStorage.removeItem(getGameStorageKey(gameId));
  } catch (e) {
    console.warn("Failed to reset game config", e);
  }
}

/**
 * Clear all game-scoped overrides.
 */
export function resetAllGameConfigs(): void {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(GAME_STORAGE_KEY_PREFIX)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn("Failed to reset all game configs", e);
  }
}

/**
 * Get the current user overrides from localStorage (for debugging/inspection).
 */
export function getUserOverrides(
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): Partial<HandConfig> {
  const { gameId, gameScopedKeys } = resolveScopedOptions(
    optionsOrPlatformOverrides,
  );
  if (!gameId) {
    return readStoredOverrides(STORAGE_KEY);
  }
  const gameOverrides = readStoredOverrides(getGameStorageKey(gameId));
  const filtered: Partial<HandConfig> = {};
  for (const key of gameScopedKeys) {
    const value = gameOverrides[key];
    if (value !== undefined) {
      (filtered as any)[key] = value;
    }
  }
  return filtered;
}

/**
 * Clear user customizations, reverting to defaults.
 * When gameId is provided, clears only game-scoped overrides for that game.
 */
export function resetConfig(
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): void {
  const { gameId } = resolveScopedOptions(optionsOrPlatformOverrides);
  if (gameId) {
    resetGameConfig(gameId);
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to reset config", e);
  }
}

// Legacy export for compatibility - builds config from raw data
// This handles old localStorage format that stored full config + _configVersion
export function normalizeConfig(
  raw: unknown,
  platformOverrides: Partial<HandConfig> = {},
): HandConfig {
  if (!raw || typeof raw !== "object") {
    return buildConfig({}, platformOverrides);
  }

  const rawObj = raw as Record<string, unknown>;

  // If this is old format with _configVersion, we need to migrate
  const { _configVersion, ...rest } = rawObj;
  const fromVersion = typeof _configVersion === "number" ? _configVersion : 0;

  // Filter to only known keys
  const knownOverrides: Partial<HandConfig> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as Array<keyof HandConfig>) {
    if (key in rest) {
      (knownOverrides as any)[key] = rest[key];
    }
  }

  // ONE-TIME MIGRATION: If this is old format (has _configVersion), apply critical migrations
  // After this runs once and saves, the new format won't have _configVersion anymore
  if (_configVersion !== undefined) {
    // v6 -> v7: Reset poseThresholds to new defaults (0.7 enterThreshold)
    // Old configs had enterThreshold: 0.0 which caused random clicks
    if (fromVersion < 7) {
      delete (knownOverrides as any).poseThresholds;
    }

    // Mark that we've migrated by immediately saving in new format
    // This prevents re-running migrations on every load
    try {
      const migratedConfig = buildConfig(knownOverrides, platformOverrides);
      const cleanOverrides = extractOverrides(migratedConfig);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanOverrides));
      console.log(
        `[Airpoint] Migrated config from v${fromVersion} to new format`,
      );
    } catch (e) {
      console.warn("Failed to save migrated config", e);
    }
  }

  return buildConfig(knownOverrides, platformOverrides);
}
