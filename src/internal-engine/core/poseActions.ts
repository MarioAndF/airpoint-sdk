import type { HandConfig, PoseAction, PoseName } from "./types";

export function getPoseTapAction(
  config: HandConfig,
  pose: PoseName,
): PoseAction | undefined {
  return config.poseTapActions?.[pose];
}

export function getPoseHoldAction(
  config: HandConfig,
  pose: PoseName,
): PoseAction | undefined {
  const mapped = config.poseHoldActions?.[pose];
  if (mapped) return mapped;

  // Default: allow thumb-middle to behave as press/hold (drag) when enabled.
  if (pose === "thumb_middle_pinch" && config.enableClickHold) {
    return "drag";
  }

  return undefined;
}

export function isTapActionEnabled(
  config: HandConfig,
  action: PoseAction | undefined,
  handId: "Left" | "Right",
): boolean {
  if (!action) return false;

  if (action === "left_click") {
    if (!config.enableClick) return false;
    return config.clickHand === "Both" || config.clickHand === handId;
  }

  if (action === "right_click") return config.enableRightClick !== false;
  if (action === "scroll") return config.enableScroll !== false;
  if (action === "drag") return config.enableGrab !== false;
  if (action === "dictation") return config.enableDictation !== false;
  return true;
}

export function isHoldActionEnabled(
  config: HandConfig,
  action: PoseAction | undefined,
  pose: PoseName,
): boolean {
  if (!action) return false;

  if (action === "scroll") return config.enableScroll !== false;

  if (action === "drag") {
    if (pose === "thumb_middle_pinch") return config.enableClickHold;
    return config.enableGrab !== false;
  }

  if (action === "window_tile") return config.enableWindowTile !== false;

  if (action === "spaces_nav") return config.enableSpacesNav !== false;

  if (action === "dictation") return config.enableDictation !== false;

  if (action === "left_click") return config.enableClickHold;
  if (action === "right_click") return config.enableRightClick !== false;
  return true;
}
