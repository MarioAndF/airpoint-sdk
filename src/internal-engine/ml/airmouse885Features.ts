import { HandLandmark, Handedness } from "../core/types";

const LANDMARK_COUNT = 21;
const VALUES_PER_POINT = 3;
const EPSILON = 1e-6;

// Bone pairs for geometry features.
export const AIRMOUSE_BONE_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

// Angle triplets for joint-angle features.
export const AIRMOUSE_ANGLE_TRIPLETS: [number, number, number][] = [
  [1, 2, 3],
  [2, 3, 4],
  [5, 6, 7],
  [6, 7, 8],
  [9, 10, 11],
  [10, 11, 12],
  [13, 14, 15],
  [14, 15, 16],
  [17, 18, 19],
  [18, 19, 20],
  [0, 5, 6],
  [0, 9, 10],
  [0, 13, 14],
  [0, 17, 18],
  [0, 1, 2],
];

export const AIRMOUSE_885_GROUP_LENGTHS = {
  raw3D: 63,
  raw2DWithZ: 63,
  wristRelative3D: 63,
  wristRelative2DWithZ: 63,
  palmNormalizedWithZ: 63,
  geometry2D: 285,
  geometry3D: 285,
} as const;

export type Airmouse885GroupName = keyof typeof AIRMOUSE_885_GROUP_LENGTHS;

export type Airmouse885GroupRanges = Record<
  Airmouse885GroupName,
  { start: number; end: number }
>;

function buildRanges(): Airmouse885GroupRanges {
  let offset = 0;
  const result = {} as Airmouse885GroupRanges;

  const names = Object.keys(
    AIRMOUSE_885_GROUP_LENGTHS,
  ) as Airmouse885GroupName[];

  for (const name of names) {
    const len = AIRMOUSE_885_GROUP_LENGTHS[name];
    result[name] = { start: offset, end: offset + len };
    offset += len;
  }

  return result;
}

export const AIRMOUSE_885_GROUP_RANGES: Airmouse885GroupRanges = buildRanges();
export const AIRMOUSE_885_FEATURE_COUNT = 885;

export type AirmouseGeometryFeatureGroup = {
  pairwiseDistances: number[];
  boneVectors: number[][];
  jointAngles: number[];
};

export type Airmouse885FeatureGroups = {
  raw3D: number[][];
  raw2DWithZ: number[][];
  wristRelative3D: number[][];
  wristRelative2DWithZ: number[][];
  palmNormalizedWithZ: number[][];
  geometry2D: AirmouseGeometryFeatureGroup;
  geometry3D: AirmouseGeometryFeatureGroup;
  flat: Float32Array;
  ranges: Airmouse885GroupRanges;
};

function validateLandmarks(
  landmarks2D: HandLandmark[],
  landmarks3D: HandLandmark[],
) {
  if (landmarks2D.length !== LANDMARK_COUNT) {
    throw new Error(`Expected 21 2D landmarks, got ${landmarks2D.length}`);
  }
  if (landmarks3D.length !== LANDMARK_COUNT) {
    throw new Error(`Expected 21 3D landmarks, got ${landmarks3D.length}`);
  }
}

function fillGeometry(
  landmarks: HandLandmark[],
  out: Float32Array,
  startOffset: number,
): number {
  let idx = startOffset;

  // Pairwise distances (210).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    for (let j = i + 1; j < LANDMARK_COUNT; j++) {
      const a = landmarks[i];
      const b = landmarks[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      out[idx++] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  // Bone vectors (60).
  for (const [a, b] of AIRMOUSE_BONE_PAIRS) {
    out[idx++] = landmarks[b].x - landmarks[a].x;
    out[idx++] = landmarks[b].y - landmarks[a].y;
    out[idx++] = landmarks[b].z - landmarks[a].z;
  }

  // Joint angles (15).
  for (const [i, j, k] of AIRMOUSE_ANGLE_TRIPLETS) {
    const a = landmarks[i];
    const b = landmarks[j];
    const c = landmarks[k];
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v1z = a.z - b.z;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const v2z = c.z - b.z;
    const dot = v1x * v2x + v1y * v2y + v1z * v2z;
    const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
    const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
    out[idx++] =
      n1 > EPSILON && n2 > EPSILON
        ? Math.acos(Math.max(-1, Math.min(1, dot / (n1 * n2))))
        : 0;
  }

  return idx;
}

/**
 * Mirrors landmarks to match the model input convention used by HandCursorEngine:
 * - Left hand 2D x becomes (1 - x)
 * - Left hand 3D x becomes (-x)
 */
export function mirrorLandmarksForModelInput(
  handedness: Handedness,
  landmarks2D: HandLandmark[],
  landmarks3D: HandLandmark[],
): { landmarks2D: HandLandmark[]; landmarks3D: HandLandmark[] } {
  if (handedness !== "Left") {
    return { landmarks2D, landmarks3D };
  }

  return {
    landmarks2D: landmarks2D.map((lm) => ({ ...lm, x: 1 - lm.x })),
    landmarks3D: landmarks3D.map((lm) => ({ ...lm, x: -lm.x })),
  };
}

/**
 * Extracts the full 885-dim airmouse feature vector into `out`.
 * Layout follows AIRMOUSE_885_GROUP_RANGES.
 */
export function extractAirmouse885ToBuffer(
  landmarks2D: HandLandmark[],
  landmarks3D: HandLandmark[],
  out: Float32Array,
): Float32Array {
  validateLandmarks(landmarks2D, landmarks3D);

  if (out.length < AIRMOUSE_885_FEATURE_COUNT) {
    throw new Error(
      `Output buffer must have at least 885 values, got ${out.length}`,
    );
  }

  let idx = 0;

  const wrist3D = landmarks3D[0];
  const wrist2D = landmarks2D[0];
  const indexMcp2D = landmarks2D[5];

  const dx = wrist2D.x - indexMcp2D.x;
  const dy = wrist2D.y - indexMcp2D.y;
  const palmSize = Math.max(Math.sqrt(dx * dx + dy * dy), EPSILON);

  // 1) Raw 3D landmarks (63).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[idx++] = landmarks3D[i].x;
    out[idx++] = landmarks3D[i].y;
    out[idx++] = landmarks3D[i].z;
  }

  // 2) Raw 2D landmarks with z (63).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[idx++] = landmarks2D[i].x;
    out[idx++] = landmarks2D[i].y;
    out[idx++] = landmarks2D[i].z;
  }

  // 3) Wrist-relative 3D (63).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[idx++] = landmarks3D[i].x - wrist3D.x;
    out[idx++] = landmarks3D[i].y - wrist3D.y;
    out[idx++] = landmarks3D[i].z - wrist3D.z;
  }

  // 4) Wrist-relative 2D with z (63).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[idx++] = landmarks2D[i].x - wrist2D.x;
    out[idx++] = landmarks2D[i].y - wrist2D.y;
    out[idx++] = landmarks2D[i].z - wrist2D.z;
  }

  // 5) Palm-normalized with z (63).
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    out[idx++] = (landmarks3D[i].x - wrist3D.x) / palmSize;
    out[idx++] = (landmarks3D[i].y - wrist3D.y) / palmSize;
    out[idx++] = (landmarks3D[i].z - wrist3D.z) / palmSize;
  }

  // 6) "2D" geometry using full xyz (285).
  idx = fillGeometry(landmarks2D, out, idx);

  // 7) 3D geometry (285).
  idx = fillGeometry(landmarks3D, out, idx);

  return out;
}

export function extractAirmouse885Features(
  landmarks2D: HandLandmark[],
  landmarks3D: HandLandmark[],
): Float32Array {
  const out = new Float32Array(AIRMOUSE_885_FEATURE_COUNT);
  return extractAirmouse885ToBuffer(landmarks2D, landmarks3D, out);
}

function toTriplets(values: Float32Array | number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < values.length; i += VALUES_PER_POINT) {
    result.push([values[i], values[i + 1], values[i + 2]]);
  }
  return result;
}

function toGeometryGroup(values: Float32Array): AirmouseGeometryFeatureGroup {
  const pairwise = Array.from(values.slice(0, 210));
  const bones = toTriplets(values.slice(210, 270));
  const angles = Array.from(values.slice(270, 285));
  return {
    pairwiseDistances: pairwise,
    boneVectors: bones,
    jointAngles: angles,
  };
}

export function extractAirmouse885GroupedFeatures(
  landmarks2D: HandLandmark[],
  landmarks3D: HandLandmark[],
): Airmouse885FeatureGroups {
  const flat = extractAirmouse885Features(landmarks2D, landmarks3D);

  const raw3DRange = AIRMOUSE_885_GROUP_RANGES.raw3D;
  const raw2DRange = AIRMOUSE_885_GROUP_RANGES.raw2DWithZ;
  const wrist3DRange = AIRMOUSE_885_GROUP_RANGES.wristRelative3D;
  const wrist2DRange = AIRMOUSE_885_GROUP_RANGES.wristRelative2DWithZ;
  const palmRange = AIRMOUSE_885_GROUP_RANGES.palmNormalizedWithZ;
  const geometry2DRange = AIRMOUSE_885_GROUP_RANGES.geometry2D;
  const geometry3DRange = AIRMOUSE_885_GROUP_RANGES.geometry3D;

  return {
    raw3D: toTriplets(flat.slice(raw3DRange.start, raw3DRange.end)),
    raw2DWithZ: toTriplets(flat.slice(raw2DRange.start, raw2DRange.end)),
    wristRelative3D: toTriplets(
      flat.slice(wrist3DRange.start, wrist3DRange.end),
    ),
    wristRelative2DWithZ: toTriplets(
      flat.slice(wrist2DRange.start, wrist2DRange.end),
    ),
    palmNormalizedWithZ: toTriplets(flat.slice(palmRange.start, palmRange.end)),
    geometry2D: toGeometryGroup(
      flat.slice(geometry2DRange.start, geometry2DRange.end),
    ),
    geometry3D: toGeometryGroup(
      flat.slice(geometry3DRange.start, geometry3DRange.end),
    ),
    flat,
    ranges: AIRMOUSE_885_GROUP_RANGES,
  };
}
