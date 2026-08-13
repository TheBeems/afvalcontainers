#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultScriptsDirectory = '/home/mathijs/.codex/plugins/cache/openai-curated-remote/data-analytics/0.2.8-13ceeea1f599/skills/build-report/scripts';

function parseArguments(argv) {
  const options = {
    input: resolve(scriptDirectory, 'artifact.json'),
    output: resolve(scriptDirectory, 'warmenhuizen-containeroptimalisatie.html'),
    scriptsDirectory: defaultScriptsDirectory
  };
  for (const argument of argv) {
    const [name, ...valueParts] = argument.split('=');
    const value = valueParts.join('=');
    if (name === '--input' && value) options.input = resolve(value);
    else if (name === '--output' && value) options.output = resolve(value);
    else if (name === '--scripts-dir' && value) options.scriptsDirectory = resolve(value);
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return options;
}

function patchScrollbarWidthBug(runtimeHtml) {
  const replacements = [
    ['width: 100vw;', 'width: 100%;'],
    ['margin-right: calc(50% - 50vw);', 'margin-right: 0;'],
    ['margin-left: calc(50% - 50vw);', 'margin-left: 0;']
  ];
  let patched = runtimeHtml;
  for (const [source, replacement] of replacements) {
    if (patched.split(source).length !== 2) {
      throw new Error(`Expected exactly one portable-reader CSS occurrence: ${source}`);
    }
    patched = patched.replace(source, replacement);
  }
  return patched;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const moduleUrl = (filename) => pathToFileURL(resolve(options.scriptsDirectory, filename)).href;
  const [{ buildPortableArtifact, readPackagedReaderRuntime }, { extractPortableChartSvgs }, { verifyPortableArtifact }] = await Promise.all([
    import(moduleUrl('build_portable_artifact.mjs')),
    import(moduleUrl('extract_portable_chart_svgs.mjs')),
    import(moduleUrl('verify_portable_artifact.mjs'))
  ]);
  const artifact = JSON.parse(readFileSync(options.input, 'utf8'));
  const runtimeHtml = patchScrollbarWidthBug(readPackagedReaderRuntime().html);
  const temporaryStem = `${options.output}.tmp-${process.pid}-${randomUUID()}`;
  const initialPath = `${temporaryStem}-initial.html`;
  const candidatePath = `${temporaryStem}-candidate.html`;
  const screenshotPath = `${temporaryStem}-failure.png`;

  mkdirSync(dirname(options.output), { recursive: true });
  try {
    writeFileSync(initialPath, buildPortableArtifact(artifact, { runtimeHtml }), 'utf8');
    const staticCharts = await extractPortableChartSvgs({
      htmlPath: initialPath,
      readyTimeoutMs: 10_000
    });
    writeFileSync(candidatePath, buildPortableArtifact(artifact, { runtimeHtml, staticCharts }), 'utf8');
    const verification = await verifyPortableArtifact({
      artifactPath: options.input,
      htmlPath: candidatePath,
      readyTimeoutMs: 10_000,
      screenshotPath,
      timeoutMs: 30_000
    });
    renameSync(candidatePath, options.output);
    console.log(JSON.stringify({
      output: options.output,
      compatibilityPatch: 'portable reader top bar uses containing-block width instead of scrollbar-sensitive 100vw',
      staticChartCount: Object.keys(staticCharts).length,
      verification
    }, null, 2));
  } finally {
    rmSync(initialPath, { force: true });
    rmSync(candidatePath, { force: true });
    rmSync(screenshotPath, { force: true });
  }
}

await main();
