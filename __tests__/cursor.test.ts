// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createAirpointCursorOverlay } from "../src/cursor";

describe("createAirpointCursorOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders removable click pulse feedback on demand", () => {
    vi.useFakeTimers();
    const cursor = createAirpointCursorOverlay({ size: 32 });

    cursor.move(100, 120, { space: "pixels" });
    cursor.pulse({ durationMs: 120 });

    expect(
      document.body.querySelector("[data-airpoint-cursor-pulse]"),
    ).not.toBeNull();
    expect(
      cursor.element.querySelector("[data-airpoint-cursor-pulse]"),
    ).toBeNull();

    vi.advanceTimersByTime(200);

    expect(
      document.body.querySelector("[data-airpoint-cursor-pulse]"),
    ).toBeNull();
  });

  it("auto-pulses when click state becomes active", () => {
    vi.useFakeTimers();
    const cursor = createAirpointCursorOverlay({ size: 32 });

    cursor.move(100, 120, { clicking: true, space: "pixels" });

    expect(
      document.body.querySelectorAll("[data-airpoint-cursor-pulse]"),
    ).toHaveLength(1);
    expect(
      cursor.element.querySelector("[data-airpoint-cursor-pulse]"),
    ).toBeNull();

    cursor.move(100, 120, { clicking: true, space: "pixels" });

    expect(
      document.body.querySelectorAll("[data-airpoint-cursor-pulse]"),
    ).toHaveLength(1);

    cursor.move(100, 120, { space: "pixels" });
    cursor.move(100, 120, { clicking: true, space: "pixels" });

    expect(
      document.body.querySelectorAll("[data-airpoint-cursor-pulse]"),
    ).toHaveLength(2);
  });

  it("starts click pulse as an outer halo instead of a center dot", () => {
    vi.useFakeTimers();
    const cursor = createAirpointCursorOverlay({ size: 32 });

    cursor.move(100, 120, { clicking: true, space: "pixels" });
    const pulse = document.body.querySelector(
      "[data-airpoint-cursor-pulse]",
    ) as HTMLElement | null;

    expect(pulse?.style.transform).toBe("translate(-50%, -50%) scale(1)");
    expect(pulse?.style.width).toBe("40px");
    expect(pulse?.style.height).toBe("40px");
  });

  it("keeps cursor translation separate from click scaling", () => {
    const cursor = createAirpointCursorOverlay({ size: 32, style: "arrow" });

    cursor.move(1000, 600, { space: "pixels" });
    const idleTransform = cursor.element.style.transform;

    cursor.move(1000, 600, { clicking: true, space: "pixels" });
    const glyph = cursor.element.firstElementChild as HTMLElement | null;

    expect(cursor.element.style.transform).toBe(idleTransform);
    expect(cursor.element.style.scale ?? "").toBe("");
    expect(glyph?.style.transform).toBe("scale(0.9)");
  });

  it("renders circle cursor without a permanent inner dot", () => {
    const cursor = createAirpointCursorOverlay({ style: "circle" });

    expect(cursor.element.querySelectorAll("svg circle")).toHaveLength(1);
  });
});
