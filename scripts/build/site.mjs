import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateAddressIndexes } from '../generate-address-indexes.mjs';

export const projectRoot = resolve(import.meta.dirname, '../..');
export const distDir = resolve(projectRoot, 'dist');

const files = [
  ['src/index.html', 'index.html'],
  ['src/styles.css', 'styles.css'],
  ['data/places.json', 'data/places.json']
];

const directories = [
  ['src/app', 'app'],
  ['src/shared', 'shared'],
  ['src/styles', 'styles']
];

export async function buildSite() {
  await generateAddressIndexes({ verbose: false });
  await rm(distDir, { recursive: true, force: true });
  await mkdir(resolve(distDir, 'data'), { recursive: true });

  for (const [source, destination] of files) {
    await copyFile(resolve(projectRoot, source), resolve(distDir, destination));
  }

  for (const [source, destination] of directories) {
    await cp(resolve(projectRoot, source), resolve(distDir, destination), { recursive: true });
  }

  await cp(resolve(projectRoot, 'data/places'), resolve(distDir, 'data/places'), { recursive: true });

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}
