import {
  STORAGE_KEY as TYPES_STORAGE_KEY,
  buildConfig as buildTypesConfig,
  getGameStorageKey as getTypesGameStorageKey,
  getGameUserOverrides as getTypesGameUserOverrides,
  getUserOverrides as getTypesUserOverrides,
  loadConfig as loadTypesConfig,
  normalizeConfig as normalizeTypesConfig,
  resetAllGameConfigs as resetAllTypesGameConfigs,
  resetConfig as resetTypesConfig,
  resetGameConfig as resetTypesGameConfig,
  saveConfig as saveTypesConfig,
  type HandConfig,
  type ScopedConfigOptions,
} from "./types";

export const STORAGE_KEY = TYPES_STORAGE_KEY;

export const SDK_DEFAULT_OVERRIDES: Partial<HandConfig> = {
  gestureModel: "airmouse-4.3-onnx",
};

function withSdkPlatformOverrides(
  optionsOrPlatformOverrides: Partial<HandConfig> | ScopedConfigOptions = {},
): Partial<HandConfig> | ScopedConfigOptions {
  if (
    optionsOrPlatformOverrides &&
    typeof optionsOrPlatformOverrides === "object" &&
    ("platformOverrides" in optionsOrPlatformOverrides ||
      "gameId" in optionsOrPlatformOverrides ||
      "gameScopedKeys" in optionsOrPlatformOverrides)
  ) {
    const options = optionsOrPlatformOverrides as ScopedConfigOptions;
    return {
      ...options,
      platformOverrides: {
        ...SDK_DEFAULT_OVERRIDES,
        ...(options.platformOverrides ?? {}),
      },
    };
  }

  return {
    ...SDK_DEFAULT_OVERRIDES,
    ...(optionsOrPlatformOverrides as Partial<HandConfig>),
  };
}

export function buildConfig(
  userOverrides: Partial<HandConfig> = {},
  platformOverrides: Partial<HandConfig> = {},
): HandConfig {
  return buildTypesConfig(userOverrides, {
    ...SDK_DEFAULT_OVERRIDES,
    ...platformOverrides,
  });
}

export const DEFAULT_CONFIG: HandConfig = buildConfig();

export function normalizeConfig(
  raw: unknown,
  platformOverrides: Partial<HandConfig> = {},
): HandConfig {
  return normalizeTypesConfig(raw, {
    ...SDK_DEFAULT_OVERRIDES,
    ...platformOverrides,
  });
}

export function loadConfig(
  optionsOrPlatformOverrides: Partial<HandConfig> | ScopedConfigOptions = {},
): HandConfig {
  return loadTypesConfig(withSdkPlatformOverrides(optionsOrPlatformOverrides));
}

export function saveConfig(
  config: HandConfig,
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): void {
  saveTypesConfig(
    config,
    withSdkPlatformOverrides(optionsOrPlatformOverrides ?? {}),
  );
}

export function getUserOverrides(
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): Partial<HandConfig> {
  return getTypesUserOverrides(
    withSdkPlatformOverrides(optionsOrPlatformOverrides ?? {}),
  );
}

export function getGameUserOverrides(gameId: string): Partial<HandConfig> {
  return getTypesGameUserOverrides(gameId);
}

export function getGameStorageKey(gameId: string): string {
  return getTypesGameStorageKey(gameId);
}

export function resetConfig(
  optionsOrPlatformOverrides?: Partial<HandConfig> | ScopedConfigOptions,
): void {
  resetTypesConfig(withSdkPlatformOverrides(optionsOrPlatformOverrides ?? {}));
}

export function resetGameConfig(gameId: string): void {
  resetTypesGameConfig(gameId);
}

export function resetAllGameConfigs(): void {
  resetAllTypesGameConfigs();
}
