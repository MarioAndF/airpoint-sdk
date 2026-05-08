import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const targetDir = process.argv[2];

if (!targetDir) {
  throw new Error("Usage: node scripts/fix-dist-esm-imports.mjs <dist-dir>");
}

const distRoot = resolve(process.cwd(), targetDir);

const hasKnownExtension = (specifier) =>
  /\.[a-z0-9]+$/iu.test(specifier) || specifier.endsWith("/");

const rewriteRelativeSpecifier = (filePath, specifier) => {
  if (!specifier.startsWith(".")) {
    return specifier;
  }

  if (hasKnownExtension(specifier)) {
    return specifier;
  }

  const basePath = resolve(dirname(filePath), specifier);
  if (existsSync(`${basePath}.js`)) {
    return `${specifier}.js`;
  }
  if (existsSync(resolve(basePath, "index.js"))) {
    return `${specifier}/index.js`;
  }

  return `${specifier}.js`;
};

const rewriteSource = (filePath, source) =>
  source
    .replace(
      /((?:import|export)\s+[^"'`]*?\sfrom\s*["'])(\.[^"'`]+)(["'])/gu,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteRelativeSpecifier(filePath, specifier)}${suffix}`,
    )
    .replace(
      /((?:import\s*["']))(\.[^"'`]+)(["'])/gu,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteRelativeSpecifier(filePath, specifier)}${suffix}`,
    )
    .replace(
      /((?:import\s*\(\s*["']))(\.[^"'`]+)(["']\s*\))/gu,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${rewriteRelativeSpecifier(filePath, specifier)}${suffix}`,
    );

const visit = (dir) => {
  for (const entry of readdirSync(dir)) {
    const filePath = resolve(dir, entry);
    if (statSync(filePath).isDirectory()) {
      visit(filePath);
      continue;
    }

    if (!filePath.endsWith(".js")) {
      continue;
    }

    const source = readFileSync(filePath, "utf8");
    const nextSource = rewriteSource(filePath, source);
    if (nextSource !== source) {
      writeFileSync(filePath, nextSource);
    }
  }
};

visit(distRoot);
