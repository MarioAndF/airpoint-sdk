import { HandState } from "./HandState";
import {
  CursorOutput,
  PoseOutput,
  HandConfig,
  HandOutput,
  HandLandmark,
  PoseName,
  PoseProbabilities,
} from "./types";
import { FrameInput } from "./FrameInput";
import { getHandRotation } from "./gestures";

import { TCNGestureClassifierFull } from "../ml/TCNGestureClassifierFull";
import { ONNXGestureClassifier } from "../ml/ONNXGestureClassifier";

import {
  getPoseHoldAction,
  getPoseTapAction,
  isHoldActionEnabled,
  isTapActionEnabled,
} from "./poseActions";

// Classifier type (LSTM, TCN, or ONNX)
type ClickClassifier = TCNGestureClassifierFull | ONNXGestureClassifier;

type MlTimingSink = {
  addFeatureExtraction: (ms: number) => void;
  addGestureML: (ms: number) => void;
};

type GestureAssetId = "airmouse-4.1" | "airmouse-4.3";

export interface HandCursorEngineGestureAssetUrls {
  normalizerPaths?: Partial<Record<GestureAssetId, string>>;
  onnxModelPaths?: Partial<Record<GestureAssetId, string>>;
  tcnNormalizerPaths?: Partial<Record<GestureAssetId, string>>;
  tcnWeightPaths?: Partial<Record<GestureAssetId, string>>;
}

export interface HandCursorEngineAssetPaths {
  gestureModelBasePath?: string;
  gestureWeightBasePath?: string;
  gestureAssetUrls?: HandCursorEngineGestureAssetUrls;
  normalizerBasePath?: string;
  ortWasmBasePath?: string;
}

export class HandCursorEngine {
  config: HandConfig;
  handStates: { [key: string]: HandState };
  // Pre-allocated output objects to avoid GC pressure
  private cursorOutputPool: { [key: string]: CursorOutput };
  private cursorOutputArray: CursorOutput[];
  private poseOutputPool: { [key: string]: PoseOutput };
  private poseOutputArray: PoseOutput[];
  private outputPool: { [key: string]: HandOutput };
  private outputArray: HandOutput[];
  // ML Classifiers for gesture detection (LSTM airmouse-3 or TCN airmouse-4)
  private clickClassifiers: Partial<Record<"Left" | "Right", ClickClassifier>>;
  private currentModel: string;
  private assetPaths: Required<HandCursorEngineAssetPaths>;

  constructor(config: HandConfig, assetPaths: HandCursorEngineAssetPaths = {}) {
    this.config = config;
    this.assetPaths = {
      gestureModelBasePath: assetPaths.gestureModelBasePath ?? "/models",
      gestureWeightBasePath: assetPaths.gestureWeightBasePath ?? "/weights",
      gestureAssetUrls: assetPaths.gestureAssetUrls ?? {},
      normalizerBasePath: assetPaths.normalizerBasePath ?? "/normalizers",
      ortWasmBasePath: assetPaths.ortWasmBasePath ?? "/",
    };
    this.handStates = {
      Left: new HandState("Left", "L", "#2dd4bf", config), // teal-400
      Right: new HandState("Right", "R", "#60a5fa", config), // blue-400
    };
    // Pre-allocate output objects
    this.cursorOutputPool = {
      Left: this.createEmptyCursorOutput("Left", "L"),
      Right: this.createEmptyCursorOutput("Right", "R"),
    };
    this.cursorOutputArray = [];
    this.poseOutputPool = {
      Left: this.createEmptyPoseOutput("Left", "L"),
      Right: this.createEmptyPoseOutput("Right", "R"),
    };
    this.poseOutputArray = [];
    this.outputPool = {
      Left: this.createEmptyOutput("Left", "L"),
      Right: this.createEmptyOutput("Right", "R"),
    };
    this.outputArray = [];
    // Initialize ML classifiers based on selected model
    this.currentModel = config.gestureModel ?? "airmouse-4.3-onnx";
    this.clickClassifiers = config.enableMLClassifier
      ? this.createClassifiers(this.currentModel)
      : {};
  }

  private createClassifiers(
    model: string,
  ): Partial<Record<"Left" | "Right", ClickClassifier>> {
    const normalizerPath41 =
      this.assetPaths.gestureAssetUrls.normalizerPaths?.["airmouse-4.1"];
    const normalizerPath43 =
      this.assetPaths.gestureAssetUrls.normalizerPaths?.["airmouse-4.3"];

    if (model === "airmouse-4.1-onnx") {
      // ONNX TCN classifier with full z-depth (885 features)
      return {
        Left: new ONNXGestureClassifier(
          "airmouse-4.1",
          this.assetPaths.gestureModelBasePath,
          this.assetPaths.normalizerBasePath,
          this.assetPaths.ortWasmBasePath,
          {
            modelPath:
              this.assetPaths.gestureAssetUrls.onnxModelPaths?.["airmouse-4.1"],
            normalizerPath: normalizerPath41,
          },
        ),
        Right: new ONNXGestureClassifier(
          "airmouse-4.1",
          this.assetPaths.gestureModelBasePath,
          this.assetPaths.normalizerBasePath,
          this.assetPaths.ortWasmBasePath,
          {
            modelPath:
              this.assetPaths.gestureAssetUrls.onnxModelPaths?.["airmouse-4.1"],
            normalizerPath: normalizerPath41,
          },
        ),
      };
    } else if (model === "airmouse-4.3-onnx" || model === "airmouse-4.2-onnx") {
      // ONNX TCN classifier with full z-depth (885 features) + thumb-index
      return {
        Left: new ONNXGestureClassifier(
          "airmouse-4.3",
          this.assetPaths.gestureModelBasePath,
          this.assetPaths.normalizerBasePath,
          this.assetPaths.ortWasmBasePath,
          {
            modelPath:
              this.assetPaths.gestureAssetUrls.onnxModelPaths?.["airmouse-4.3"],
            normalizerPath: normalizerPath43,
          },
        ),
        Right: new ONNXGestureClassifier(
          "airmouse-4.3",
          this.assetPaths.gestureModelBasePath,
          this.assetPaths.normalizerBasePath,
          this.assetPaths.ortWasmBasePath,
          {
            modelPath:
              this.assetPaths.gestureAssetUrls.onnxModelPaths?.["airmouse-4.3"],
            normalizerPath: normalizerPath43,
          },
        ),
      };
    } else if (model === "airmouse-4.1") {
      // Pure JS TCN with full z-depth (885 features)
      return {
        Left: new TCNGestureClassifierFull(
          "airmouse-4.1",
          this.assetPaths.gestureWeightBasePath,
          this.assetPaths.normalizerBasePath,
          {
            normalizerPath:
              this.assetPaths.gestureAssetUrls.tcnNormalizerPaths?.[
                "airmouse-4.1"
              ] ?? normalizerPath41,
            weightsPath:
              this.assetPaths.gestureAssetUrls.tcnWeightPaths?.["airmouse-4.1"],
          },
        ),
        Right: new TCNGestureClassifierFull(
          "airmouse-4.1",
          this.assetPaths.gestureWeightBasePath,
          this.assetPaths.normalizerBasePath,
          {
            normalizerPath:
              this.assetPaths.gestureAssetUrls.tcnNormalizerPaths?.[
                "airmouse-4.1"
              ] ?? normalizerPath41,
            weightsPath:
              this.assetPaths.gestureAssetUrls.tcnWeightPaths?.["airmouse-4.1"],
          },
        ),
      };
    } else if (model === "airmouse-4.3" || model === "airmouse-4.2") {
      // Pure JS TCN with full z-depth (885 features) + thumb-index
      return {
        Left: new TCNGestureClassifierFull(
          "airmouse-4.3",
          this.assetPaths.gestureWeightBasePath,
          this.assetPaths.normalizerBasePath,
          {
            normalizerPath:
              this.assetPaths.gestureAssetUrls.tcnNormalizerPaths?.[
                "airmouse-4.3"
              ] ?? normalizerPath43,
            weightsPath:
              this.assetPaths.gestureAssetUrls.tcnWeightPaths?.["airmouse-4.3"],
          },
        ),
        Right: new TCNGestureClassifierFull(
          "airmouse-4.3",
          this.assetPaths.gestureWeightBasePath,
          this.assetPaths.normalizerBasePath,
          {
            normalizerPath:
              this.assetPaths.gestureAssetUrls.tcnNormalizerPaths?.[
                "airmouse-4.3"
              ] ?? normalizerPath43,
            weightsPath:
              this.assetPaths.gestureAssetUrls.tcnWeightPaths?.["airmouse-4.3"],
          },
        ),
      };
    } else {
      throw new Error(
        `Unknown gesture model: "${model}". Supported: "airmouse-4.1-onnx", "airmouse-4.1", "airmouse-4.2-onnx", "airmouse-4.2", "airmouse-4.3-onnx", "airmouse-4.3".`,
      );
    }
  }

  private createEmptyCursorOutput(id: string, label: string): CursorOutput {
    return {
      id,
      label,
      x: 0,
      y: 0,
      z: 0,
      speed: 0,
      fingerSpeed: 0,
      rotation: null,
      isPointing: false,
      handednessScore: undefined,
    };
  }

  private createEmptyPoseOutput(id: string, label: string): PoseOutput {
    return {
      id,
      label,
      pose: undefined,
      activePose: undefined,
      isPinching: false,
      isClicking: false,
      isRightClicking: false,
      isGrabbing: false,
      isScrolling: false,
      poseProbabilities: undefined,
      scroll: undefined,
      scrollPhase: 0,
      momentumPhase: 0,
      clickTimestamp: 0,
    };
  }

  private createEmptyOutput(id: string, label: string): HandOutput {
    return {
      id,
      label,
      x: 0,
      y: 0,
      z: 0,
      isClicking: false,
      isRightClicking: false,
      isGrabbing: false,
      mlPose: undefined,
      poseProbabilities: undefined,
      mlGesture: undefined,
      mlProbabilities: undefined,
      isPointing: false,
      speed: 0,
      fingerSpeed: 0,
      rotation: null,
      clickTimestamp: 0,
      scroll: undefined,
      handednessScore: undefined,
    };
  }

  updateConfig(newConfig: Partial<HandConfig>) {
    const prevClickJoint = this.config.clickJoint;
    const prevEnableMLClassifier = this.config.enableMLClassifier;
    this.config = { ...this.config, ...newConfig };

    // Update hand states (propagates to modules)
    this.handStates.Left.updateConfig(this.config);
    this.handStates.Right.updateConfig(this.config);

    // Recreate classifiers if the selected model changes.
    const modelChanged =
      newConfig.gestureModel !== undefined &&
      newConfig.gestureModel !== this.currentModel;
    const clickJointChanged =
      newConfig.clickJoint !== undefined &&
      newConfig.clickJoint !== prevClickJoint;
    const mlClassifierEnabledChanged =
      newConfig.enableMLClassifier !== undefined &&
      newConfig.enableMLClassifier !== prevEnableMLClassifier;

    if (modelChanged) {
      this.currentModel = newConfig.gestureModel!;
    }

    if (!this.config.enableMLClassifier) {
      this.clickClassifiers = {};
      return;
    }

    if (modelChanged || clickJointChanged || mlClassifierEnabledChanged) {
      this.clickClassifiers = this.createClassifiers(this.currentModel);
    }
  }

  triggerRecenter(handId: "Left" | "Right", width: number, height: number) {
    const hand = this.handStates[handId];
    if (!hand) return;
    hand.recenter(width / 2, height / 2);
  }

  triggerRecenterAll(width: number, height: number) {
    this.triggerRecenter("Left", width, height);
    this.triggerRecenter("Right", width, height);
  }

  processCursor(
    inputs: FrameInput[],
    timestamp: number,
    width: number,
    height: number,
    palmWheelActive: boolean | Set<"Left" | "Right"> = false,
  ): CursorOutput[] {
    // Reuse array to avoid allocation
    this.cursorOutputArray.length = 0;

    if (!inputs || inputs.length === 0) return this.cursorOutputArray;

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const landmarks: HandLandmark[] = input.channels.landmarks;
      const handednessScore = input.metadata.confidence;
      const handedness = input.metadata.handedness;

      const hand = this.handStates[handedness];
      if (!hand) continue;

      // 1. Rotation
      hand.rotation = getHandRotation(landmarks);

      // 2. Resolve Raw Target (Index vs Palm Wheel)
      const indexTip = landmarks[8];
      const wrist = landmarks[0];
      const middleMcp = landmarks[9];

      const indexX = (1 - indexTip.x) * width;
      const indexY = indexTip.y * height;
      const palmX = (1 - (wrist.x + middleMcp.x) / 2) * width;
      const palmY = ((wrist.y + middleMcp.y) / 2) * height;

      let cursorSourceX: number;
      let cursorSourceY: number;

      const palmWheelActiveForHand =
        typeof palmWheelActive === "boolean"
          ? palmWheelActive
          : palmWheelActive.has(handedness);

      if (palmWheelActiveForHand) {
        if (!hand.palmWheelWasActive) {
          hand.palmWheelOffset.x = indexX - palmX;
          hand.palmWheelOffset.y = indexY - palmY;
          hand.palmWheelWasActive = true;
        }
        cursorSourceX = palmX + hand.palmWheelOffset.x;
        cursorSourceY = palmY + hand.palmWheelOffset.y;
      } else {
        if (hand.palmWheelWasActive) {
          const currentPalmX = palmX + hand.palmWheelOffset.x;
          const currentPalmY = palmY + hand.palmWheelOffset.y;
          hand.palmWheelOffset.x = currentPalmX - indexX;
          hand.palmWheelOffset.y = currentPalmY - indexY;
          hand.palmWheelWasActive = false;
        }
        cursorSourceX = indexX + hand.palmWheelOffset.x;
        cursorSourceY = indexY + hand.palmWheelOffset.y;

        const decay = 0.9;
        hand.palmWheelOffset.x *= decay;
        hand.palmWheelOffset.y *= decay;
        if (Math.abs(hand.palmWheelOffset.x) < 0.5) hand.palmWheelOffset.x = 0;
        if (Math.abs(hand.palmWheelOffset.y) < 0.5) hand.palmWheelOffset.y = 0;
      }

      // 3. Process Kinematics
      const kinematicsOut = hand.kinematics.process(
        { x: cursorSourceX, y: cursorSourceY },
        landmarks,
        timestamp,
        width,
        height,
        this.config,
      );

      // Save delta for gesture processing
      if (kinematicsOut.isValid) {
        hand.cursorDelta = kinematicsOut.delta;
      } else {
        hand.cursorDelta = { x: 0, y: 0 };
      }

      // Output Construction
      // 4. Pointing Direction Check
      // Check if pointing towards screen (Z-depth check).
      // -Z is towards camera. Tip should be closer (smaller Z) than Wrist.
      // If Tip.z > Wrist.z, the finger is pointing away from the screen.
      // We use a threshold of 0.1 to allow for vertical hands (approx 0 z-diff)
      // 4. Pointing Direction Check
      // Check if pointing towards screen using normalized vector direction.
      // -Z is towards camera. We want the vector (Wrist -> Tip) to have a significant negative Z component.
      // Normalize the vector to handle hand size differences.
      const pdx = indexTip.x - wrist.x;
      const pdy = indexTip.y - wrist.y;
      const pdz = indexTip.z - wrist.z;
      const plen = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
      const dirZ = plen > 0 ? pdz / plen : 0;

      // Configurable threshold:
      // - Higher (e.g. -0.05) = less strict, accepts flatter pointing.
      // - Lower (e.g. -0.25) = more strict, requires stronger forward tilt.
      // 0 would be flat (parallel to screen), >0 allows away-pointing and is not recommended.
      const pointingForwardZThreshold = Number.isFinite(
        this.config.pointingForwardZThreshold,
      )
        ? this.config.pointingForwardZThreshold
        : -0.15;
      const isPointing =
        this.config.enablePointingGate === false
          ? true
          : dirZ < pointingForwardZThreshold;

      const output = this.cursorOutputPool[handedness];
      output.x = kinematicsOut.cursor.x;
      output.y = kinematicsOut.cursor.y;
      output.z = landmarks[8].z;
      output.speed = kinematicsOut.speed;
      output.fingerSpeed = kinematicsOut.fingerSpeed;
      output.rotation = hand.rotation;
      output.isPointing = isPointing;
      output.handednessScore = handednessScore;

      this.cursorOutputArray.push(output);
    }

    return this.cursorOutputArray;
  }

  async processGestures(
    inputs: FrameInput[],
    timestamp: number,
    _width: number,
    _height: number,
    timing?: MlTimingSink,
  ): Promise<PoseOutput[]> {
    // Reuse array to avoid allocation
    this.poseOutputArray.length = 0;

    if (!inputs || inputs.length === 0) return this.poseOutputArray;

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const landmarks: HandLandmark[] = input.channels.landmarks;
      const worldLandmarks: HandLandmark[] | undefined =
        input.channels.worldLandmarks;
      const handedness = input.metadata.handedness;

      const hand = this.handStates[handedness];
      if (!hand) continue;

      // 1. Pose Detection
      let mlPose: PoseName | undefined = undefined;
      let poseProbabilities: PoseProbabilities | undefined = undefined;

      if (this.config.enableMLClassifier) {
        const classifier = this.clickClassifiers[handedness];
        if (classifier && worldLandmarks) {
          const isLeftHand = handedness === "Left";
          const mlLandmarks2D = isLeftHand
            ? landmarks.map((lm) => ({ ...lm, x: 1 - lm.x }))
            : landmarks;
          const mlLandmarks3D = isLeftHand
            ? worldLandmarks.map((lm) => ({ ...lm, x: -lm.x }))
            : worldLandmarks;

          // Use predictAsync for ONNX classifiers (current frame), predict for others
          const prediction =
            "predictAsync" in classifier
              ? await classifier.predictAsync(
                  mlLandmarks2D,
                  mlLandmarks3D,
                  timing,
                )
              : classifier.predict(mlLandmarks2D, mlLandmarks3D, timing);
          mlPose = prediction.pose;
          poseProbabilities = prediction.poseProbabilities;
        }
      }

      // 2. Pose State Machine
      hand.isPinching = false;
      hand.isClicking = false;
      hand.isRightClicking = false;
      hand.isDictating = false;
      hand.isDictationEnding = false;

      if (!this.config.enableMLClassifier || !poseProbabilities) {
        hand.poseState.reset();
        hand.isGrabbing = false;
      } else {
        // Update Motion for Drag Detection
        const activePose = hand.poseState.getActivePose();
        if (activePose) {
          const dist = Math.hypot(hand.cursorDelta.x, hand.cursorDelta.y);
          hand.poseState.addMotion(dist);
        }

        const events = hand.poseState.process(
          poseProbabilities,
          timestamp,
          this.config,
          handedness,
        );

        for (const event of events) {
          if (event.type === "pose_enter") {
            // Check if this is the left-click pose entering (thumb-middle pinch starts)
            // Only trigger isPinching for the primary click gesture, not scroll/right-click
            const tapAction = getPoseTapAction(this.config, event.pose);
            if (
              tapAction === "left_click" &&
              event.pose === "thumb_middle_pinch"
            ) {
              hand.isPinching = true;
            }
          } else if (event.type === "tap") {
            const tapAction = getPoseTapAction(this.config, event.pose);
            if (isTapActionEnabled(this.config, tapAction, hand.id)) {
              if (tapAction === "left_click") {
                const debounceMs = this.config.clickDebounceMs ?? 200;
                const debouncePassed =
                  !this.config.enableClickDebounce ||
                  timestamp - hand.lastClickTime > debounceMs;
                if (debouncePassed) {
                  hand.isClicking = true;
                  hand.clickAnimation = timestamp;
                  hand.lastClickTime = timestamp;
                }
              } else if (tapAction === "right_click") {
                hand.isRightClicking = true;
              }
            }
          } else if (event.type === "hold_start") {
            const holdAction = getPoseHoldAction(this.config, event.pose);
            if (isHoldActionEnabled(this.config, holdAction, event.pose)) {
              if (holdAction === "drag") hand.isGrabbing = true;
              else if (holdAction === "dictation") hand.isDictating = true;
              // Note: right-click for thumb_ring_pinch fires on hold_end, not hold_start
            }
          } else if (event.type === "hold_end") {
            const holdAction = getPoseHoldAction(this.config, event.pose);
            if (holdAction === "drag") hand.isGrabbing = false;
            else if (holdAction === "dictation") hand.isDictationEnding = true;

            // Special case: thumb_ring_pinch stillness = right-click on release
            // Only fire right-click if user stayed still (motion < threshold) throughout hold
            // Use motionDistance from event (not state machine, which is already reset)
            if (
              event.pose === "thumb_ring_pinch" &&
              (event.motionDistance ?? 0) <
                (this.config.poseHoldMotionThresholdPx ?? 4)
            ) {
              hand.isRightClicking = true;
            }
          }
        }
      }

      // 3. Scroll Controller
      let isScrollGestureActive = false;
      const currentActivePose = hand.poseState.getActivePose();

      if (currentActivePose && hand.poseState.isHoldActive()) {
        const holdAction = getPoseHoldAction(this.config, currentActivePose);
        if (
          holdAction === "scroll" &&
          isHoldActionEnabled(this.config, "scroll", currentActivePose)
        ) {
          isScrollGestureActive = true;
        }
      }

      const scrollOut = hand.scrollState.process(
        hand.cursorDelta,
        isScrollGestureActive,
        timestamp,
        this.config,
      );

      // 4. Window Tile Controller
      let isWindowTileGestureActive = false;
      if (currentActivePose && hand.poseState.isHoldActive()) {
        const holdAction = getPoseHoldAction(this.config, currentActivePose);
        if (
          holdAction === "window_tile" &&
          this.config.enableWindowTile &&
          isHoldActionEnabled(this.config, "window_tile", currentActivePose)
        ) {
          isWindowTileGestureActive = true;
        }
      }

      const windowTileOut = hand.windowTileState.process(
        hand.cursorDelta,
        isWindowTileGestureActive,
        this.config,
      );

      // 5. Spaces Navigation Controller (thumb-pinky-base + slide)
      let isSpacesNavGestureActive = false;
      if (currentActivePose && hand.poseState.isHoldActive()) {
        const holdAction = getPoseHoldAction(this.config, currentActivePose);
        if (
          holdAction === "spaces_nav" &&
          this.config.enableSpacesNav !== false &&
          isHoldActionEnabled(this.config, "spaces_nav", currentActivePose)
        ) {
          isSpacesNavGestureActive = true;
        }
      }

      const spacesNavOut = hand.spacesNavState.process(
        hand.cursorDelta,
        isSpacesNavGestureActive,
        this.config,
      );

      // Output Construction
      const output = this.poseOutputPool[handedness];
      output.pose = mlPose;
      output.activePose = currentActivePose ?? undefined;
      output.poseProbabilities = poseProbabilities;
      output.isPinching = hand.isPinching;
      output.isClicking = hand.isClicking;
      output.isRightClicking = hand.isRightClicking;
      output.isGrabbing = hand.isGrabbing;
      output.isDictating = hand.isDictating;
      output.isDictationEnding = hand.isDictationEnding;
      output.isScrolling = scrollOut.isScrolling || scrollOut.isInertia;

      output.scroll =
        scrollOut.isScrolling || scrollOut.isInertia
          ? scrollOut.scrollDelta
          : undefined;

      // Phase mappings
      output.scrollPhase = 0;
      output.momentumPhase = 0;

      // Window tiling
      output.isWindowTiling = windowTileOut.isActive;
      output.windowTileDirection = windowTileOut.triggered
        ? windowTileOut.direction
        : null;

      // Spaces navigation (4-finger swipe equivalent)
      output.isSpacesNav = spacesNavOut.isActive;
      output.spacesNavDirection = spacesNavOut.triggered
        ? spacesNavOut.direction
        : null;

      output.clickTimestamp = hand.lastClickTime;

      this.poseOutputArray.push(output);
    }

    return this.poseOutputArray;
  }

  /**
   * @deprecated Use processCursor/processGestures instead.
   */
  async process(
    results: any,
    timestamp: number,
    width: number,
    height: number,
    timing?: MlTimingSink,
  ): Promise<HandOutput[]> {
    const cursorOutputs = this.processCursor(results, timestamp, width, height);
    const poseOutputs = await this.processGestures(
      results,
      timestamp,
      width,
      height,
      timing,
    );

    // Reuse array to avoid allocation
    this.outputArray.length = 0;

    for (const cursor of cursorOutputs) {
      const output = this.outputPool[cursor.id];
      output.x = cursor.x;
      output.y = cursor.y;
      output.z = cursor.z;
      output.speed = cursor.speed;
      output.fingerSpeed = cursor.fingerSpeed;
      output.rotation = cursor.rotation;
      output.isPointing = cursor.isPointing;
      output.handednessScore = cursor.handednessScore;

      const poseOutput = poseOutputs.find((g) => g.id === cursor.id);
      if (poseOutput) {
        output.isClicking = poseOutput.isClicking;
        output.isGrabbing = poseOutput.isGrabbing;
        output.isRightClicking = poseOutput.isRightClicking;
        output.mlPose = poseOutput.pose;
        output.poseProbabilities = poseOutput.poseProbabilities;
        output.mlGesture = poseOutput.pose;
        output.mlProbabilities = poseOutput.poseProbabilities;
        output.scroll = poseOutput.scroll;
        output.clickTimestamp = poseOutput.clickTimestamp;
      } else {
        output.isClicking = false;
        output.isGrabbing = false;
        output.isRightClicking = false;
        output.mlPose = undefined;
        output.poseProbabilities = undefined;
        output.mlGesture = undefined;
        output.mlProbabilities = undefined;
        output.scroll = undefined;
        output.clickTimestamp = 0;
      }

      this.outputArray.push(output);
    }

    return this.outputArray;
  }

  // Helper to get raw state if needed (for debug drawing etc)
  getHandState(id: string) {
    return this.handStates[id];
  }
}
