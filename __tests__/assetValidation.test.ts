import { describe, expect, it, vi } from "vitest";
import { validateAirpointSdkAssets } from "../src/assetValidation";

describe("validateAirpointSdkAssets", () => {
  it("passes when every required asset responds successfully", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;

    await expect(
      validateAirpointSdkAssets(
        {
          basePath: "/airpoint",
        },
        {},
        fetchMock,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws with exact missing paths when assets are unavailable", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("vision_bundle.js")) {
        return {
          ok: false,
          status: 404,
        };
      }
      return {
        ok: true,
        status: 200,
      };
    }) as unknown as typeof fetch;

    await expect(
      validateAirpointSdkAssets(
        {
          basePath: "/airpoint",
        },
        {},
        fetchMock,
      ),
    ).rejects.toThrow("/airpoint/mediapipe/vision_bundle.js");
  });

  it("accepts in-memory premium asset URLs without fetching them", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;

    await expect(
      validateAirpointSdkAssets(
        {
          basePath: "/airpoint",
        },
        {
          enableMLClassifier: true,
          gestureModel: "airmouse-4.3",
          hasPremiumBundle: true,
          premiumBundlePath: "blob:airpoint-premium-bundle",
        },
        fetchMock,
      ),
    ).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalledWith(
      "blob:airpoint-premium-bundle",
      expect.anything(),
    );
  });
});
