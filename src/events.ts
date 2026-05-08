import type {
  Handedness,
  HandLandmark,
  PoseName,
  PoseProbabilities,
} from "./types";

export type AirpointSdkEventType =
  | "move"
  | "pose"
  | "pose_enter"
  | "pose_exit"
  | "hand_found"
  | "hand_lost"
  | "raw_landmarks"
  | "timing";

export type AirpointSdkEventBase = {
  type: AirpointSdkEventType;
  timestamp: number;
  hand: Handedness;
  x?: number;
  y?: number;
  confidence?: number;
};

export type AirpointMoveEvent = AirpointSdkEventBase & {
  type: "move";
  speed: number;
  fingerSpeed: number;
  handednessScore?: number;
  scroll?: { x: number; y: number };
};

export type AirpointPoseEvent = AirpointSdkEventBase & {
  type: "pose";
  pose: PoseName;
  poseProbabilities: PoseProbabilities;
};

export type AirpointPoseEnterEvent = AirpointSdkEventBase & {
  type: "pose_enter";
  pose: PoseName;
};

export type AirpointPoseExitEvent = AirpointSdkEventBase & {
  type: "pose_exit";
  pose: PoseName;
};

export type AirpointPoseTransitionEvent =
  | AirpointPoseEnterEvent
  | AirpointPoseExitEvent;

export type AirpointHandFoundEvent = AirpointSdkEventBase & {
  type: "hand_found";
};

export type AirpointHandLostEvent = AirpointSdkEventBase & {
  type: "hand_lost";
};

export type AirpointHandEvent = AirpointHandFoundEvent | AirpointHandLostEvent;

export type AirpointRawLandmarksEvent = AirpointSdkEventBase & {
  type: "raw_landmarks";
  landmarks: HandLandmark[];
  worldLandmarks?: HandLandmark[];
};

export type AirpointTimingEvent = AirpointSdkEventBase & {
  type: "timing";
  timing: Record<string, number>;
};

export type AirpointSdkEvent =
  | AirpointMoveEvent
  | AirpointPoseEvent
  | AirpointPoseEnterEvent
  | AirpointPoseExitEvent
  | AirpointHandFoundEvent
  | AirpointHandLostEvent
  | AirpointRawLandmarksEvent
  | AirpointTimingEvent;

export type AirpointSdkEventMap = {
  move: AirpointMoveEvent;
  pose: AirpointPoseEvent;
  pose_enter: AirpointPoseEnterEvent;
  pose_exit: AirpointPoseExitEvent;
  hand_found: AirpointHandFoundEvent;
  hand_lost: AirpointHandLostEvent;
  raw_landmarks: AirpointRawLandmarksEvent;
  timing: AirpointTimingEvent;
};

type EventListener<T extends AirpointSdkEventType> = (
  event: AirpointSdkEventMap[T],
) => void;

export class AirpointEventEmitter {
  private listeners = new Map<AirpointSdkEventType, Set<EventListener<any>>>();

  on<T extends AirpointSdkEventType>(
    type: T,
    cb: EventListener<T>,
  ): () => void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(cb as EventListener<any>);
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(cb as EventListener<any>);
    };
  }

  emit<T extends AirpointSdkEventType>(type: T, event: AirpointSdkEventMap[T]): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    for (const cb of bucket) {
      cb(event as any);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
