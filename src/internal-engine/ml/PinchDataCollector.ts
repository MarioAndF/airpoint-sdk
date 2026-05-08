/**
 * Data collector for gesture classification training.
 * Records labeled samples of raw hand landmarks.
 * 
 * Version 4.0:
 * - Removed legacy "baked" features (pinchDistance, etc)
 * - Records raw landmarks (2D + 3D) and metadata
 * - Mirrors raw landmarks into `features.landmarks2D/landmarks3D` for training compatibility
 */

import { HandLandmark } from "../core/types";

// Local type for airmouse collector (matches airmouse model labels)
// This is separate from the @airpoint/types AirmousePoseName to avoid conflicts
export type AirmousePoseName =
  | "idle"
  | "thumb_index_pinch"
  | "thumb_middle_pinch"
  | "thumb_ring_pinch"
  | "thumb_pinky_pinch"
  | "thumb_index_middle_pinch"
  | "thumb_pinky_base";

// Re-export for backwards compatibility
export type GestureLabel = AirmousePoseName;

export const GESTURE_LABELS: AirmousePoseName[] = [
  "idle",
  "thumb_index_pinch",
  "thumb_middle_pinch",
  "thumb_ring_pinch",
  "thumb_pinky_pinch",
  "thumb_pinky_base",
  "thumb_index_middle_pinch",
];

export const GESTURE_TO_ID: Record<AirmousePoseName, number> = {
  idle: 0,
  thumb_index_pinch: 1,
  thumb_middle_pinch: 2,
  thumb_ring_pinch: 3,
  thumb_pinky_pinch: 4,
  thumb_pinky_base: 5,
  thumb_index_middle_pinch: 6,
};

export interface CollectedSample {
  timestamp: number;
  label: number; // 0-6 for gesture classes
  labelName: AirmousePoseName; // Human-readable label

  // Raw Data (The only thing that matters)
  landmarks: number[]; // Flat array [x, y, z, x, y, z...] (21 points * 3)
  worldLandmarks: number[]; // Flat array [x, y, z...] (21 points * 3)
  features?: {
    landmarks2D: number[]; // Mirror of landmarks for training compatibility
    landmarks3D: number[]; // Mirror of worldLandmarks for training compatibility
  };

  // Metadata
  handedness?: "Left" | "Right";
  confidence?: number;

  // Legacy / Debug (Optional)
  systemPrediction?: 0 | 1;
}

export interface CollectionSession {
  version: "4.0";
  collectedAt: string;
  samples: CollectedSample[];
  metadata: {
    gestureCounts: Record<AirmousePoseName, number>;
    totalSamples: number;
    durationMs: number;
  };
}

export type RecordingState = "idle" | "recording";

export class PinchDataCollector {
  private samples: CollectedSample[] = [];
  private recordingState: RecordingState = "idle";
  private currentGesture: AirmousePoseName = "idle"; // Current label being applied
  private sessionStartTime: number = 0;

  // Callbacks for UI updates
  public onStateChange?: (
    isRecording: boolean,
    currentGesture: AirmousePoseName
  ) => void;
  public onSampleRecorded?: (counts: Record<AirmousePoseName, number>) => void;

  constructor() {
    // No initialization needed
  }

  /**
   * Start a new collection session.
   */
  startSession() {
    this.samples = [];
    this.sessionStartTime = performance.now();
    this.recordingState = "idle";
    this.currentGesture = "idle";
    this.notifyStateChange();
  }

  /**
   * Start/stop continuous recording (press R to toggle).
   */
  toggleRecording() {
    if (this.recordingState === "recording") {
      this.recordingState = "idle";
    } else {
      this.recordingState = "recording";
    }
    console.log("toggleRecording called, new state:", this.recordingState);
    this.notifyStateChange();
  }

  /**
   * Set current gesture label (hold key while performing gesture).
   */
  setGesture(gesture: AirmousePoseName) {
    this.currentGesture = gesture;
    if (this.recordingState === "recording") {
      this.notifyStateChange();
    }
  }

  /**
   * @deprecated Use setGesture() instead
   */
  setPinchHeld(held: boolean) {
    this.setGesture(held ? "thumb_middle_pinch" : "idle");
  }

  /**
   * @deprecated Use toggleRecording() and setGesture() instead
   */
  setRecordingState(state: "idle" | "pinch" | "recording") {
    if (state === "pinch") {
      this.currentGesture = "thumb_middle_pinch";
    } else if (state === "idle" || state === "recording") {
      this.currentGesture = "idle";
    }
    this.notifyStateChange();
  }

  /**
   * Helper to flatten landmarks
   */
  private flattenLandmarks(landmarks: HandLandmark[]): number[] {
    const flat: number[] = [];
    for (const lm of landmarks) {
      flat.push(lm.x, lm.y, lm.z);
    }
    return flat;
  }

  /**
   * Process a frame. Records sample when recording is active.
   * Label is determined by currentGesture (default: idle).
   */
  processFrame(
    landmarks2D: HandLandmark[],
    landmarks3D: HandLandmark[] | undefined,
    timestamp: number,
    currentlyClicking: boolean, // From existing detection, for reference
    handedness?: "Left" | "Right", // From MediaPipe handedness
    confidence?: number // MediaPipe detection confidence
  ): void {
    if (!landmarks2D || landmarks2D.length !== 21) return;

    // Only record if recording is active
    if (this.recordingState !== "recording") return;

    const label = GESTURE_TO_ID[this.currentGesture];
    const systemPrediction: 0 | 1 = currentlyClicking ? 1 : 0;

    // Flatten landmarks (Efficient storage)
    const flatLandmarks = this.flattenLandmarks(landmarks2D);
    const flatWorldLandmarks = landmarks3D ? this.flattenLandmarks(landmarks3D) : [];

    const sample: CollectedSample = {
      timestamp,
      label,
      labelName: this.currentGesture,
      systemPrediction,
      landmarks: flatLandmarks,
      worldLandmarks: flatWorldLandmarks,
      features: {
        landmarks2D: flatLandmarks,
        landmarks3D: flatWorldLandmarks,
      },
      handedness,
      confidence,
    };

    this.samples.push(sample);
    this.notifySampleRecorded();
  }

  /**
   * Get current sample counts by gesture.
   */
  getCounts(): Record<AirmousePoseName, number> {
    const counts: Record<AirmousePoseName, number> = {
      idle: 0,
      thumb_index_pinch: 0,
      thumb_middle_pinch: 0,
      thumb_ring_pinch: 0,
      thumb_pinky_pinch: 0,
      thumb_index_middle_pinch: 0,
      thumb_pinky_base: 0,
    };
    for (const s of this.samples) {
      const label = s.labelName || "idle"; // Backwards compat
      if (label in counts) {
        counts[label as AirmousePoseName]++;
      }
    }
    return counts;
  }

  /**
   * Get current recording state.
   */
  getRecordingState(): RecordingState {
    return this.recordingState;
  }

  /**
   * Get current gesture being labeled.
   */
  getCurrentGesture(): AirmousePoseName {
    return this.currentGesture;
  }

  /**
   * Clear all collected samples.
   */
  clear() {
    this.samples = [];
    this.notifySampleRecorded();
  }

  /**
   * Export collected data as JSON.
   */
  exportSession(): CollectionSession {
    const counts = this.getCounts();
    const now = new Date().toISOString();
    const duration = performance.now() - this.sessionStartTime;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return {
      version: "4.0", // New lightweight format
      collectedAt: now,
      samples: this.samples,
      metadata: {
        gestureCounts: counts,
        totalSamples: total,
        durationMs: duration,
      },
    };
  }

  /**
   * Download session as JSON file.
   */
  downloadSession(filename?: string) {
    const session = this.exportSession();
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `airmouse-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Load a previous session (to continue collecting).
   */
  loadSession(session: CollectionSession) {
    // Basic compatibility check
    if (session.version === "4.0") {
      this.samples = session.samples;
      this.notifySampleRecorded();
    } else {
      console.warn("Attempting to load legacy session into v4 collector. Some fields may be missing.");
      // Try to adapt best-effort

      this.samples = session.samples.map(s => ({
        ...s,
        // If legacy loaded, we might need to verify landmark shape, but usually fine
      }));
      this.notifySampleRecorded();
    }
  }

  private notifyStateChange() {
    const isRecording = this.recordingState === "recording";
    console.log("notifyStateChange:", {
      isRecording,
      currentGesture: this.currentGesture,
      hasCallback: !!this.onStateChange,
    });
    this.onStateChange?.(isRecording, this.currentGesture);
  }

  private notifySampleRecorded() {
    const counts = this.getCounts();
    this.onSampleRecorded?.(counts);
  }
}

/**
 * Gesture hotkeys for data collection.
 * Hold key while performing gesture, release to return to idle.
 */
export const GESTURE_HOTKEYS: Record<string, AirmousePoseName> = {
  "0": "thumb_index_pinch",
  "1": "thumb_middle_pinch",
  "2": "thumb_ring_pinch",
  "3": "thumb_pinky_pinch",
  "4": "thumb_pinky_base",
  "5": "thumb_index_middle_pinch",
};

/**
 * Create keyboard handler for multi-gesture data collection.
 * Returns cleanup function.
 */
export function setupCollectionKeyboard(
  collector: PinchDataCollector,
  options: {
    recordKey?: string; // Default: 'r'
    saveKey?: string; // Default: 's'
    clearKey?: string; // Default: 'c'
  } = {}
): () => void {
  const { recordKey = "r", saveKey = "s", clearKey = "c" } = options;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    if (key === recordKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      collector.toggleRecording();
    } else if (key in GESTURE_HOTKEYS) {
      e.preventDefault();
      collector.setGesture(GESTURE_HOTKEYS[key]);
    } else if (key === saveKey && (e.ctrlKey || e.metaKey)) {
      // Cmd+S to save
      e.preventDefault();
      collector.downloadSession();
    } else if (key === clearKey && e.ctrlKey) {
      // Ctrl+C to clear
      e.preventDefault();
      if (confirm("Clear all collected samples?")) {
        collector.clear();
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key in GESTURE_HOTKEYS) {
      collector.setGesture("idle");
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // Return cleanup function
  return () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  };
}
