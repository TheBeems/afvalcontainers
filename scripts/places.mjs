import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '..');
export const placesManifestPath = resolve(projectRoot, 'data/places.json');

export function resolveProjectPath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('Path must be a non-empty string.');
  }

  return resolve(projectRoot, path.replace(/^\.\//, ''));
}

export function resolvePlaceDataPath(place, key) {
  const path = place?.paths?.[key];
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error(`Place ${place?.id || '(unknown)'} is missing paths.${key}.`);
  }

  return resolveProjectPath(path);
}

export async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export async function readPlacesManifest() {
  const places = await readJson(placesManifestPath, 'data/places.json');
  if (!Array.isArray(places) || places.length === 0) {
    throw new Error('data/places.json must contain a non-empty array.');
  }

  return places;
}

export function getDefaultPlace(places) {
  return places.find((place) => place.id === 'warmenhuizen') || places[0];
}
