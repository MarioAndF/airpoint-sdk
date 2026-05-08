import { HandLandmark } from "./types";

import { calculateRadialHeuristic, DEFAULT_RADIAL_CONFIG } from "./AirKeyboardRadial";

/**
 * Finger identifiers for Palm Wheel selection
 */
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";

/**
 * State of each finger (true = up/extended, false = down/pressed)
 */
export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/**
 * Palm Wheel action definition - abstract so any action can be plugged in
 * Can be a regular action or a submenu that opens nested actions
 */
export interface PalmWheelAction {
  id: string;
  label: string;
  icon?: string; // Lucide icon name or emoji
  isSubmenu?: boolean; // True if this opens a submenu
  onSelect: () => void;
}

/**
 * Palm Wheel slot configuration - maps fingers to actions
 */
export interface PalmWheelSlot {
  finger: FingerName;
  action: PalmWheelAction | null;
}

/**
 * Palm Wheel state
 */
export type PalmWheelState =
  | "inactive" // Not showing
  | "activating" // Open palm detected, waiting for hold time
  | "active" // Wheel is showing, waiting for finger press
  | "confirmed"; // Action fired, brief visual confirmation

/**
 * Normalized fingertip positions (0-1 range, camera coordinates)
 */
export interface FingerPositions {
  thumb: { x: number; y: number };
  index: { x: number; y: number };
  middle: { x: number; y: number };
  ring: { x: number; y: number };
  pinky: { x: number; y: number };
  palmCenter: { x: number; y: number };
}

/**
 * Palm Wheel output for rendering
 */
export interface PalmWheelOutput {
  state: PalmWheelState;
  fingerState: FingerState; // true = up, false = pressed down
  fingerPositions: FingerPositions | null;
  progress: number; // 0-1 activation progress
  selectedFinger: FingerName | null;
  selectionProgress: number; // 0-1, always 1 when confirmed
  slots: PalmWheelSlot[];
  /** Current submenu path (empty = root level) */
  menuPath: string[];
  /** Label of current submenu (null = root level) */
  menuLabel: string | null;
  /** Icon of current submenu (null = root level) */
  menuIcon: string | null;
  /** Audio event trigger */
  pressEvent?: "down" | "up" | null;
}

/**
 * Configuration for Palm Wheel detection
 */
export interface PalmWheelConfig {
  enabled: boolean;
  activationHoldMs: number; // Time to hold open palm to activate
  pressDownThreshold: number; // Normalized distance below which finger is "pressed"
  pressUpThreshold: number; // Normalized distance above which finger is "released"
  palmFacingDotThreshold: number; // How much the palm faces the camera (0-1)
  palmFacingDotHysteresis: number; // Hysteresis applied to palm-facing dot (0-1)
  openPalmGraceMs: number; // Allowed time to keep activating if open palm briefly drops
  confirmationHoldMs: number; // Time to keep confirmed state visible
  confirmationGraceMs: number; // Allowed time to keep wheel open after confirm if palm briefly drops
  cooldownMs: number; // Cooldown after action before can activate again
}

export const DEFAULT_PALM_WHEEL_CONFIG: PalmWheelConfig = {
  enabled: true,
  activationHoldMs: 200,
  pressDownThreshold: 0.95, // Normalized to Cylinder Radius (1.0 = on surface)
  pressUpThreshold: 1.1, // Hysteresis (1.1 = 10% outside)
  palmFacingDotThreshold: 0.5,
  palmFacingDotHysteresis: 0.05,
  openPalmGraceMs: 100,
  confirmationHoldMs: 200,
  confirmationGraceMs: 200,
  cooldownMs: 200,
};

/**
 * Detects open palm state and finger press/release for Palm Wheel selection.
 *
 * Simple button model:
 * - Finger down (distance shrinks below threshold) = pressed, show feedback
 * - Finger up (distance grows above threshold) = fire action
 */
export class PalmWheelDetector {
  private config: PalmWheelConfig;
  private slots: PalmWheelSlot[];

  // State tracking
  private state: PalmWheelState = "inactive";
  private activationStartTime: number | null = null;
  private selectedFinger: FingerName | null = null;
  private lastActionTime: number = 0;
  private confirmationStartTime: number | null = null;
  private openPalmStable: boolean = false;
  private lastOpenPalmTime: number | null = null;

  // Per-finger pressed state (true = currently pressed down)
  private fingerPressed: Record<FingerName, boolean> = {
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
  };

  // Submenu navigation state
  private menuPath: string[] = [];
  private menuLabel: string | null = null;
  private menuIcon: string | null = null;

  // Callback to notify when submenu changes (so parent can rebuild slots)
  private onSubmenuChange:
    | ((path: string[], label: string | null) => void)
    | null = null;

  // Pre-allocated output object
  private output: PalmWheelOutput;

  constructor(config: Partial<PalmWheelConfig> = {}) {
    this.config = { ...DEFAULT_PALM_WHEEL_CONFIG, ...config };

    this.slots = [
      { finger: "thumb", action: null },
      { finger: "index", action: null },
      { finger: "middle", action: null },
      { finger: "ring", action: null },
      { finger: "pinky", action: null },
    ];

    this.output = {
      state: "inactive",
      fingerState: {
        thumb: true,
        index: true,
        middle: true,
        ring: true,
        pinky: true,
      },
      fingerPositions: null,
      progress: 0,
      selectedFinger: null,
      selectionProgress: 0,
      slots: this.slots,
      menuPath: [],
      menuLabel: null,
      menuIcon: null,
      pressEvent: null,
    };
  }

  /**
   * Set callback for submenu navigation changes
   */
  setOnSubmenuChange(
    callback: ((path: string[], label: string | null) => void) | null,
  ): void {
    this.onSubmenuChange = callback;
  }

  /**
   * Navigate into a submenu
   */
  enterSubmenu(
    submenuId: string,
    submenuLabel: string,
    submenuIcon?: string,
  ): void {
    this.menuPath.push(submenuId);
    this.menuLabel = submenuLabel;
    this.menuIcon = submenuIcon ?? null;
    this.output.menuPath = [...this.menuPath];
    this.output.menuLabel = this.menuLabel;
    this.output.menuIcon = this.menuIcon;
    this.onSubmenuChange?.(this.menuPath, this.menuLabel);
  }

  /**
   * Navigate back to parent menu (or root)
   */
  exitSubmenu(): void {
    if (this.menuPath.length > 0) {
      this.menuPath.pop();
      // If we're back at root, clear the label and icon
      this.menuLabel = this.menuPath.length > 0 ? null : null;
      this.menuIcon = this.menuPath.length > 0 ? null : null;
      this.output.menuPath = [...this.menuPath];
      this.output.menuLabel = this.menuLabel;
      this.output.menuIcon = this.menuIcon;
      this.onSubmenuChange?.(this.menuPath, this.menuLabel);
    }
  }

  /**
   * Reset to root menu level (exit all submenus)
   */
  resetToRoot(): void {
    this.menuPath = [];
    this.menuLabel = null;
    this.menuIcon = null;
    this.output.menuPath = [];
    this.output.menuLabel = null;
    this.output.menuIcon = null;
    this.onSubmenuChange?.(this.menuPath, this.menuLabel);
  }

  /**
   * Get current menu path
   */
  getMenuPath(): string[] {
    return [...this.menuPath];
  }

  /**
   * Check if currently in a submenu
   */
  isInSubmenu(): boolean {
    return this.menuPath.length > 0;
  }

  /**
   * Set the action for a specific finger slot
   */
  setSlotAction(finger: FingerName, action: PalmWheelAction | null): void {
    const slot = this.slots.find((s) => s.finger === finger);
    if (slot) {
      slot.action = action;
    }
  }

  /**
   * Set all slot actions at once
   */
  setSlots(actions: Partial<Record<FingerName, PalmWheelAction | null>>): void {
    for (const [finger, action] of Object.entries(actions)) {
      this.setSlotAction(finger as FingerName, action ?? null);
    }
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<PalmWheelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Compute normalized finger distances (Radial Heuristic)
   * Returns: Distance from Palm Cylinder Axis / Cylinder Radius
   * < 1.0 = Inside Cylinder (Pressed)
   * > 1.0 = Outside Cylinder (Released)
   */
  private computeFingerDistances(
    landmarks: HandLandmark[],
  ): Record<FingerName, number> {
    const heuristic = calculateRadialHeuristic(landmarks, DEFAULT_RADIAL_CONFIG);
    const radius = heuristic.radius;

    if (radius === 0) {
      return { thumb: 2, index: 2, middle: 2, ring: 2, pinky: 2 };
    }

    return {
      thumb: heuristic.fingers.thumb.dist / radius,
      index: heuristic.fingers.index.dist / radius,
      middle: heuristic.fingers.middle.dist / radius,
      ring: heuristic.fingers.ring.dist / radius,
      pinky: heuristic.fingers.pinky.dist / radius,
    };
  }

  /**
   * Check if all fingers are extended (for open palm detection)
   */
  private allFingersUp(distances: Record<FingerName, number>): boolean {
    const threshold = this.config.pressUpThreshold;
    // Uniform cylinder check (AirKeyboard-4 logic)
    return (
      distances.thumb > threshold &&
      distances.index > threshold &&
      distances.middle > threshold &&
      distances.ring > threshold &&
      distances.pinky > threshold
    );
  }

  /**
   * Check if hand is in open palm position facing camera
   */
  private isOpenPalm(
    landmarks: HandLandmark[],
    distances: Record<FingerName, number>,
    handedness?: "Left" | "Right",
    facingThreshold: number = this.config.palmFacingDotThreshold,
  ): boolean {
    if (!this.allFingersUp(distances)) {
      return false;
    }

    // Check palm facing camera
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const pinkyMcp = landmarks[17];

    const palmUp = {
      x: middleMcp.x - wrist.x,
      y: middleMcp.y - wrist.y,
      z: middleMcp.z - wrist.z,
    };
    const palmAcross = {
      x: indexMcp.x - pinkyMcp.x,
      y: indexMcp.y - pinkyMcp.y,
      z: indexMcp.z - pinkyMcp.z,
    };

    if (handedness === "Left") {
      palmAcross.x = -palmAcross.x;
      palmAcross.y = -palmAcross.y;
      palmAcross.z = -palmAcross.z;
    }

    const normal = {
      x: palmAcross.y * palmUp.z - palmAcross.z * palmUp.y,
      y: palmAcross.z * palmUp.x - palmAcross.x * palmUp.z,
      z: palmAcross.x * palmUp.y - palmAcross.y * palmUp.x,
    };

    const normalMag = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z,
    );

    if (normalMag === 0) {
      return false;
    }

    const facingDot = -normal.z / normalMag;
    return facingDot >= facingThreshold;
  }

  /**
   * Extract finger positions for UI rendering
   */
  private getFingerPositions(landmarks: HandLandmark[]): FingerPositions {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];

    return {
      thumb: { x: landmarks[2].x, y: landmarks[2].y },
      index: { x: landmarks[5].x, y: landmarks[5].y },
      middle: { x: landmarks[9].x, y: landmarks[9].y },
      ring: { x: landmarks[13].x, y: landmarks[13].y },
      pinky: { x: landmarks[17].x, y: landmarks[17].y },
      palmCenter: {
        x: (wrist.x + middleMcp.x) / 2,
        y: (wrist.y + middleMcp.y) / 2,
      },
    };
  }

  /**
   * Process landmarks and return Palm Wheel state
   */
  process(
    landmarks: HandLandmark[] | null,
    now: number = Date.now(),
    handedness?: "Left" | "Right",
  ): PalmWheelOutput {
    if (!this.config.enabled) {
      this.reset();
      return this.output;
    }

    // Reset output
    this.output.progress = 0;
    this.output.selectedFinger = null;
    this.output.selectionProgress = 0;
    this.output.fingerPositions = null;
    this.output.pressEvent = null;

    // Check cooldown - only applies when trying to activate from inactive
    const inCooldown = now - this.lastActionTime < this.config.cooldownMs;
    if (inCooldown && this.state === "inactive") {
      this.output.state = "inactive";
      return this.output;
    }

    // No landmarks = reset
    if (!landmarks || landmarks.length < 21) {
      this.reset();
      // Ensure pressEvent is cleared even if reset() didn't (paranoid check)
      this.output.pressEvent = null;
      return this.output;
    }

    const distances = this.computeFingerDistances(landmarks);
    const baseFacingThreshold = this.config.palmFacingDotThreshold;
    const hysteresis = this.config.palmFacingDotHysteresis ?? 0;
    const facingThreshold = Math.max(
      0,
      Math.min(
        1,
        baseFacingThreshold + (this.openPalmStable ? -hysteresis : hysteresis),
      ),
    );
    const isOpenPalmRaw = this.isOpenPalm(
      landmarks,
      distances,
      handedness,
      facingThreshold,
    );
    let isOpenPalmNow = isOpenPalmRaw;

    if (isOpenPalmRaw) {
      this.openPalmStable = true;
      this.lastOpenPalmTime = now;
    } else {
      const graceMs = this.config.openPalmGraceMs ?? 0;
      const withinGrace =
        this.state === "activating" &&
        graceMs > 0 &&
        this.lastOpenPalmTime !== null &&
        now - this.lastOpenPalmTime <= graceMs;
      if (withinGrace) {
        isOpenPalmNow = true;
        this.openPalmStable = true;
      } else {
        this.openPalmStable = false;
      }
    }

    // Update finger state for output (true = up, false = pressed)
    this.output.fingerState = {
      thumb: distances.thumb > this.config.pressDownThreshold * 0.7,
      index: distances.index > this.config.pressDownThreshold,
      middle: distances.middle > this.config.pressDownThreshold,
      ring: distances.ring > this.config.pressDownThreshold,
      pinky: distances.pinky > this.config.pressDownThreshold * 0.9,
    };

    this.output.fingerPositions = this.getFingerPositions(landmarks);

    // State machine
    // Reset ephemeral events
    this.output.pressEvent = null;

    switch (this.state) {
      case "inactive":
        if (isOpenPalmNow) {
          this.state = "activating";
          this.activationStartTime = now;
        }
        break;

      case "activating":
        if (!isOpenPalmNow) {
          this.reset();
          break;
        }

        const activationElapsed = now - (this.activationStartTime ?? now);
        this.output.progress = Math.min(
          1,
          activationElapsed / this.config.activationHoldMs,
        );

        if (activationElapsed >= this.config.activationHoldMs) {
          this.state = "active";
          // Reset all finger pressed states when entering active
          this.fingerPressed = {
            thumb: false,
            index: false,
            middle: false,
            ring: false,
            pinky: false,
          };
        }
        break;

      case "active":
        const fingers: FingerName[] = [
          "thumb",
          "index",
          "middle",
          "ring",
          "pinky",
        ];
        const enabledFingers = new Set<FingerName>(
          this.slots
            .filter((slot) => slot.action !== null)
            .map((slot) => slot.finger),
        );


        // Exit if more than one finger is pressed (user is closing hand to exit)
        let downCount = 0;
        for (const finger of fingers) {
          const downThresh = this.config.pressDownThreshold;
          if (distances[finger] < downThresh) {
            downCount++;
          }
        }

        if (downCount > 1) {
          this.reset();
          break;
        }

        // Check each finger for press/release
        for (const finger of fingers) {
          if (!enabledFingers.has(finger)) {
            this.fingerPressed[finger] = false;
            continue;
          }
          const downThresh = this.config.pressDownThreshold;
          const dist = distances[finger];

          if (!this.fingerPressed[finger] && dist < downThresh) {
            // Finger entered cylinder
            this.fingerPressed[finger] = true;
            this.output.pressEvent = "down";
          }

          if (this.fingerPressed[finger]) {
            // Already pressed logic (if needed)
          }
        }

        // Check for release (fire action)
        for (const finger of fingers) {
          if (!enabledFingers.has(finger)) continue;
          if (this.fingerPressed[finger]) {
            const upThresh = this.config.pressUpThreshold;
            const dist = distances[finger];

            if (dist > upThresh) {
              // Finger exited cylinder - FIRE!
              this.fingerPressed[finger] = false;
              this.output.pressEvent = "up";
              this.state = "confirmed";
              this.selectedFinger = finger;
              this.confirmationStartTime = now;
              this.output.selectedFinger = finger;
              this.output.selectionProgress = 1;
              this.executeAction(finger);
              break;
            }
          }
        }

        // Show which finger is currently pressed (for visual feedback)
        for (const finger of fingers) {
          if (!enabledFingers.has(finger)) continue;
          if (this.fingerPressed[finger]) {
            this.output.selectedFinger = finger;
            this.output.selectionProgress = 0.5; // Show as "in progress"
            break;
          }
        }
        break;

      case "confirmed":
        this.output.selectedFinger = this.selectedFinger;
        this.output.selectionProgress = 1;
        const confirmationElapsed = now - (this.confirmationStartTime ?? now);
        if (confirmationElapsed >= this.config.confirmationHoldMs) {
          // After confirmation, go back to active if hand is still open
          if (isOpenPalmNow) {
            this.state = "active";
            this.selectedFinger = null;
            this.output.selectedFinger = null;
            this.output.selectionProgress = 0;
            // Reset finger pressed states
            this.fingerPressed = {
              thumb: false,
              index: false,
              middle: false,
              ring: false,
              pinky: false,
            };
          } else {
            const graceMs = this.config.confirmationGraceMs ?? 0;
            const withinGrace =
              graceMs > 0 &&
              this.lastOpenPalmTime !== null &&
              now - this.lastOpenPalmTime <= graceMs;
            if (withinGrace) {
              break;
            }
            this.reset();
          }
          this.lastActionTime = now;
        }
        break;
    }

    this.output.state = this.state;
    return this.output;
  }

  /**
   * Execute the action for the selected finger
   */
  private executeAction(finger: FingerName): void {
    const slot = this.slots.find((s) => s.finger === finger);
    if (slot?.action?.onSelect) {
      slot.action.onSelect();
    }
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = "inactive";
    this.activationStartTime = null;
    this.selectedFinger = null;
    this.confirmationStartTime = null;
    this.openPalmStable = false;
    this.lastOpenPalmTime = null;
    this.fingerPressed = {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    };
    this.output.state = "inactive";
    this.output.fingerState = {
      thumb: true,
      index: true,
      middle: true,
      ring: true,
      pinky: true,
    };
    this.output.fingerPositions = null;
    this.output.progress = 0;
    this.output.selectedFinger = null;
    this.output.selectionProgress = 0;
    this.output.pressEvent = null;
    // Reset menu state and notify
    const wasInSubmenu = this.menuPath.length > 0;
    this.menuPath = [];
    this.menuLabel = null;
    this.menuIcon = null;
    this.output.menuPath = [];
    this.output.menuLabel = null;
    this.output.menuIcon = null;
    if (wasInSubmenu) {
      this.onSubmenuChange?.([], null);
    }
  }

  /**
   * Force deactivate
   */
  deactivate(): void {
    this.reset();
  }

  /**
   * Get current state
   */
  getState(): PalmWheelState {
    return this.state;
  }

  /**
   * Check if Palm Wheel is currently showing
   */
  isActive(): boolean {
    return this.state === "active";
  }
}
