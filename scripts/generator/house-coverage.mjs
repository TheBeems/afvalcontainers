import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddressAllowedByRules, normalizeWhitespace } from '../../src/shared/address.js';
import { classifyCoverageStatus } from '../../src/shared/coverage.js';
import {
  countRestafvalContainers,
  getContainerAnalysisStatus,
  getContainerAnalysisType,
  hasRestafvalStream
} from '../../src/shared/containers.js';
import {
  formatRouteCacheCoordinate,
  haversineMeters,
  isValidRouteGeometry,
  roundCoordinate,
  roundMetric
} from '../../src/shared/geometry.js';
import {
  getDefaultPlace,
  readPlacesManifest,
  resolvePlaceDataPath
} from '../places.mjs';
import { splitCoverageForPlace } from '../split-house-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_CANDIDATE_COUNT = 6;
const DEFAULT_RESULT_COUNT = 3;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_DELAY_MS = 1100;
const DEFAULT_TABLE_BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 45000;
const ADDRESS_BBOX_TILE_ROWS = 2;
const ADDRESS_BBOX_TILE_COLUMNS = 2;
const BBOX_TILE_OVERLAP_DEGREES = 0.000001;
const PDOK_WOONPLAATS_URL = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/woonplaats/items';
const PDOK_ADRES_URL = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/adres/items';
const PDOK_BRT_TOP10NL_COLLECTIONS_URL = 'https://api.pdok.nl/brt/top10nl/ogc/v1/collections';
const BRT_BUILT_UP_AREA_COLLECTIONS = ['plaats_multivlak', 'plaats_vlak'];
const ANALYSIS_SCOPE_TYPE = 'built_up_area';
const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot';
const OSRM_PROFILE = 'foot';
const USER_AGENT = 'warmenhuizen-afvalcontainers-batch/1.0';
const ROUTE_CACHE_VERSION = 'route-v1';

const defaultOptions = {
  placeId: null,
  containerPath: null,
  outputJsonPath: null,
  candidateCount: DEFAULT_CANDIDATE_COUNT,
  resultCount: DEFAULT_RESULT_COUNT,
  concurrency: DEFAULT_CONCURRENCY,
  limitHouses: null,
  delayMs: DEFAULT_DELAY_MS,
  tableBatchSize: DEFAULT_TABLE_BATCH_SIZE,
  includeRouteGeometries: false,
  refreshRoutes: false
};

function printHelp() {
  console.log(`
Gebruik:
  node scripts/generate-house-coverage.mjs [opties]

Opties:
  --place=ID           Plaats uit data/places.json. Standaard: warmenhuizen.
  --container-file=PAD   Pad naar de containerdataset JSON.
  --output-json=PAD      Pad voor het gegenereerde JSON-resultaat.
  --candidate-count=N    Aantal hemelsbreed dichtste containers per adres. Standaard: ${DEFAULT_CANDIDATE_COUNT}
  --result-count=N       Aantal opgeslagen dichtstbijzijnde containers per adres. Standaard: ${DEFAULT_RESULT_COUNT}
  --concurrency=N        Gelijktijdige OSRM-verzoeken, begrensd door --delay-ms. Standaard: ${DEFAULT_CONCURRENCY}
  --limit-houses=N       Analyseer alleen de eerste N adressen (handig voor tests).
  --delay-ms=N           Minimum wachttijd tussen OSRM-verzoeken. Standaard: ${DEFAULT_DELAY_MS}
  --table-batch-size=N   Aantal adressen per OSRM table-batch. Standaard: ${DEFAULT_TABLE_BATCH_SIZE}
  --include-route-geometries
                         Haal routegeometrieën op voor de opgeslagen top-${DEFAULT_RESULT_COUNT}. Standaard: uit.
  --refresh-routes       Haal routegeometrieën opnieuw op en negeer de route-cache. Impliceert --include-route-geometries.
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

    if (arg === '--refresh-routes') {
      options.includeRouteGeometries = true;
      options.refreshRoutes = true;
      continue;
    }

    if (arg === '--include-route-geometries') {
      options.includeRouteGeometries = true;
      continue;
    }

    if (!arg.startsWith('--') || !arg.includes('=')) {
      throw new Error(`Onbekend argument: ${arg}`);
    }

    const [key, rawValue] = arg.slice(2).split('=');
    switch (key) {
      case 'place':
        options.placeId = rawValue;
        break;
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
      case 'table-batch-size':
        options.tableBatchSize = parsePositiveInteger(rawValue, key);
        break;
      default:
        throw new Error(`Onbekend argument: --${key}`);
    }
  }

  return options;
}

async function resolveOptions(argv) {
  const options = parseArgs(argv);
  const places = await readPlacesManifest();
  const place = options.placeId
    ? places.find((candidate) => candidate.id === options.placeId)
    : getDefaultPlace(places);

  if (!place) {
    const knownPlaces = places.map((candidate) => candidate.id).join(', ');
    throw new Error(`Onbekende plaats: ${options.placeId}. Bekende plaatsen: ${knownPlaces}`);
  }

  return {
    ...options,
    place,
    placeId: place.id,
    containerPath: options.containerPath || resolvePlaceDataPath(place, 'containers'),
    outputJsonPath: options.outputJsonPath || (
      place.paths?.coverage
        ? resolvePlaceDataPath(place, 'coverage')
        : resolve(projectRoot, `data/places/${place.id}/house-coverage.json`)
    ),
    writeSplitFiles: !options.outputJsonPath
  };
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

function createRateLimiter(delayMs) {
  let nextRequestAt = 0;
  let queue = Promise.resolve();

  return async function waitForTurn() {
    // OSRM is a shared public service; serialize attempts so retries respect the same delay.
    const turn = queue.then(async () => {
      const waitMs = Math.max(0, nextRequestAt - Date.now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      nextRequestAt = Date.now() + delayMs;
    });

    queue = turn.catch(() => {});
    await turn;
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildRouteCacheKey(house, container) {
  // Include rounded coordinates so moved houses or containers cannot reuse stale route geometry.
  return [
    ROUTE_CACHE_VERSION,
    OSRM_BASE_URL,
    OSRM_PROFILE,
    house.id,
    formatRouteCacheCoordinate(house.lat),
    formatRouteCacheCoordinate(house.lon),
    container.id,
    formatRouteCacheCoordinate(container.lat),
    formatRouteCacheCoordinate(container.lon)
  ].join('|');
}

function isContainerAllowedForHouse(house, container) {
  if (!container.access) {
    return true;
  }

  if (container.access.scope !== 'private') {
    throw new Error(`Container ${container.id} heeft een onbekende toegangsregel: ${container.access.scope}`);
  }

  return isAddressAllowedByRules(house.address, container.access.allowedAddresses);
}

function formatDutchHouseNumber(properties) {
  return `${properties.huisnummer || ''}${properties.huisletter || ''}${properties.toevoeging ? ` ${properties.toevoeging}` : ''}`;
}

async function fetchJson(url, label, { retries = 3, timeoutMs = DEFAULT_TIMEOUT_MS, beforeAttempt = null } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (typeof beforeAttempt === 'function') {
        await beforeAttempt();
      }

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

async function fetchOsrmJson(url, label, options) {
  return fetchJson(url, label, { beforeAttempt: options.osrmRateLimiter });
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

async function loadRouteCache(outputJsonPath, options) {
  const emptyCache = {
    routes: new Map(),
    scanned: 0,
    reusable: 0,
    skipped: 0,
    disabled: !options.includeRouteGeometries || options.refreshRoutes
  };

  if (!options.includeRouteGeometries || options.refreshRoutes) {
    return emptyCache;
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(outputJsonPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return emptyCache;
    }
    throw new Error(`Bestaande coverage kon niet als route-cache worden gelezen: ${error.message}`);
  }

  for (const house of parsed.houses || []) {
    for (const container of house.nearestContainers || []) {
      emptyCache.scanned += 1;
      if (typeof container.routeCacheKey !== 'string' || !isValidRouteGeometry(container.routeGeometry)) {
        emptyCache.skipped += 1;
        continue;
      }
      emptyCache.routes.set(container.routeCacheKey, container.routeGeometry);
      emptyCache.reusable += 1;
    }
  }

  return emptyCache;
}

function getPolygonalGeometryCoordinates(geometry) {
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates || [];
  }

  if (geometry?.type === 'Polygon') {
    return [geometry.coordinates || []];
  }

  return [];
}

function isPolygonalGeometry(geometry) {
  return getPolygonalGeometryCoordinates(geometry).length > 0;
}

function getFeatureCoordinates(geometry) {
  const coordinates = [];

  for (const polygon of getPolygonalGeometryCoordinates(geometry)) {
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

function computeBboxFromPolygonalGeometry(geometry) {
  const coordinates = getFeatureCoordinates(geometry);
  if (!coordinates.length) {
    throw new Error('Geometrie bevat geen bruikbare coördinaten.');
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

function isPointInPolygonalGeometry(point, geometry) {
  return getPolygonalGeometryCoordinates(geometry).some((polygon) => isPointInPolygon(point, polygon));
}

function buildBboxParam(bbox) {
  return [bbox.west, bbox.south, bbox.east, bbox.north]
    .map((value) => value.toFixed(6))
    .join(',');
}

function splitBbox(bbox, rows, columns) {
  const tiles = [];
  const width = (bbox.east - bbox.west) / columns;
  const height = (bbox.north - bbox.south) / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      // Tiny overlap avoids missing features that lie exactly on a tile edge.
      tiles.push({
        west: Math.max(bbox.west, bbox.west + (column * width) - BBOX_TILE_OVERLAP_DEGREES),
        south: Math.max(bbox.south, bbox.south + (row * height) - BBOX_TILE_OVERLAP_DEGREES),
        east: Math.min(bbox.east, bbox.west + ((column + 1) * width) + BBOX_TILE_OVERLAP_DEGREES),
        north: Math.min(bbox.north, bbox.south + ((row + 1) * height) + BBOX_TILE_OVERLAP_DEGREES)
      });
    }
  }

  return tiles;
}

async function loadPlaceBoundary(place) {
  const initialUrl = `${PDOK_WOONPLAATS_URL}?f=json&limit=${DEFAULT_PAGE_SIZE}`;
  const { stopResult } = await fetchPaginatedFeatures(initialUrl, 'Woonplaatsen laden', {
    pageLimit: 20,
    stopWhen: (pageFeatures) => pageFeatures.find((feature) => {
      const properties = feature.properties || {};
      return feature.geometry?.type === 'MultiPolygon'
        && properties.woonplaats === place.name
        && properties.status === 'Woonplaats aangewezen';
    })
  });

  if (!stopResult) {
    throw new Error(`Woonplaats ${place.name} niet gevonden in de BAG-woonplaatscollectie.`);
  }

  return stopResult;
}

function isPlaceBuiltUpArea(feature, place) {
  const properties = feature?.properties || {};
  return isPolygonalGeometry(feature?.geometry)
    && properties.naamnl === place.name
    && properties.bebouwdekom === 'ja'
    && properties.typegebied === 'woonkern'
    && properties.isbagwoonplaats === 'ja';
}

function getBrtBuiltUpAreaUrl(collectionId) {
  return `${PDOK_BRT_TOP10NL_COLLECTIONS_URL}/${collectionId}/items`;
}

function describeBrtFeature(feature, collectionId) {
  const properties = feature.properties || {};
  return [
    collectionId,
    properties.naamnl || 'naam onbekend',
    properties.bebouwdekom || 'bebouwdekom onbekend',
    properties.typegebied || 'type onbekend',
    `BAG=${properties.isbagwoonplaats || 'onbekend'}`
  ].join(' / ');
}

function summarizeBrtFeatures(attempts) {
  const descriptions = [];

  for (const attempt of attempts) {
    for (const feature of attempt.features) {
      descriptions.push(describeBrtFeature(feature, attempt.collectionId));
    }
  }

  const uniqueDescriptions = Array.from(new Set(descriptions));
  const visibleDescriptions = uniqueDescriptions.slice(0, 20);
  const suffix = uniqueDescriptions.length > visibleDescriptions.length
    ? `; ... (${uniqueDescriptions.length - visibleDescriptions.length} extra)`
    : '';

  return `${visibleDescriptions.join('; ') || 'geen'}${suffix}`;
}

async function loadPlaceBuiltUpArea(searchBbox, place) {
  const bboxParam = buildBboxParam(searchBbox);
  const attempts = [];

  for (const collectionId of BRT_BUILT_UP_AREA_COLLECTIONS) {
    const initialUrl = `${getBrtBuiltUpAreaUrl(collectionId)}?f=json&limit=${DEFAULT_PAGE_SIZE}&bbox=${bboxParam}`;
    const { features, pageCount } = await fetchPaginatedFeatures(initialUrl, `BRT ${collectionId} laden`, { pageLimit: 5 });
    const builtUpAreas = features.filter((feature) => isPlaceBuiltUpArea(feature, place));
    attempts.push({ collectionId, features, pageCount, matchCount: builtUpAreas.length });

    if (builtUpAreas.length === 1) {
      console.log(`BRT bebouwde-komvlakken opgehaald uit ${collectionId} binnen woonplaatsbbox: ${features.length} features verdeeld over ${pageCount} pagina(s).`);
      return {
        collectionId,
        feature: builtUpAreas[0]
      };
    }

    if (builtUpAreas.length > 1) {
      // Multiple matches would make the analysis boundary ambiguous.
      break;
    }
  }

  const matchSummary = attempts
    .map((attempt) => `${attempt.collectionId}: ${attempt.matchCount}`)
    .join(', ');
  throw new Error(`BRT-bebouwdekomvlak voor ${place.name} niet eenduidig gevonden. Matches: ${matchSummary}. Gevonden vlakken: ${summarizeBrtFeatures(attempts)}`);
}

function getAnalysisScopeLabel(place) {
  return `bebouwde kom ${place.name}`;
}

function normalizeAddressFeature(feature, boundaryGeometry, place) {
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

  if (properties.woonplaats_naam !== place.name) {
    return null;
  }

  if (coordinates.length < 2 || !isPointInPolygonalGeometry(coordinates, boundaryGeometry)) {
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
    city: properties.woonplaats_naam || place.name,
    lat: coordinates[1],
    lon: coordinates[0]
  };
}

function sortHouses(houses) {
  return houses.sort((left, right) => {
    const addressOrder = left.address.localeCompare(right.address, 'nl-NL');
    if (addressOrder !== 0) {
      return addressOrder;
    }
    return left.id.localeCompare(right.id, 'nl-NL');
  });
}

async function loadAddresses(boundaryGeometry, analysisBoundaryGeometry, place) {
  const bbox = computeBboxFromPolygonalGeometry(boundaryGeometry);
  const addressBboxes = splitBbox(bbox, ADDRESS_BBOX_TILE_ROWS, ADDRESS_BBOX_TILE_COLUMNS);
  const features = [];
  let pageCount = 0;

  for (const [index, addressBbox] of addressBboxes.entries()) {
    const bboxParam = buildBboxParam(addressBbox);
    const initialUrl = `${PDOK_ADRES_URL}?f=json&limit=${DEFAULT_PAGE_SIZE}&bbox=${bboxParam}`;
    const tileResult = await fetchPaginatedFeatures(initialUrl, `Adressen laden tegel ${index + 1}/${addressBboxes.length}`, { pageLimit: 20 });
    features.push(...tileResult.features);
    pageCount += tileResult.pageCount;
  }

  console.log(`BAG-adressen opgehaald binnen woonplaatsbbox: ${features.length} features verdeeld over ${pageCount} tegelpagina(s).`);

  const uniqueBagHouses = new Map();
  for (const feature of features) {
    const house = normalizeAddressFeature(feature, boundaryGeometry, place);
    if (house && !uniqueBagHouses.has(house.id)) {
      uniqueBagHouses.set(house.id, house);
    }
  }

  const bagHouses = sortHouses(Array.from(uniqueBagHouses.values()));
  const houses = bagHouses.filter((house) => isPointInPolygonalGeometry([house.lon, house.lat], analysisBoundaryGeometry));

  console.log(`BAG-verblijfsobjecten binnen woonplaats ${place.name}: ${bagHouses.length}.`);
  console.log(`Adressen binnen ${getAnalysisScopeLabel(place)}: ${houses.length}; uitgesloten buiten analysegebied: ${bagHouses.length - houses.length}.`);

  return {
    houses,
    stats: {
      totalBagAddresses: bagHouses.length,
      includedAddresses: houses.length,
      excludedAddresses: bagHouses.length - houses.length
    }
  };
}

function getCandidateContainers(house, containers, count) {
  return containers
    .filter(hasRestafvalStream)
    .filter((container) => isContainerAllowedForHouse(house, container))
    .map((container) => ({
      ...container,
      straightDistance: haversineMeters(house.lat, house.lon, container.lat, container.lon)
    }))
    .sort((left, right) => left.straightDistance - right.straightDistance)
    .slice(0, Math.min(count, containers.length));
}

function getUniqueCandidateContainers(jobs) {
  const containersById = new Map();

  for (const job of jobs) {
    for (const candidate of job.candidates) {
      if (!containersById.has(candidate.id)) {
        containersById.set(candidate.id, candidate);
      }
    }
  }

  return Array.from(containersById.values());
}

async function fetchWalkingMatrixBatch(jobs, options) {
  const destinationContainers = getUniqueCandidateContainers(jobs);
  const coordinates = [
    ...jobs.map((job) => [job.house.lon, job.house.lat]),
    ...destinationContainers.map((container) => [container.lon, container.lat])
  ]
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(';');

  const sources = jobs.map((_, index) => index).join(';');
  const destinations = destinationContainers
    .map((_, index) => jobs.length + index)
    .join(';');

  const url = `${OSRM_BASE_URL}/table/v1/${OSRM_PROFILE}/${coordinates}?sources=${sources}&destinations=${destinations}&annotations=distance,duration`;
  const data = await fetchOsrmJson(url, `Loopafstanden berekenen voor ${jobs.length} adres(sen)`, options);

  if (data.code !== 'Ok') {
    throw new Error(`OSRM table gaf code ${data.code || 'onbekend'}.`);
  }

  return { matrix: data, destinationContainers };
}

async function fetchWalkingRoute(house, container, options) {
  const coordinates = `${house.lon},${house.lat};${container.lon},${container.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coordinates}?overview=simplified&geometries=geojson`;
  const data = await fetchOsrmJson(url, `Looproute ophalen voor ${house.address} naar ${container.id}`, options);

  if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes[0]?.geometry?.coordinates) {
    throw new Error(`OSRM route gaf code ${data.code || 'onbekend'}.`);
  }

  return data.routes[0].geometry.coordinates
    .map(([lon, lat]) => [roundCoordinate(lat), roundCoordinate(lon)])
    .filter(([lat, lon]) => lat !== null && lon !== null);
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function buildHouseJobs(houses, containers, options) {
  return houses.map((house, index) => ({
    index,
    house,
    candidates: getCandidateContainers(house, containers, options.candidateCount)
  }));
}

function buildRankedCandidates(job, matrix, sourceIndex, destinationIndexById) {
  const distances = matrix.distances?.[sourceIndex] || [];
  const durations = matrix.durations?.[sourceIndex] || [];

  return job.candidates
    .map((candidate) => {
      const destinationIndex = destinationIndexById.get(candidate.id);
      return {
        ...candidate,
        walkingDistance: distances[destinationIndex],
        walkingDuration: durations[destinationIndex]
      };
    })
    .filter((candidate) => Number.isFinite(candidate.walkingDistance) && Number.isFinite(candidate.walkingDuration))
    .sort((left, right) => left.walkingDistance - right.walkingDistance);
}

async function analyzeDistanceBatch(jobs, options, distanceStats, totalHouses) {
  try {
    const { matrix, destinationContainers } = await fetchWalkingMatrixBatch(jobs, options);
    const destinationIndexById = new Map(destinationContainers.map((container, index) => [container.id, index]));

    distanceStats.batches += 1;
    distanceStats.houses += jobs.length;
    if (distanceStats.batches % 5 === 0 || distanceStats.houses === totalHouses) {
      console.log(`Loopafstandsbatches berekend: ${distanceStats.batches} batch(es), ${distanceStats.houses}/${totalHouses} adressen.`);
    }

    return jobs.map((job, sourceIndex) => ({
      index: job.index,
      house: job.house,
      ranked: buildRankedCandidates(job, matrix, sourceIndex, destinationIndexById),
      analysisError: null
    }));
  } catch (error) {
    distanceStats.failedBatches += 1;

    if (jobs.length > 1) {
      // Split failed table batches to isolate bad address/container pairs without losing the rest.
      const midpoint = Math.ceil(jobs.length / 2);
      const left = await analyzeDistanceBatch(jobs.slice(0, midpoint), options, distanceStats, totalHouses);
      const right = await analyzeDistanceBatch(jobs.slice(midpoint), options, distanceStats, totalHouses);
      return [...left, ...right];
    }

    distanceStats.houses += 1;
    return [{
      index: jobs[0].index,
      house: jobs[0].house,
      ranked: [],
      analysisError: error.message || 'Loopafstand kon niet worden berekend.'
    }];
  }
}

async function buildDistanceAnalyses(houseJobs, options) {
  const analyses = new Array(houseJobs.length);
  const routableJobs = [];
  const distanceStats = {
    batches: 0,
    failedBatches: 0,
    houses: 0
  };

  for (const job of houseJobs) {
    if (!job.candidates.length) {
      analyses[job.index] = {
        index: job.index,
        house: job.house,
        ranked: [],
        analysisError: 'Er zijn geen containers beschikbaar.'
      };
      continue;
    }
    routableJobs.push(job);
  }

  const batches = chunkArray(routableJobs, options.tableBatchSize);
  const batchResults = await mapWithConcurrency(batches, options.concurrency, (batch) => (
    analyzeDistanceBatch(batch, options, distanceStats, routableJobs.length)
  ));

  for (const batchResult of batchResults) {
    for (const analysis of batchResult) {
      analyses[analysis.index] = analysis;
    }
  }

  console.log(`Loopafstandsbatches afgerond: ${distanceStats.batches} gelukt, ${distanceStats.failedBatches} opgesplitst of mislukt.`);
  return analyses;
}

function buildNearestContainerEntry(house, container) {
  return {
    id: container.id,
    address: container.address,
    accuracy: container.accuracy,
    type: getContainerAnalysisType(container),
    status: getContainerAnalysisStatus(container),
    straightDistance: roundMetric(container.straightDistance),
    walkingDistance: roundMetric(container.walkingDistance),
    walkingDuration: roundMetric(container.walkingDuration),
    coverageStatus: classifyCoverageStatus(container.walkingDistance),
    routeCacheKey: buildRouteCacheKey(house, container),
    routeGeometry: [],
    routeError: null
  };
}

function buildCoverageResult(analysis, options, routeCache, routeTasks, routeStats) {
  const { house, ranked } = analysis;

  if (!ranked.length) {
    return buildUnreachableResult(
      house,
      analysis.analysisError || 'Voor dit adres vond OSRM geen looproute naar de voorselectiecontainers.'
    );
  }

  const nearestContainers = [];
  for (const container of ranked.slice(0, Math.min(options.resultCount, ranked.length))) {
    const entry = buildNearestContainerEntry(house, container);

    routeStats.total += 1;
    if (!options.includeRouteGeometries) {
      routeStats.skipped += 1;
    } else {
      const cachedRouteGeometry = routeCache.routes.get(entry.routeCacheKey);
      if (cachedRouteGeometry) {
        entry.routeGeometry = cachedRouteGeometry;
        routeStats.reused += 1;
      } else {
        routeTasks.push({ house, container, entry });
      }
    }

    nearestContainers.push(entry);
  }

  const nearest = ranked[0];
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

async function populateRouteGeometries(routeTasks, options, routeStats) {
  if (!routeTasks.length) {
    console.log(`Routegeometrieën: ${routeStats.reused} hergebruikt, 0 opgehaald, 0 mislukt.`);
    return;
  }

  await mapWithConcurrency(routeTasks, options.concurrency, async ({ house, container, entry }) => {
    try {
      entry.routeGeometry = await fetchWalkingRoute(house, container, options);
      routeStats.fetched += 1;
    } catch (error) {
      entry.routeError = error.message || 'Looproute kon niet worden opgehaald.';
      routeStats.failed += 1;
    }

    const completed = routeStats.fetched + routeStats.failed;
    if (completed % 25 === 0 || completed === routeTasks.length) {
      console.log(`Routegeometrieën opgehaald: ${completed}/${routeTasks.length} (${routeStats.reused} hergebruikt, ${routeStats.failed} mislukt).`);
    }
  });
}

function buildSummary(results, options, containers, bbox, addressStats) {
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
    includeRouteGeometries: options.includeRouteGeometries,
    tableBatchSize: options.tableBatchSize,
    containerCount: countRestafvalContainers(containers),
    bbox,
    analysisAddressScope: ANALYSIS_SCOPE_TYPE,
    sourceAddressCount: addressStats.totalBagAddresses,
    includedAddressCount: addressStats.includedAddresses,
    excludedAddressCount: addressStats.excludedAddresses,
    limitedRun: Number.isInteger(options.limitHouses)
  };
}

function buildAnalysisScope(builtUpAreaFeature, addressStats, place, collectionId) {
  const properties = builtUpAreaFeature.properties || {};

  return {
    type: ANALYSIS_SCOPE_TYPE,
    label: getAnalysisScopeLabel(place),
    source: {
      dataset: 'BRT TOP10NL',
      collection: collectionId,
      featureId: builtUpAreaFeature.id || '',
      name: properties.naamnl || '',
      officialName: properties.naamofficieel || '',
      builtUpArea: properties.bebouwdekom || '',
      areaType: properties.typegebied || '',
      isBagPlace: properties.isbagwoonplaats || '',
      sourceActuality: properties.bronactualiteit || '',
      sourceDescription: properties.bronbeschrijving || ''
    },
    addresses: {
      totalBagAddresses: addressStats.totalBagAddresses,
      includedAddresses: addressStats.includedAddresses,
      excludedAddresses: addressStats.excludedAddresses
    }
  };
}

async function writeOutput(outputJsonPath, payload) {
  await mkdir(dirname(outputJsonPath), { recursive: true });

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(outputJsonPath, json, 'utf8');
}

export async function generateHouseCoverage(argv = process.argv.slice(2)) {
  const options = await resolveOptions(argv);
  options.osrmRateLimiter = createRateLimiter(options.delayMs);

  const containers = await loadContainers(options.containerPath);
  const routeCache = await loadRouteCache(options.outputJsonPath, options);

  console.log(`Plaats: ${options.place.name} (${options.place.id}).`);
  console.log(`Containerdataset geladen: ${containers.length} locaties.`);
  console.log(`OSRM-instellingen: ${options.tableBatchSize} adressen per table-batch, minimaal ${options.delayMs} ms tussen verzoeken.`);
  if (!options.includeRouteGeometries) {
    console.log('Routegeometrieën: overgeslagen. De kaart gebruikt live fallback wanneer een route wordt geselecteerd.');
  } else if (routeCache.disabled) {
    console.log('Route-cache genegeerd door --refresh-routes.');
  } else {
    console.log(`Route-cache geladen: ${routeCache.reusable} bruikbare route(s), ${routeCache.skipped} overgeslagen.`);
  }
  console.log(`Zoek woonplaatsgrens voor ${options.place.name}...`);

  const boundaryFeature = await loadPlaceBoundary(options.place);
  const placeBbox = computeBboxFromPolygonalGeometry(boundaryFeature.geometry);
  console.log(`Woonplaatsgrens gevonden: ${boundaryFeature.properties?.identificatie || 'onbekende identificatie'}.`);

  console.log(`Zoek BRT-bebouwdekomvlak voor ${options.place.name}...`);
  const analysisBoundary = await loadPlaceBuiltUpArea(placeBbox, options.place);
  const analysisBoundaryFeature = analysisBoundary.feature;
  const analysisBbox = computeBboxFromPolygonalGeometry(analysisBoundaryFeature.geometry);
  console.log(`BRT-bebouwdekomvlak gevonden: ${analysisBoundaryFeature.id || 'onbekende identificatie'} (${analysisBoundaryFeature.properties?.bronactualiteit || 'bronactualiteit onbekend'}).`);

  const { houses: allAddresses, stats: addressStats } = await loadAddresses(boundaryFeature.geometry, analysisBoundaryFeature.geometry, options.place);
  const houses = Number.isInteger(options.limitHouses)
    ? allAddresses.slice(0, options.limitHouses)
    : allAddresses;

  console.log(`Te analyseren adressen: ${houses.length}${Number.isInteger(options.limitHouses) ? ` (beperkt vanaf totaal ${allAddresses.length})` : ''}.`);

  const houseJobs = buildHouseJobs(houses, containers, options);
  const analyses = await buildDistanceAnalyses(houseJobs, options);
  const routeTasks = [];
  const routeStats = {
    total: 0,
    reused: 0,
    fetched: 0,
    failed: 0,
    skipped: 0
  };
  const results = analyses.map((analysis) => buildCoverageResult(analysis, options, routeCache, routeTasks, routeStats));

  if (options.includeRouteGeometries) {
    console.log(`Routegeometrieën voorbereid: ${routeStats.total} totaal, ${routeStats.reused} uit cache, ${routeTasks.length} op te halen.`);
    await populateRouteGeometries(routeTasks, options, routeStats);
  } else {
    console.log(`Routegeometrieën overgeslagen: ${routeStats.skipped} route(s) krijgen live fallback in de kaart.`);
  }

  const generatedAt = new Date().toISOString();
  const summary = buildSummary(results, options, containers, analysisBbox, addressStats);

  const payload = {
    schemaVersion: 4,
    generatedAt,
    placeName: options.place.name,
    analysisScope: buildAnalysisScope(analysisBoundaryFeature, addressStats, options.place, analysisBoundary.collectionId),
    source: {
      pdokWoonplaatsCollection: 'woonplaats',
      pdokAdresCollection: 'adres',
      pdokBuiltUpAreaCollection: analysisBoundary.collectionId,
      osrmBaseUrl: OSRM_BASE_URL,
      osrmProfile: OSRM_PROFILE
    },
    summary,
    houses: results
  };

  await writeOutput(options.outputJsonPath, payload);
  if (options.writeSplitFiles) {
    await splitCoverageForPlace(options.place, payload);
  }

  console.log('Analyse afgerond.');
  console.log(`0-100 m: ${summary.counts.within_100}`);
  console.log(`100-125 m: ${summary.counts.between_100_125}`);
  console.log(`125-150 m: ${summary.counts.between_125_150}`);
  console.log(`150-275 m: ${summary.counts.between_150_275}`);
  console.log(`Boven 275 m: ${summary.counts.over_275}`);
  console.log(`Onbereikbaar: ${summary.counts.unreachable}`);
  console.log(`JSON geschreven naar: ${options.outputJsonPath}`);
}
