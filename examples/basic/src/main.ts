import {
  createAirpointCursorOverlay,
  createAirpointDomAdapter,
  createAirpointPlugin,
  createAirpointSvgIconElement,
  type AirpointPlugin,
  type AirpointPluginManifest,
} from "@airpoint/sdk";
import "./styles.css";

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Airpoint example could not find ${selector}.`);
  }
  return element;
}

const stage = getElement<HTMLCanvasElement>("#stage");
const video = getElement<HTMLVideoElement>("#airpoint-video");
const toggleButton = getElement<HTMLButtonElement>("#toggle");
const trackingLabel = getElement<HTMLSpanElement>("#tracking-label-text");
const clickTarget = getElement<HTMLButtonElement>("#click-target");
const cursor = createAirpointCursorOverlay({
  clickAnimation: "pulse",
  color: "#111111",
  size: 30,
  style: "arrow",
});
const airpointApiKey =
  import.meta.env.VITE_AIRPOINT_API_KEY?.trim() || undefined;
const licenseServerUrl =
  import.meta.env.VITE_AIRPOINT_LICENSE_SERVER_URL?.trim() || undefined;
const STARTUP_TIMEOUT_MS = 30_000;

const manifest = {
  metadata: {
    appId: "airpoint-basic-example",
    appName: "Airpoint Basic Example",
    profile: "minimal-canvas",
  },
  runtime: {
    assets: {
      basePath: "/airpoint",
    },
    coords: {
      space: "normalized",
    },
  },
  tracking: {
    config: {
      enableMLClassifier: Boolean(airpointApiKey),
      gestureModel: "airmouse-4.3-onnx",
    },
    cursorHand: "Right",
    clickHand: "Right",
  },
  intents: {
    thumb_middle_pinch: {
      tap: "airpoint-click",
    },
  },
} satisfies AirpointPluginManifest;

let plugin: AirpointPlugin = createPlugin();
let running = false;

function prepareInBackground() {
  void plugin.prepare().catch((error) => {
    console.warn("Airpoint background prepare failed:", error);
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutId),
  );
}

function setToggleButton(state: "start" | "starting" | "stop") {
  const iconName = state === "stop" ? "pointer-off" : "pointer";
  const label =
    state === "starting"
      ? "Loading tracking"
      : state === "stop"
        ? "Stop tracking"
        : "Start tracking";
  const content =
    state === "starting"
      ? document.createElement("span")
      : createAirpointSvgIconElement(iconName, {
          size: 22,
          strokeWidth: 2.25,
        });

  if (state === "starting") {
    content.classList.add("tracking-spinner");
    content.setAttribute("aria-hidden", "true");
  }

  toggleButton.replaceChildren(content);
  toggleButton.dataset.state = state;
  toggleButton.setAttribute("aria-label", label);
  toggleButton.title = label;
  trackingLabel.textContent = label;
}

function paintCanvas() {
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);

  stage.width = Math.round(width * scale);
  stage.height = Math.round(height * scale);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  const ctx = stage.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function createPlugin() {
  const nextPlugin = createAirpointPlugin({
    adapter: createAirpointDomAdapter(),
    apiKey: airpointApiKey,
    licenseServerUrl,
    manifest,
    video,
  });

  nextPlugin.on("move", (event) => {
    if (typeof event.x !== "number" || typeof event.y !== "number") {
      return;
    }
    cursor.move(event.x, event.y, {
      clicking: event.clicking,
      grabbing: event.grabbing,
      hand: event.hand,
      rightClicking: event.rightClicking,
      space: "normalized",
    });
  });

  nextPlugin.on("hand_lost", () => {
    cursor.hide();
  });

  return nextPlugin;
}

async function start() {
  if (running || toggleButton.disabled) {
    return;
  }

  toggleButton.disabled = true;
  setToggleButton("starting");

  try {
    await withTimeout(
      (async () => {
        await plugin.startCamera(video);
        await plugin.start();
      })(),
      STARTUP_TIMEOUT_MS,
      "Airpoint example: tracking startup timed out.",
    );
    running = true;
    setToggleButton("stop");
  } catch (error) {
    console.error(error);
    plugin.stop();
    plugin = createPlugin();
    prepareInBackground();
    running = false;
    cursor.hide();
    setToggleButton("start");
  } finally {
    toggleButton.disabled = false;
  }
}

function stop() {
  plugin.pause();
  plugin.stopCamera();
  running = false;
  cursor.hide();
  setToggleButton("start");
}

toggleButton.addEventListener("click", () => {
  if (running) {
    stop();
    return;
  }
  void start();
});

clickTarget.addEventListener("click", () => {
  clickTarget.textContent = "Clicked";
  window.setTimeout(() => {
    clickTarget.textContent = "Click me";
  }, 650);
});

window.addEventListener("resize", paintCanvas);
prepareInBackground();
setToggleButton("start");
paintCanvas();
