// Core geometric types
export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmark extends Point {
  visibility?: number;
}

export interface FaceLandmark extends Point {
  visibility?: number;
}

export interface PoseLandmark extends Point {
  visibility?: number;
}

export type Handedness = "Left" | "Right";

// Pipeline timing (ms)
export interface PipelineTiming {
  frameTimestamp: number;
  frameInterval: number;

  mediapipeMs: number;
  preFiltersMs: number;
  cursorMs: number;
  gestureMs: number;
  featureExtractionMs: number;
  gestureMLMs: number;
  renderMs: number;

  totalPipelineMs: number;
  frameBudgetMs: number;
  headroomMs: number;
  utilizationPercent: number;
}

export interface PipelineTimingHistory {
  current: PipelineTiming;
  avgLast10: PipelineTiming;
  maxLast10: PipelineTiming;
}

export const EMPTY_TIMING: PipelineTiming = {
  frameTimestamp: 0,
  frameInterval: 0,
  mediapipeMs: 0,
  preFiltersMs: 0,
  cursorMs: 0,
  gestureMs: 0,
  featureExtractionMs: 0,
  gestureMLMs: 0,
  renderMs: 0,
  totalPipelineMs: 0,
  frameBudgetMs: 33.33,
  headroomMs: 33.33,
  utilizationPercent: 0,
};

// Palm wheel control bindings
export type PalmWheelControlSlot =
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5";

/**
 * A palm wheel binding can be either:
 * - A simple action string (e.g., "recenter", "spotlight")
 * - A submenu definition with nested actions
 */
export interface PalmWheelSubmenu {
  type: "submenu";
  label: string;
  icon?: string;
  items: Record<string, PalmWheelBinding>;
}

export type PalmWheelBinding = string | PalmWheelSubmenu;

export type PalmWheelControlBindings = Record<
  PalmWheelControlSlot,
  PalmWheelBinding
>;
export type PalmWheelEnabled = { Left: boolean; Right: boolean };
export type PalmWheelAppBindings = Record<PalmWheelControlSlot, string>;
export type PalmWheelIconOverrides = Record<
  PalmWheelControlSlot,
  string | null
>;

export type GameVirtualControlPose =
  | "none"
  | "idle"
  | "thumb_index_pinch"
  | "thumb_middle_pinch"
  | "thumb_index_middle_pinch"
  | "thumb_ring_pinch"
  | "thumb_pinky_pinch"
  | "thumb_pinky_base";

export type GameVirtualThumbstickConfig = {
  enabled: boolean;
  hand: Handedness;
  pose: GameVirtualControlPose;
  activationInput?: GameVirtualThumbstickActivationInput;
  /** Optional per-stick sensitivity override. Falls back to shared thumbsticks.sensitivity. */
  sensitivity?: number;
  /** Optional per-stick direction override. Falls back to shared thumbsticks.directionSource. */
  directionSource?: GameVirtualThumbstickDirectionSource;
};

export type GameVirtualThumbstickActivationInput =
  | "ml_pose"
  | "index_middle_close"
  | "index_middle_ring_close"
  | "index_middle_ring_pinky_close";

export type GameVirtualThumbstickDirectionSource = "drag" | "index_pointing";
export type GameVirtualDPadDirectionSource = "drag" | "index_pointing";
export type GameVirtualDPadActivationMode = "clutch" | "toggle";
export type GameVirtualDPadActivationInput =
  | "ml_pose"
  | "heuristic_pinch"
  | "index_middle_close"
  | "index_middle_ring_close"
  | "index_middle_ring_pinky_close"
  | "hybrid";

export type GameVirtualDPadHybridFingerCloseInput =
  | "index_middle_close"
  | "index_middle_ring_close"
  | "index_middle_ring_pinky_close";

export type GameVirtualDPadConfig = {
  enabled: boolean;
  hand: Handedness;
  pose: GameVirtualControlPose;
  directionSource?: GameVirtualDPadDirectionSource;
  activationMode?: GameVirtualDPadActivationMode;
  activationInput?: GameVirtualDPadActivationInput;
  /** Finger-close gate used by Hybrid mode (defaults to index+middle). */
  hybridFingerCloseInput?: GameVirtualDPadHybridFingerCloseInput;
  pointPinchSinglePress?: boolean;
};

export type GameVirtualLeftNavigationMode = "left_stick" | "dpad";

export type GameVirtualLeftNavigationToggleConfig = {
  enabled: boolean;
  hand: Handedness;
  pose: GameVirtualControlPose;
  /** Active target after (re)enable/reset before the first toggle pose. */
  mode?: GameVirtualLeftNavigationMode;
};

export type GameVirtualFaceButtonsConfig = {
  enabled: boolean;
  hand: Handedness;
  poses: Record<"A" | "B" | "X" | "Y" | "L1" | "R1", GameVirtualControlPose>;
};

export type GameVirtualTapClickConfig = {
  enabled: boolean;
  hand: Handedness;
  pose: GameVirtualControlPose;
};

export interface GameVirtualControlsConfig {
  enabled: boolean;
  gameplayCursorEnabled: boolean;
  thumbsticks: {
    /** Shared response curve fallback (1.0 = baseline, lower = less sensitive). */
    sensitivity?: number;
    /** Shared direction fallback when per-stick directionSource is unset. */
    directionSource?: GameVirtualThumbstickDirectionSource;
    left: GameVirtualThumbstickConfig;
    right: GameVirtualThumbstickConfig;
  };
  dpad: GameVirtualDPadConfig;
  leftNavigationToggle?: GameVirtualLeftNavigationToggleConfig;
  faceButtons: GameVirtualFaceButtonsConfig;
  tapClick: GameVirtualTapClickConfig;
}

// Cursor style options
export type CursorStyle = "circle" | "arrow" | "crosshair";

// ML pose outputs (relabels model classes without semantic actions)
export type PoseName =
  | "idle"
  | "thumb_index_pinch"
  | "thumb_middle_pinch"
  | "thumb_ring_pinch"
  | "thumb_pinky_pinch"
  | "thumb_index_middle_pinch"
  | "thumb_pinky_base"
  | "thumb_index_press"
  | "thumb_middle_press"
  | "thumb_ring_press"
  | "thumb_pinky_press"
  | "thumb_press_down";

export type PoseProbabilities = Record<PoseName, number>;

export interface PoseThresholds {
  enterThreshold: number;
  exitThreshold: number;
  enterFrames: number;
  exitFrames: number;
}

export type PoseThresholdMap = Partial<
  Record<PoseName, Partial<PoseThresholds>>
>;

// Action mapping for pose taps/holds
export type PoseAction =
  | "left_click"
  | "right_click"
  | "scroll"
  | "drag"
  | "window_tile"
  | "spaces_nav"
  | "dictation";
export type PoseActionMap = Partial<Record<PoseName, PoseAction>>;

// Window tiling direction
export type WindowTileDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "fill"
  | null;

// Settings visibility system
export type SettingVisibility = "user" | "advanced" | "internal";

// Hand configuration
export interface HandConfig {
  maxHands: number;
  detectionConfidence: number;
  trackingConfidence: number;
  showConnections: boolean;
  showLandmarks: boolean;
  /** Show keyboard press threshold zones */
  showKeyboardThresholds: boolean;
  showCursor: boolean;
  /** Show click pulse animation when clicking */
  showClickFeedback: boolean;
  /** Play a subtle sound when clicking */
  playClickSound: boolean;
  /** Which system sound to play on click down */
  clickDownSoundName: string;
  /** Which system sound to play on click up */
  clickUpSoundName: string;
  /** Volume of click sound (0.0 to 1.0) */
  clickVolume: number;
  // Global audio (games + UI)
  audioMuted: boolean;
  audioMasterVolume: number;
  audioMusicVolume: number;
  audioSfxVolume: number;
  /** Enables the LAN mobile remote service in the desktop backend. */
  mobileRemoteEnabled: boolean;
  /** Which cursors to display: 'dominant' (active hand only) or 'both' */
  cursorDisplay: "dominant" | "both";
  /** Visual cursor style */
  cursorStyle: CursorStyle;
  /** Cursor size multiplier (1.0 = default) */
  cursorSize: number;
  // Movement
  lerpSpeed: number;
  enableLerp: boolean;
  lerpThreshold: number;
  enableSnap: boolean;
  pointerSensitivity: number;
  pointerAcceleration: number;
  /** Enable forward-pointing gate for cursor/control actions */
  enablePointingGate: boolean;
  /**
   * Forward-pointing gate for cursor control.
   * Uses normalized index direction Z (wrist -> index tip), where negative is toward camera.
   * Higher values are less strict (e.g. -0.05), lower values are more strict (e.g. -0.25).
   */
  pointingForwardZThreshold: number;
  // Distance Compensation
  enableDistanceCompensation: boolean;
  referencePalmSize: number;
  // Cursor smoothing (OneEuro filter)
  enableFilter: boolean;
  filterMinCutoff: number;
  filterBeta: number;
  // Gesture enables
  enableClick: boolean;
  enableRightClick: boolean;
  enableGrab: boolean;
  enableDictation: boolean;
  // Gesture hint toasts
  showClickGestureHint: boolean;
  showRightClickGestureHint: boolean;
  showGrabGestureHint: boolean;
  showScrollGestureHint: boolean;
  showZoomGestureHint: boolean;
  showWindowTileGestureHint: boolean;
  showSpacesNavGestureHint: boolean;
  // Click
  clickJoint: number;
  clickDebounceMs: number;
  enableClickDebounce: boolean;
  // Scroll
  enableScroll: boolean;
  scrollSpeed: number;
  enableAxisLock: boolean;
  axisLockThreshold: number;
  // Zoom (two-hand pinch gesture)
  enableZoom: boolean;
  zoomSpeed: number;
  // Landmark Smoothing
  enableLandmarkSmoothing: boolean;
  landmarkMinCutoff: number;
  landmarkBeta: number;
  landmarkSmoothingExcludeJoints: number[];
  // ML Classifier
  enableMLClassifier: boolean;
  /**
   * Gesture/pose model used by the engine.
   * - "airmouse-4.3-onnx" (TCN+ONNX+z-depth, +thumb-index) 97.73% accuracy, ~1-2ms - default, recommended
   * - "airmouse-4.3" (TCN+JS+z-depth, +thumb-index) 97.73% accuracy, ~10ms
   * - "airmouse-4.1-onnx" (TCN+ONNX+z-depth) 97.64% accuracy, ~1-2ms
   * - "airmouse-4.1" (TCN+JS+z-depth) 97.64% accuracy, ~10ms
   */
  gestureModel:
    | "airmouse-4.1-onnx"
    | "airmouse-4.1"
    | "airmouse-4.3-onnx"
    | "airmouse-4.3"
    // Legacy values kept for backwards compatibility with persisted settings.
    | "airmouse-4.2-onnx"
    | "airmouse-4.2";
  // Hand selection
  clickHand: "Right" | "Left" | "Both";
  cursorHand: "Right" | "Left" | "Both";
  // Controls
  palmWheelEnabled: PalmWheelEnabled;
  palmWheelBindings: PalmWheelControlBindings;
  palmWheelAppBindings: PalmWheelAppBindings;
  palmWheelIconOverrides: PalmWheelIconOverrides;
  palmWheelPalmFacingDotThreshold: number;
  palmWheelPressUpThreshold: number;
  palmWheelOpenPalmHysteresis: number;
  palmWheelOpenPalmGraceMs: number;
  palmWheelFixed: boolean;
  gameVirtualControls: GameVirtualControlsConfig;
  // Desktop-specific: Tracking warning toasts
  enableTrackingWarnings: boolean;
  // Desktop-specific: Update available toasts
  enableUpdateToasts: boolean;
  // Desktop-specific: Automatically check for updates
  enableAutoUpdateChecks: boolean;
  // Desktop-specific: Auto update check interval (hours)
  autoUpdateCheckIntervalHours: number;
  // Desktop-specific: Automatically download/install updates
  enableAutoInstallUpdates: boolean;
  // Desktop/web analytics (anonymous product telemetry)
  enableAnonymousAnalytics: boolean;
  // Desktop-specific: Mouse update rate
  mouseUpdateRateHz: number;
  // Camera settings
  cameraAspectRatio: "auto" | "16:9" | "4:3" | "1:1" | "9:16";
  cameraQuality: number; // 0 = auto, or vertical pixels (480, 720, 1080, 1440, 2160)
  cameraDeviceId: string;
  cameraFrameRate: number;
  // Camera view window position (desktop only)
  cameraViewPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  cameraViewSize: "small" | "medium" | "large";
  cameraViewOpacity: number;
  cameraViewHoverOpacity: number;
  showGameHud: boolean;
  showCameraHud: boolean;
  // Hand tracking system
  handTrackingFramework: "mediapipe";
  handTrackingDelegate: "GPU" | "CPU";
  // Debug
  showTimingPanel: boolean;
  logMLPredictions: boolean;
  // Advanced: Pose detection thresholds (per-pose hysteresis)
  poseThresholds?: PoseThresholdMap;
  // Pose hold timing (tap vs hold resolver)
  poseHoldThresholdMs: number;
  // Motion distance (px) to distinguish hold behaviors.
  // For thumb_ring_pinch: < threshold = right-click (stillness), >= threshold = scroll (movement)
  // For other poses: promotes tap -> hold when both actions are mapped
  poseHoldMotionThresholdPx: number;
  // Optional: allow thumb-middle to behave as press/hold (default false)
  enableClickHold: boolean;
  // Pose -> action mapping (tap/hold)
  poseTapActions: PoseActionMap;
  poseHoldActions: PoseActionMap;
  // Advanced: Scroll physics
  scrollDeadzone: number;
  scrollInertiaFriction: number;
  scrollMinInertiaSpeed: number;
  // Window Tiling (thumb-pinky pinch + slide)
  enableWindowTile: boolean;
  animateWindowTile: boolean;
  windowTileSensitivity: number; // Pixels of movement to trigger
  // Spaces Navigation (thumb-pinky-base + slide) - 4-finger swipe equivalent
  enableSpacesNav: boolean;
  spacesNavSensitivity: number; // Pixels of movement to trigger
  invertSpacesNav: boolean; // "Natural" scrolling direction (swipe left -> go right)

  // AirKeyboard Heuristic Model
  keyboardModel: "plane" | "cylinder"; // "plane" = AirKeyboard-3 (Archived), "cylinder" = AirKeyboard-4 (Default)
}

/**
 * Default configuration - the canonical defaults for all Airpoint apps.
 * All apps should use this as their base and override only what's needed.
 */
export const DEFAULT_CONFIG: HandConfig = {
  maxHands: 2,
  detectionConfidence: 0.5,
  trackingConfidence: 0.5,
  showConnections: true,
  showLandmarks: true,
  showKeyboardThresholds: false,
  showCursor: true,
  showClickFeedback: true,
  playClickSound: true,
  clickDownSoundName: "click_down",
  clickUpSoundName: "click_up",
  clickVolume: 0.5,
  audioMuted: false,
  audioMasterVolume: 1.0,
  audioMusicVolume: 0.7,
  audioSfxVolume: 0.8,
  mobileRemoteEnabled: false,
  cursorDisplay: "dominant",
  cursorStyle: "arrow",
  cursorSize: 1.0,
  // Movement modifiers
  lerpSpeed: 55.0, // High = responsive, fills gaps between 30Hz frames
  enableLerp: true,
  lerpThreshold: 2.0,
  enableSnap: true,
  pointerSensitivity: 2.5,
  pointerAcceleration: 1.5,
  enablePointingGate: true,
  // Forward-pointing gate (higher is less strict, lower is stricter)
  pointingForwardZThreshold: -0.15,
  // Distance Compensation
  enableDistanceCompensation: true,
  referencePalmSize: 0.1,
  // Cursor smoothing
  enableFilter: true,
  filterMinCutoff: 1.0,
  filterBeta: 0.01,
  // Gesture enables
  enableClick: true,
  enableRightClick: true,
  enableGrab: true,
  enableDictation: true,
  // Gesture hint toasts
  showClickGestureHint: false,
  showRightClickGestureHint: true,
  showGrabGestureHint: true,
  showScrollGestureHint: true,
  showZoomGestureHint: true,
  showWindowTileGestureHint: true,
  showSpacesNavGestureHint: true,
  // Click detection
  clickJoint: 12,
  clickDebounceMs: 200,
  enableClickDebounce: true,
  // Scroll
  enableScroll: true,
  scrollSpeed: 1.0,
  enableAxisLock: true,
  axisLockThreshold: 2.0,
  // Zoom (two-hand pinch gesture)
  enableZoom: true,
  zoomSpeed: 0.001,
  // Landmark Smoothing (OneEuro filter on raw landmarks)
  enableLandmarkSmoothing: true,
  landmarkMinCutoff: 2.0, // Balanced smoothing
  landmarkBeta: 45.0, // Responsive but not too twitchy
  landmarkSmoothingExcludeJoints: [],
  // ML Classifier
  enableMLClassifier: true, // Use trained ML model for pinch detection
  gestureModel: "airmouse-4.3-onnx",
  keyboardModel: "cylinder", // Default to AirKeyboard-4 (Palm Cylinder)
  // Hand selection
  clickHand: "Right", // Only right hand triggers clicks by default
  cursorHand: "Right", // Only right hand controls cursor by default
  // Controls
  palmWheelEnabled: {
    Left: true,
    Right: true,
  },
  palmWheelBindings: {
    R1: {
      type: "submenu",
      label: "Tracking",
      icon: "pointer",
      items: {
        "1": "tracking_toggle",
        "2": "recenter",
        "3": "show_main_window",
        "4": "show_camera_window",
        "5": "stop_tracking",
      },
    },
    R2: "mission_control",
    R3: "spotlight",
    R4: "dictation",
    R5: {
      type: "submenu",
      label: "Player",
      icon: "play",
      items: {
        "1": "nav_back",
        "2": "media_prev",
        "3": "media_play_pause",
        "4": "media_next",
        "5": {
          type: "submenu",
          label: "Volume",
          icon: "volume-2",
          items: {
            "1": "submenu_back",
            "2": "submenu_confirm",
            "3": "unassigned",
            "4": "unassigned",
            "5": "unassigned",
          },
        },
      },
    },
    L1: "siri_listen",
    L2: {
      type: "submenu",
      label: "Window",
      icon: "app-window",
      items: {
        "1": "window_hide",
        "2": "window_fullscreen",
        "3": "window_minimize",
        "4": "window_close",
        "5": "submenu_back",
      },
    },
    L3: {
      type: "submenu",
      label: "Edit",
      icon: "pencil",
      items: {
        "1": "edit_paste",
        "2": "edit_copy",
        "3": "edit_cut",
        "4": "edit_redo",
        "5": "edit_undo",
      },
    },
    L4: {
      type: "submenu",
      label: "Apps",
      icon: "grid-2x2",
      items: {
        "1": "open_app:/System/Applications/Siri.app",
        "2": "open_app:/System/Library/CoreServices/Finder.app",
        "3": "open_app:/Applications/Safari.app",
        "4": "open_app:/System/Applications/Mail.app",
        "5": "submenu_back",
      },
    },
    L5: "keyboard",
  },
  palmWheelAppBindings: {
    L1: "/System/Applications/Siri.app",
    L2: "/System/Library/CoreServices/Finder.app",
    L3: "/Applications/Safari.app",
    L4: "/System/Applications/Mail.app",
    L5: "/Applications/ChatGPT.app",
    R1: "unassigned",
    R2: "unassigned",
    R3: "unassigned",
    R4: "unassigned",
    R5: "unassigned",
  },
  palmWheelIconOverrides: {
    L1: "mic",
    L2: "app-window",
    L3: "pencil",
    L4: "grid-2x2",
    L5: null,
    R1: null,
    R2: null,
    R3: null,
    R4: null,
    R5: null,
  },
  palmWheelPalmFacingDotThreshold: 0.5,
  palmWheelPressUpThreshold: 1.8,
  palmWheelOpenPalmHysteresis: 0.05,
  palmWheelOpenPalmGraceMs: 100,
  palmWheelFixed: true,
  gameVirtualControls: {
    enabled: false,
    gameplayCursorEnabled: true,
    thumbsticks: {
      sensitivity: 0.5,
      directionSource: "drag",
      left: {
        enabled: false,
        hand: "Left",
        pose: "thumb_middle_pinch",
        activationInput: "ml_pose",
        sensitivity: 0.5,
        directionSource: "drag",
      },
      right: {
        enabled: false,
        hand: "Right",
        pose: "thumb_middle_pinch",
        activationInput: "ml_pose",
        sensitivity: 0.5,
        directionSource: "drag",
      },
    },
    dpad: {
      enabled: false,
      hand: "Left",
      pose: "thumb_middle_pinch",
      directionSource: "index_pointing",
      activationMode: "clutch",
      activationInput: "hybrid",
      hybridFingerCloseInput: "index_middle_close",
      pointPinchSinglePress: true,
    },
    leftNavigationToggle: {
      enabled: false,
      hand: "Left",
      pose: "thumb_pinky_base",
      mode: "left_stick",
    },
    faceButtons: {
      enabled: false,
      hand: "Right",
      poses: {
        A: "thumb_index_pinch",
        B: "thumb_middle_pinch",
        X: "thumb_ring_pinch",
        Y: "thumb_pinky_pinch",
        L1: "none",
        R1: "thumb_pinky_base",
      },
    },
    tapClick: {
      enabled: false,
      hand: "Right",
      pose: "thumb_middle_pinch",
    },
  },
  enableTrackingWarnings: true,
  enableUpdateToasts: true,
  enableAutoUpdateChecks: true,
  autoUpdateCheckIntervalHours: 24,
  enableAutoInstallUpdates: true,
  enableAnonymousAnalytics: true,
  // Desktop-specific: Mouse update rate (higher = smoother but more CPU)
  mouseUpdateRateHz: 60, // 60Hz baseline
  // Camera settings - "auto" = highest FOV detected from camera capabilities
  cameraAspectRatio: "1:1",
  cameraQuality: 0, // 0 = auto
  cameraDeviceId: "",
  cameraFrameRate: 0,
  cameraViewPosition: "bottom-right",
  cameraViewSize: "medium",
  cameraViewOpacity: 0.5,
  cameraViewHoverOpacity: 1.0,
  showGameHud: true,
  showCameraHud: true,
  // Hand tracking system
  handTrackingFramework: "mediapipe",
  handTrackingDelegate: "GPU",
  // Debug
  showTimingPanel: true,
  logMLPredictions: false,
  // Advanced: Pose detection thresholds
  poseThresholds: {
    thumb_index_pinch: {
      enterThreshold: 0.5,
      exitThreshold: 0.25,
      enterFrames: 1,
      exitFrames: 2,
    },
    thumb_middle_pinch: {
      enterThreshold: 0.75,
      exitThreshold: 0.25,
      enterFrames: 2,
      exitFrames: 2,
    },
    thumb_ring_pinch: {
      enterThreshold: 0.75,
      exitThreshold: 0.45,
      enterFrames: 2,
      exitFrames: 5,
    },
    thumb_index_middle_pinch: {
      enterThreshold: 0.75,
      exitThreshold: 0.45,
      enterFrames: 2,
      exitFrames: 4,
    },
    thumb_pinky_pinch: {
      enterThreshold: 0.75,
      exitThreshold: 0.3,
      enterFrames: 2,
      exitFrames: 2,
    },
    thumb_pinky_base: {
      enterThreshold: 0.75,
      exitThreshold: 0.3,
      enterFrames: 2,
      exitFrames: 2,
    },
  },
  poseHoldThresholdMs: 180,
  poseHoldMotionThresholdPx: 15, // Allow natural hand tremor while still detecting intentional scroll movement
  enableClickHold: false,
  poseTapActions: {
    thumb_middle_pinch: "left_click",
    // thumb_ring_pinch removed - now uses stillness-based hold for right-click
  },
  poseHoldActions: {
    thumb_ring_pinch: "scroll", // Movement = scroll, stillness = right-click (dual behavior)
    thumb_index_middle_pinch: "drag",
    thumb_index_pinch: "dictation", // Hold to dictate, release stops
    thumb_pinky_pinch: "window_tile",
    thumb_pinky_base: "spaces_nav",
  },
  // Advanced: Scroll physics
  scrollDeadzone: 1,
  scrollInertiaFriction: 0.95,
  scrollMinInertiaSpeed: 5,
  // Window Tiling
  enableWindowTile: true,
  animateWindowTile: true,
  windowTileSensitivity: 20, // 20px movement to trigger
  // Spaces Navigation (4-finger swipe equivalent)
  enableSpacesNav: true,
  spacesNavSensitivity: 20, // 20px movement to trigger
  invertSpacesNav: true, // "Natural" scrolling direction (swipe left -> go right)
};

// Engine outputs
export interface CursorOutput {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  fingerSpeed: number;
  rotation: { pitch: number; yaw: number; roll: number } | null;
  isPointing: boolean;
  handednessScore?: number;
}

export interface PoseOutput {
  id: string;
  label: string;
  pose?: PoseName;
  /** Debounced pose state from the pose state machine (enters/exits by thresholds). */
  activePose?: PoseName;
  /** True when a click pose (thumb-middle pinch) starts - use for click down sound */
  isPinching: boolean;
  isClicking: boolean;
  isRightClicking: boolean;
  isGrabbing: boolean;
  isScrolling: boolean;
  /** True when dictation hold is active (thumb-index pinch) */
  isDictating?: boolean;
  /** True when dictation hold just ended (release pinch) */
  isDictationEnding?: boolean;
  poseProbabilities?: PoseProbabilities;
  scroll?: { x: number; y: number };
  /** macOS scroll phase: 0=none, 1=began, 2=changed, 4=ended */
  scrollPhase?: number;
  /** macOS momentum phase: 0=none, 1=begin, 2=continue, 3=end */
  momentumPhase?: number;
  clickTimestamp: number;
  // Window tiling (thumb-pinky pinch)
  isWindowTiling?: boolean;
  windowTileDirection?: WindowTileDirection;
  // Spaces navigation (thumb-pinky-base) - 4-finger swipe equivalent
  isSpacesNav?: boolean;
  spacesNavDirection?: WindowTileDirection;
}

/**
 * @deprecated Use PoseOutput instead.
 */
export type GestureOutput = PoseOutput;

/**
 * @deprecated Use CursorOutput + GestureOutput instead.
 */
export interface HandOutput {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  isClicking: boolean;
  // Multi-gesture ML outputs (airmouse-*). Optional for backwards compatibility.
  isRightClicking?: boolean;
  isGrabbing?: boolean;
  isDictating?: boolean;
  isDictationEnding?: boolean;
  mlPose?: PoseName;
  poseProbabilities?: PoseProbabilities;
  /** @deprecated Use mlPose instead. */
  mlGesture?: PoseName;
  /** @deprecated Use poseProbabilities instead. */
  mlProbabilities?: PoseProbabilities;
  isPointing: boolean;
  speed: number;
  fingerSpeed: number;
  rotation: { pitch: number; yaw: number; roll: number } | null;
  scroll?: { x: number; y: number };
  clickTimestamp: number;
  handednessScore?: number;
}

// Cross-platform event types (for SDK/native consumers)
export type AirpointEventType =
  | "move"
  | "click"
  | "release"
  | "scroll"
  | "gesture";

export interface AirpointEvent {
  type: AirpointEventType;
  timestamp: number;
  hand: "Left" | "Right";
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  confidence?: number;
}

export interface AirpointMoveEvent extends AirpointEvent {
  type: "move";
  speed: number;
}

export interface AirpointClickEvent extends AirpointEvent {
  type: "click" | "release";
}

export interface AirpointScrollEvent extends AirpointEvent {
  type: "scroll";
  deltaX: number;
  deltaY: number;
}

export interface AirpointPoseEvent extends AirpointEvent {
  type: "gesture";
  pose: PoseName;
}

/**
 * @deprecated Use AirpointPoseEvent instead.
 */
export type AirpointGestureEvent = AirpointPoseEvent;

// Desktop tracking route + control stream protocol
export type TrackingRouteMode = "os_cursor" | "game_controls";

export interface TrackingRouteSnapshot {
  mode: TrackingRouteMode;
  targetWindowLabel?: string | null;
  configOverrides?: Partial<HandConfig>;
}

export interface DesktopControlHandState {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  speed: number;
  fingerSpeed: number;
  confidence?: number;
  pose?: PoseName;
  poseProbabilities?: PoseProbabilities;
  // Optional index-finger pointing vector derived from raw landmarks.
  // x: positive means pointing right, negative left
  // y: positive means pointing down, negative up
  indexPointingX?: number;
  indexPointingY?: number;
  // Optional full hand landmarks for downstream gesture heuristics.
  rawLandmarks?: HandLandmark[];
  isClicking: boolean;
  isRightClicking: boolean;
  isGrabbing: boolean;
  isScrolling: boolean;
}

export type DesktopControlTransition =
  | { type: "hand_found"; hand: Handedness; timestamp: number }
  | { type: "hand_lost"; hand: Handedness; timestamp: number }
  | {
      type: "pose_enter";
      hand: Handedness;
      pose: PoseName;
      timestamp: number;
    }
  | {
      type: "pose_exit";
      hand: Handedness;
      pose: PoseName;
      timestamp: number;
    };

export interface DesktopControlPalmWheelState {
  handLabel: Handedness;
  cursorX?: number;
  cursorY?: number;
  palmWheel: unknown | null;
}

export interface DesktopControlFrameV1 {
  protocol: "airpoint.desktop.controls.v1";
  frame: number;
  timestamp: number;
  hands: Partial<Record<Handedness, DesktopControlHandState>>;
  transitions: DesktopControlTransition[];
  palmWheels: DesktopControlPalmWheelState[];
}

// MediaPipe result adapters
export interface HandednessInfo {
  label: string;
  score: number;
}

export interface AdaptedHandResult {
  multiHandLandmarks: HandLandmark[][];
  multiHandWorldLandmarks: HandLandmark[][];
  multiHandedness: HandednessInfo[];
}

// Tracker options
export interface HandTrackerOptions {
  maxHands?: number;
  detectionConfidence?: number;
  trackingConfidence?: number;
  delegate?: "CPU" | "GPU";
  wasmPath?: string;
  modelPath?: string;
}

export interface HandTrackerResult {
  landmarks: HandLandmark[][];
  worldLandmarks: HandLandmark[][];
  handedness: HandednessInfo[];
  timestamp: number;
}

export interface TrackerClassificationCategory {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

export interface TrackerClassificationGroup {
  categories: TrackerClassificationCategory[];
  headIndex: number;
  headName: string;
}

export interface TrackerTransformationMatrix {
  rows: number;
  columns: number;
  data: number[];
}

export interface PoseSegmentationMask {
  width: number;
  height: number;
  hasUint8Array(): boolean;
  hasFloat32Array(): boolean;
  getAsUint8Array(): Uint8Array;
  getAsFloat32Array(): Float32Array;
  clone(): PoseSegmentationMask;
  close(): void;
}

export interface FaceTrackerOptions {
  numFaces?: number;
  detectionConfidence?: number;
  presenceConfidence?: number;
  trackingConfidence?: number;
  outputBlendshapes?: boolean;
  outputTransformationMatrices?: boolean;
  delegate?: "CPU" | "GPU";
  wasmPath?: string;
  modelPath?: string;
}

export interface FaceTrackerResult {
  landmarks: FaceLandmark[][];
  blendshapes: TrackerClassificationGroup[];
  transformationMatrices: TrackerTransformationMatrix[];
  timestamp: number;
}

export interface PoseTrackerOptions {
  numPoses?: number;
  detectionConfidence?: number;
  presenceConfidence?: number;
  trackingConfidence?: number;
  outputSegmentationMasks?: boolean;
  delegate?: "CPU" | "GPU";
  wasmPath?: string;
  modelPath?: string;
}

export interface PoseTrackerResult {
  landmarks: PoseLandmark[][];
  worldLandmarks: PoseLandmark[][];
  segmentationMasks: PoseSegmentationMask[];
  timestamp: number;
}

// App-level Frame Data types (used in InfoPanel)
export interface AppHandOutput {
  handLabel: "Left" | "Right";
  isPinching?: boolean;
  isClicking: boolean;
  isRightClicking?: boolean;
  isGrabbing?: boolean;
  isScrolling?: boolean;
  clickTimestamp?: number;
  cursorX: number;
  cursorY: number;
  cursorZ: number;
  rotation?: { pitch: number; yaw: number; roll: number };
  fingerSpeed?: number;
  cursorSpeed?: number;
  pinchDistance?: number;
  handednessScore?: number;
}

export interface AppGesturePrediction {
  pose: PoseName;
  poseProbabilities: PoseProbabilities;
  model?: string;
  handLabel?: "Left" | "Right";
}

export interface AppTrackingWarning {
  type: "warning" | "error";
  message: string;
}

export type AppGesturePredictions = Partial<
  Record<"Left" | "Right", AppGesturePrediction>
>;

export interface FrameData {
  handsCount: number;
  maxHands?: number;
  renderFps: number;
  trackingFps: number;
  cameraFps: number;
  inferenceMs: number;
  outputs: AppHandOutput[];
  timing: PipelineTiming;
  delegate?: string;
  gesturePrediction: AppGesturePrediction | null;
  gesturePredictions?: AppGesturePredictions;
  trackingWarning: AppTrackingWarning | null;
  screenInfo?: string;
  showTimingPanel?: boolean;
  cameraWidth?: number;
  cameraHeight?: number;
  cameraSource?: string;
  screenWidth?: number;
  screenHeight?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  gestureModel?: string;
}

export interface SystemVitals {
  cpu_usage: number;
  ram_total: number;
  ram_used: number;
  temperature: number | null;
}

// Re-export config utilities
export {
  STORAGE_KEY,
  GAME_STORAGE_KEY_PREFIX,
  DEFAULT_GAME_SCOPED_KEYS,
  type ScopedConfigOptions,
  buildConfig,
  normalizeConfig,
  loadConfig,
  saveConfig,
  getUserOverrides,
  getGameUserOverrides,
  getGameStorageKey,
  resetConfig,
  resetGameConfig,
  resetAllGameConfigs,
} from "./config-core";
