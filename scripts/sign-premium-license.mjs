#!/usr/bin/env node

import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function usage() {
  console.error(
    "Usage: airpoint-sdk-sign-premium-license --claims <file> --private-key-jwk <file> --out <file> [--public-key-out <file>]",
  );
  process.exit(1);
}

function canonicalizeValue(value) {
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

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

const args = parseArgs(process.argv.slice(2));
if (!args.claims || !args["private-key-jwk"] || !args.out) {
  usage();
}

const claims = JSON.parse(readFileSync(resolve(args.claims), "utf8"));
const privateJwk = JSON.parse(
  readFileSync(resolve(args["private-key-jwk"]), "utf8"),
);
const privateKey = createPrivateKey({
  key: privateJwk,
  format: "jwk",
});

const signature = sign(
  "sha256",
  Buffer.from(canonicalizeValue(claims)),
  privateKey,
);

const license = {
  ...claims,
  signature: toBase64Url(signature),
};

mkdirSync(dirname(resolve(args.out)), { recursive: true });
writeFileSync(resolve(args.out), `${JSON.stringify(license, null, 2)}\n`);

if (args["public-key-out"]) {
  const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });
  mkdirSync(dirname(resolve(args["public-key-out"])), { recursive: true });
  writeFileSync(
    resolve(args["public-key-out"]),
    `${JSON.stringify(publicJwk, null, 2)}\n`,
  );
}

console.log(`[airpoint/sdk] Signed premium license -> ${resolve(args.out)}`);
