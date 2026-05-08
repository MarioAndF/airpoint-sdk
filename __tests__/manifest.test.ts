import { describe, expect, it } from "vitest";
import {
  normalizeAirpointManifest,
  validateAirpointManifest,
} from "../src/manifest";

describe("manifest helpers", () => {
  it("normalizes shorthand string bindings into intent configs", () => {
    const manifest = normalizeAirpointManifest({
      intents: {
        thumb_middle_pinch: {
          tap: "primary-select",
        },
      },
    });

    expect(manifest.intents.thumb_middle_pinch?.tap).toEqual({
      id: "primary-select",
    });
  });

  it("preserves structured bindings and metadata", () => {
    const manifest = normalizeAirpointManifest({
      intents: {
        thumb_middle_pinch: {
          tap: {
            allowWhenBlocked: true,
            id: "primary-select",
            metadata: { source: "test" },
            target: "toolbar.primary",
          },
        },
      },
    });

    expect(manifest.intents.thumb_middle_pinch?.tap).toEqual({
      allowWhenBlocked: true,
      id: "primary-select",
      metadata: { source: "test" },
      target: "toolbar.primary",
    });
  });

  it("rejects invalid target definitions", () => {
    expect(() =>
      validateAirpointManifest({
        intents: {
          thumb_middle_pinch: {
            tap: { id: "primary-select", target: " " },
          },
        },
      }),
    ).toThrow("Invalid target");
  });
});
