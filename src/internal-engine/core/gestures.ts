import { HandLandmark } from "./types";

export function getHandRotation(landmarks: HandLandmark[]) {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const middleMcp = landmarks[9];

  // Vector from wrist to middle MCP (up the palm)
  const palmUp = {
    x: middleMcp.x - wrist.x,
    y: middleMcp.y - wrist.y,
    z: middleMcp.z - wrist.z,
  };

  // Vector from pinky MCP to index MCP (across the palm)
  const palmAcross = {
    x: indexMcp.x - pinkyMcp.x,
    y: indexMcp.y - pinkyMcp.y,
    z: indexMcp.z - pinkyMcp.z,
  };

  // Palm normal (cross product)
  const normal = {
    x: palmAcross.y * palmUp.z - palmAcross.z * palmUp.y,
    y: palmAcross.z * palmUp.x - palmAcross.x * palmUp.z,
    z: palmAcross.x * palmUp.y - palmAcross.y * palmUp.x,
  };

  // Normalize
  const normalize = (v: any) => {
    const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (mag > 0) {
      v.x /= mag;
      v.y /= mag;
      v.z /= mag;
    }
  };

  normalize(normal);
  normalize(palmUp);

  const pitch = Math.atan2(-palmUp.z, -palmUp.y) * (180 / Math.PI);
  const yaw = Math.atan2(normal.x, -normal.z) * (180 / Math.PI);
  const roll = Math.atan2(palmAcross.y, palmAcross.x) * (180 / Math.PI);

  return { pitch, yaw, roll };
}
