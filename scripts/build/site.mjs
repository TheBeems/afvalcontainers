import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import { splitHouseCoverage } from '../split-house-coverage.mjs';
import { readPlacesManifest, resolveProjectPath } from '../places.mjs';

export const projectRoot = resolve(import.meta.dirname, '../..');
export const distDir = resolve(projectRoot, 'dist');

const placeFilePathKeys = [
  'containers',
  'coverageSummary',
  'houseMap',
  'addressIndex'
];

function getDistPathForProjectPath(path) {
  return resolve(distDir, relative(projectRoot, path));
}

async function copyProjectFile(path) {
  const destination = getDistPathForProjectPath(path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(path, destination);
}

async function copyProjectDirectory(path) {
  const destination = getDistPathForProjectPath(path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(path, destination, { recursive: true });
}

async function copyRuntimeData() {
  const places = await readPlacesManifest();
  await copyProjectFile(resolve(projectRoot, 'data/places.json'));

  for (const place of places) {
    for (const key of placeFilePathKeys) {
      await copyProjectFile(resolveProjectPath(place.paths[key]));
    }
    await copyProjectDirectory(resolveProjectPath(place.paths.houseDetailsBase));
  }
}

export async function buildSite() {
  await splitHouseCoverage({ verbose: false });
  await rm(distDir, { recursive: true, force: true });
  await viteBuild({
    configFile: resolve(projectRoot, 'vite.config.js')
  });
  await copyRuntimeData();

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}
