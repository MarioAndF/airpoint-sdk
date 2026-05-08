import { HandConfig, PoseName, PoseProbabilities } from "./types";
import { resolvePoseThresholds } from "./poseThresholds";
import { getPoseNames } from "../ml/poseMapping";
import {
  getPoseHoldAction,
  getPoseTapAction,
  isHoldActionEnabled,
  isTapActionEnabled,
} from "./poseActions";

export type PoseEventType = "pose_enter" | "tap" | "hold_start" | "hold_end";

export type PoseEvent = {
  type: PoseEventType;
  pose: PoseName;
  motionDistance?: number; // Motion distance accumulated during hold (for hold_end events)
};

export class PoseStateMachine {
  // State
  private activePose: PoseName | null = null;
  private poseCandidate: PoseName | null = null;
  private poseEnterCount: number = 0;
  private poseExitCount: number = 0;
  private poseStartTime: number = 0;
  private poseHoldActive: boolean = false;
  private poseMotionDistance: number = 0;

  constructor() {}

  reset() {
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

  getMotionDistance(): number {
    return this.poseMotionDistance;
  }

  addMotion(distance: number) {
    if (this.activePose) {
      this.poseMotionDistance += distance;
    }
  }

  private getDominantPose(
    poseProbabilities: PoseProbabilities,
    poseNames: PoseName[],
  ): PoseName | null {
    let bestPose: PoseName | null = null;
    let bestProb = -1;
    for (const pose of poseNames) {
      if (pose === "idle") continue;
      const prob = poseProbabilities[pose];
      if (prob > bestProb) {
        bestProb = prob;
        bestPose = pose;
      }
    }
    return bestPose;
  }

  process(
    poseProbabilities: PoseProbabilities,
    timestamp: number,
    config: HandConfig,
    handId: "Left" | "Right",
  ): PoseEvent[] {
    const events: PoseEvent[] = [];
    const poseNames = getPoseNames(config.gestureModel);

    // --- CASE 1: No active pose, looking for entry ---
    if (!this.activePose) {
      const candidatePose = this.getDominantPose(poseProbabilities, poseNames);

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
        // ENTER POSE
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

    // --- CASE 2: Active pose, looking for exit or hold trigger ---
    const activePose = this.activePose;
    const { exitThreshold, exitFrames } = resolvePoseThresholds(
      config,
      activePose,
    );

    // Check stability
    if (poseProbabilities[activePose] < exitThreshold) {
      this.poseExitCount += 1;
    } else {
      this.poseExitCount = 0;
    }

    // Check Hold Trigger
    const holdAction = getPoseHoldAction(config, activePose);
    const holdEligible = isHoldActionEnabled(config, holdAction, activePose);
    const tapAction = getPoseTapAction(config, activePose);
    const tapEligible = isTapActionEnabled(config, tapAction, handId);

    // Motion-based promotion (Drag logic)
    // For gestures with both tap and hold actions (like drag), require both to be eligible.
    // For gestures with only hold actions (like window_tile, spaces_nav), allow motion promotion directly.
    const motionThreshold = config.poseHoldMotionThresholdPx ?? 0;
    const hasTapAction = !!tapAction;
    const canPromoteByMotion =
      holdEligible && motionThreshold > 0 && (!hasTapAction || tapEligible);
    const holdByMotion =
      canPromoteByMotion && this.poseMotionDistance >= motionThreshold;

    // Time-based promotion
    // Special case: thumb_ring_pinch uses dual behavior
    // - Movement (>= threshold) = scroll (via holdByMotion)
    // - Stillness (< threshold) = right-click (via holdByTime)
    const isThumbRingPinch = activePose === "thumb_ring_pinch";
    const scrollRequiresMotion = holdAction === "scroll" && !isThumbRingPinch;
    const elapsedMs = timestamp - this.poseStartTime;

    // For thumb_ring_pinch: allow time-based hold for right-click (stillness)
    // For other scroll gestures: require motion only
    const holdByTime =
      holdEligible &&
      !scrollRequiresMotion &&
      elapsedMs >= config.poseHoldThresholdMs;

    if (
      !this.poseHoldActive &&
      this.poseExitCount === 0 &&
      (holdByTime || holdByMotion)
    ) {
      this.poseHoldActive = true;
      events.push({ type: "hold_start", pose: activePose });
    }

    // Check Exit
    if (this.poseExitCount >= exitFrames) {
      const wasHolding = this.poseHoldActive;
      const motionDistance = this.poseMotionDistance; // Capture BEFORE reset
      this.activePose = null;
      this.poseExitCount = 0;
      this.poseHoldActive = false;
      this.poseMotionDistance = 0;

      if (wasHolding && holdEligible) {
        events.push({ type: "hold_end", pose: activePose, motionDistance });
      } else {
        // If we weren't holding, it's a tap (if eligible)
        // Original logic simply fired "tap" here, but we should probably verify eligibility?
        // Original logic: "events.push({ type: "tap", pose: activePose });"
        // Then loop checked "if (tapEligible) ...".
        // Here we just emit the raw event, let the consumer decide what to do.
        events.push({ type: "tap", pose: activePose });
      }
    }

    return events;
  }
}
