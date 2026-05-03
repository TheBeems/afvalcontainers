#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  HVC_IMPORT_CONTAINER_ACCURACY,
  RESTAFVAL_CONTAINER_TYPES
} from '../src/shared/containers.js';
import { haversineMeters, roundCoordinate, roundMetric } from '../src/shared/geometry.js';
import {
  getDefaultPlace,
  projectRoot,
  readPlacesManifest,
  resolvePlaceDataPath,
  resolveProjectPath
} from './places.mjs';

const OPZET_ADDRESS_URL = 'https://inzamelkalender.hvcgroep.nl/adressen';
const HVC_LOCATIONS_URL = 'https://www.hvcgroep.nl/proxy/api/app/v3/waste/locations';
const PDOK_LOCATIESERVER_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

const AUTO_ADDRESS_MATCH_MAX_METERS = 75;
const AUTO_NEAREST_MATCH_MAX_METERS = 25;
const AUTO_NEAREST_NEXT_GAP_METERS = 15;
const UNCHANGED_MAX_METERS = 0.5;

function parseArgs(argv) {
  const options = {
    apply: false,
    placeId: null,
    outputJson: null,
    help: false
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--output-json=')) {
      options.outputJson = arg.slice('--output-json='.length);
      continue;
    }

    if (arg.startsWith('--place=')) {
      options.placeId = arg.slice('--place='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/audit-hvc-existing-containers.mjs [--place=warmenhuizen] [--apply] [--output-json=/tmp/hvc-existing-containers.json]

Audits existing rest/semi-rest containers against HVC container locations.

Options:
  --place=ID           Place from data/places.json. Default: warmenhuizen.
  --apply              Update lat/lon, hvcContainerId and accuracy for certain matches.
  --output-json=PATH   Write the audit report as JSON.
  --help              Show this help.
`);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

async function readOptionalJson(path, label) {
  try {
    return await readJson(path, label);
  } catch (error) {
    if (error.message.includes('ENOENT')) {
      return null;
    }
    throw error;
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeAddress(value) {
  return normalizeText(value)
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ');
}

function normalizePostcode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function parseStreetAddress(address) {
  const match = String(address || '').trim().match(/^(.+?)\s+(\d+)([A-Za-z]?)(?:\s+(.*))?$/);

  if (!match) {
    return null;
  }

  return {
    street: match[1].trim(),
    houseNumber: Number(match[2]),
    houseLetter: match[3] || '',
    houseNumberExtension: match[4]?.trim() || ''
  };
}

function getAddressKey(parsedAddress) {
  const extension = [
    parsedAddress.houseLetter,
    parsedAddress.houseNumberExtension
  ].filter(Boolean).join(' ');

  return normalizeAddress(`${parsedAddress.street} ${parsedAddress.houseNumber}${extension ? ` ${extension}` : ''}`);
}

function levenshteinDistance(left, right) {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const cost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + cost
      );
    }

    previous = current;
  }

  return previous[right.length];
}

function isRestExistingContainer(container) {
  return Array.isArray(container.streams)
    && container.streams.some((stream) => stream.status === 'existing'
      && RESTAFVAL_CONTAINER_TYPES.has(stream.type));
}

function createCoverageAddressIndex(houses) {
  const exact = new Map();
  const parsed = [];

  for (const house of houses) {
    const parsedAddress = parseStreetAddress(house.address);
    if (!parsedAddress) {
      continue;
    }

    const entry = {
      address: house.address,
      postcode: normalizePostcode(house.postcode),
      parsedAddress,
      normalizedStreet: normalizeText(parsedAddress.street),
      key: getAddressKey(parsedAddress)
    };

    if (!entry.postcode) {
      continue;
    }

    parsed.push(entry);

    const existing = exact.get(entry.key) || [];
    existing.push(entry);
    exact.set(entry.key, existing);
  }

  return { exact, parsed };
}

function resolvePostcode(container, addressIndex) {
  const parsedAddress = parseStreetAddress(container.address);
  if (!parsedAddress) {
    return {
      parsedAddress: null,
      postcode: null,
      method: 'none',
      matchedAddress: null,
      reason: 'container address could not be parsed'
    };
  }

  const key = getAddressKey(parsedAddress);
  const exactMatches = addressIndex.exact.get(key) || [];
  const uniqueExactPostcodes = [...new Set(exactMatches.map((entry) => entry.postcode))];

  if (uniqueExactPostcodes.length === 1) {
    return {
      parsedAddress,
      postcode: uniqueExactPostcodes[0],
      method: 'exact-address',
      matchedAddress: exactMatches[0].address,
      reason: 'postcode resolved by exact local coverage address'
    };
  }

  if (uniqueExactPostcodes.length > 1) {
    return {
      parsedAddress,
      postcode: null,
      method: 'ambiguous-exact-address',
      matchedAddress: exactMatches.map((entry) => entry.address).join('; '),
      reason: 'multiple postcodes matched the exact local coverage address'
    };
  }

  const normalizedStreet = normalizeText(parsedAddress.street);
  const fuzzyMatches = addressIndex.parsed.filter((entry) => {
    if (entry.parsedAddress.houseNumber !== parsedAddress.houseNumber) {
      return false;
    }

    if (entry.parsedAddress.houseLetter !== parsedAddress.houseLetter) {
      return false;
    }

    if (entry.parsedAddress.houseNumberExtension !== parsedAddress.houseNumberExtension) {
      return false;
    }

    return levenshteinDistance(entry.normalizedStreet, normalizedStreet) <= 1;
  });

  const uniqueFuzzyPostcodes = [...new Set(fuzzyMatches.map((entry) => entry.postcode))];

  if (uniqueFuzzyPostcodes.length === 1 && fuzzyMatches.length === 1) {
    return {
      parsedAddress,
      postcode: uniqueFuzzyPostcodes[0],
      method: 'fuzzy-street-address',
      matchedAddress: fuzzyMatches[0].address,
      reason: 'postcode resolved by unique fuzzy local coverage address'
    };
  }

  if (fuzzyMatches.length > 0) {
    return {
      parsedAddress,
      postcode: null,
      method: 'ambiguous-fuzzy-street-address',
      matchedAddress: fuzzyMatches.map((entry) => entry.address).join('; '),
      reason: 'multiple fuzzy local coverage addresses matched'
    };
  }

  return {
    parsedAddress,
    postcode: null,
    method: 'not-found',
    matchedAddress: null,
    reason: 'postcode not found in local coverage addresses'
  };
}

function parsePoint(value) {
  const match = String(value || '').match(/^POINT\(([-0-9.]+) ([-0-9.]+)\)$/);
  return match ? {
    lon: Number(match[1]),
    lat: Number(match[2])
  } : null;
}

async function resolvePostcodeFromPdok(container, placeName) {
  const parsedAddress = parseStreetAddress(container.address);
  if (!parsedAddress) {
    return {
      parsedAddress: null,
      postcode: null,
      method: 'none',
      matchedAddress: null,
      reason: 'container address could not be parsed'
    };
  }

  const query = `${container.address} ${placeName}`;
  const searchParams = new URLSearchParams({
    q: query,
    rows: '5'
  });
  const data = await fetchJson(`${PDOK_LOCATIESERVER_URL}?${searchParams.toString()}`);
  const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
  const normalizedStreet = normalizeText(parsedAddress.street);
  const matches = docs.filter((doc) => {
    const point = parsePoint(doc.centroide_ll);
    return doc.type === 'adres'
      && normalizeText(doc.woonplaatsnaam) === normalizeText(placeName)
      && normalizeText(doc.straatnaam) === normalizedStreet
      && Number(doc.huisnummer) === parsedAddress.houseNumber
      && normalizeText(doc.huis_nlt) === normalizeText(`${parsedAddress.houseNumber}${parsedAddress.houseLetter}${parsedAddress.houseNumberExtension ? ` ${parsedAddress.houseNumberExtension}` : ''}`)
      && normalizePostcode(doc.postcode)
      && Number.isFinite(point?.lat)
      && Number.isFinite(point?.lon);
  });

  if (matches.length === 1) {
    return {
      parsedAddress,
      postcode: normalizePostcode(matches[0].postcode),
      method: 'pdok-address',
      matchedAddress: matches[0].weergavenaam || null,
      reason: 'postcode resolved by PDOK address lookup'
    };
  }

  return {
    parsedAddress,
    postcode: null,
    method: matches.length > 1 ? 'ambiguous-pdok-address' : 'pdok-not-found',
    matchedAddress: matches.map((match) => match.weergavenaam).join('; ') || null,
    reason: matches.length > 1
      ? 'multiple PDOK addresses matched'
      : 'postcode not found by PDOK address lookup'
  };
}

function formatContainerAddress(container) {
  if (!container) {
    return '';
  }

  return [container.street, container.house_number]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .join(' ');
}

function getHvcAddressKey(container) {
  return normalizeAddress(formatContainerAddress(container));
}

function getContainerDistanceMeters(container, hvcContainer) {
  return haversineMeters(
    container.lat,
    container.lon,
    Number(hvcContainer.latitude),
    Number(hvcContainer.longitude)
  );
}

function filterHvcRestContainers(locations) {
  return locations.filter((location) => location
    && Object.prototype.hasOwnProperty.call(location, 'container_id')
    && String(location.container_id || '').trim() !== ''
    && location.type === 'rest'
    && location.is_accessible_for_user !== false
    && Number.isFinite(Number(location.latitude))
    && Number.isFinite(Number(location.longitude)));
}

function createManualResult(container, postcodeResolution, reason, extra = {}) {
  return {
    id: container.id,
    address: container.address,
    status: 'manualReview',
    reason,
    postcode: postcodeResolution.postcode,
    postcodeResolution,
    oldLat: container.lat,
    oldLon: container.lon,
    newLat: null,
    newLon: null,
    deltaMeters: null,
    hvcContainerId: null,
    hvcAddress: null,
    ...extra
  };
}

function pickHvcMatch(container, postcodeResolution, hvcRestContainers) {
  if (hvcRestContainers.length === 0) {
    return createManualResult(container, postcodeResolution, 'no HVC rest container candidates returned');
  }

  const currentAddressKey = getAddressKey(postcodeResolution.parsedAddress);
  const addressMatches = hvcRestContainers.filter((candidate) => getHvcAddressKey(candidate) === currentAddressKey);

  if (addressMatches.length === 1) {
    const match = addressMatches[0];
    const deltaMeters = getContainerDistanceMeters(container, match);

    if (deltaMeters <= AUTO_ADDRESS_MATCH_MAX_METERS) {
      return createMatchedResult(container, postcodeResolution, match, deltaMeters, 'address-match');
    }

    return createManualResult(
      container,
      postcodeResolution,
      `address match shift exceeds ${AUTO_ADDRESS_MATCH_MAX_METERS} m`,
      createCandidateSummary(match, deltaMeters)
    );
  }

  if (addressMatches.length > 1) {
    return createManualResult(
      container,
      postcodeResolution,
      'multiple HVC rest containers matched the same address',
      { candidates: addressMatches.map((candidate) => createCandidateSummary(candidate, getContainerDistanceMeters(container, candidate))) }
    );
  }

  const candidatesByDistance = hvcRestContainers
    .map((candidate) => ({
      candidate,
      deltaMeters: getContainerDistanceMeters(container, candidate)
    }))
    .sort((left, right) => left.deltaMeters - right.deltaMeters);

  const closest = candidatesByDistance[0];
  const next = candidatesByDistance[1] || null;

  if (
    closest.deltaMeters <= AUTO_NEAREST_MATCH_MAX_METERS
    && (!next || next.deltaMeters - closest.deltaMeters >= AUTO_NEAREST_NEXT_GAP_METERS)
  ) {
    return createMatchedResult(container, postcodeResolution, closest.candidate, closest.deltaMeters, 'nearest-unique');
  }

  return createManualResult(
    container,
    postcodeResolution,
    'no certain HVC match by address or unique nearest distance',
    { candidates: candidatesByDistance.slice(0, 5).map(({ candidate, deltaMeters }) => createCandidateSummary(candidate, deltaMeters)) }
  );
}

function createCandidateSummary(candidate, deltaMeters) {
  return {
    hvcContainerId: candidate.container_id,
    hvcAddress: formatContainerAddress(candidate),
    hvcType: candidate.type,
    hvcLat: roundCoordinate(Number(candidate.latitude)),
    hvcLon: roundCoordinate(Number(candidate.longitude)),
    deltaMeters: roundMetric(deltaMeters)
  };
}

function createMatchedResult(container, postcodeResolution, hvcContainer, deltaMeters, reason) {
  const newLat = roundCoordinate(Number(hvcContainer.latitude));
  const newLon = roundCoordinate(Number(hvcContainer.longitude));
  const oldLat = roundCoordinate(container.lat);
  const oldLon = roundCoordinate(container.lon);
  const unchanged = deltaMeters <= UNCHANGED_MAX_METERS && oldLat === newLat && oldLon === newLon;

  return {
    id: container.id,
    address: container.address,
    status: unchanged ? 'unchanged' : 'wouldUpdate',
    reason,
    postcode: postcodeResolution.postcode,
    postcodeResolution,
    oldLat,
    oldLon,
    newLat,
    newLon,
    deltaMeters: roundMetric(deltaMeters),
    hvcContainerId: hvcContainer.container_id,
    hvcAddress: formatContainerAddress(hvcContainer),
    hvcType: hvcContainer.type,
    hvcInsertionOpening: hvcContainer.insertion_opening || null,
    hvcIsAccessibleForUser: hvcContainer.is_accessible_for_user
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function fetchHvcAddress(postcode, houseNumber) {
  const url = `${OPZET_ADDRESS_URL}/${encodeURIComponent(`${postcode}:${houseNumber}`)}`;
  const addresses = await fetchJson(url);

  if (!Array.isArray(addresses)) {
    throw new Error('HVC address response was not an array');
  }

  return addresses;
}

function chooseHvcAddress(addresses, postcodeResolution) {
  const { parsedAddress, postcode } = postcodeResolution;
  const normalizedStreet = normalizeText(parsedAddress.street);

  const matches = addresses.filter((address) => normalizePostcode(address.postcode) === postcode
    && Number(address.huisnummer) === parsedAddress.houseNumber
    && normalizeText(address.straat) === normalizedStreet);

  if (matches.length === 1) {
    return { address: matches[0], reason: 'exact HVC address match' };
  }

  const fallbackMatches = addresses.filter((address) => normalizePostcode(address.postcode) === postcode
    && Number(address.huisnummer) === parsedAddress.houseNumber);

  if (fallbackMatches.length === 1) {
    return { address: fallbackMatches[0], reason: 'postcode and house number HVC address match' };
  }

  return {
    address: null,
    reason: matches.length > 1 || fallbackMatches.length > 1
      ? 'multiple HVC addresses returned'
      : 'no HVC address returned for postcode and house number'
  };
}

async function fetchHvcLocations(address) {
  const searchParams = new URLSearchParams({
    bagid: String(address.bagid),
    lat: String(address.latitude),
    lng: String(address.longitude),
    postal_code: normalizePostcode(address.postcode),
    house_number: String(address.huisnummer)
  });

  if (address.huisletter) {
    searchParams.set('house_letter', String(address.huisletter));
  }

  if (address.toevoeging) {
    searchParams.set('house_number_extension', String(address.toevoeging));
  }

  const locations = await fetchJson(`${HVC_LOCATIONS_URL}?${searchParams.toString()}`);

  if (!Array.isArray(locations)) {
    throw new Error('HVC locations response was not an array');
  }

  return locations;
}

async function auditContainer(container, addressIndex, placeName) {
  const postcodeResolution = addressIndex
    ? resolvePostcode(container, addressIndex)
    : await resolvePostcodeFromPdok(container, placeName);

  if (!postcodeResolution.parsedAddress) {
    return createManualResult(container, postcodeResolution, postcodeResolution.reason);
  }

  if (!postcodeResolution.postcode) {
    return createManualResult(container, postcodeResolution, postcodeResolution.reason);
  }

  try {
    const hvcAddresses = await fetchHvcAddress(
      postcodeResolution.postcode,
      postcodeResolution.parsedAddress.houseNumber
    );
    const selectedAddress = chooseHvcAddress(hvcAddresses, postcodeResolution);

    if (!selectedAddress.address) {
      return createManualResult(container, postcodeResolution, selectedAddress.reason, {
        hvcAddressCount: hvcAddresses.length
      });
    }

    const hvcLocations = await fetchHvcLocations(selectedAddress.address);
    const hvcRestContainers = filterHvcRestContainers(hvcLocations);
    const result = pickHvcMatch(container, postcodeResolution, hvcRestContainers);

    return {
      ...result,
      hvcAddressLookupReason: selectedAddress.reason,
      hvcAddressDescription: selectedAddress.address.description || null,
      hvcLocationCount: hvcLocations.length,
      hvcRestContainerCount: hvcRestContainers.length
    };
  } catch (error) {
    return createManualResult(container, postcodeResolution, `HVC request failed: ${error.message}`);
  }
}

function applyResults(containers, results) {
  const updates = new Map(
    results
      .filter((result) => result.status === 'wouldUpdate')
      .map((result) => [result.id, result])
  );

  for (const container of containers) {
    const update = updates.get(container.id);
    if (!update) {
      continue;
    }

    container.lat = update.newLat;
    container.lon = update.newLon;
    container.hvcContainerId = String(update.hvcContainerId);
    container.accuracy = HVC_IMPORT_CONTAINER_ACCURACY;
    update.status = 'updated';
  }

  return updates.size;
}

function formatCoordinatePair(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return '-';
  }

  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function formatSummaryLine(result) {
  const hvcLabel = result.hvcContainerId
    ? `${result.hvcContainerId} ${result.hvcAddress || ''}`.trim()
    : '-';
  const oldCoordinates = formatCoordinatePair(result.oldLat, result.oldLon);
  const newCoordinates = formatCoordinatePair(result.newLat, result.newLon);
  const delta = result.deltaMeters === null ? '-' : `${result.deltaMeters} m`;

  return [
    result.id.padEnd(4),
    result.status.padEnd(12),
    result.address.padEnd(30),
    `HVC: ${hvcLabel}`.padEnd(34),
    `${oldCoordinates} -> ${newCoordinates}`.padEnd(44),
    `delta: ${delta}`.padEnd(16),
    result.reason
  ].join('  ');
}

function printReport(results, apply, appliedCount, placeId, hasCoverage) {
  const counts = results.reduce((totals, result) => {
    totals[result.status] = (totals[result.status] || 0) + 1;
    return totals;
  }, {});

  console.log(`HVC existing container audit (${apply ? 'apply' : 'dry-run'})`);
  console.log(`Audited: ${results.length}`);
  console.log(`Unchanged: ${counts.unchanged || 0}`);
  console.log(`Would update: ${counts.wouldUpdate || 0}`);
  console.log(`Updated: ${counts.updated || 0}`);
  console.log(`Manual review: ${counts.manualReview || 0}`);
  console.log('');

  for (const result of results) {
    console.log(formatSummaryLine(result));
  }

  if (apply && appliedCount > 0 && hasCoverage) {
    console.log('');
    console.log(`Coverage is now stale. Regenerate intentionally with: node scripts/generate-house-coverage.mjs --place=${placeId}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const places = await readPlacesManifest();
  const place = options.placeId
    ? places.find((candidate) => candidate.id === options.placeId)
    : getDefaultPlace(places);

  if (!place) {
    const knownPlaces = places.map((candidate) => candidate.id).join(', ');
    throw new Error(`Unknown place: ${options.placeId}. Known places: ${knownPlaces}`);
  }

  const containerPath = resolvePlaceDataPath(place, 'containers');
  const containers = await readJson(containerPath, `${place.id} container-locations.json`);
  const coveragePath = place.paths?.coverage
    ? resolvePlaceDataPath(place, 'coverage')
    : resolveProjectPath(`data/places/${place.id}/house-coverage.json`);
  const coverage = await readOptionalJson(coveragePath, `${place.id} house-coverage.json`);

  if (!Array.isArray(containers)) {
    throw new Error(`${place.id} container-locations.json must contain an array`);
  }

  if (coverage && !Array.isArray(coverage.houses)) {
    throw new Error(`${place.id} house-coverage.json must contain houses`);
  }

  const addressIndex = coverage ? createCoverageAddressIndex(coverage.houses) : null;
  const existingContainers = containers.filter(isRestExistingContainer);
  const results = [];

  for (const container of existingContainers) {
    results.push(await auditContainer(container, addressIndex, place.name));
  }

  const appliedCount = options.apply ? applyResults(containers, results) : 0;

  if (options.apply && appliedCount > 0) {
    await writeFile(containerPath, `${JSON.stringify(containers, null, 2)}\n`);
  }

  if (options.outputJson) {
    await writeFile(resolve(projectRoot, options.outputJson), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply' : 'dry-run',
      auditedCount: results.length,
      appliedCount,
      results
    }, null, 2)}\n`);
  }

  printReport(results, options.apply, appliedCount, place.id, Boolean(coverage));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
