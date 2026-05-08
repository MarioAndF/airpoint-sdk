# Airpoint SDK

Browser-first plugin runtime for adding touchless hand control to web apps.

This repo is intentionally monolithic for the standalone v0 line: the public plugin API, tracking orchestration, MediaPipe adapter, gesture engine internals, runtime assets, and examples live together so consumers can install one package and hosts do not need to understand Airpoint internals.

## Install

With npm:

```bash
npm install @airpoint/sdk
npm exec airpoint-sdk-copy-assets -- --out public --base airpoint
```

With pnpm:

```bash
pnpm add @airpoint/sdk
pnpm exec airpoint-sdk-copy-assets --out public --base airpoint
```

The SDK is package-manager agnostic. This repo uses pnpm for development, but consuming apps can use npm, pnpm, yarn, or bun.

The install command adds `@airpoint/sdk` to your app so you can import the plugin API from application code. The asset-copy command copies the browser runtime files that cannot be bundled directly, including the MediaPipe hand tracker model, MediaPipe WASM files, and ONNX Runtime WASM files. With `--out public --base airpoint`, those files are written under `public/airpoint` and served by your app at `/airpoint/...`. Match that URL in your manifest with `runtime.assets.basePath: "/airpoint"`.

For npm, the extra `--` before `--out` is npm's argument separator: it tells npm to pass `--out public --base airpoint` to `airpoint-sdk-copy-assets` instead of parsing those flags itself.

## Framework Support

Airpoint is a browser ESM package, not a Vite-only package. It can be used from Vite, Next.js, Remix, Astro, webpack, Rollup, Parcel, or another modern bundler as long as the code runs on the client and the runtime assets are served from a public path such as `/airpoint`.

For SSR frameworks, create and start the plugin only in browser/client code because camera access, DOM events, and MediaPipe require browser APIs. Plain no-bundler HTML apps are possible with an import map or CDN/bundled build, but the package does not currently ship a standalone UMD/IIFE script tag build.

## Quick Start

```ts
import {
  createAirpointCursorOverlay,
  createAirpointDomAdapter,
  createAirpointPlugin,
} from "@airpoint/sdk";

const video = document.querySelector("video")!;
const cursor = createAirpointCursorOverlay({ style: "arrow" });
const apiKey = getAirpointApiKeyFromYourAppConfig(); // optional

const plugin = createAirpointPlugin({
  apiKey,
  video,
  manifest: {
    runtime: {
      assets: {
        basePath: "/airpoint",
      },
    },
    tracking: {
      config: {
        enableMLClassifier: Boolean(apiKey),
        gestureModel: "airmouse-4.3-onnx",
      },
    },
    intents: {
      thumb_middle_pinch: {
        tap: "primary-select",
      },
    },
  },
  adapter: createAirpointDomAdapter(),
});

plugin.on("move", (event) => {
  cursor.move(event.x, event.y, {
    clicking: event.clicking,
    grabbing: event.grabbing,
    hand: event.hand,
    rightClicking: event.rightClicking,
    space: "normalized",
  });
});

plugin.on("hand_lost", () => cursor.hide());

void plugin.prepare(); // optional: prefetch/decrypt premium assets before the user starts tracking

await plugin.startCamera(video);
await plugin.start();
```

## Public API

Stable v0 integration surface:

- `createAirpointPlugin(options)`
- `createAirpointCursorOverlay(options)`
- `createAirpointDomAdapter(options)`
- `AirpointPlugin`
- `AirpointPluginManifest`
- `AirpointHostAdapter`
- `AirpointIntent`
- `validateAirpointManifest(manifest)`
- `normalizeAirpointManifest(manifest)`
- `resolveAirpointSdkAssetPaths(assets)`
- `getAirpointSdkRequiredAssets(assets, profile)`
- `validateAirpointSdkAssets(assets, profile)`

`@airpoint/sdk/internal` is intentionally unstable. It exists to keep older first-party integrations moving while the plugin API settles.

Use `plugin.prepare()` at app load to fetch/decrypt premium assets and warm the gesture engine before the user clicks Start. Use `plugin.pause()` for user-facing tracking toggles when you want fast resume. It stops frame processing but keeps the loaded trackers and gesture assets warm. Use `plugin.stop()` only for full teardown.

## Asset Contract

The browser-facing contract is one `basePath`:

```ts
runtime: {
  assets: {
    basePath: "/airpoint",
  },
}
```

`airpoint-sdk-copy-assets` copies the public runtime assets into that tree:

- `/airpoint/mediapipe/vision_bundle.js`
- `/airpoint/mediapipe/models/hand_landmarker.task`
- `/airpoint/mediapipe/wasm/*`
- `/airpoint/ort/ort-wasm-simd-threaded.{mjs,wasm}`

AirMouse model and normalizer files are not copied by the public asset command. For v0, use one of these modes:

- Set `tracking.config.enableMLClassifier: false` for the public/basic runtime path.
- Provide premium AirMouse assets through `apiKey` or the advanced premium bundle options.
- Explicitly host your own compatible model and normalizer assets under the configured paths.

If an asset is missing, `plugin.start()` fails with the exact expected paths and the copy-assets command to run.

## Basic Example

```bash
pnpm install
pnpm --filter @airpoint/basic-example dev
```

The example serves a camera-backed cursor and uses the public plugin API only. Copy `examples/basic/.env.example` to `examples/basic/.env.local` and set `VITE_AIRPOINT_API_KEY` to enable the premium AirMouse classifier; without a key the example falls back to the public tracking path.

## DOM Adapter

`createAirpointDomAdapter()` is a framework-agnostic host adapter for normal web apps. It turns tap intents into DOM clicks at the Airpoint cursor position by default, resolves manifest targets for explicit non-pointer actions, and dispatches bubbling `airpoint:intent` plus `airpoint:<intent-id>` custom events so app code can handle custom controls.

```ts
createAirpointPlugin({
  apiKey: getAirpointApiKeyFromYourAppConfig(),
  video,
  manifest: {
    tracking: {
      config: {
        enableMLClassifier: true,
        gestureModel: "airmouse-4.3-onnx",
      },
    },
    intents: {
      thumb_middle_pinch: {
        tap: "click-under-cursor",
      },
    },
  },
  adapter: createAirpointDomAdapter(),
});
```

For non-click behavior, set an action by intent id or per binding metadata:

```ts
createAirpointDomAdapter({
  actions: {
    "open-menu": "dispatch_event",
    "focus-search": "focus",
  },
});
```

If an intent should always act on its declared manifest target instead of the element under the cursor, opt into that behavior:

```ts
createAirpointDomAdapter({ pointerTarget: "intent" });
```

## Cursor Feedback

`createAirpointCursorOverlay()` includes a prebuilt click pulse animation. Pass click state from `move` events to animate automatically when Airpoint detects a click:

```ts
const cursor = createAirpointCursorOverlay({
  clickAnimation: "pulse",
  style: "arrow",
});

plugin.on("move", (event) => {
  cursor.move(event.x, event.y, {
    clicking: event.clicking,
    hand: event.hand,
    space: "normalized",
  });
});
```

For custom gestures or app-defined intents, trigger the same bundled animation manually:

```ts
plugin.on("intent", () => {
  cursor.pulse();
});
```

Set `clickAnimation: "none"` if you want to use only your own cursor feedback.

## Custom Gestures Without A License Key

The license key only gates premium AirMouse model delivery. Public hand tracking, cursor movement, DOM adaptation, and raw landmark events can run without a key.

For custom heuristic gestures, disable the ML classifier and request raw landmarks:

```ts
const plugin = createAirpointPlugin({
  video,
  manifest: {
    runtime: {
      emitRawLandmarks: true,
      assets: { basePath: "/airpoint" },
    },
    tracking: {
      config: { enableMLClassifier: false },
    },
  },
});

plugin.on("raw_landmarks", (event) => {
  // Implement app-specific pinch, dwell, swipe, or pose heuristics here.
});
```

Today, custom heuristics are implemented in app code from `raw_landmarks`, `move`, and DOM adapter events. The built-in manifest `intents` map is driven by SDK pose events, so injecting a custom recognizer directly into that pose pipeline is not yet part of the stable public API.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm pack --pack-destination .pack
```

Useful scripts:

- `pnpm copy-assets` copies SDK runtime assets from this package.
- `pnpm dev:example` starts the basic example.
- `pnpm pack:local` creates a local package tarball in `.pack/`.

## Premium AirMouse Delivery

The SDK includes an optional premium flow:

1. Package premium assets into an encrypted bundle.
2. Sign a customer license authorizing that bundle.
3. Authenticate the customer in your backend.
4. Return the license and AES decryption key after account and billing checks.
5. Start the plugin with `apiKey` or advanced `premium` options.

Helper CLIs:

```bash
pnpm exec airpoint-sdk-pack-premium-assets --in ./premium-assets --out ./dist/airmouse.bundle.json --write-key ./dist/airmouse.key
pnpm exec airpoint-sdk-sign-premium-license --claims ./license-claims.json --private-key-jwk ./private-signing-key.jwk --out ./license.json --public-key-out ./public-signing-key.jwk
```

Browser-delivered model files can still be extracted by determined users. The commercial leverage is account access, licensing, updates, support, and legal terms.

## Release Notes

Before public npm release, choose the license and finalize the default AirMouse asset stance.
