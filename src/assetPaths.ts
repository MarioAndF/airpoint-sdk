export interface AirpointSdkAssetPaths {
  basePath?: string;
  gestureWeightBasePath?: string;
  mediapipeBasePath?: string;
  mediapipeWasmPath?: string;
  mediapipeModelPath?: string;
  gestureModelBasePath?: string;
  normalizerBasePath?: string;
  ortWasmBasePath?: string;
  premiumBundlePath?: string;
}

export interface ResolvedAirpointSdkAssetPaths {
  gestureWeightBasePath: string;
  mediapipeVisionBundlePath: string;
  mediapipeWasmPath: string;
  mediapipeModelPath: string;
  gestureModelBasePath: string;
  normalizerBasePath: string;
  ortWasmBasePath: string;
  premiumBundlePath?: string;
}

export interface AirpointSdkRequiredAsset {
  kind:
    | "mediapipe_model"
    | "mediapipe_vision_bundle"
    | "mediapipe_wasm"
    | "gesture_model"
    | "gesture_weight"
    | "gesture_normalizer"
    | "ort_wasm"
    | "premium_bundle";
  path: string;
}

export interface AirpointSdkAssetProfile {
  enableMLClassifier?: boolean;
  gestureModel?: string;
  hasPremiumBundle?: boolean;
  premiumBundlePath?: string;
}

function trimTrailingSlashes(path: string): string {
  return path.replace(/\/+$/u, "");
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedBasePath = trimTrailingSlashes(basePath);
  const normalizedSuffix = suffix.replace(/^\/+/u, "");
  if (!normalizedBasePath) {
    return normalizedSuffix;
  }
  return `${normalizedBasePath}/${normalizedSuffix}`;
}

export function resolveAirpointSdkAssetPaths(
  assets: AirpointSdkAssetPaths = {},
): ResolvedAirpointSdkAssetPaths {
  const basePath = assets.basePath ? trimTrailingSlashes(assets.basePath) : "";
  const mediapipeBasePath = assets.mediapipeBasePath
    ? trimTrailingSlashes(assets.mediapipeBasePath)
    : basePath
      ? joinPath(basePath, "mediapipe")
      : "mediapipe";

  return {
    gestureWeightBasePath:
      assets.gestureWeightBasePath ??
      (basePath ? joinPath(basePath, "weights") : "/weights"),
    mediapipeVisionBundlePath: joinPath(mediapipeBasePath, "vision_bundle.js"),
    mediapipeWasmPath:
      assets.mediapipeWasmPath ?? joinPath(mediapipeBasePath, "wasm"),
    mediapipeModelPath:
      assets.mediapipeModelPath ??
      joinPath(mediapipeBasePath, "models/hand_landmarker.task"),
    gestureModelBasePath:
      assets.gestureModelBasePath ??
      (basePath ? joinPath(basePath, "models") : "/models"),
    normalizerBasePath:
      assets.normalizerBasePath ??
      (basePath ? joinPath(basePath, "normalizers") : "/normalizers"),
    ortWasmBasePath:
      assets.ortWasmBasePath ?? (basePath ? joinPath(basePath, "ort") : "/"),
    premiumBundlePath: assets.premiumBundlePath,
  };
}

function resolveGestureModelAssetId(model: string | undefined): string | null {
  const resolvedModel = model ?? "airmouse-4.3-onnx";
  if (resolvedModel === "airmouse-4.1-onnx") {
    return "airmouse-4.1";
  }
  if (resolvedModel === "airmouse-4.1") {
    return "airmouse-4.1";
  }
  if (
    resolvedModel === "airmouse-4.2" ||
    resolvedModel === "airmouse-4.3" ||
    resolvedModel === "airmouse-4.2-onnx" ||
    resolvedModel === "airmouse-4.3-onnx"
  ) {
    return "airmouse-4.3";
  }
  if (resolvedModel.endsWith("-onnx")) {
    return resolvedModel.replace(/-onnx$/u, "");
  }
  return null;
}

function isOnnxGestureModel(model: string | undefined): boolean {
  return (model ?? "airmouse-4.3-onnx").endsWith("-onnx");
}

export function getAirpointSdkRequiredAssets(
  assets: AirpointSdkAssetPaths = {},
  profile: AirpointSdkAssetProfile = {},
): AirpointSdkRequiredAsset[] {
  const resolvedAssets = resolveAirpointSdkAssetPaths(assets);
  const requiredAssets: AirpointSdkRequiredAsset[] = [
    {
      kind: "mediapipe_vision_bundle",
      path: resolvedAssets.mediapipeVisionBundlePath,
    },
    {
      kind: "mediapipe_model",
      path: resolvedAssets.mediapipeModelPath,
    },
    {
      kind: "mediapipe_wasm",
      path: joinPath(
        resolvedAssets.mediapipeWasmPath,
        "vision_wasm_internal.js",
      ),
    },
    {
      kind: "mediapipe_wasm",
      path: joinPath(
        resolvedAssets.mediapipeWasmPath,
        "vision_wasm_internal.wasm",
      ),
    },
    {
      kind: "mediapipe_wasm",
      path: joinPath(
        resolvedAssets.mediapipeWasmPath,
        "vision_wasm_nosimd_internal.js",
      ),
    },
    {
      kind: "mediapipe_wasm",
      path: joinPath(
        resolvedAssets.mediapipeWasmPath,
        "vision_wasm_nosimd_internal.wasm",
      ),
    },
  ];

  if (profile.enableMLClassifier === false) {
    return requiredAssets;
  }

  const resolvedGestureModel = profile.gestureModel ?? "airmouse-4.3-onnx";
  const gestureModelAssetId = resolveGestureModelAssetId(resolvedGestureModel);
  if (!gestureModelAssetId) {
    return requiredAssets;
  }

  const premiumBundlePath =
    profile.premiumBundlePath ?? resolvedAssets.premiumBundlePath;

  if (profile.hasPremiumBundle || premiumBundlePath) {
    if (premiumBundlePath) {
      requiredAssets.push({
        kind: "premium_bundle",
        path: premiumBundlePath,
      });
    }

    if (isOnnxGestureModel(resolvedGestureModel)) {
      requiredAssets.push(
        {
          kind: "ort_wasm",
          path: joinPath(
            resolvedAssets.ortWasmBasePath,
            "ort-wasm-simd-threaded.mjs",
          ),
        },
        {
          kind: "ort_wasm",
          path: joinPath(
            resolvedAssets.ortWasmBasePath,
            "ort-wasm-simd-threaded.wasm",
          ),
        },
      );
    }

    return requiredAssets;
  }

  if (isOnnxGestureModel(resolvedGestureModel)) {
    requiredAssets.push(
      {
        kind: "gesture_model",
        path: joinPath(
          resolvedAssets.gestureModelBasePath,
          `${gestureModelAssetId}.onnx`,
        ),
      },
      {
        kind: "gesture_normalizer",
        path: joinPath(
          resolvedAssets.normalizerBasePath,
          `${gestureModelAssetId}-normalizer.json`,
        ),
      },
      {
        kind: "ort_wasm",
        path: joinPath(
          resolvedAssets.ortWasmBasePath,
          "ort-wasm-simd-threaded.mjs",
        ),
      },
      {
        kind: "ort_wasm",
        path: joinPath(
          resolvedAssets.ortWasmBasePath,
          "ort-wasm-simd-threaded.wasm",
        ),
      },
    );
  } else {
    requiredAssets.push(
      {
        kind: "gesture_weight",
        path: joinPath(
          resolvedAssets.gestureWeightBasePath,
          `${gestureModelAssetId}.json`,
        ),
      },
      {
        kind: "gesture_normalizer",
        path: joinPath(
          resolvedAssets.normalizerBasePath,
          `${gestureModelAssetId}-normalizer.json`,
        ),
      },
    );
  }

  return requiredAssets;
}
