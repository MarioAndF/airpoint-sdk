import { PoseName, PoseProbabilities } from "../core/types";

/**
 * Recognized pose names in model output order.
 *
 * airmouse-4.1 output:
 * [idle, thumb_middle_pinch, thumb_ring_pinch, thumb_pinky_pinch, thumb_index_middle_pinch, thumb_pinky_base]
 *
 * airmouse-4.2 output:
 * [idle, thumb_index_pinch, thumb_middle_pinch, thumb_ring_pinch, thumb_pinky_pinch, thumb_pinky_base, thumb_index_middle_pinch]
 *
 * airmouse-4.3 output:
 * [idle, thumb_index_pinch, thumb_middle_pinch, thumb_ring_pinch, thumb_pinky_pinch, thumb_pinky_base, thumb_index_middle_pinch]
 */
export const POSE_NAMES_4_1: PoseName[] = [
  "idle", // index 0
  "thumb_middle_pinch", // index 1
  "thumb_ring_pinch", // index 2
  "thumb_pinky_pinch", // index 3
  "thumb_index_middle_pinch", // index 4
  "thumb_pinky_base", // index 5
];

export const POSE_NAMES_4_2: PoseName[] = [
  "idle", // index 0
  "thumb_index_pinch", // index 1
  "thumb_middle_pinch", // index 2
  "thumb_ring_pinch", // index 3
  "thumb_pinky_pinch", // index 4
  "thumb_pinky_base", // index 5
  "thumb_index_middle_pinch", // index 6
];

// Backwards-compatible default (airmouse-4.1 output order)
export const POSE_NAMES = POSE_NAMES_4_1;

export function getPoseNames(modelId?: string): PoseName[] {
  if (
    modelId?.startsWith("airmouse-4.2") ||
    modelId?.startsWith("airmouse-4.3")
  ) {
    return POSE_NAMES_4_2;
  }
  return POSE_NAMES_4_1;
}

/**
 * Convert model output array to PoseProbabilities record.
 * Order matches airmouse-3 model labels from model_registry.json.
 */
export function toPoseProbabilities(
  probs: number[],
  poseNames: PoseName[] = POSE_NAMES_4_1,
): PoseProbabilities {
  const poseProbabilities: PoseProbabilities = {
    idle: 0,
    thumb_index_pinch: 0,
    thumb_middle_pinch: 0,
    thumb_ring_pinch: 0,
    thumb_pinky_pinch: 0,
    thumb_index_middle_pinch: 0,
    thumb_pinky_base: 0,
    // Keyboard poses (not used by airmouse classifiers)
    thumb_index_press: 0,
    thumb_middle_press: 0,
    thumb_ring_press: 0,
    thumb_pinky_press: 0,
    thumb_press_down: 0,
  };

  for (let i = 0; i < poseNames.length; i++) {
    const pose = poseNames[i];
    poseProbabilities[pose] = probs[i] ?? 0;
  }

  return poseProbabilities;
}
