import { HandLandmark, Handedness } from "./types";

/**
 * Normalized input for a single hand in a single frame.
 * derived from MediaPipe or other tracking sources.
 */
export interface FrameInput {
  channels: {
    /**
     * 2D Normalized Landmarks (0-1)
     */
    landmarks: HandLandmark[];
    /**
     * 3D World Landmarks (Meters) - Optional
     */
    worldLandmarks?: HandLandmark[];
  };
  metadata: {
    handedness: Handedness; // "Left" | "Right"
    confidence: number;
    timestamp: number;
  };
}
