<div align="center">

# Airpoint SDK

**Touchless hand control for the web.** Add it to any web app and let users move a cursor, click, and trigger custom intents with their hand — just a webcam, no extra hardware.

[![npm](https://img.shields.io/npm/v/airpoint-sdk.svg)](https://www.npmjs.com/package/airpoint-sdk)
[![license](https://img.shields.io/npm/l/airpoint-sdk.svg)](./LICENSE)

</div>

---

- [Requirements](#requirements)
- [Setup](#setup)
- [Quick start](#quick-start)
- [Enabling the AirMouse ML model](#enabling-the-airmouse-ml-model)
- [How it works](#how-it-works)
- [Recipes](#recipes)
- [API reference](#api-reference)
- [About AirMouse](#about-airmouse)
- [Contributing](#contributing)
- [License](#license)

## Requirements

- Modern browser with `getUserMedia` (Chrome, Edge, Safari 16+, Firefox).
- Page served over **HTTPS** (or `localhost`) — required by the camera API.
- A bundler (Vite, Next.js, webpack, …) or any static host that can serve a public assets directory.

## Setup

> Using an AI coding agent (Claude Code, Cursor, Copilot, Codex)? Point it at [SKILL.md](./SKILL.md) and it can install and configure Airpoint for you interactively.

**1. Install the package.**

```bash
npm install airpoint-sdk
# or: pnpm add airpoint-sdk · yarn add airpoint-sdk · bun add airpoint-sdk
```

**2. Copy the runtime assets into your public directory.**

The MediaPipe model and WASM files can't be bundled — they need to be served as static files.

```bash
npx airpoint-sdk-copy-assets --out public --base airpoint
```

This writes everything under `public/airpoint/`. If your framework uses a different static folder (e.g. SvelteKit's `static/`), pass `--out static`.

**3. (Optional) Add your AirMouse license key to `.env`.**

The SDK works without a key using the built-in heuristic engine. If you have a license, drop the key in your environment file:

```bash
# .env / .env.local
VITE_AIRPOINT_API_KEY=your-license-key-here
```

> Use whatever env-var prefix your framework requires: `VITE_*` for Vite, `NEXT_PUBLIC_*` for Next.js, `PUBLIC_*` for SvelteKit/Astro, etc. Keys are loaded in the browser, so anything you expose to the client is fine.

That's the full setup. Now you can wire it up.

## Quick start

```ts
import {
  createAirpointPlugin,
  createAirpointCursorOverlay,
  createAirpointDomAdapter,
} from "airpoint-sdk";

const video = document.querySelector("video")!;
const cursor = createAirpointCursorOverlay({ style: "arrow" });

const apiKey = import.meta.env.VITE_AIRPOINT_API_KEY; // or process.env.NEXT_PUBLIC_AIRPOINT_API_KEY, etc.

const plugin = createAirpointPlugin({
  apiKey, // optional — enables AirMouse if present
  video,
  adapter: createAirpointDomAdapter(),
  manifest: {
    runtime: { assets: { basePath: "/airpoint" } },
    tracking: {
      config: {
        enableMLClassifier: Boolean(apiKey),
        gestureModel: "airmouse-4.3-onnx",
      },
    },
    intents: {
      thumb_middle_pinch: { tap: "primary-select" },
    },
  },
});

plugin.on("move", (e) => {
  cursor.move(e.x, e.y, {
    space: "normalized",
    clicking: e.clicking,
    grabbing: e.grabbing,
    rightClicking: e.rightClicking,
    hand: e.hand,
  });
});

plugin.on("hand_lost", () => cursor.hide());

await plugin.startCamera(video);
await plugin.start();
```

That's it. Show your hand to the camera, the cursor follows your fingertip, and a thumb-to-middle pinch clicks whatever's under it.

> If `start()` can't find an asset, it throws with the exact missing path and the copy-assets command to run — no silent failures.

## Enabling the AirMouse ML model

Three things need to be true:

1. You have a license key in your env (see [Setup](#setup) step 3).
2. You pass the key as `apiKey` when creating the plugin.
3. Your manifest has `tracking.config.enableMLClassifier: true` and `gestureModel: "airmouse-4.3-onnx"`.

The Quick start above already does all three. Without the key, the plugin falls back to the heuristic engine — same API, lower accuracy, and no need to set `enableMLClassifier`.

## How it works

```
Webcam ─▶ MediaPipe hand tracker ─▶ Gesture engine ─▶ Plugin events ─▶ Adapter (DOM, your code)
                                          │
                              (optional AirMouse classifier, with key)
```

- **Tracker** — MediaPipe runs on-device and produces 21 hand landmarks per frame.
- **Gesture engine** — Built-in heuristics or AirMouse turn landmarks into pinches, grabs, scrolls, and a moving cursor.
- **Manifest** — You declare which gestures map to which intents (`tap`, `dispatch_event`, `focus`, …) and which targets they hit.
- **Adapter** — The bridge between intents and your app. The bundled DOM adapter turns taps into real DOM clicks.

Lifecycle:

- `plugin.prepare()` — preload assets and warm the engine before the user starts. Optional.
- `plugin.pause()` — stop processing but keep everything loaded. Use for in-app toggles.
- `plugin.stop()` — full teardown.

## Recipes

### DOM adapter — non-click actions

```ts
createAirpointDomAdapter({
  actions: {
    "open-menu": "dispatch_event",
    "focus-search": "focus",
  },
});
```

Force intents to act on their declared manifest target instead of whatever's under the cursor:

```ts
createAirpointDomAdapter({ pointerTarget: "intent" });
```

### Cursor click animation

`createAirpointCursorOverlay()` ships with a built-in pulse. Forward click state from `move` events and it animates automatically:

```ts
const cursor = createAirpointCursorOverlay({
  style: "arrow",
  clickAnimation: "pulse",
});

plugin.on("intent", () => cursor.pulse()); // for app-defined intents
```

Use `clickAnimation: "none"` to handle feedback yourself.

### Custom gestures from raw landmarks

Disable the classifier and listen for raw landmarks to build your own pose/dwell/swipe logic:

```ts
const plugin = createAirpointPlugin({
  video,
  manifest: {
    runtime: {
      emitRawLandmarks: true,
      assets: { basePath: "/airpoint" },
    },
    tracking: { config: { enableMLClassifier: false } },
  },
});

plugin.on("raw_landmarks", (event) => {
  // your pinch / dwell / swipe logic
});
```

> The built-in `intents` map is driven by SDK pose events. Plugging a custom recognizer directly into that pipeline isn't a stable public API yet — for now, custom heuristics live in your app code on top of `raw_landmarks` and `move`.

### SSR / Next.js

Camera, DOM, and MediaPipe all need browser APIs. Create the plugin only in client-side code (a `useEffect`, a dynamic import, etc.).

## API reference

Stable v0 surface — won't break in patch/minor releases:

| Export                                          | Purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `createAirpointPlugin(options)`                 | Main entry. Wires a video, manifest, and adapter into a running plugin. |
| `createAirpointCursorOverlay(options)`          | Prebuilt cursor with click animations.                                  |
| `createAirpointDomAdapter(options)`             | Framework-agnostic DOM adapter.                                         |
| `validateAirpointManifest(manifest)`            | Throws on invalid manifests. Useful in tests.                           |
| `normalizeAirpointManifest(manifest)`           | Fills in defaults; returns the resolved manifest.                       |
| `resolveAirpointSdkAssetPaths(assets)`          | Resolves the full set of runtime asset URLs.                            |
| `getAirpointSdkRequiredAssets(assets, profile)` | Lists assets required for a given profile.                              |
| `validateAirpointSdkAssets(assets, profile)`    | Verifies assets are reachable.                                          |

Types: `AirpointPlugin`, `AirpointPluginManifest`, `AirpointHostAdapter`, `AirpointIntent`.

## About AirMouse

If you've ever tried to write your own gesture detection on top of hand landmarks, you know how it goes: a pinch threshold that works for your hand but not your coworker's, a "click" that fires when someone scratches their nose, distance heuristics that fall apart the moment the hand tilts. It's a lot of trial and error, and the result is usually still flaky.

AirMouse is the model we built so you don't have to do that.

It's a temporal convolutional network (TCN) trained on a hand-collected, hand-labeled dataset of pinches, clicks, grabs, scrolls, and idle motion across many hands, lighting conditions, and camera angles.

| Metric                       | `airmouse-4.3-onnx`                              |
| ---------------------------- | ------------------------------------------------ |
| Test accuracy                | 97.73%                                           |
| Inference (ONNX, in-browser) | ~1–2 ms / frame                                  |
| Gesture classes              | `idle`, `click`, `right_click`, `grab`, `scroll` |
| Runtime                      | ONNX Runtime Web (WASM, on-device)               |

Runs locally — no frames leave the user's machine.

Licenses are how the model and the rest of Airpoint stay maintained. Grab one at [airpoint.app](https://airpoint.app), or reach out if you're a student, researcher, or OSS maintainer.

## Contributing

PRs and issues welcome. The repo is a small pnpm workspace.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev:example   # runs examples/basic
```

The example app lives in [`examples/basic`](./examples/basic). Copy `.env.example` to `.env.local` and set `VITE_AIRPOINT_API_KEY` to try AirMouse; without a key it uses the heuristic engine.

Questions? `hello@airpoint.app`.

## License

[Apache-2.0](./LICENSE). MediaPipe and ONNX Runtime browser assets are covered by their upstream licenses — see [NOTICES.md](./NOTICES.md).

The AirMouse model is **not** part of the OSS package and is delivered separately under its own terms.
