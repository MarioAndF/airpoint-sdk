// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AirpointSDK } from "../src/sdk";
import { createAirpointDomAdapter } from "../src/domAdapter";
import { createAirpointPlugin } from "../src/plugin";

const { createAirpointSDKMock } = vi.hoisted(() => ({
  createAirpointSDKMock: vi.fn(),
}));

vi.mock("../src/sdk", async () => {
  const actual =
    await vi.importActual<typeof import("../src/sdk")>("../src/sdk");
  return {
    ...actual,
    createAirpointSDK: createAirpointSDKMock,
  };
});

class FakeSdk {
  private listeners = new Map<string, Set<(event: any) => void>>();

  prepare = vi.fn<AirpointSDK["prepare"]>(async () => {});
  start = vi.fn<AirpointSDK["start"]>(async () => {});
  pause = vi.fn<AirpointSDK["pause"]>();
  stop = vi.fn<AirpointSDK["stop"]>();
  startCamera = vi.fn<AirpointSDK["startCamera"]>();
  stopCamera = vi.fn<AirpointSDK["stopCamera"]>();
  getConfig = vi.fn<AirpointSDK["getConfig"]>(
    () =>
      ({
        poseHoldThresholdMs: 120,
      }) as any,
  );
  updateConfig = vi.fn<AirpointSDK["updateConfig"]>();
  setVideo = vi.fn<AirpointSDK["setVideo"]>();
  processFrame = vi.fn<AirpointSDK["processFrame"]>();
  getState = vi.fn<AirpointSDK["getState"]>(() => ({
    lastFrameMs: 0,
    running: true,
  }));

  on(event: string, listener: (event: unknown) => void) {
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(listener);
    this.listeners.set(event, bucket);
    return () => {
      bucket.delete(listener);
    };
  }

  emit(event: string, payload: unknown) {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(payload);
    }
  }
}

describe("createAirpointPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createAirpointSDKMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("emits tap intents and resolves DOM targets", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const button = document.createElement("button");
    button.className = "primary-action";
    document.body.appendChild(button);

    const plugin = createAirpointPlugin({
      manifest: {
        dom: {
          targets: {
            primary: ".primary-action",
          },
        },
        intents: {
          thumb_middle_pinch: {
            tap: {
              id: "primary-select",
              target: "primary",
            },
          },
        },
      },
    });

    const intents: Array<any> = [];
    plugin.on("intent", (event) => intents.push(event));

    sdk.emit("pose_enter", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 100,
      type: "pose_enter",
      x: 0.5,
      y: 0.5,
    });
    sdk.emit("pose_exit", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 150,
      type: "pose_exit",
      x: 0.5,
      y: 0.5,
    });

    expect(intents).toHaveLength(1);
    expect(intents[0].intent.id).toBe("primary-select");
    expect(intents[0].intent.phase).toBe("tap");
    expect(intents[0].target).toBe(button);
  });

  it("pauses tracking without tearing down plugin listeners", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const plugin = createAirpointPlugin();
    const moves: Array<any> = [];
    plugin.on("move", (event) => moves.push(event));

    plugin.pause();

    expect(sdk.pause).toHaveBeenCalledTimes(1);
    expect(sdk.stop).not.toHaveBeenCalled();

    sdk.emit("move", {
      hand: "Right",
      timestamp: 100,
      type: "move",
      x: 0.25,
      y: 0.5,
    });

    expect(moves).toHaveLength(1);
  });

  it("prepares the SDK without starting tracking", async () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const plugin = createAirpointPlugin();

    await plugin.prepare();

    expect(sdk.prepare).toHaveBeenCalledTimes(1);
    expect(sdk.start).not.toHaveBeenCalled();
  });

  it("suppresses performIntent when blocked unless binding allows it", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);
    const performIntent = vi.fn();

    const plugin = createAirpointPlugin({
      adapter: {
        isBlockedAtPoint: () => true,
        performIntent,
      },
      manifest: {
        intents: {
          thumb_middle_pinch: {
            tap: {
              id: "primary-select",
            },
          },
        },
      },
    });

    const intents: Array<any> = [];
    plugin.on("intent", (event) => intents.push(event));

    sdk.emit("pose_enter", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 100,
      type: "pose_enter",
      x: 0.5,
      y: 0.5,
    });
    sdk.emit("pose_exit", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 150,
      type: "pose_exit",
      x: 0.5,
      y: 0.5,
    });

    expect(intents.at(-1)?.blocked).toBe(true);
    expect(performIntent).not.toHaveBeenCalled();
  });

  it("uses the cursor point for DOM click intents by default", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const button = document.createElement("button");
    button.className = "primary-action";
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    const canvas = document.createElement("canvas");
    document.body.appendChild(button);
    document.body.appendChild(canvas);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => canvas),
    });

    const plugin = createAirpointPlugin({
      adapter: createAirpointDomAdapter(),
      manifest: {
        dom: {
          targets: {
            primary: ".primary-action",
          },
        },
        intents: {
          thumb_middle_pinch: {
            tap: {
              id: "primary-select",
              target: "primary",
            },
          },
        },
      },
    });

    plugin.on("intent", () => {});

    sdk.emit("pose_enter", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 100,
      type: "pose_enter",
      x: 0.5,
      y: 0.5,
    });
    sdk.emit("pose_exit", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 150,
      type: "pose_exit",
      x: 0.5,
      y: 0.5,
    });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("can opt into clicking resolved intent targets", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const button = document.createElement("button");
    button.className = "primary-action";
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    const canvas = document.createElement("canvas");
    document.body.appendChild(button);
    document.body.appendChild(canvas);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => canvas),
    });

    const plugin = createAirpointPlugin({
      adapter: createAirpointDomAdapter({ pointerTarget: "intent" }),
      manifest: {
        dom: {
          targets: {
            primary: ".primary-action",
          },
        },
        intents: {
          thumb_middle_pinch: {
            tap: {
              id: "primary-select",
              target: "primary",
            },
          },
        },
      },
    });

    plugin.on("intent", () => {});

    sdk.emit("pose_enter", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 100,
      type: "pose_enter",
      x: 0.5,
      y: 0.5,
    });
    sdk.emit("pose_exit", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 150,
      type: "pose_exit",
      x: 0.5,
      y: 0.5,
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("lets the DOM adapter click the element under the cursor", () => {
    const button = document.createElement("button");
    const onClick = vi.fn();
    const events: string[] = [];
    button.addEventListener("mousedown", () => events.push("mousedown"));
    button.addEventListener("mouseup", () => events.push("mouseup"));
    button.addEventListener("click", () => events.push("click"));
    button.addEventListener("click", onClick);
    document.body.appendChild(button);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => button),
    });

    createAirpointDomAdapter().performIntent?.({
      blocked: false,
      hand: "Right",
      intent: {
        id: "primary-select",
        phase: "tap",
        pose: "thumb_middle_pinch",
      },
      point: { space: "pixels", x: 10, y: 20 },
      timestamp: 100,
      type: "intent",
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["mousedown", "mouseup", "click"]);
  });

  it("lets apps listen for framework-agnostic DOM intent events", () => {
    const button = document.createElement("button");
    const onIntent = vi.fn();
    button.addEventListener("airpoint:intent", onIntent);
    document.body.appendChild(button);

    createAirpointDomAdapter({
      defaultAction: "dispatch_event",
    }).performIntent?.({
      blocked: false,
      hand: "Right",
      intent: {
        id: "custom-action",
        phase: "tap",
        pose: "thumb_middle_pinch",
      },
      target: button,
      timestamp: 100,
      type: "intent",
    });

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(onIntent.mock.calls[0][0].detail.intent.id).toBe("custom-action");
  });

  it("emits hold_start and hold_end when a pose stays active past threshold", () => {
    const sdk = new FakeSdk();
    createAirpointSDKMock.mockReturnValue(sdk);

    const plugin = createAirpointPlugin({
      manifest: {
        intents: {
          thumb_middle_pinch: {
            hold_start: "hold-begin",
            hold_end: "hold-end",
          },
        },
      },
    });

    const intents: Array<string> = [];
    plugin.on("intent", (event) => intents.push(event.intent.phase));

    sdk.emit("pose_enter", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 100,
      type: "pose_enter",
      x: 0.5,
      y: 0.5,
    });

    vi.advanceTimersByTime(130);

    sdk.emit("pose_exit", {
      hand: "Right",
      pose: "thumb_middle_pinch",
      timestamp: 260,
      type: "pose_exit",
      x: 0.5,
      y: 0.5,
    });

    expect(intents).toContain("hold_start");
    expect(intents).toContain("hold_end");
  });
});
