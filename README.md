# Airpoint SDK

Browser-first plugin runtime for adding touchless hand control to web apps.

This repo is intentionally monolithic for the standalone v0 line: the public plugin API, tracking orchestration, MediaPipe adapter, gesture engine internals, runtime assets, and examples live together so consumers can install one package and hosts do not need to understand Airpoint internals.

## Install

```bash
pnpm add @airpoint/sdk
pnpm exec airpoint-sdk-copy-assets --out public --base airpoint
```

## Quick Start

```ts
import { createAirpointPlugin } from "@airpoint/sdk";

const video = document.querySelector("video")!;

const plugin = createAirpointPlugin({
  video,
  manifest: {
    runtime: {
      assets: {
        basePath: "/airpoint",
      },
    },
    tracking: {
      config: {
        enableMLClassifier: false,
      },
    },
    intents: {
      thumb_middle_pinch: {
        tap: "primary-select",
      },
    },
  },
  adapter: {
    performIntent(event) {
      console.log("Airpoint intent", event.intent.id, event);
    },
  },
});

await plugin.startCamera(video);
await plugin.start();
```

## Public API

Stable v0 integration surface:

- `createAirpointPlugin(options)`
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

The example serves a camera-backed cursor and uses the public plugin API only. It disables the premium gesture classifier by default so it can run with the public assets copied by the package.

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

Before public npm release, choose the license and finalize the default AirMouse asset stance. See [docs/EXTRACTION.md](docs/EXTRACTION.md).