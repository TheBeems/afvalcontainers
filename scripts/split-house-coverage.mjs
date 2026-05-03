#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  readJson,
  readPlacesManifest,
  resolvePlaceDataPath,
  resolveProjectPath
} from './places.mjs';

const DEFAULT_COVERAGE_FILENAME = 'house-coverage.json';
const MAX_HOUSES_PER_DETAIL_BUNDLE = 75;

function getLegacyCoveragePath(place) {
  return place.paths?.coverage
    ? resolvePlaceDataPath(place, 'coverage')
    : resolveProjectPath(`data/places/${place.id}/${DEFAULT_COVERAGE_FILENAME}`);
}

function getRequiredPath(place, key) {
  return resolvePlaceDataPath(place, key);
}

function getHouseDetailsPath(place, detailBundle) {
  const basePath = place.paths?.houseDetailsBase;
  if (typeof basePath !== 'string' || basePath.trim() === '') {
    throw new Error(`Place ${place.id} is missing paths.houseDetailsBase.`);
  }
  return resolveProjectPath(`${basePath.replace(/\/$/, '')}/${detailBundle}.json`);
}

function getStreetName(address) {
  const match = String(address || '').trim().match(/^(.+?)\s+\d+[A-Za-z]?(?:\s+.*)?$/);
  return match ? match[1].trim() : 'onbekende-straat';
}

function getHouseNumber(address) {
  const match = String(address || '').trim().match(/\s+(\d+)[A-Za-z]?(?:\s+.*)?$/);
  return match ? Number(match[1]) : 0;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'straat';
}

function getUniqueSlug(street, usedSlugs) {
  const baseSlug = slugify(street);
  let slug = baseSlug;
  let suffix = 2;

  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(slug);
  return slug;
}

function getUniqueBundleName(candidate, usedBundleNames) {
  let bundleName = candidate;
  let suffix = 2;

  while (usedBundleNames.has(bundleName)) {
    bundleName = `${candidate}-${suffix}`;
    suffix += 1;
  }

  usedBundleNames.add(bundleName);
  return bundleName;
}

function sortHousesByAddress(left, right) {
  const houseNumberOrder = getHouseNumber(left.address) - getHouseNumber(right.address);
  if (houseNumberOrder !== 0) {
    return houseNumberOrder;
  }
  return String(left.address || '').localeCompare(String(right.address || ''), 'nl-NL', { numeric: true });
}

function buildDetailBundles(houses) {
  const streetGroups = new Map();

  for (const house of houses) {
    const street = getStreetName(house.address);
    if (!streetGroups.has(street)) {
      streetGroups.set(street, []);
    }
    streetGroups.get(street).push(house);
  }

  const usedSlugs = new Set();
  const usedBundleNames = new Set();
  const houseDetailBundles = new Map();
  const bundles = [];
  const streets = Array.from(streetGroups.keys()).sort((left, right) => left.localeCompare(right, 'nl-NL'));

  for (const street of streets) {
    const streetSlug = getUniqueSlug(street, usedSlugs);
    const streetHouses = streetGroups.get(street).slice().sort(sortHousesByAddress);
    const shardCount = Math.ceil(streetHouses.length / MAX_HOUSES_PER_DETAIL_BUNDLE);

    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      const start = shardIndex * MAX_HOUSES_PER_DETAIL_BUNDLE;
      const shardHouses = streetHouses.slice(start, start + MAX_HOUSES_PER_DETAIL_BUNDLE);
      const candidateBundle = shardCount > 1
        ? `${streetSlug}-${String(shardIndex + 1).padStart(2, '0')}`
        : streetSlug;
      const detailBundle = getUniqueBundleName(candidateBundle, usedBundleNames);

      for (const house of shardHouses) {
        houseDetailBundles.set(house.id, detailBundle);
      }

      bundles.push({
        detailBundle,
        street,
        houses: shardHouses
      });
    }
  }

  return { bundles, houseDetailBundles };
}

function buildCoverageSummary(coverage) {
  return {
    schemaVersion: coverage.schemaVersion,
    generatedAt: coverage.generatedAt,
    placeName: coverage.placeName,
    analysisScope: coverage.analysisScope,
    source: coverage.source,
    summary: coverage.summary
  };
}

function buildHouseMap(houses, houseDetailBundles) {
  return houses.map((house) => ({
    id: house.id,
    lat: house.lat,
    lon: house.lon,
    coverageStatus: house.coverageStatus,
    detailBundle: houseDetailBundles.get(house.id)
  }));
}

function buildAddressIndex(place, coverage, houseDetailBundles) {
  return (coverage.houses || []).map((house) => ({
    placeId: place.id,
    id: house.id,
    address: house.address,
    postcode: house.postcode || '',
    city: house.city || place.name,
    detailBundle: houseDetailBundles.get(house.id)
  }));
}

async function writeJson(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload)}\n`, 'utf8');
}

export async function splitCoverageForPlace(place, coverage) {
  const houses = Array.isArray(coverage.houses) ? coverage.houses : [];
  const houseDetailsBasePath = resolveProjectPath(place.paths.houseDetailsBase);
  const { bundles, houseDetailBundles } = buildDetailBundles(houses);

  await rm(houseDetailsBasePath, { recursive: true, force: true });
  await mkdir(houseDetailsBasePath, { recursive: true });

  await Promise.all([
    writeJson(getRequiredPath(place, 'coverageSummary'), buildCoverageSummary(coverage)),
    writeJson(getRequiredPath(place, 'houseMap'), buildHouseMap(houses, houseDetailBundles)),
    writeJson(getRequiredPath(place, 'addressIndex'), buildAddressIndex(place, coverage, houseDetailBundles)),
    ...bundles.map((bundle) => writeJson(getHouseDetailsPath(place, bundle.detailBundle), bundle))
  ]);

  return {
    houses: houses.length,
    bundles: bundles.length
  };
}

export async function splitHouseCoverage({ verbose = true } = {}) {
  const places = await readPlacesManifest();
  const results = [];

  for (const place of places) {
    if (!place.paths?.coverageSummary || !place.paths?.houseMap || !place.paths?.addressIndex || !place.paths?.houseDetailsBase) {
      results.push({
        placeId: place.id,
        count: 0,
        skipped: true
      });
      continue;
    }

    const coverage = await readJson(getLegacyCoveragePath(place), `${place.id} legacy coverage`);
    const count = await splitCoverageForPlace(place, coverage);

    results.push({
      placeId: place.id,
      ...count,
      skipped: false
    });
  }

  if (verbose) {
    const summary = results
      .map((result) => (
        result.skipped
          ? `${result.placeId}: overgeslagen`
          : `${result.placeId}: ${result.houses} adressen in ${result.bundles} detailbundel(s)`
      ))
      .join(', ');
    console.log(`Coverage-split: ${summary}.`);
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  splitHouseCoverage().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
