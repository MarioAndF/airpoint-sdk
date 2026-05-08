import { HandConfig } from "./types";

export interface ScrollOutput {
    scrollDelta: { x: number; y: number };
    isScrolling: boolean;
    isInertia: boolean;
    axis: "x" | "y" | "free" | null;
}

export class ScrollController {
    // State
    private scrollAxis: "x" | "y" | "free" | null = null;
    private scrollAccumulator: { x: number; y: number } = { x: 0, y: 0 };

    private scrollVelocity: { x: number; y: number } = { x: 0, y: 0 };
    private inertiaVelocity: { x: number; y: number } = { x: 0, y: 0 };

    private isScrolling: boolean = false;
    private isInertia: boolean = false;

    private lastFrameTime: number = 0;

    constructor() { }

    reset() {
        this.scrollAxis = null;
        this.scrollAccumulator = { x: 0, y: 0 };
        this.scrollVelocity = { x: 0, y: 0 };
        this.inertiaVelocity = { x: 0, y: 0 };
        this.isScrolling = false;
        this.isInertia = false;
        this.lastFrameTime = 0;
    }

    process(
        cursorDelta: { x: number; y: number }, // Raw cursor movement delta
        isGestureActive: boolean, // Is the scroll gesture actively held?
        timestamp: number,
        config: HandConfig
    ): ScrollOutput {
        // Delta time calculation
        const dt = this.lastFrameTime > 0 ? (timestamp - this.lastFrameTime) / 1000 : 0.016;
        this.lastFrameTime = timestamp;

        let dx = 0;
        let dy = 0;
        let processedAsScroll = false;

        // --- TRANSITION: Active -> Inertia ---
        if (this.isScrolling && !isGestureActive) {
            // User released scroll gesture
            const speedSq =
                this.scrollVelocity.x * this.scrollVelocity.x +
                this.scrollVelocity.y * this.scrollVelocity.y;

            const minSpeed = config.scrollMinInertiaSpeed ?? 5;
            const MIN_INERTIA_SPEED_SQ = minSpeed * minSpeed;

            if (!this.isInertia && speedSq > MIN_INERTIA_SPEED_SQ) {
                this.isInertia = true;
                this.inertiaVelocity = { ...this.scrollVelocity };
            }

            this.isScrolling = false;
        }

        // --- ACTIVE SCROLLING ---
        if (isGestureActive) {
            this.isInertia = false;
            this.isScrolling = true;
            processedAsScroll = true;

            // Apply Deadzone
            const DEADZONE = config.scrollDeadzone ?? 0.5;
            let rawDx = cursorDelta.x;
            let rawDy = cursorDelta.y;

            if (Math.abs(rawDx) < DEADZONE) rawDx = 0;
            if (Math.abs(rawDy) < DEADZONE) rawDy = 0;

            const sensitivity = config.scrollSpeed;
            // Invert delta for natural scrolling (drag up to scroll down)
            const vx = -rawDx * sensitivity;
            const vy = -rawDy * sensitivity;

            let finalVx = vx;
            let finalVy = vy;

            // Axis Locking
            if (config.enableAxisLock) {
                const AXIS_LOCK_DISTANCE = 15;
                const BREAKOUT_THRESHOLD = 8;

                if (this.scrollAxis === null) {
                    // Accumulate
                    this.scrollAccumulator.x += vx;
                    this.scrollAccumulator.y += vy;

                    const accX = Math.abs(this.scrollAccumulator.x);
                    const accY = Math.abs(this.scrollAccumulator.y);
                    const dist = Math.hypot(accX, accY);

                    if (dist > AXIS_LOCK_DISTANCE) {
                        const ratio = config.axisLockThreshold || 2.0;
                        if (accX > accY * ratio) {
                            this.scrollAxis = "x";
                            finalVx = this.scrollAccumulator.x;
                            finalVy = 0;
                        } else if (accY > accX * ratio) {
                            this.scrollAxis = "y";
                            finalVx = 0;
                            finalVy = this.scrollAccumulator.y;
                        } else {
                            this.scrollAxis = "free";
                            finalVx = this.scrollAccumulator.x;
                            finalVy = this.scrollAccumulator.y;
                        }
                    } else {
                        // Still accumulating
                        finalVx = 0;
                        finalVy = 0;
                    }
                } else if (this.scrollAxis === "free") {
                    // Free mode - pass through
                } else {
                    // Locked - check breakout
                    if (this.scrollAxis === "x") {
                        if (Math.abs(vy) > BREAKOUT_THRESHOLD && Math.abs(vy) > Math.abs(vx) * 1.5) {
                            this.scrollAxis = "free";
                        } else {
                            finalVy = 0;
                        }
                    } else if (this.scrollAxis === "y") {
                        if (Math.abs(vx) > BREAKOUT_THRESHOLD && Math.abs(vx) > Math.abs(vy) * 1.5) {
                            this.scrollAxis = "free";
                        } else {
                            finalVx = 0;
                        }
                    }
                }
            } else {
                // No lock
                this.scrollAxis = "free";
            }

            dx = finalVx;
            dy = finalVy;

            // Update instantaneous velocity
            if (dt > 0) {
                // Simple smoothing for velocity
                const trackingAlpha = 0.5;
                // const instantVx = dx / dt; // pixels per second? No, dx is per frame.
                // Actually, scrollVelocity in original code seemed to be per-frame units?
                // Let's check original...
                // Original: hand.scrollVelocity = { x: finalVx, y: finalVy };
                // It just stored the per-frame delta as "velocity". 
                // We will stick to that to be safe.
                this.scrollVelocity.x = this.scrollVelocity.x * (1 - trackingAlpha) + dx * trackingAlpha;
                this.scrollVelocity.y = this.scrollVelocity.y * (1 - trackingAlpha) + dy * trackingAlpha;
            }

        } else if (this.isInertia) {
            // --- INERTIA ---
            const friction = config.scrollInertiaFriction ?? 0.95;
            this.inertiaVelocity.x *= friction;
            this.inertiaVelocity.y *= friction;

            dx = this.inertiaVelocity.x;
            dy = this.inertiaVelocity.y;

            const speedSq = this.inertiaVelocity.x * this.inertiaVelocity.x + this.inertiaVelocity.y * this.inertiaVelocity.y;
            if (speedSq < 0.5) {
                this.isInertia = false;
                this.inertiaVelocity = { x: 0, y: 0 };
                dx = 0;
                dy = 0;
            }
        } else {
            // Reset axis if neither active nor inertia
            this.scrollAxis = null;
            this.scrollAccumulator = { x: 0, y: 0 };
        }

        return {
            scrollDelta: { x: dx, y: dy },
            isScrolling: processedAsScroll,
            isInertia: this.isInertia,
            axis: this.scrollAxis
        };
    }
}
