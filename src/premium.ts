type AirpointBase64Input = string | Uint8Array | ArrayBuffer;

export interface AirpointPremiumAssetEntry {
  data: string;
  encoding?: "base64" | "base64url";
  mediaType?: string;
}

export interface AirpointPremiumBundlePayload {
  assets: Record<string, AirpointPremiumAssetEntry>;
  bundleId: string;
  createdAt: string;
  version: 1;
}

export interface AirpointPremiumEncryptedBundle {
  algorithm: "AES-GCM-256";
  bundleId: string;
  createdAt: string;
  ciphertext: string;
  iv: string;
  version: 1;
}

export interface AirpointPremiumLicenseClaims {
  bundleId: string;
  customerId?: string;
  entitlements: string[];
  expiresAt?: string;
  issuedAt: string;
  licenseId: string;
  notBefore?: string;
  version: 1;
}

export interface AirpointPremiumLicense extends AirpointPremiumLicenseClaims {
  signature: string;
}

export interface AirpointPremiumOptions {
  bundle?: AirpointPremiumEncryptedBundle;
  bundlePath?: string;
  decryptionKey?: AirpointBase64Input;
  license: AirpointPremiumLicense;
  licensePublicKey: JsonWebKey;
  requiredEntitlements?: string[];
  resolveDecryptionKey?: (
    license: AirpointPremiumLicenseClaims,
  ) => Promise<AirpointBase64Input>;
}

export interface AirpointMaterializedPremiumAssets {
  assetUrls: Record<string, string>;
  revoke(): void;
}

export interface AirpointPreparedPremiumAssets {
  assetUrls: Record<string, string>;
  bundle: AirpointPremiumEncryptedBundle;
  claims: AirpointPremiumLicenseClaims;
  payload: AirpointPremiumBundlePayload;
  revoke(): void;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Airpoint premium asset protection requires Web Crypto.");
  }
  return globalThis.crypto;
}

function normalizeBase64(input: string) {
  const normalized = input.replace(/-/gu, "+").replace(/_/gu, "/");
  const padding = normalized.length % 4;
  if (padding === 0) {
    return normalized;
  }
  return `${normalized}${"=".repeat(4 - padding)}`;
}

function decodeBase64(input: string): Uint8Array {
  const normalized = normalizeBase64(input);

  if (typeof atob === "function") {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const globalBuffer = (
    globalThis as {
      Buffer?: {
        from(input: string, encoding: string): Uint8Array;
      };
    }
  ).Buffer;
  if (globalBuffer) {
    return new Uint8Array(globalBuffer.from(normalized, "base64"));
  }

  throw new Error("Unable to decode base64 asset data in this runtime.");
}

function bytesFromInput(input: AirpointBase64Input): Uint8Array {
  if (typeof input === "string") {
    return decodeBase64(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function canonicalizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeValue(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"));

    return `{${entries
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${canonicalizeValue(entry)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function inferMediaTypeFromPath(path: string): string {
  if (path.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

export function stripAirpointPremiumLicenseSignature(
  license: AirpointPremiumLicense,
): AirpointPremiumLicenseClaims {
  const { signature: _, ...claims } = license;
  return claims;
}

export function serializeAirpointPremiumLicenseClaims(
  license: AirpointPremiumLicense | AirpointPremiumLicenseClaims,
): string {
  const claims =
    "signature" in license
      ? stripAirpointPremiumLicenseSignature(license)
      : license;
  return canonicalizeValue(claims);
}

export async function verifyAirpointPremiumLicense(
  license: AirpointPremiumLicense,
  publicKey: JsonWebKey,
  options: {
    now?: Date;
    requiredEntitlements?: string[];
  } = {},
): Promise<AirpointPremiumLicenseClaims> {
  const claims = stripAirpointPremiumLicenseSignature(license);
  const requiredEntitlements = options.requiredEntitlements ?? [];
  const now = options.now ?? new Date();
  const cryptoApi = getCrypto();
  const verifyKey = await cryptoApi.subtle.importKey(
    "jwk",
    publicKey,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["verify"],
  );

  const isValid = await cryptoApi.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256",
    },
    verifyKey,
    toArrayBuffer(decodeBase64(license.signature)),
    toArrayBuffer(
      new TextEncoder().encode(serializeAirpointPremiumLicenseClaims(claims)),
    ),
  );

  if (!isValid) {
    throw new Error("Airpoint premium license signature is invalid.");
  }

  if (claims.version !== 1) {
    throw new Error(
      `Unsupported Airpoint premium license version: ${claims.version}`,
    );
  }

  if (claims.notBefore && now < new Date(claims.notBefore)) {
    throw new Error("Airpoint premium license is not active yet.");
  }

  if (claims.expiresAt && now > new Date(claims.expiresAt)) {
    throw new Error("Airpoint premium license has expired.");
  }

  for (const entitlement of requiredEntitlements) {
    if (!claims.entitlements.includes(entitlement)) {
      throw new Error(
        `Airpoint premium license is missing required entitlement: ${entitlement}`,
      );
    }
  }

  return claims;
}

export async function loadAirpointPremiumEncryptedBundle(
  options: Pick<AirpointPremiumOptions, "bundle" | "bundlePath">,
  fetchImpl: typeof fetch | undefined = typeof fetch === "function"
    ? fetch
    : undefined,
): Promise<AirpointPremiumEncryptedBundle> {
  if (options.bundle) {
    return options.bundle;
  }

  if (!options.bundlePath) {
    throw new Error(
      "Airpoint premium assets require either a bundle object or bundlePath.",
    );
  }

  if (!fetchImpl) {
    throw new Error(
      "Airpoint premium bundle loading requires fetch in this runtime.",
    );
  }

  const response = await fetchImpl(options.bundlePath, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load Airpoint premium bundle: HTTP ${response.status}`,
    );
  }

  return (await response.json()) as AirpointPremiumEncryptedBundle;
}

export async function decryptAirpointPremiumBundle(
  bundle: AirpointPremiumEncryptedBundle,
  keyInput: AirpointBase64Input,
): Promise<AirpointPremiumBundlePayload> {
  const cryptoApi = getCrypto();
  const keyBytes = bytesFromInput(keyInput);
  if (keyBytes.byteLength !== 32) {
    throw new Error(
      `Airpoint premium bundle decryption expects a 32-byte AES key, received ${keyBytes.byteLength} bytes.`,
    );
  }

  const key = await cryptoApi.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"],
  );

  const plaintext = await cryptoApi.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(decodeBase64(bundle.iv)),
    },
    key,
    toArrayBuffer(decodeBase64(bundle.ciphertext)),
  );

  const payload = JSON.parse(
    new TextDecoder().decode(new Uint8Array(plaintext)),
  ) as AirpointPremiumBundlePayload;

  if (payload.bundleId !== bundle.bundleId) {
    throw new Error(
      `Airpoint premium bundle mismatch: expected ${bundle.bundleId}, received ${payload.bundleId}.`,
    );
  }

  return payload;
}

export function materializeAirpointPremiumAssets(
  payload: AirpointPremiumBundlePayload,
): AirpointMaterializedPremiumAssets {
  const assetUrls: Record<string, string> = {};
  const revokableUrls = new Set<string>();

  for (const [path, asset] of Object.entries(payload.assets)) {
    const bytes = decodeBase64(asset.data);
    const mediaType = asset.mediaType ?? inferMediaTypeFromPath(path);

    if (
      typeof Blob !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      const url = URL.createObjectURL(
        new Blob([toArrayBuffer(bytes)], { type: mediaType }),
      );
      assetUrls[path] = url;
      revokableUrls.add(url);
      continue;
    }

    assetUrls[path] = `data:${mediaType};base64,${normalizeBase64(asset.data)}`;
  }

  return {
    assetUrls,
    revoke() {
      for (const url of revokableUrls) {
        URL.revokeObjectURL(url);
      }
      revokableUrls.clear();
    },
  };
}

export async function prepareAirpointPremiumAssets(
  options: AirpointPremiumOptions,
): Promise<AirpointPreparedPremiumAssets> {
  const claims = await verifyAirpointPremiumLicense(
    options.license,
    options.licensePublicKey,
    {
      requiredEntitlements: options.requiredEntitlements ?? [
        "airmouse-premium",
      ],
    },
  );

  const bundle = await loadAirpointPremiumEncryptedBundle(options);
  if (bundle.bundleId !== claims.bundleId) {
    throw new Error(
      `Airpoint premium license is for bundle ${claims.bundleId}, but bundle ${bundle.bundleId} was provided.`,
    );
  }

  const decryptionKey =
    options.decryptionKey ??
    (options.resolveDecryptionKey
      ? await options.resolveDecryptionKey(claims)
      : undefined);

  if (!decryptionKey) {
    throw new Error(
      "Airpoint premium assets require a decryption key or resolveDecryptionKey callback.",
    );
  }

  const payload = await decryptAirpointPremiumBundle(bundle, decryptionKey);
  const materialized = materializeAirpointPremiumAssets(payload);

  return {
    assetUrls: materialized.assetUrls,
    bundle,
    claims,
    payload,
    revoke: materialized.revoke,
  };
}
