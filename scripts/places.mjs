import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '..');
export const placesManifestPath = resolve(projectRoot, 'data/places.json');
export const DEFAULT_PLACE_ID = 'warmenhuizen';

export const publishablePlaceFilePathKeys = [
  'containers',
  'coverageSummary',
  'houseMap',
  'addressIndex'
];

export function getDefaultPlacePaths(placeId) {
  return {
    containers: `./data/places/${placeId}/container-locations.json`,
    coverageSummary: `./data/places/${placeId}/coverage-summary.json`,
    houseMap: `./data/places/${placeId}/house-map.json`,
    addressIndex: `./data/places/${placeId}/address-index.compact.json`,
    houseDetailsBase: `./data/places/${placeId}/house-details`
  };
}

export function normalizePlace(place) {
  if (!place || typeof place !== 'object' || Array.isArray(place)) {
    return place;
  }

  return {
    ...place,
    seo: {
      slug: place.id,
      ...place.seo
    },
    paths: {
      ...getDefaultPlacePaths(place.id),
      ...place.paths
    }
  };
}

export function resolveProjectPath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('Path must be a non-empty string.');
  }

  return resolve(projectRoot, path.replace(/^\.\//, ''));
}

export function resolvePlaceDataPath(place, key) {
  const path = normalizePlace(place)?.paths?.[key];
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

  return places.map(normalizePlace);
}

export function getDefaultPlace(places) {
  return places.find((place) => place.id === DEFAULT_PLACE_ID) || places[0];
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryHasJsonFiles(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith('.json'));
  } catch {
    return false;
  }
}

export async function isPublishablePlace(place) {
  const normalizedPlace = normalizePlace(place);
  if (!normalizedPlace?.id) {
    return false;
  }

  const hasRequiredFiles = await Promise.all(
    publishablePlaceFilePathKeys.map((key) => exists(resolvePlaceDataPath(normalizedPlace, key)))
  );

  return hasRequiredFiles.every(Boolean)
    && (await directoryHasJsonFiles(resolvePlaceDataPath(normalizedPlace, 'houseDetailsBase')));
}

export async function getPublishablePlaces(places) {
  const configuredPlaces = places || await readPlacesManifest();
  const normalizedPlaces = configuredPlaces.map(normalizePlace);
  const publishableFlags = await Promise.all(normalizedPlaces.map(isPublishablePlace));
  return normalizedPlaces.filter((_, index) => publishableFlags[index]);
}
