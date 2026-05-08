#!/usr/bin/env node

import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetsRoot = resolve(root, "assets");

const args = process.argv.slice(2);
const outArgIndex = args.findIndex((arg) => arg === "--out");
const outDir =
  (outArgIndex >= 0 ? args[outArgIndex + 1] : undefined) || "public";
const baseArgIndex = args.findIndex((arg) => arg === "--base");
const baseDir = (baseArgIndex >= 0 ? args[baseArgIndex + 1] : undefined) || "";

const destRoot = resolve(process.cwd(), outDir);
const baseRoot = baseDir
  ? resolve(destRoot, baseDir.replace(/^\/+|\/+$/gu, ""))
  : destRoot;

const copyDir = (srcDir, destDir) => {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const src = resolve(srcDir, entry);
    const dest = resolve(destDir, entry);
    if (statSync(src).isDirectory()) {
      copyDir(src, dest);
      continue;
    }
    copyFileSync(src, dest);
  }
};

const ortSrc = resolve(assetsRoot, "ort");
const mediaPipeSrc = resolve(assetsRoot, "mediapipe");

copyDir(ortSrc, resolve(baseRoot, "ort"));
copyDir(mediaPipeSrc, resolve(baseRoot, "mediapipe"));

console.log(`[airpoint/sdk] Public runtime assets copied to ${baseRoot}`);
