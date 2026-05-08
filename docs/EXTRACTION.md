# Monolithic Extraction Notes

This repository is intentionally monolithic for the first standalone Airpoint SDK release.

## Shape

- The published package is `@airpoint/sdk`.
- Runtime internals live under `src/internal-*` and are bundled into the same package.
- The stable integration path is `createAirpointPlugin(...)` plus manifest and host adapter types.
- `@airpoint/sdk/internal` exists as an unstable bridge for first-party migration work and should not be documented as the main integration path.

## Release Gate

Before public npm release:

- Decide the public license.
- Decide whether the default AirMouse model is public, premium-only, or replaced by a basic OSS model.
- Run the package tarball smoke test from a clean temporary app.
- Keep the basic example building from the packed package, not source-only workspace assumptions.

## Asset Stance

The package currently ships public MediaPipe and ONNX Runtime browser assets. Premium AirMouse model files are not copied by `airpoint-sdk-copy-assets` and are expected to come from the license/API-key path or from explicitly hosted customer assets.