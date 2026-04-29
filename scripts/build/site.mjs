import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '../..');
export const distDir = resolve(projectRoot, 'dist');

const files = [
  ['src/index.html', 'index.html'],
  ['src/styles.css', 'styles.css'],
  ['data/container-locations.json', 'data/container-locations.json'],
  ['data/house-coverage.json', 'data/house-coverage.json']
];

const directories = [
  ['src/app', 'app'],
  ['src/shared', 'shared'],
  ['src/styles', 'styles']
];

export async function buildSite() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(resolve(distDir, 'data'), { recursive: true });

  for (const [source, destination] of files) {
    await copyFile(resolve(projectRoot, source), resolve(distDir, destination));
  }

  for (const [source, destination] of directories) {
    await cp(resolve(projectRoot, source), resolve(distDir, destination), { recursive: true });
  }

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}
