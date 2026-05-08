// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AirpointSDK } from "../src/sdk";
import { createAirpointPlugin } from "../src/plugin";

const { createAirpointSDKMock } = vi.hoisted(() => ({
  createAirpointSDKMock: vi.fn(),
}));

vi.mock("../src/sdk", async () => {
  const actual = await vi.importActual<typeof import("../src/sdk")>("../src/sdk");
  return {
    ...actual,
    createAirpointSDK: createAirpointSDKMock,
  };
});

class FakeSdk {
  private listeners = new Map<string, Set<(event: any) => void>>();

  start = vi.fn<AirpointSDK["start"]>(async () => {});
  stop = vi.fn<AirpointSDK["stop"]>();
  startCamera = vi.fn<AirpointSDK["startCamera"]>();
  stopCamera = vi.fn<AirpointSDK["stopCamera"]>();
  getConfig = vi.fn<AirpointSDK["getConfig"]>(() => ({
    poseHoldThresholdMs: 120,
  } as any));
  updateConfig = vi.fn<AirpointSDK["updateConfig"]>();
  setVideo = vi.fn<AirpointSDK["setVideo"]>();
  processFrame = vi.fn<AirpointSDK["processFrame"]>();
  getState = vi.fn<AirpointSDK["getState"]>(() => ({
    lastFrameMs: 0,
    running: true,
  }));

  on(event: string, cb: (event: unknown) => void) {
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(cb);
    this.listeners.set(event, bucket);
    return () => {
      bucket.delete(cb);
    };
  }

  emit(event: string, payload: unknown) {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    for (const cb of bucket) {
      cb(payload);
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
