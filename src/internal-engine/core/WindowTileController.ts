import { HandConfig, WindowTileDirection } from "../shared-types";

export interface WindowTileOutput {
  /** The detected direction, or null if not yet determined */
  direction: WindowTileDirection;
  /** Whether the gesture is currently active */
  isActive: boolean;
  /** Accumulated movement for visual feedback */
  progress: { x: number; y: number };
  /** Whether the threshold was met and action should trigger on release */
  triggered: boolean;
}

/**
 * WindowTileController handles thumb-pinky pinch + slide gestures for window tiling.
 *
 * Behavior:
 * 1. When gesture starts, begin accumulating cursor movement
 * 2. After LOCK_THRESHOLD pixels, lock to the dominant axis (horizontal or vertical)
 * 3. Once movement exceeds windowTileSensitivity, mark as triggered
 * 4. On gesture release, if triggered, return the final direction for action dispatch
 */
export class WindowTileController {
  private accumulator: { x: number; y: number } = { x: 0, y: 0 };
  private lockedDirection: WindowTileDirection = null;
  private isActive: boolean = false;
  private _triggered: boolean = false;

  /** Pixels of movement before locking to an axis */
  private readonly LOCK_THRESHOLD = 8;

  constructor() {}

  reset(): void {
    this.accumulator = { x: 0, y: 0 };
    this.lockedDirection = null;
    this.isActive = false;
    this._triggered = false;
  }

  /**
   * Process a frame of window tile gesture detection.
   *
   * @param cursorDelta - The cursor movement delta this frame
   * @param isGestureActive - Whether the thumb-pinky pinch hold is active
   * @param config - Hand configuration for sensitivity threshold
   * @returns WindowTileOutput with current state
   */
  process(
    cursorDelta: { x: number; y: number },
    isGestureActive: boolean,
    config: HandConfig
  ): WindowTileOutput {
    // Gesture just started
    if (isGestureActive && !this.isActive) {
      this.isActive = true;
      this.accumulator = { x: 0, y: 0 };
      this.lockedDirection = null;
      this._triggered = false;
    }

    // Gesture ended - return final state
    if (!isGestureActive && this.isActive) {
      const direction = this.lockedDirection;
      const triggered = this._triggered;
      this.reset();

      // Return final direction if threshold was met
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
    const threshold = config.windowTileSensitivity ?? 20;

    // Determine direction if not locked
    if (!this.lockedDirection) {
      if (absX > this.LOCK_THRESHOLD || absY > this.LOCK_THRESHOLD) {
        if (absX > absY) {
          this.lockedDirection = this.accumulator.x > 0 ? "right" : "left";
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
