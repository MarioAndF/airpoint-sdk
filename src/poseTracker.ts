import { DEFAULT_CONFIG } from "./types";
import type { HandConfig, PoseName, PoseProbabilities, PoseThresholds } from "./types";

export type PoseTrackerEventType =
  | "pose_enter"
  | "pose_exit"
  | "tap"
  | "hold_start"
  | "hold_end";

export type PoseTrackerEvent = {
  type: PoseTrackerEventType;
  pose: PoseName;
};

const FALLBACK_THRESHOLDS: PoseThresholds = {
  enterThreshold: 0.9,
  exitThreshold: 0.5,
  enterFrames: 3,
  exitFrames: 3,
};

function resolvePoseThresholds(
  config: HandConfig,
  pose: PoseName,
): PoseThresholds {
  const userConfigured = config.poseThresholds?.[pose] ?? {};
  const defaultConfigured = DEFAULT_CONFIG.poseThresholds?.[pose] ?? {};
  return {
    ...FALLBACK_THRESHOLDS,
    ...defaultConfigured,
    ...userConfigured,
  };
}

function getDominantPose(
  poseProbabilities: PoseProbabilities,
): PoseName | null {
  let bestPose: PoseName | null = null;
  let bestProb = -1;
  for (const [pose, prob] of Object.entries(poseProbabilities)) {
    if (pose === "idle") continue;
    if (prob > bestProb) {
      bestProb = prob;
      bestPose = pose as PoseName;
    }
  }
  return bestPose;
}

export class PoseTracker {
  private activePose: PoseName | null = null;
  private poseCandidate: PoseName | null = null;
  private poseEnterCount = 0;
  private poseExitCount = 0;
  private poseStartTime = 0;
  private poseHoldActive = false;
  private poseMotionDistance = 0;

  reset(): void {
    this.activePose = null;
    this.poseCandidate = null;
    this.poseEnterCount = 0;
    this.poseExitCount = 0;
    this.poseStartTime = 0;
    this.poseHoldActive = false;
    this.poseMotionDistance = 0;
  }

  getActivePose(): PoseName | null {
    return this.activePose;
  }

  isHoldActive(): boolean {
    return this.poseHoldActive;
  }

  private finalizeActivePoseExit(events: PoseTrackerEvent[], pose: PoseName): void {
    const wasHolding = this.poseHoldActive;
    this.activePose = null;
    this.poseExitCount = 0;
    this.poseHoldActive = false;
    this.poseMotionDistance = 0;
    this.poseCandidate = null;
    this.poseEnterCount = 0;
    events.push({ type: "pose_exit", pose });
    if (wasHolding) {
      events.push({ type: "hold_end", pose });
    } else {
      events.push({ type: "tap", pose });
    }
  }

  update(
    poseProbabilities: PoseProbabilities | undefined,
    timestamp: number,
    config: HandConfig,
    motionDeltaPx: number,
  ): PoseTrackerEvent[] {
    const events: PoseTrackerEvent[] = [];

    if (!poseProbabilities) {
      if (!this.activePose) {
        this.poseCandidate = null;
        this.poseEnterCount = 0;
        return events;
      }

      const activePose = this.activePose;
      this.finalizeActivePoseExit(events, activePose);
      return events;
    }

    // Case 1: no active pose, find entry
    if (!this.activePose) {
      const candidatePose = getDominantPose(poseProbabilities);
      if (!candidatePose) {
        this.poseCandidate = null;
        this.poseEnterCount = 0;
        return events;
      }

      if (this.poseCandidate !== candidatePose) {
        this.poseCandidate = candidatePose;
        this.poseEnterCount = 0;
      }

      const { enterThreshold, enterFrames } = resolvePoseThresholds(
        config,
        candidatePose,
      );

      if (poseProbabilities[candidatePose] >= enterThreshold) {
        this.poseEnterCount += 1;
      } else {
        this.poseEnterCount = 0;
      }

      if (this.poseEnterCount >= enterFrames) {
        this.activePose = candidatePose;
        this.poseStartTime = timestamp;
        this.poseExitCount = 0;
        this.poseHoldActive = false;
        this.poseMotionDistance = 0;
        this.poseCandidate = null;
        this.poseEnterCount = 0;
        events.push({ type: "pose_enter", pose: candidatePose });
      }

      return events;
    }

    // Case 2: active pose, check exit/hold
    const activePose = this.activePose;
    const { exitThreshold, exitFrames } = resolvePoseThresholds(
      config,
      activePose,
    );

    this.poseMotionDistance += motionDeltaPx;

    if (poseProbabilities[activePose] < exitThreshold) {
      this.poseExitCount += 1;
    } else {
      this.poseExitCount = 0;
    }

    const motionThreshold = config.poseHoldMotionThresholdPx ?? 0;
    const holdByMotion =
      motionThreshold > 0 && this.poseMotionDistance >= motionThreshold;

    const holdByTime =
      (config.poseHoldThresholdMs ?? 0) > 0 &&
      timestamp - this.poseStartTime >= config.poseHoldThresholdMs;

    if (
      !this.poseHoldActive &&
      this.poseExitCount === 0 &&
      (holdByTime || holdByMotion)
    ) {
      this.poseHoldActive = true;
      events.push({ type: "hold_start", pose: activePose });
    }

    if (this.poseExitCount >= exitFrames) {
      this.finalizeActivePoseExit(events, activePose);
    }

    return events;
  }
}
