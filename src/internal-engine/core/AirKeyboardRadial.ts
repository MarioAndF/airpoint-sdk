import { HandLandmark } from "../core/types";

import {
    AirKeyboardResult,
    FingerPinchState,
    KeyboardFingerName
} from "./AirKeyboardTypes";
import { AirKeyboardStrategy } from "./AirKeyboardStrategy";

export interface AirKeyboardRadialConfig {
    /** Radius of the cylinder as multiplier of palm size (default: 0.3) */
    radiusMultiplier: number;
    /** Hysteresis factor for release (default: 1.1) */
    releaseMultiplier: number;
}

export const DEFAULT_RADIAL_CONFIG: AirKeyboardRadialConfig = {
    radiusMultiplier: 0.5, // Cylinder radius = 0.5 * Palm Length (Diameter = Palm Length)
    releaseMultiplier: 1.1 // Release when outside radius * 1.1
};

type RadialFingerName = "thumb" | KeyboardFingerName;

/**
 * Pure function to calculate radial (cylinder) heuristic geometry.
 * Used by both detection and visualization.
 */
export function calculateRadialHeuristic(
    landmarks: HandLandmark[],
    config: AirKeyboardRadialConfig
) {
    // 1. Calculate Basis Vectors & Origin for "Coronal Cylinder"
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];

    // Origin = Palm Center
    const origin = {
        x: (wrist.x + middleMcp.x) / 2,
        y: (wrist.y + middleMcp.y) / 2,
        z: (wrist.z + middleMcp.z) / 2
    };

    // Calculate Palm Normal
    // V1 = Wrist -> Middle (Longitudinal)
    const v1 = {
        x: middleMcp.x - wrist.x,
        y: middleMcp.y - wrist.y,
        z: middleMcp.z - wrist.z
    };
    // V2 = Index -> Pinky (Transverse)
    const v2 = {
        x: pinkyMcp.x - indexMcp.x,
        y: pinkyMcp.y - indexMcp.y,
        z: pinkyMcp.z - indexMcp.z
    };

    // Normal = V1 x V2
    const nx = v1.y * v2.z - v1.z * v2.y;
    const ny = v1.z * v2.x - v1.x * v2.z;
    const nz = v1.x * v2.y - v1.y * v2.x;
    const lenN = Math.hypot(nx, ny, nz) || 1;

    const axisDir = {
        x: nx / lenN,
        y: ny / lenN,
        z: nz / lenN
    };

    // Palm Size Reference (still wrist to middle distance)
    const palmSize = Math.hypot(v1.x, v1.y, v1.z) || 1;
    const axisLen = palmSize; // Visual length helper

    // 2. Define Cylinder Radius
    const radius = config.radiusMultiplier * palmSize;

    // Helper: Calculate distance of point P from Line(Origin=PalmCenter, Dir=PalmNormal)
    const getDistanceFromAxis = (point: HandLandmark): number => {
        const vecToPoint = {
            x: point.x - origin.x,
            y: point.y - origin.y,
            z: point.z - origin.z
        };

        // Cross Product: vecToPoint x axisDir
        const crossX = vecToPoint.y * axisDir.z - vecToPoint.z * axisDir.y;
        const crossY = vecToPoint.z * axisDir.x - vecToPoint.x * axisDir.z;
        const crossZ = vecToPoint.x * axisDir.y - vecToPoint.y * axisDir.x;

        return Math.hypot(crossX, crossY, crossZ);
    };

    // 3. Process each finger
    const processFinger = (tipIndex: number) => {
        const tip = landmarks[tipIndex];
        const dist = getDistanceFromAxis(tip);
        const isPressed = dist < radius;
        return { isPressed, dist, tip };
    };

    return {
        origin, // Was wrist
        axisDir,
        axisLen,
        palmSize,
        radius,
        fingers: {
            thumb: processFinger(4),
            index: processFinger(8),
            middle: processFinger(12),
            ring: processFinger(16),
            pinky: processFinger(20)
        }
    };
}

/**
 * AirKeyboard Radial Detector (Palm Cylinder) (AirKeyboard-4)
 */
export class AirKeyboardRadialDetector implements AirKeyboardStrategy {
    private config: AirKeyboardRadialConfig;

    private fingerPressed: Record<RadialFingerName, boolean> = {
        thumb: false,
        index: false,
        middle: false,
        ring: false,
        pinky: false,
    };

    // Store debug info
    private debugInfo: any = null;

    constructor(config: Partial<AirKeyboardRadialConfig> = {}) {
        this.config = { ...DEFAULT_RADIAL_CONFIG, ...config };
    }

    update(landmarks: HandLandmark[] | null): AirKeyboardResult & {
        thumbPressed: boolean;
        thumbJustPressed: boolean;
        thumbJustReleased: boolean
    } {
        const emptyState: FingerPinchState = {
            isPinching: false,
            justPressed: false,
            justReleased: false,
            distance: 0,
        };

        if (!landmarks || landmarks.length < 21) {
            this.debugInfo = null;
            const result = {
                index: { ...emptyState, justReleased: this.fingerPressed.index },
                middle: { ...emptyState, justReleased: this.fingerPressed.middle },
                ring: { ...emptyState, justReleased: this.fingerPressed.ring },
                pinky: { ...emptyState, justReleased: this.fingerPressed.pinky },
                thumbPressed: false,
                thumbJustPressed: false,
                thumbJustReleased: this.fingerPressed.thumb,
                isActive: false,
            };
            this.fingerPressed = { thumb: false, index: false, middle: false, ring: false, pinky: false };
            return result;
        }

        // Calculate heuristic using standalone function
        const heuristic = calculateRadialHeuristic(landmarks, this.config);

        // Update debug info
        this.debugInfo = heuristic;

        const updateState = (finger: RadialFingerName, res: { isPressed: boolean, dist: number }) => {
            const wasPressed = this.fingerPressed[finger];

            // Hysteresis logic
            const radius = heuristic.radius;
            const releaseRadius = radius * this.config.releaseMultiplier;
            const threshold = wasPressed ? releaseRadius : radius;
            const isPressed = res.dist < threshold;

            this.fingerPressed[finger] = isPressed;
            return {
                isPinching: isPressed,
                justPressed: isPressed && !wasPressed,
                justReleased: !isPressed && wasPressed,
                distance: res.dist
            };
        };

        const thumbState = updateState("thumb", heuristic.fingers.thumb);
        const indexState = updateState("index", heuristic.fingers.index);
        const middleState = updateState("middle", heuristic.fingers.middle);
        const ringState = updateState("ring", heuristic.fingers.ring);
        const pinkyState = updateState("pinky", heuristic.fingers.pinky);

        return {
            index: indexState,
            middle: middleState,
            ring: ringState,
            pinky: pinkyState,
            thumbPressed: thumbState.isPinching,
            thumbJustPressed: thumbState.justPressed,
            thumbJustReleased: thumbState.justReleased,
            isActive: true
        };
    }

    reset() {
        this.fingerPressed = { thumb: false, index: false, middle: false, ring: false, pinky: false };
    }

    getDebugInfo() {
        return this.debugInfo;
    }
}
