import { HandConfig } from "./types";
import { CursorKinematics } from "./CursorKinematics";
import { PoseStateMachine } from "./PoseStateMachine";
import { ScrollController } from "./ScrollController";
import { WindowTileController } from "./WindowTileController";
import { SpacesNavController } from "./SpacesNavController";

export class HandState {
  id: "Left" | "Right";
  label: string; // 'Left' or 'Right'
  color: string; // '#2dd4bf' (teal-400) or '#60a5fa' (blue-400)

  // Modules
  kinematics: CursorKinematics;
  poseState: PoseStateMachine;
  scrollState: ScrollController;
  windowTileState: WindowTileController;
  spacesNavState: SpacesNavController;

  // High-Level Action State (derived or managed by Engine based on events)
  isPinching: boolean = false; // True when click pose starts (pinch begins)
  isClicking: boolean = false;
  isRightClicking: boolean = false;
  isGrabbing: boolean = false; // "Drag" action active
  isDictating: boolean = false; // Dictation active (thumb-index pinch hold)
  isDictationEnding: boolean = false; // Dictation hold just ended

  // Click Animation State
  clickAnimation: number = 0;
  lastClickTime: number = 0;

  // Rotation (Calculated per frame)
  rotation: { pitch: number; yaw: number; roll: number } | null = null;

  // Palm Wheel State
  palmWheelWasActive: boolean = false;
  palmWheelOffset: { x: number; y: number } = { x: 0, y: 0 };

  // Inter-module State (Shared between Kinematics output and Gesture processing)
  cursorDelta: { x: number; y: number } = { x: 0, y: 0 };

  constructor(
    id: "Left" | "Right",
    label: string,
    color: string,
    config: HandConfig,
  ) {
    this.id = id;
    this.label = label;
    this.color = color;

    this.kinematics = new CursorKinematics(config);
    this.poseState = new PoseStateMachine();
    this.scrollState = new ScrollController();
    this.windowTileState = new WindowTileController();
    this.spacesNavState = new SpacesNavController();
  }

  updateConfig(config: HandConfig) {
    this.kinematics.updateConfig(config);
    // PoseStateMachine and ScrollController receive config processing-time
    // but if they had config-dependent reset logic:
    // this.scrollState.updateConfig(config); // (ScrollController doesn't have/need this yet)
  }

  reset() {
    this.kinematics.reset();
    this.poseState.reset();
    this.scrollState.reset();
    this.windowTileState.reset();
    this.spacesNavState.reset();

    this.isPinching = false;
    this.isClicking = false;
    this.isRightClicking = false;
    this.isGrabbing = false;
    this.isDictating = false;
    this.isDictationEnding = false;
    this.rotation = null;
    this.palmWheelWasActive = false;
    this.palmWheelOffset = { x: 0, y: 0 };
  }

  recenter(centerX: number, centerY: number) {
    this.kinematics.setCursorPosition(centerX, centerY);
    // Reset other states
    this.poseState.reset();
    this.scrollState.reset();
    this.isClicking = false;
    this.isRightClicking = false;
    this.isGrabbing = false;
    this.isDictating = false;
    this.isDictationEnding = false;
  }

  anchor(x: number, y: number) {
    this.kinematics.setCursorPosition(x, y);
    // Reset gesture states
    this.poseState.reset();
    this.scrollState.reset();
    this.isClicking = false;
    this.isRightClicking = false;
    this.isGrabbing = false;
    this.isDictating = false;
    this.isDictationEnding = false;
    this.palmWheelWasActive = false;
    this.palmWheelOffset = { x: 0, y: 0 };
    this.cursorDelta = { x: 0, y: 0 };
  }
}
