import { describe, expect, it } from "vitest";
import {
  getAirpointSdkRequiredAssets,
  resolveAirpointSdkAssetPaths,
} from "../src/assetPaths";

describe("resolveAirpointSdkAssetPaths", () => {
  it("preserves the legacy root defaults when no asset base path is provided", () => {
    expect(resolveAirpointSdkAssetPaths()).toEqual({
      gestureModelBasePath: "/models",
      gestureWeightBasePath: "/weights",
      mediapipeVisionBundlePath: "mediapipe/vision_bundle.js",
      mediapipeModelPath: "mediapipe/models/hand_landmarker.task",
      mediapipeWasmPath: "mediapipe/wasm",
      normalizerBasePath: "/normalizers",
      ortWasmBasePath: "/",
      premiumBundlePath: undefined,
    });
  });

  it("builds a namespaced asset tree from a base path", () => {
    expect(
      resolveAirpointSdkAssetPaths({
        basePath: "/airpoint",
      }),
    ).toEqual({
      gestureModelBasePath: "/airpoint/models",
      gestureWeightBasePath: "/airpoint/weights",
      mediapipeVisionBundlePath: "/airpoint/mediapipe/vision_bundle.js",
      mediapipeModelPath: "/airpoint/mediapipe/models/hand_landmarker.task",
      mediapipeWasmPath: "/airpoint/mediapipe/wasm",
      normalizerBasePath: "/airpoint/normalizers",
      ortWasmBasePath: "/airpoint/ort",
      premiumBundlePath: undefined,
    });
  });

  it("lets explicit overrides win over the shared base path", () => {
    expect(
      resolveAirpointSdkAssetPaths({
        basePath: "/airpoint",
        gestureModelBasePath: "/gesture-models",
        mediapipeModelPath: "/custom/hand.task",
        ortWasmBasePath: "/custom-ort",
      }),
    ).toEqual({
      gestureModelBasePath: "/gesture-models",
      gestureWeightBasePath: "/airpoint/weights",
      mediapipeVisionBundlePath: "/airpoint/mediapipe/vision_bundle.js",
      mediapipeModelPath: "/custom/hand.task",
      mediapipeWasmPath: "/airpoint/mediapipe/wasm",
      normalizerBasePath: "/airpoint/normalizers",
      ortWasmBasePath: "/custom-ort",
      premiumBundlePath: undefined,
    });
  });

  it("lists required assets for the default onnx setup", () => {
    expect(
      getAirpointSdkRequiredAssets(
        {
          basePath: "/airpoint",
        },
        {},
      ),
    ).toEqual([
      {
        kind: "mediapipe_vision_bundle",
        path: "/airpoint/mediapipe/vision_bundle.js",
      },
      {
        kind: "mediapipe_model",
        path: "/airpoint/mediapipe/models/hand_landmarker.task",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_internal.js",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_internal.wasm",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_nosimd_internal.js",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
      },
      {
        kind: "gesture_model",
        path: "/airpoint/models/airmouse-4.3.onnx",
      },
      {
        kind: "gesture_normalizer",
        path: "/airpoint/normalizers/airmouse-4.3-normalizer.json",
      },
      {
        kind: "ort_wasm",
        path: "/airpoint/ort/ort-wasm-simd-threaded.mjs",
      },
      {
        kind: "ort_wasm",
        path: "/airpoint/ort/ort-wasm-simd-threaded.wasm",
      },
    ]);
  });

  it("skips onnx assets when ML classification is disabled", () => {
    expect(
      getAirpointSdkRequiredAssets(
        {
          basePath: "/airpoint",
        },
        {
          enableMLClassifier: false,
        },
      ),
    ).toHaveLength(6);
  });

  it("uses a premium bundle instead of public AirMouse model files", () => {
    expect(
      getAirpointSdkRequiredAssets(
        {
          basePath: "/airpoint",
          premiumBundlePath: "/private/airmouse.bundle.json",
        },
        {},
      ),
    ).toEqual([
      {
        kind: "mediapipe_vision_bundle",
        path: "/airpoint/mediapipe/vision_bundle.js",
      },
      {
        kind: "mediapipe_model",
        path: "/airpoint/mediapipe/models/hand_landmarker.task",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_internal.js",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_internal.wasm",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_nosimd_internal.js",
      },
      {
        kind: "mediapipe_wasm",
        path: "/airpoint/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
      },
      {
        kind: "premium_bundle",
        path: "/private/airmouse.bundle.json",
      },
      {
        kind: "ort_wasm",
        path: "/airpoint/ort/ort-wasm-simd-threaded.mjs",
      },
      {
        kind: "ort_wasm",
        path: "/airpoint/ort/ort-wasm-simd-threaded.wasm",
      },
    ]);
  });
});
