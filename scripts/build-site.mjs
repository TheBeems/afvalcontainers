#!/usr/bin/env node

import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = resolve(projectRoot, 'dist');

const files = [
  ['src/index.html', 'index.html'],
  ['src/styles.css', 'styles.css'],
  ['src/app.js', 'app.js'],
  ['data/container-locations.json', 'data/container-locations.json'],
  ['data/house-coverage.json', 'data/house-coverage.json']
];

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(resolve(distDir, 'data'), { recursive: true });

  for (const [source, destination] of files) {
    await copyFile(resolve(projectRoot, source), resolve(distDir, destination));
  }

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}

build().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
