/**
 * CameraManager - 100% AGNOSTIC camera utility
 * Works on ANY camera on ANY device - no hardcoded values
 *
 * Strategy:
 * - First load: Get basic stream → read capabilities → stop → get optimal stream
 * - Subsequent loads: Use cached capabilities → get optimal stream directly
 */

export type AspectRatioMode = "auto" | "16:9" | "4:3" | "1:1" | "9:16";

export interface CameraMode {
  id: AspectRatioMode;
  label: string;
  width: number;
  height: number;
  aspectRatio: number;
  totalPixels: number;
  frameRate?: number;
}

export interface CameraCapabilities {
  deviceId: string;
  deviceLabel: string;
  modes: CameraMode[];
  recommended: CameraMode;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  minFrameRate: number;
  maxFrameRate: number;
  supportedResolutions: Array<{ width: number; height: number; label: string }>;
  supportedFrameRates: number[];
}

export interface CameraStreamOptions {
  idealFrameRate?: number;
  minFrameRate?: number;
  maxFrameRate?: number;
  idealWidth?: number;
  idealHeight?: number;
}

const ASPECT_RATIOS: { id: AspectRatioMode; ratio: number; label: string }[] = [
  { id: "16:9", ratio: 16 / 9, label: "16:9 Landscape" },
  { id: "4:3", ratio: 4 / 3, label: "4:3" },
  { id: "1:1", ratio: 1, label: "1:1 Square" },
  { id: "9:16", ratio: 9 / 16, label: "9:16 Portrait" },
];

// Cache
let cachedCapabilities: CameraCapabilities | null = null;
const CACHE_KEY = "airpoint-camera-capabilities";

function isDeviceNotFoundError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "NotFoundError" || name === "OverconstrainedError";
}

/**
 * Calculate available modes from camera's reported max dimensions
 */
function calculateModes(maxWidth: number, maxHeight: number): CameraMode[] {
  const maxDimension = Math.max(maxWidth, maxHeight);

  return ASPECT_RATIOS.map((ar) => {
    let width: number;
    let height: number;

    if (ar.ratio >= 1) {
      // Landscape or square
      width = Math.min(maxDimension, maxWidth);
      height = Math.round(width / ar.ratio);
      if (height > maxHeight) {
        height = maxHeight;
        width = Math.round(height * ar.ratio);
      }
    } else {
      // Portrait
      height = Math.min(maxDimension, maxHeight);
      width = Math.round(height * ar.ratio);
      if (width > maxWidth) {
        width = maxWidth;
        height = Math.round(width / ar.ratio);
      }
    }

    return {
      id: ar.id,
      label: `${ar.label} (${width}x${height})`,
      width,
      height,
      aspectRatio: ar.ratio,
      totalPixels: width * height,
    };
  });
}

function buildSupportedResolutions(
  capabilities: MediaTrackCapabilities
): Array<{ width: number; height: number; label: string }> {
  const maxW = capabilities.width?.max ?? 1920;
  const maxH = capabilities.height?.max ?? 1080;
  const minW = capabilities.width?.min ?? 0;
  const minH = capabilities.height?.min ?? 0;

  const presets = [
    { width: 3840, height: 2160, label: "4K (3840x2160)" },
    { width: 2560, height: 1440, label: "1440p (2560x1440)" },
    { width: 1920, height: 1080, label: "1080p (1920x1080)" },
    { width: 1600, height: 1200, label: "UXGA (1600x1200)" },
    { width: 1280, height: 960, label: "960p (1280x960)" },
    { width: 1280, height: 720, label: "720p (1280x720)" },
    { width: 1024, height: 768, label: "XGA (1024x768)" },
    { width: 960, height: 540, label: "qHD (960x540)" },
    { width: 640, height: 480, label: "VGA (640x480)" },
    { width: 640, height: 360, label: "360p (640x360)" },
    { width: 320, height: 240, label: "QVGA (320x240)" },
  ];

  return presets.filter(
    (preset) =>
      preset.width <= maxW &&
      preset.height <= maxH &&
      preset.width >= minW &&
      preset.height >= minH
  );
}

function buildSupportedFrameRates(
  capabilities: MediaTrackCapabilities
): number[] {
  const min = capabilities.frameRate?.min ?? 1;
  const max = capabilities.frameRate?.max ?? 60;
  const presets = [15, 24, 30, 45, 60, 90, 120];
  return presets.filter((fps) => fps >= min && fps <= max);
}

/**
 * Get capabilities from camera - reads max width/height from device
 * Returns capabilities without keeping the stream open
 */
async function detectCapabilities(
  deviceId?: string
): Promise<CameraCapabilities> {
  // Get minimal stream just to read capabilities
  const requestStream = async (useDeviceId?: string) =>
    navigator.mediaDevices.getUserMedia({
      video: useDeviceId
        ? { deviceId: { exact: useDeviceId } }
        : { facingMode: "user" },
    });

  let stream: MediaStream;
  try {
    stream = await requestStream(deviceId);
  } catch (error) {
    if (deviceId && isDeviceNotFoundError(error)) {
      stream = await requestStream(undefined);
      deviceId = undefined;
    } else {
      throw error;
    }
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("No video track available");
  }

  const caps = track.getCapabilities();
  const actualDeviceId = deviceId ? caps.deviceId || deviceId : "default";
  const deviceLabel = track.label || "Camera";
  const minWidth = caps.width?.min ?? 0;
  const maxWidth = caps.width?.max ?? 640;
  const minHeight = caps.height?.min ?? 0;
  const maxHeight = caps.height?.max ?? 480;
  const minFrameRate = caps.frameRate?.min ?? 1;
  const maxFrameRate = caps.frameRate?.max ?? 60;

  // Stop immediately - we only needed capabilities
  track.stop();
  stream.getTracks().forEach((t) => t.stop());

  // Calculate modes from capabilities
  const modes = calculateModes(maxWidth, maxHeight);
  const supportedResolutions = buildSupportedResolutions(caps);
  const supportedFrameRates = buildSupportedFrameRates(caps);

  // Recommended = highest total pixels
  const recommended = modes.reduce((best, current) =>
    current.totalPixels > best.totalPixels ? current : best
  );

  const capabilities: CameraCapabilities = {
    deviceId: actualDeviceId,
    deviceLabel,
    modes,
    recommended,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    minFrameRate,
    maxFrameRate,
    supportedResolutions,
    supportedFrameRates,
  };

  // Cache it (avoid persisting default-device cache)
  cachedCapabilities = capabilities;
  if (deviceId) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(capabilities));
    } catch {}
  }

  return capabilities;
}

/**
 * Load cached capabilities (memory or localStorage)
 */
function loadCachedCapabilities(deviceId?: string): CameraCapabilities | null {
  if (
    cachedCapabilities &&
    (deviceId
      ? cachedCapabilities.deviceId === deviceId
      : cachedCapabilities.deviceId === "default")
  ) {
    return cachedCapabilities;
  }

  try {
    const saved = localStorage.getItem(CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CameraCapabilities;
      cachedCapabilities = parsed;
      if (deviceId ? parsed.deviceId === deviceId : parsed.deviceId === "default") {
        return parsed;
      }
    }
  } catch {}

  return null;
}

/**
 * Get a camera stream with the specified mode
 * 100% AGNOSTIC - no hardcoded defaults
 *
 * First load: 2 camera accesses (detect capabilities, then get optimal stream)
 * Subsequent: 1 camera access (uses cached capabilities)
 */
export async function getCameraStream(
  mode: AspectRatioMode = "auto",
  deviceId?: string,
  options: CameraStreamOptions = {}
): Promise<{
  stream: MediaStream;
  actualMode: CameraMode;
  capabilities: CameraCapabilities;
}> {
  // Try to load cached capabilities
  let capabilities = loadCachedCapabilities(deviceId);

  // No cache? Detect capabilities first (this will flash once)
  if (!capabilities) {
    capabilities = await detectCapabilities(deviceId);
  }

  // Determine target mode
  let targetMode: CameraMode;
  if (mode === "auto") {
    targetMode = capabilities.recommended;
  } else {
    targetMode =
      capabilities.modes.find((m) => m.id === mode) || capabilities.recommended;
  }

  // Get stream with optimal mode - 2-step approach for Safari compatibility
  const requestStream = async (useDeviceId?: string) =>
    navigator.mediaDevices.getUserMedia({
      video: {
        ...(useDeviceId
          ? { deviceId: { exact: useDeviceId } }
          : { facingMode: "user" }),
        aspectRatio: { ideal: targetMode.aspectRatio },
      },
    });

  let stream: MediaStream;
  try {
    stream = await requestStream(deviceId);
  } catch (error) {
    if (deviceId && isDeviceNotFoundError(error)) {
      stream = await requestStream(undefined);
      deviceId = undefined;
    } else {
      throw error;
    }
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error("No video track available");
  }

  // Hint: optimize for motion (hand tracking).
  try {
    track.contentHint = "motion";
  } catch {}

  const idealWidth = options.idealWidth ?? targetMode.width;
  const idealHeight = options.idealHeight ?? targetMode.height;
  const idealAspectRatio =
    options.idealWidth && options.idealHeight
      ? idealWidth / idealHeight
      : targetMode.aspectRatio;

  const widthHeightConstraints: MediaTrackConstraints = {
    width: { ideal: idealWidth },
    height: { ideal: idealHeight },
    aspectRatio: { ideal: idealAspectRatio },
  };

  const frameRateConstraints =
    options.minFrameRate !== undefined ||
    options.idealFrameRate !== undefined ||
    options.maxFrameRate !== undefined
      ? {
          ...(options.minFrameRate !== undefined
            ? { min: options.minFrameRate }
            : {}),
          ...(options.idealFrameRate !== undefined
            ? { ideal: options.idealFrameRate }
            : {}),
          ...(options.maxFrameRate !== undefined
            ? { max: options.maxFrameRate }
            : {}),
        }
      : undefined;

  // Apply constraints (frameRate may be ignored or unsupported; resolution is best-effort).
  try {
    await track.applyConstraints({
      ...widthHeightConstraints,
      ...(frameRateConstraints ? { frameRate: frameRateConstraints } : {}),
    });
  } catch (e) {
    if (frameRateConstraints) {
      try {
        await track.applyConstraints(widthHeightConstraints);
      } catch {}
    } else {
      throw e;
    }
  }

  // Get actual resulting settings
  const settings = track.getSettings();
  const actualMode: CameraMode = {
    id: targetMode.id,
    label: `${targetMode.id} (${settings.width}x${settings.height})`,
    width: settings.width || targetMode.width,
    height: settings.height || targetMode.height,
    aspectRatio:
      (settings.width || targetMode.width) /
      (settings.height || targetMode.height),
    totalPixels:
      (settings.width || targetMode.width) *
      (settings.height || targetMode.height),
    frameRate: settings.frameRate,
  };

  return { stream, actualMode, capabilities };
}

/**
 * Get capabilities without opening camera (cache only)
 */
export function getCachedCapabilities(): CameraCapabilities | null {
  return loadCachedCapabilities();
}

/**
 * Force re-detection of camera capabilities
 */
export async function detectCameraModes(
  deviceId?: string
): Promise<CameraCapabilities> {
  return detectCapabilities(deviceId);
}

/**
 * Clear cached capabilities
 */
export function clearCameraCache(): void {
  cachedCapabilities = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

/**
 * List available cameras
 */
export async function listCameras(options?: {
  requestPermission?: boolean;
}): Promise<MediaDeviceInfo[]> {
  if (options?.requestPermission) {
    try {
      // Prompt for camera access so enumerateDevices returns labeled devices.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Ignore permission errors and fall back to enumerateDevices.
    }
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}
