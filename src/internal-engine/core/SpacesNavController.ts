import { HandConfig, WindowTileDirection } from "../shared-types";

export interface SpacesNavOutput {
  /** The detected direction, or null if not yet determined */
  direction: WindowTileDirection;
  /** Whether the gesture is currently active */
  isActive: boolean;
  /** Accumulated movement for visual feedback */
  progress: { x: number; y: number };
  /** Whether the threshold was met and action should trigger */
  triggered: boolean;
}

/**
 * SpacesNavController handles thumb-pinky-base + slide gestures for Spaces navigation.
 * This is the 4-finger trackpad swipe equivalent:
 * - Up: Mission Control
 * - Down: App Exposé
 * - Left/Right: Switch Spaces
 *
 * Behavior:
 * 1. When gesture starts, begin accumulating cursor movement
 * 2. After LOCK_THRESHOLD pixels, lock to the dominant axis (horizontal or vertical)
 * 3. Once movement exceeds spacesNavSensitivity, mark as triggered
 * 4. When triggered, action should fire immediately (not on release)
 */
export class SpacesNavController {
  private accumulator: { x: number; y: number } = { x: 0, y: 0 };
  private lockedDirection: WindowTileDirection = null;
  private isActive: boolean = false;
  private _triggered: boolean = false;

  /** Pixels of movement before locking to an axis */
  private readonly LOCK_THRESHOLD = 8;

  constructor() { }

  reset(): void {
    this.accumulator = { x: 0, y: 0 };
    this.lockedDirection = null;
    this.isActive = false;
    this._triggered = false;
  }

  /**
   * Process a frame of spaces navigation gesture detection.
   *
   * @param cursorDelta - The cursor movement delta this frame
   * @param isGestureActive - Whether the thumb-pinky-base hold is active
   * @param config - Hand configuration for sensitivity threshold
   * @returns SpacesNavOutput with current state
   */
  process(
    cursorDelta: { x: number; y: number },
    isGestureActive: boolean,
    config: HandConfig
  ): SpacesNavOutput {
    // Gesture just started
    if (isGestureActive && !this.isActive) {
      this.isActive = true;
      this.accumulator = { x: 0, y: 0 };
      this.lockedDirection = null;
      this._triggered = false;
    }

    // Gesture ended - reset state
    if (!isGestureActive && this.isActive) {
      const direction = this.lockedDirection;
      const triggered = this._triggered;
      this.reset();

      // Return final state (but action should have already fired on trigger)
      if (direction && triggered) {
        return {
          direction,
          isActive: false,
          progress: { x: 0, y: 0 },
          triggered: true,
        };
      }
      return {
        direction: null,
        isActive: false,
        progress: { x: 0, y: 0 },
        triggered: false,
      };
    }

    // Not active
    if (!isGestureActive) {
      return {
        direction: null,
        isActive: false,
        progress: { x: 0, y: 0 },
        triggered: false,
      };
    }

    // Accumulate movement
    this.accumulator.x += cursorDelta.x;
    this.accumulator.y += cursorDelta.y;

    const absX = Math.abs(this.accumulator.x);
    const absY = Math.abs(this.accumulator.y);
    const threshold = config.spacesNavSensitivity ?? 20;

    // Determine direction if not locked
    if (!this.lockedDirection) {
      if (absX > this.LOCK_THRESHOLD || absY > this.LOCK_THRESHOLD) {
        if (absX > absY) {
          if (config.invertSpacesNav) {
            this.lockedDirection = this.accumulator.x > 0 ? "left" : "right";
          } else {
            this.lockedDirection = this.accumulator.x > 0 ? "right" : "left";
          }
        } else {
          this.lockedDirection = this.accumulator.y > 0 ? "bottom" : "top";
        }
      }
    }

    // Check if threshold met
    if (this.lockedDirection && !this._triggered) {
      const relevantAccum =
        this.lockedDirection === "left" || this.lockedDirection === "right"
          ? absX
          : absY;
      if (relevantAccum >= threshold) {
        this._triggered = true;
      }
    }

    return {
      direction: this.lockedDirection,
      isActive: true,
      progress: { ...this.accumulator },
      triggered: this._triggered,
    };
  }
}
