export const MEDIAPIPE_DEFAULT_WASM_PATH = "/mediapipe/wasm";

function isZipTaskFile(bytes: Uint8Array): boolean {
  const maxOffset = Math.min(8, Math.max(0, bytes.length - 4));
  for (let off = 0; off <= maxOffset; off++) {
    if (
      bytes[off] === 0x50 &&
      bytes[off + 1] === 0x4b &&
      (bytes[off + 2] === 0x03 ||
        bytes[off + 2] === 0x05 ||
        bytes[off + 2] === 0x07) &&
      (bytes[off + 3] === 0x04 ||
        bytes[off + 3] === 0x06 ||
        bytes[off + 3] === 0x08)
    ) {
      return true;
    }
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchModelBytes(
  url: string,
  retries = 3,
  timeoutMs = 45_000,
): Promise<Uint8Array> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        cache: attempt === 1 ? "force-cache" : "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch model: ${url} (HTTP ${res.status})`);
      }

      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (!isZipTaskFile(bytes)) {
        const ct = res.headers.get("content-type") || "unknown";
        throw new Error(
          `Model URL did not return a .task zip (content-type=${ct}): ${url}`,
        );
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(200 * attempt);
      }
    } finally {
      clearTimeout(timerId);
    }
  }

  throw lastError ?? new Error(`Failed to fetch model: ${url}`);
}

export async function loadTaskModelBytes(
  modelSources: readonly string[],
): Promise<Uint8Array> {
  let lastModelError: unknown = null;

  for (const source of modelSources) {
    try {
      return await fetchModelBytes(source, 3, 45_000);
    } catch (error) {
      lastModelError = error;
    }
  }

  throw lastModelError ?? new Error("Unable to load MediaPipe model.");
}

export function nextMonotonicTimestamp(
  lastTimestampMs: number,
  candidateMs: number,
): number {
  let ts = Number.isFinite(candidateMs) ? Math.floor(candidateMs) : 0;
  if (ts <= 0) ts = 1;
  if (ts <= lastTimestampMs) ts = lastTimestampMs + 1;
  return ts;
}
