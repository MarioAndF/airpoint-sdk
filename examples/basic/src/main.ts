import {
  createAirpointPlugin,
  type AirpointIntentEvent,
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

const video = getElement<HTMLVideoElement>("#airpoint-video");
const cursor = getElement<HTMLDivElement>("#cursor");
const startButton = getElement<HTMLButtonElement>("#start");
const stopButton = getElement<HTMLButtonElement>("#stop");
const statusElement = getElement<HTMLParagraphElement>("#status");
const logElement = getElement<HTMLPreElement>("#log");
const targetButton = document.querySelector<HTMLButtonElement>("#target");

const manifest = {
  metadata: {
    appId: "airpoint-basic-example",
    appName: "Airpoint Basic Example",
    profile: "basic-browser",
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
      enableMLClassifier: false,
    },
    cursorHand: "Right",
    clickHand: "Right",
  },
  intents: {
    thumb_middle_pinch: {
      tap: {
        id: "select-target",
        target: "primaryTarget",
      },
    },
  },
  dom: {
    targets: {
      primaryTarget: "#target",
    },
  },
} satisfies AirpointPluginManifest;

let plugin: AirpointPlugin | null = null;

function setStatus(message: string) {
  statusElement.textContent = message;
}

function log(message: string) {
  logElement.textContent = `${new Date().toLocaleTimeString()} ${message}\n${logElement.textContent}`;
}

function performIntent(event: AirpointIntentEvent) {
  log(`intent: ${event.intent.id} (${event.intent.phase})`);
  if (event.intent.id === "select-target" && event.target instanceof HTMLElement) {
    event.target.click();
  }
}

function createPlugin() {
  return createAirpointPlugin({
    manifest,
    video,
    adapter: {
      performIntent,
    },
  });
}

async function startTracking() {
  if (plugin?.getState().running) {
    return;
  }

  setStatus("Requesting camera...");
  plugin = createPlugin();

  plugin.on("move", (event) => {
    if (typeof event.x !== "number" || typeof event.y !== "number") {
      return;
    }
    cursor.style.left = `${event.x * 100}%`;
    cursor.style.top = `${event.y * 100}%`;
    cursor.classList.add("is-visible");
  });

  plugin.on("hand_found", (event) => log(`hand found: ${event.hand}`));
  plugin.on("hand_lost", (event) => log(`hand lost: ${event.hand}`));
  plugin.on("intent", performIntent);

  try {
    await plugin.startCamera(video);
    await plugin.start();
    setStatus("Tracking active.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message);
    plugin.stop();
    plugin = null;
  }
}

function stopTracking() {
  plugin?.stop();
  plugin = null;
  cursor.classList.remove("is-visible");
  setStatus("Stopped.");
}

startButton.addEventListener("click", () => void startTracking());
stopButton.addEventListener("click", stopTracking);
targetButton?.addEventListener("click", () => log("target selected"));