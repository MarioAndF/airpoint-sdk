# Notices

Airpoint SDK redistributes browser runtime assets from the following projects so consumer apps can serve the required WebAssembly and model runtime files from their own public assets directory.

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`
- Upstream: https://mediapipe.dev
- License: Apache-2.0
- Used for: browser hand tracking runtime assets, including MediaPipe Tasks Vision JavaScript, WebAssembly, and hand landmarker model files copied under `assets/mediapipe`.

## ONNX Runtime Web

- Package: `onnxruntime-web`
- Upstream: https://github.com/microsoft/onnxruntime
- License: MIT
- Used for: browser ONNX Runtime JavaScript and WebAssembly assets copied under `assets/ort`.

Premium AirMouse model assets are not included in this OSS package. They are delivered separately through the optional license/API-key path.
