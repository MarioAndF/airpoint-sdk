#!/usr/bin/env node

import { createCipheriv, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

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
    "Usage: airpoint-sdk-pack-premium-assets --in <dir> --out <file> [--bundle-id <id>] [--key-base64 <key> | --key-file <file>] [--write-key <file>]",
  );
  process.exit(1);
}

function normalizeBase64(input) {
  const normalized = input.replace(/-/gu, "+").replace(/_/gu, "/");
  const padding = normalized.length % 4;
  if (padding === 0) {
    return normalized;
  }
  return `${normalized}${"=".repeat(4 - padding)}`;
}

function toBase64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

function inferMediaType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".json") return "application/json";
  if (extension === ".onnx") return "application/octet-stream";
  return "application/octet-stream";
}

function collectFiles(rootDir, currentDir = rootDir, files = []) {
  for (const entry of readdirSync(currentDir)) {
    const fullPath = join(currentDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(rootDir, fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

const args = parseArgs(process.argv.slice(2));
const inputDir = args.in ? resolve(args.in) : null;
const outputFile = args.out ? resolve(args.out) : null;

if (!inputDir || !outputFile) {
  usage();
}

let key;
if (args["key-base64"]) {
  key = Buffer.from(normalizeBase64(args["key-base64"]), "base64");
} else if (args["key-file"]) {
  key = Buffer.from(
    normalizeBase64(readFileSync(resolve(args["key-file"]), "utf8").trim()),
    "base64",
  );
} else {
  key = randomBytes(32);
}

if (key.length !== 32) {
  throw new Error(`Expected a 32-byte AES key, received ${key.length} bytes.`);
}

if (args["write-key"]) {
  mkdirSync(dirname(resolve(args["write-key"])), { recursive: true });
  writeFileSync(resolve(args["write-key"]), toBase64Url(key));
}

const files = collectFiles(inputDir);
const assets = {};
for (const filePath of files) {
  const relativePath = relative(inputDir, filePath).split("\\").join("/");
  assets[relativePath] = {
    data: readFileSync(filePath).toString("base64"),
    encoding: "base64",
    mediaType: inferMediaType(relativePath),
  };
}

const bundleId = args["bundle-id"] ?? `${basename(inputDir)}-${Date.now()}`;
const payload = {
  assets,
  bundleId,
  createdAt: new Date().toISOString(),
  version: 1,
};

const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([
  cipher.update(JSON.stringify(payload), "utf8"),
  cipher.final(),
]);
const tag = cipher.getAuthTag();

const envelope = {
  algorithm: "AES-GCM-256",
  bundleId,
  createdAt: payload.createdAt,
  ciphertext: toBase64Url(Buffer.concat([ciphertext, tag])),
  iv: toBase64Url(iv),
  version: 1,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(envelope, null, 2)}\n`);

console.log(
  `[airpoint/sdk] Packed premium bundle ${bundleId} -> ${outputFile}`,
);
if (!args["key-base64"] && !args["key-file"] && !args["write-key"]) {
  console.log(
    `[airpoint/sdk] Generated AES key (base64url): ${toBase64Url(key)}`,
  );
}
