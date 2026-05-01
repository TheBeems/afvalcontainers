#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  readJson,
  readPlacesManifest,
  resolvePlaceDataPath
} from './places.mjs';

function buildAddressIndex(place, coverage) {
  const houses = Array.isArray(coverage?.houses) ? coverage.houses : [];

  return houses.map((house) => ({
    placeId: place.id,
    id: house.id,
    address: house.address,
    postcode: house.postcode || '',
    city: house.city || place.name,
    lat: house.lat,
    lon: house.lon
  }));
}

async function readExistingJson(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function generateAddressIndexes({ verbose = true } = {}) {
  const places = await readPlacesManifest();
  const results = [];

  for (const place of places) {
    if (!place.paths?.coverage || !place.paths?.addressIndex) {
      results.push({
        placeId: place.id,
        count: 0,
        changed: false,
        skipped: true
      });
      continue;
    }

    const coveragePath = resolvePlaceDataPath(place, 'coverage');
    const addressIndexPath = resolvePlaceDataPath(place, 'addressIndex');
    const coverage = await readJson(coveragePath, `${place.id} coverage`);
    const addressIndex = buildAddressIndex(place, coverage);
    const nextJson = `${JSON.stringify(addressIndex, null, 2)}\n`;
    const currentJson = await readExistingJson(addressIndexPath);
    const changed = currentJson !== nextJson;

    if (changed) {
      await mkdir(dirname(addressIndexPath), { recursive: true });
      await writeFile(addressIndexPath, nextJson, 'utf8');
    }

    results.push({
      placeId: place.id,
      count: addressIndex.length,
      changed
    });
  }

  if (verbose) {
    const summary = results
      .map((result) => (
        result.skipped
          ? `${result.placeId}: overgeslagen`
          : `${result.placeId}: ${result.count} adressen${result.changed ? ' bijgewerkt' : ' actueel'}`
      ))
      .join(', ');
    console.log(`Adresindexen: ${summary}.`);
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAddressIndexes().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
