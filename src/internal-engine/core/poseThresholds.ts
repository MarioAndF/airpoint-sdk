import { DEFAULT_CONFIG } from "../shared-types";
import type { HandConfig, PoseName, PoseThresholds } from "./types";

/**
 * Fallback thresholds for poses not defined in DEFAULT_CONFIG.
 * These are intentionally conservative (won't trigger easily).
 */
const FALLBACK_THRESHOLDS: PoseThresholds = {
  enterThreshold: 0.9,
  exitThreshold: 0.5,
  enterFrames: 3,
  exitFrames: 3,
};

/**
 * Resolve pose thresholds from config, falling back to DEFAULT_CONFIG.
 * Single source of truth: engine local DEFAULT_CONFIG.poseThresholds
 */
export function resolvePoseThresholds(
  config: HandConfig,
  pose: PoseName,
): PoseThresholds {
  // User config takes priority
  const userConfigured = config.poseThresholds?.[pose] ?? {};
  // Then DEFAULT_CONFIG from the local type/config layer
  const defaultConfigured = DEFAULT_CONFIG.poseThresholds?.[pose] ?? {};

  // Merge: FALLBACK <- DEFAULT_CONFIG <- user config
  return {
    ...FALLBACK_THRESHOLDS,
    ...defaultConfigured,
    ...userConfigured,
  };
}
