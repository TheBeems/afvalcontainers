#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const pluginRoot = process.env.DATA_ANALYTICS_PLUGIN_ROOT;

if (!pluginRoot) {
  throw new Error("Set DATA_ANALYTICS_PLUGIN_ROOT to the installed data-analytics plugin directory.");
}

const builderPath = resolve(
  pluginRoot,
  "skills/build-report/scripts/build_portable_artifact.mjs",
);
const { buildPortableArtifact } = await import(pathToFileURL(builderPath));

const inputPath = resolve(process.argv[2] ?? new URL("artifact.json", import.meta.url).pathname);
const outputPath = resolve(process.argv[3] ?? new URL("warmenhuizen-containeroptimalisatie.html", import.meta.url).pathname);
const artifact = JSON.parse(readFileSync(inputPath, "utf8"));
const html = buildPortableArtifact(artifact);
const overflowFix = `<style data-warmenhuizen-portable-overflow-fix="true">
html, body { max-width: 100%; overflow-x: clip; }
.analytics-top-bar { width: 100% !important; box-sizing: border-box !important; }
</style>`;
writeFileSync(outputPath, html.replace("</head>", `${overflowFix}\n</head>`));
console.log(`Wrote ${outputPath} with the portable-reader overflow containment fix.`);
