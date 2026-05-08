import { HandConfig, Point, HandLandmark } from "./types";
import { OneEuroFilter } from "../utils/OneEuroFilter";
import { calculateDistance } from "../utils/math";

export interface KinematicsOutput {
    cursor: Point; // Final filtered cursor position (screen px)
    delta: Point; // Frame delta (screen px)
    speed: number; // Cursor speed (px/s)
    fingerSpeed: number; // Finger speed (px/s)
    isValid: boolean; // True if delta is valid (not a jump or first frame)
}

export class CursorKinematics {
    public filterX: OneEuroFilter;
    public filterY: OneEuroFilter;

    // State
    private lastFingerPos: { x: number | null; y: number | null } = { x: null, y: null };
    private lastPointerPos: { x: number | null; y: number | null } = { x: null, y: null };
    private lastFrameTime: number = 0;

    // Smoothing state for display values
    private displaySpeed: number = 0;
    private displayFingerSpeed: number = 0;

    constructor(config: HandConfig) {
        this.filterX = new OneEuroFilter(
            config.filterMinCutoff,
            config.filterBeta
        );
        this.filterY = new OneEuroFilter(
            config.filterMinCutoff,
            config.filterBeta
        );
    }

    updateConfig(config: HandConfig) {
        this.filterX.minCutoff = config.filterMinCutoff;
        this.filterX.beta = config.filterBeta;
        this.filterY.minCutoff = config.filterMinCutoff;
        this.filterY.beta = config.filterBeta;
    }

    reset() {
        this.filterX.reset();
        this.filterY.reset();
        this.lastFingerPos = { x: null, y: null };
        this.lastPointerPos = { x: null, y: null };
        this.lastFrameTime = 0;
        this.displaySpeed = 0;
        this.displayFingerSpeed = 0;
    }

    getDisplayStats() {
        return {
            speed: this.displaySpeed,
            fingerSpeed: this.displayFingerSpeed
        };
    }

    /**
     * Process a frame to determine cursor movement.
     * 
     * @param rawTarget The raw screen coordinates {x, y} of the tracking target (e.g. index tip or palm center)
     * @param landmarks Full hand landmarks (used for distance compensation)
     * @param timestamp Current timestamp (ms)
     * @param width Screen width (for jump detection)
     * @param config HandConfig
     */
    process(
        rawTarget: { x: number; y: number },
        landmarks: HandLandmark[],
        timestamp: number,
        width: number,
        height: number,
        config: HandConfig
    ): KinematicsOutput {
        const currentFingerX = rawTarget.x;
        const currentFingerY = rawTarget.y;

        // Output container
        const output: KinematicsOutput = {
            cursor: { x: 0, y: 0, z: 0 },
            delta: { x: 0, y: 0, z: 0 },
            speed: 0,
            fingerSpeed: 0,
            isValid: false
        };

        // First frame or reset
        if (this.lastFingerPos.x === null || this.lastFingerPos.y === null) {
            this.lastFingerPos.x = currentFingerX;
            this.lastFingerPos.y = currentFingerY;

            // If we have a previous pointer pos (e.g. from recenter), keep it.
            // Otherwise sync to current finger.
            if (this.lastPointerPos.x === null || this.lastPointerPos.y === null) {
                this.lastPointerPos.x = currentFingerX;
                this.lastPointerPos.y = currentFingerY;
            }

            this.lastFrameTime = timestamp;

            // Return static output for first frame
            output.cursor.x = this.lastPointerPos.x!;
            output.cursor.y = this.lastPointerPos.y!;
            return output;
        }

        // Delta Calculation
        const deltaX = currentFingerX - (this.lastFingerPos.x ?? currentFingerX);
        const deltaY = currentFingerY - (this.lastFingerPos.y ?? currentFingerY);

        // Jump Rejection
        const jumpDistanceSq = deltaX * deltaX + deltaY * deltaY;
        const maxJump = width * 0.15;
        const maxJumpSq = maxJump * maxJump;

        if (jumpDistanceSq < maxJumpSq) {
            // --- VALID MOVEMENT ---
            const prevPointerX = this.lastPointerPos.x!;
            const prevPointerY = this.lastPointerPos.y!;

            let sensitivity = config.pointerSensitivity;

            // Distance Compensation
            let distanceScale = 1.0;
            if (config.enableDistanceCompensation) {
                const wrist = landmarks[0];
                const middleMcp = landmarks[9];
                const palmSize = calculateDistance(wrist, middleMcp);

                if (palmSize > 0.01) {
                    distanceScale = config.referencePalmSize / palmSize;
                    distanceScale = Math.max(0.5, Math.min(3.0, distanceScale));
                }
            }

            sensitivity *= distanceScale;

            // Time delta
            const dt = Math.max(0.001, (timestamp - this.lastFrameTime) / 1000);

            // Finger Speed (Normalized)
            const normalizedDeltaX = deltaX * distanceScale;
            const normalizedDeltaY = deltaY * distanceScale;
            const fingerDist = Math.hypot(normalizedDeltaX, normalizedDeltaY);
            const fingerSpeed = fingerDist / dt; // px/s

            // Pointer Acceleration
            if (config.pointerAcceleration > 0 && fingerSpeed > 0) {
                const accelFactor = config.pointerAcceleration;
                const boost = fingerSpeed * accelFactor * 0.0005;
                sensitivity *= 1 + Math.min(2.0, boost);
            }

            // Raw Cursor Calculation
            let rawX = prevPointerX + deltaX * sensitivity;
            let rawY = prevPointerY + deltaY * sensitivity;

            // Clamp
            rawX = Math.max(0, Math.min(width, rawX));
            rawY = Math.max(0, Math.min(height, rawY));

            // Filter
            const filteredX = this.filterX.filter(rawX, timestamp);
            const filteredY = this.filterY.filter(rawY, timestamp);

            const finalX = config.enableFilter ? filteredX : rawX;
            const finalY = config.enableFilter ? filteredY : rawY;

            this.lastPointerPos.x = finalX;
            this.lastPointerPos.y = finalY;

            // Cursor Speed
            const cursorDist = Math.hypot(finalX - prevPointerX, finalY - prevPointerY);
            const cursorSpeed = cursorDist / dt;

            output.cursor.x = finalX;
            output.cursor.y = finalY;
            output.delta.x = finalX - prevPointerX;
            output.delta.y = finalY - prevPointerY;

            // Update Smooth Stats
            const alpha = 0.15;
            this.displaySpeed = this.displaySpeed * (1 - alpha) + cursorSpeed * alpha;
            this.displayFingerSpeed = this.displayFingerSpeed * (1 - alpha) + fingerSpeed * alpha;

            output.speed = this.displaySpeed;
            output.fingerSpeed = this.displayFingerSpeed;
            output.isValid = true;

        } else {
            // --- JUMP DETECTED ---
            output.isValid = false;
            output.cursor.x = this.lastPointerPos.x!;
            output.cursor.y = this.lastPointerPos.y!;
            // Keep previous speed stats
            output.speed = this.displaySpeed;
            output.fingerSpeed = this.displayFingerSpeed;
        }

        // Update state
        this.lastFingerPos.x = currentFingerX;
        this.lastFingerPos.y = currentFingerY;
        this.lastFrameTime = timestamp;

        return output;
    }

    /**
     * Manually override the cursor position (e.g. for re-centering).
     */
    setCursorPosition(x: number, y: number) {
        this.lastPointerPos.x = x;
        this.lastPointerPos.y = y;
        // Reset lastFingerPos to force "first frame" logic on next update
        // This prevents large jumps/deltas from old finger position.
        this.lastFingerPos.x = null;
        this.lastFingerPos.y = null;

        this.filterX.reset();
        this.filterY.reset();
    }
}
