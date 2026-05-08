
import { HandLandmark } from "./types";
import { AirKeyboardResult } from "./AirKeyboardTypes";

/**
 * Common interface for AirKeyboard detection strategies.
 * Allows switching between different heuristic models (e.g. Plane vs Radial).
 */
export interface AirKeyboardStrategy {
    /**
     * Update the detector with new landmarks.
     */
    update(landmarks: HandLandmark[] | null): AirKeyboardResult & {
        thumbPressed: boolean;
        thumbJustPressed: boolean;
        thumbJustReleased: boolean;
    };

    /**
     * Reset internal state (e.g. release all keys).
     */
    reset(): void;

    /**
     * Get debug info for visualization (optional).
     */
    getDebugInfo?(): any;
}
