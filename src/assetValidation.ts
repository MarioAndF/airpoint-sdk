import {
  getAirpointSdkRequiredAssets,
  type AirpointSdkAssetPaths,
  type AirpointSdkAssetProfile,
  type AirpointSdkRequiredAsset,
} from "./assetPaths";

type FetchLike = typeof fetch;

type AirpointMissingAsset = AirpointSdkRequiredAsset & {
  status?: number;
};

function isMethodNotAllowed(status: number) {
  return status === 405 || status === 501;
}

function isInlineAssetPath(path: string) {
  return path.startsWith("blob:") || path.startsWith("data:");
}

async function assetExists(
  fetchImpl: FetchLike,
  path: string,
): Promise<{ ok: true } | { ok: false; status?: number }> {
  if (isInlineAssetPath(path)) {
    return { ok: true };
  }

  const headResponse = await fetchImpl(path, {
    cache: "no-store",
    method: "HEAD",
  });
  if (headResponse.ok) {
    return { ok: true };
  }
  if (!isMethodNotAllowed(headResponse.status)) {
    return { ok: false, status: headResponse.status };
  }

  const getResponse = await fetchImpl(path, {
    cache: "no-store",
    method: "GET",
  });
  if (getResponse.ok) {
    return { ok: true };
  }
  return { ok: false, status: getResponse.status };
}

function formatMissingAssets(missingAssets: AirpointMissingAsset[]): string {
  return missingAssets
    .map((asset) =>
      asset.status
        ? `- ${asset.kind}: ${asset.path} (HTTP ${asset.status})`
        : `- ${asset.kind}: ${asset.path}`,
    )
    .join("\n");
}

export async function validateAirpointSdkAssets(
  assets: AirpointSdkAssetPaths = {},
  profile: AirpointSdkAssetProfile = {},
  fetchImpl: FetchLike | undefined = typeof fetch === "function"
    ? fetch
    : undefined,
): Promise<void> {
  if (!fetchImpl) {
    return;
  }

  const requiredAssets = getAirpointSdkRequiredAssets(assets, profile);
  const missingAssets: AirpointMissingAsset[] = [];

  for (const asset of requiredAssets) {
    try {
      const result = await assetExists(fetchImpl, asset.path);
      if (!result.ok) {
        missingAssets.push({
          ...asset,
          status: result.status,
        });
      }
    } catch {
      missingAssets.push(asset);
    }
  }

  if (missingAssets.length === 0) {
    return;
  }

  throw new Error(
    [
      "Airpoint SDK assets are missing or not being served from the configured base path.",
      formatMissingAssets(missingAssets),
      "Copy the public runtime assets into your app and separately host the premium AirMouse assets or encrypted premium bundle before starting tracking.",
      "Example: `pnpm exec airpoint-sdk-copy-assets --out public --base airpoint`",
    ].join("\n"),
  );
}
