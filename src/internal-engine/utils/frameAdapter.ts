import { FrameInput } from "../core/FrameInput";
import { HandLandmark, Handedness } from "../core/types";

// Loose type for raw MediaPipe results to avoid 'any' in core logic
interface MediaPipeResult {
    multiHandLandmarks: HandLandmark[][];
    multiHandWorldLandmarks?: HandLandmark[][];
    multiHandedness: { label: string; score: number }[];
}

/**
 * Adapts raw MediaPipe results into a strongly typed array of FrameInputs.
 * This is the ONLY place where 'any' or unsafe casting should happen regarding tracker output.
 */
export function adaptMediaPipeToFrameInputs(
    results: any,
    timestamp: number
): FrameInput[] {
    // Defensive check for empty/malformed results
    if (
        !results ||
        !results.multiHandLandmarks ||
        !results.multiHandedness ||
        results.multiHandLandmarks.length !== results.multiHandedness.length
    ) {
        return [];
    }

    const inputs: FrameInput[] = [];
    const mpResults = results as MediaPipeResult;

    for (let i = 0; i < mpResults.multiHandLandmarks.length; i++) {
        const landmarks = mpResults.multiHandLandmarks[i];
        // Map MediaPipe "Left"/"Right" string to our Handedness type
        // Note: MediaPipe labels are often 'Right' for the left hand in selfie mode,
        // but we assume the application layer handles mirroring settings or the engine handles it.
        // For this adapter, we just pass through or strictly validate.
        const rawLabel = mpResults.multiHandedness[i].label;

        // Ensure we strictly match our "Left" | "Right" type
        const handedness: Handedness = rawLabel === "Left" ? "Left" : "Right";
        const confidence = mpResults.multiHandedness[i].score;

        const worldLandmarks = mpResults.multiHandWorldLandmarks?.[i];

        inputs.push({
            channels: {
                landmarks,
                worldLandmarks,
            },
            metadata: {
                handedness,
                confidence,
                timestamp,
            },
        });
    }

    return inputs;
}
