export type KeyboardFingerName = "index" | "middle" | "ring" | "pinky";

export interface FingerPinchState {
    isPinching: boolean;
    justPressed: boolean;
    justReleased: boolean;
    distance: number;
}

export interface AirKeyboardResult {
    index: FingerPinchState;
    middle: FingerPinchState;
    ring: FingerPinchState;
    pinky: FingerPinchState;
    isActive: boolean;
}
