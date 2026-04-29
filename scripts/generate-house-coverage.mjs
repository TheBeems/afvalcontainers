#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const WARMENHUIZEN_NAME = 'Warmenhuizen';
const REFERENCE_RADIUS_METERS = 275;
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CANDIDATE_COUNT = 6;
const DEFAULT_RESULT_COUNT = 3;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DELAY_MS = 1100;
const DEFAULT_TIMEOUT_MS = 45000;
const PDOK_WOONPLAATS_URL = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/woonplaats/items';
const PDOK_ADRES_URL = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items';
const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
const OSRM_PROFILE = 'foot';
const USER_AGENT = 'warmenhuizen-afvalcontainers-batch/1.0';
const ROUTE_GEOMETRY_DECIMALS = 6;

const defaultOptions = {
  containerPath: resolve(projectRoot, 'data/container-locations.json'),
  outputJsonPath: resolve(projectRoot, 'data/house-coverage.json'),
  candidateCount: DEFAULT_CANDIDATE_COUNT,
  resultCount: DEFAULT_RESULT_COUNT,
  concurrency: DEFAULT_CONCURRENCY,
  limitHouses: null,
  delayMs: DEFAULT_DELAY_MS
};

function printHelp() {
  console.log(`
Gebruik:
  node scripts/generate-house-coverage.mjs [opties]

Opties:
  --container-file=PAD   Pad naar de containerdataset JSON.
  --output-json=PAD      Pad voor het gegenereerde JSON-resultaat.
  --candidate-count=N    Aantal hemelsbreed dichtste containers per adres. Standaard: ${DEFAULT_CANDIDATE_COUNT}
  --result-count=N       Aantal opgeslagen dichtstbijzijnde containers en routes per adres. Standaard: ${DEFAULT_RESULT_COUNT}
  --concurrency=N        Gelijktijdige OSRM table-verzoeken. Standaard: ${DEFAULT_CONCURRENCY}
  --limit-houses=N       Analyseer alleen de eerste N adressen (handig voor tests).
  --delay-ms=N           Extra wachttijd tussen OSRM-verzoeken per worker. Standaard: ${DEFAULT_DELAY_MS}
  --help                 Toon deze hulptekst.
`.trim());
}

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (!arg.startsWith('--') || !arg.includes('=')) {
      throw new Error(`Onbekend argument: ${arg}`);
    }

    const [key, rawValue] = arg.slice(2).split('=');
    switch (key) {
      case 'container-file':
        options.containerPath = resolve(projectRoot, rawValue);
        break;
      case 'output-json':
        options.outputJsonPath = resolve(projectRoot, rawValue);
        break;
      case 'candidate-count':
        options.candidateCount = parsePositiveInteger(rawValue, key);
        break;
      case 'result-count':
        options.resultCount = parsePositiveInteger(rawValue, key);
        break;
      case 'concurrency':
        options.concurrency = parsePositiveInteger(rawValue, key);
        break;
      case 'limit-houses':
        options.limitHouses = parsePositiveInteger(rawValue, key);
        break;
      case 'delay-ms':
        options.delayMs = parseNonNegativeInteger(rawValue, key);
        break;
      default:
        throw new Error(`Onbekend argument: --${key}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, key) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${key} moet een positief geheel getal zijn.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, key) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${key} moet een niet-negatief geheel getal zijn.`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function roundMetric(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function roundCoordinate(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(ROUTE_GEOMETRY_DECIMALS));
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (value) => value * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function formatDutchHouseNumber(properties) {
  return `${properties.huisnummer || ''}${properties.huisletter || ''}${properties.toevoeging ? ` ${properties.toevoeging}` : ''}`;
}

async function fetchJson(url, label, { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT
        },
        signal: AbortSignal.timeout(timeoutMs)
      });

      const text = await response.text();
      let payload;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`${label} gaf geen geldige JSON terug.`);
      }

      if (!response.ok) {
        const detail = payload.detail || payload.title || response.statusText;
        throw new Error(`${label} mislukt (${response.status}): ${detail}`);
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }

  throw new Error(`${label} mislukt: ${lastError?.message || 'onbekende fout'}`);
}

async function fetchPaginatedFeatures(initialUrl, label, { pageLimit = 25, stopWhen = null } = {}) {
  let url = initialUrl;
  let page = 0;
  const features = [];

  while (url && page < pageLimit) {
    const data = await fetchJson(url, `${label} (pagina ${page + 1})`);
    const pageFeatures = Array.isArray(data.features) ? data.features : [];
    features.push(...pageFeatures);

    if (typeof stopWhen === 'function') {
      const stopResult = stopWhen(pageFeatures, data, features);
      if (stopResult) {
        return { features, pageCount: page + 1, stopResult };
      }
    }

    const nextLink = (data.links || []).find((link) => link.rel === 'next' && link.href);
    url = nextLink ? nextLink.href : null;
    page += 1;
  }

  return { features, pageCount: page, stopResult: null };
}

async function loadContainers(containerPath) {
  const raw = await readFile(containerPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error(`Containerdataset is leeg of ongeldig: ${containerPath}`);
  }

  return parsed;
}

function getFeatureCoordinates(geometry) {
  const coordinates = [];

  for (const polygon of geometry.coordinates || []) {
    for (const ring of polygon || []) {
      for (const coordinate of ring || []) {
        if (Array.isArray(coordinate) && coordinate.length >= 2) {
          coordinates.push(coordinate);
        }
      }
    }
  }

  return coordinates;
}

function computeBboxFromMultiPolygon(geometry) {
  const coordinates = getFeatureCoordinates(geometry);
  if (!coordinates.length) {
    throw new Error('Woonplaatsgeometrie bevat geen bruikbare coördinaten.');
  }

  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);

  return {
    west: Math.min(...lons),
    south: Math.min(...lats),
    east: Math.max(...lons),
    north: Math.max(...lats)
  };
}

function isPointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];

    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygon(point, polygon) {
  if (!polygon.length || !isPointInRing(point, polygon[0])) {
    return false;
  }

  for (let index = 1; index < polygon.length; index += 1) {
    if (isPointInRing(point, polygon[index])) {
      return false;
    }
  }

  return true;
}

function isPointInMultiPolygon(point, geometry) {
  return (geometry.coordinates || []).some((polygon) => isPointInPolygon(point, polygon));
}

async function loadWarmenhuizenBoundary() {
  const initialUrl = `${PDOK_WOONPLAATS_URL}?f=json&limit=${DEFAULT_PAGE_SIZE}`;
  const { stopResult } = await fetchPaginatedFeatures(initialUrl, 'Woonplaatsen laden', {
    pageLimit: 20,
    stopWhen: (pageFeatures) => pageFeatures.find((feature) => {
      const properties = feature.properties || {};
      return feature.geometry?.type === 'MultiPolygon'
        && properties.woonplaats === WARMENHUIZEN_NAME
        && properties.status === 'Woonplaats aangewezen';
    })
  });

  if (!stopResult) {
    throw new Error(`Woonplaats ${WARMENHUIZEN_NAME} niet gevonden in de BAG-woonplaatscollectie.`);
  }

  return stopResult;
}

function normalizeAddressFeature(feature, boundaryGeometry) {
  if (!feature || feature.geometry?.type !== 'Point') {
    return null;
  }

  const properties = feature.properties || {};
  const coordinates = feature.geometry.coordinates || [];

  if (properties.status !== 'Naamgeving uitgegeven') {
    return null;
  }

  if (properties.adresseerbaar_object_type !== 'Verblijfsobject') {
    return null;
  }

  if (properties.woonplaats_naam !== WARMENHUIZEN_NAME) {
    return null;
  }

  if (coordinates.length < 2 || !isPointInMultiPolygon(coordinates, boundaryGeometry)) {
    return null;
  }

  const houseNumber = formatDutchHouseNumber(properties).trim();
  const streetName = properties.openbare_ruimte_naam;
  if (!streetName || !houseNumber) {
    return null;
  }

  return {
    id: feature.id || properties.identificatie,
    address: `${streetName} ${houseNumber}`,
    postcode: properties.postcode || '',
    city: properties.woonplaats_naam || WARMENHUIZEN_NAME,
    lat: coordinates[1],
    lon: coordinates[0]
  };
}

async function loadAddresses(boundaryGeometry) {
  const bbox = computeBboxFromMultiPolygon(boundaryGeometry);
  const bboxParam = [bbox.west, bbox.south, bbox.east, bbox.north]
    .map((value) => value.toFixed(6))
    .join(',');

  const initialUrl = `${PDOK_ADRES_URL}?f=json&limit=${DEFAULT_PAGE_SIZE}&bbox=${bboxParam}`;
  const { features, pageCount } = await fetchPaginatedFeatures(initialUrl, 'Adressen laden', { pageLimit: 20 });

  console.log(`BAG-adressen opgehaald binnen woonplaatsbbox: ${features.length} features verdeeld over ${pageCount} pagina(s).`);

  const uniqueHouses = new Map();
  for (const feature of features) {
    const house = normalizeAddressFeature(feature, boundaryGeometry);
    if (house && !uniqueHouses.has(house.id)) {
      uniqueHouses.set(house.id, house);
    }
  }

  return Array.from(uniqueHouses.values()).sort((left, right) => {
    const addressOrder = left.address.localeCompare(right.address, 'nl-NL');
    if (addressOrder !== 0) {
      return addressOrder;
    }
    return left.id.localeCompare(right.id, 'nl-NL');
  });
}

function getCandidateContainers(house, containers, count) {
  return containers
    .map((container) => ({
      ...container,
      straightDistance: haversineMeters(house.lat, house.lon, container.lat, container.lon)
    }))
    .sort((left, right) => left.straightDistance - right.straightDistance)
    .slice(0, Math.min(count, containers.length));
}

async function fetchWalkingMatrix(house, candidates) {
  const coordinates = [[house.lon, house.lat], ...candidates.map((candidate) => [candidate.lon, candidate.lat])]
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(';');

  const destinations = candidates.map((_, index) => index + 1).join(';');
  const url = `${OSRM_BASE_URL}/table/v1/${OSRM_PROFILE}/${coordinates}?sources=0&destinations=${destinations}&annotations=distance,duration`;
  const data = await fetchJson(url, `Loopafstand berekenen voor ${house.address}`);

  if (data.code !== 'Ok') {
    throw new Error(`OSRM table gaf code ${data.code || 'onbekend'}.`);
  }

  return data;
}

async function fetchWalkingRoute(house, container) {
  const coordinates = `${house.lon},${house.lat};${container.lon},${container.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coordinates}?overview=simplified&geometries=geojson`;
  const data = await fetchJson(url, `Looproute ophalen voor ${house.address} naar ${container.id}`);

  if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes[0]?.geometry?.coordinates) {
    throw new Error(`OSRM route gaf code ${data.code || 'onbekend'}.`);
  }

  return data.routes[0].geometry.coordinates
    .map(([lon, lat]) => [roundCoordinate(lat), roundCoordinate(lon)])
    .filter(([lat, lon]) => lat !== null && lon !== null);
}

function classifyCoverageStatus(distance) {
  if (!Number.isFinite(distance)) {
    return 'unreachable';
  }

  if (distance <= 100) {
    return 'within_100';
  }

  if (distance <= 125) {
    return 'between_100_125';
  }

  if (distance <= 150) {
    return 'between_125_150';
  }

  if (distance <= REFERENCE_RADIUS_METERS) {
    return 'between_150_275';
  }

  return 'over_275';
}

function buildUnreachableResult(house, analysisError = null) {
  return {
    ...house,
    nearestContainerId: null,
    nearestContainerAddress: null,
    nearestContainerAccuracy: null,
    nearestContainers: [],
    straightDistance: null,
    walkingDistance: null,
    walkingDuration: null,
    coverageStatus: 'unreachable',
    analysisError
  };
}

async function buildRankedContainersWithRoutes(house, ranked, options) {
  const nearestContainers = [];

  for (const container of ranked.slice(0, Math.min(options.resultCount, ranked.length))) {
    const entry = {
      id: container.id,
      address: container.address,
      accuracy: container.accuracy,
      type: container.type || 'rest',
      ...(Object.prototype.hasOwnProperty.call(container, 'status') ? { status: container.status } : {}),
      straightDistance: roundMetric(container.straightDistance),
      walkingDistance: roundMetric(container.walkingDistance),
      walkingDuration: roundMetric(container.walkingDuration),
      coverageStatus: classifyCoverageStatus(container.walkingDistance),
      routeGeometry: [],
      routeError: null
    };

    try {
      if (options.delayMs > 0) {
        await sleep(options.delayMs);
      }
      entry.routeGeometry = await fetchWalkingRoute(house, container);
    } catch (error) {
      entry.routeError = error.message || 'Looproute kon niet worden opgehaald.';
    }

    nearestContainers.push(entry);
  }

  return nearestContainers;
}

async function buildCoverageResult(house, candidates, matrix, options) {
  const distances = matrix.distances?.[0] || [];
  const durations = matrix.durations?.[0] || [];

  const ranked = candidates
    .map((candidate, index) => ({
      ...candidate,
      walkingDistance: distances[index],
      walkingDuration: durations[index]
    }))
    .filter((candidate) => Number.isFinite(candidate.walkingDistance) && Number.isFinite(candidate.walkingDuration))
    .sort((left, right) => left.walkingDistance - right.walkingDistance);

  if (!ranked.length) {
    return buildUnreachableResult(house, 'Voor dit adres vond OSRM geen looproute naar de voorselectiecontainers.');
  }

  const nearest = ranked[0];
  const nearestContainers = await buildRankedContainersWithRoutes(house, ranked, options);

  return {
    ...house,
    nearestContainerId: nearest.id,
    nearestContainerAddress: nearest.address,
    nearestContainerAccuracy: nearest.accuracy,
    nearestContainers,
    straightDistance: roundMetric(nearest.straightDistance),
    walkingDistance: roundMetric(nearest.walkingDistance),
    walkingDuration: roundMetric(nearest.walkingDuration),
    coverageStatus: classifyCoverageStatus(nearest.walkingDistance),
    analysisError: null
  };
}

async function analyzeHouse(house, containers, options) {
  const candidates = getCandidateContainers(house, containers, options.candidateCount);
  if (!candidates.length) {
    return buildUnreachableResult(house, 'Er zijn geen containers beschikbaar.');
  }

  if (options.delayMs > 0) {
    await sleep(options.delayMs);
  }

  try {
    const matrix = await fetchWalkingMatrix(house, candidates);
    return await buildCoverageResult(house, candidates, matrix, options);
  } catch (error) {
    return buildUnreachableResult(house, error.message || 'Loopafstand kon niet worden berekend.');
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      completed += 1;

      if (completed % 25 === 0 || completed === items.length) {
        console.log(`Loopafstanden berekend: ${completed}/${items.length}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function buildSummary(results, options, containers, bbox) {
  const counts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0
  };

  const routedDistances = [];
  const routedDurations = [];

  for (const result of results) {
    counts[result.coverageStatus] += 1;
    if (Number.isFinite(result.walkingDistance)) {
      routedDistances.push(result.walkingDistance);
    }
    if (Number.isFinite(result.walkingDuration)) {
      routedDurations.push(result.walkingDuration);
    }
  }

  const average = (values) => {
    if (!values.length) {
      return null;
    }
    return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
  };

  return {
    totalAddresses: results.length,
    routedAddresses: routedDistances.length,
    counts,
    averageWalkingDistance: average(routedDistances),
    averageWalkingDuration: average(routedDurations),
    minWalkingDistance: routedDistances.length ? roundMetric(Math.min(...routedDistances)) : null,
    maxWalkingDistance: routedDistances.length ? roundMetric(Math.max(...routedDistances)) : null,
    candidateCount: options.candidateCount,
    resultCount: options.resultCount,
    containerCount: containers.length,
    bbox,
    limitedRun: Number.isInteger(options.limitHouses)
  };
}

async function writeOutput(outputJsonPath, payload) {
  await mkdir(dirname(outputJsonPath), { recursive: true });

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(outputJsonPath, json, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const containers = await loadContainers(options.containerPath);

  console.log(`Containerdataset geladen: ${containers.length} locaties.`);
  console.log(`Zoek woonplaatsgrens voor ${WARMENHUIZEN_NAME}...`);

  const boundaryFeature = await loadWarmenhuizenBoundary();
  const bbox = computeBboxFromMultiPolygon(boundaryFeature.geometry);
  console.log(`Woonplaatsgrens gevonden: ${boundaryFeature.properties?.identificatie || 'onbekende identificatie'}.`);

  const allAddresses = await loadAddresses(boundaryFeature.geometry);
  const houses = Number.isInteger(options.limitHouses)
    ? allAddresses.slice(0, options.limitHouses)
    : allAddresses;

  console.log(`Te analyseren adressen: ${houses.length}${Number.isInteger(options.limitHouses) ? ` (beperkt vanaf totaal ${allAddresses.length})` : ''}.`);

  const results = await mapWithConcurrency(houses, options.concurrency, (house) => analyzeHouse(house, containers, options));
  const generatedAt = new Date().toISOString();
  const summary = buildSummary(results, options, containers, bbox);

  const payload = {
    schemaVersion: 3,
    generatedAt,
    placeName: WARMENHUIZEN_NAME,
    source: {
      pdokWoonplaatsCollection: 'woonplaats',
      pdokAdresCollection: 'adres',
      osrmBaseUrl: OSRM_BASE_URL,
      osrmProfile: OSRM_PROFILE
    },
    summary,
    houses: results
  };

  await writeOutput(options.outputJsonPath, payload);

  console.log('Analyse afgerond.');
  console.log(`0-100 m: ${summary.counts.within_100}`);
  console.log(`100-125 m: ${summary.counts.between_100_125}`);
  console.log(`125-150 m: ${summary.counts.between_125_150}`);
  console.log(`150-275 m: ${summary.counts.between_150_275}`);
  console.log(`Boven 275 m: ${summary.counts.over_275}`);
  console.log(`Onbereikbaar: ${summary.counts.unreachable}`);
  console.log(`JSON geschreven naar: ${options.outputJsonPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
