import { generateAddressIndexes } from '../generate-address-indexes.mjs';
import {
  readJson,
  readPlacesManifest,
  resolvePlaceDataPath
} from '../places.mjs';
import { COVERAGE_STATUS_KEYS } from '../../src/shared/coverage.js';
import {
  compareContainersById,
  countRestafvalContainers,
  DEFAULT_CONTAINER_STATUS,
  hasRestafvalStream,
  PRIVATE_ACCESS_SCOPE,
  VALID_CONTAINER_CATEGORIES,
  VALID_CONTAINER_STATUSES,
  VALID_CONTAINER_TYPES
} from '../../src/shared/containers.js';
import {
  isAddressAllowedByRules,
  validateAllowedAddressRules
} from '../../src/shared/address.js';

const EXPECTED_COVERAGE_SCHEMA_VERSION = 4;
const ANALYSIS_SCOPE_TYPE = 'built_up_area';
const BRT_BUILT_UP_AREA_COLLECTIONS = new Set(['plaats_multivlak', 'plaats_vlak']);
const VALID_COVERAGE_STATUSES = new Set(COVERAGE_STATUS_KEYS);

function fail(message) {
  throw new Error(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getContainerIdPattern(place) {
  return new RegExp(`^${escapeRegExp(place.containerIdPrefix)}\\d{2}$`);
}

function getContainerIdFormat(place) {
  return `${place.containerIdPrefix}NN`;
}

function getAnalysisScopeLabel(place) {
  return `bebouwde kom ${place.name}`;
}

function validatePlacesManifest(places) {
  const seenIds = new Set();

  for (const [index, place] of places.entries()) {
    const label = `place at index ${index}`;
    if (!place || typeof place !== 'object' || Array.isArray(place)) {
      fail(`${label} must be an object.`);
    }

    assertString(place.id, `${label}.id`);
    if (!/^[a-z0-9-]+$/.test(place.id)) {
      fail(`${label}.id must use lowercase letters, numbers, and hyphens.`);
    }
    if (seenIds.has(place.id)) {
      fail(`Duplicate place id: ${place.id}`);
    }
    seenIds.add(place.id);

    assertString(place.name, `${label}.name`);
    assertString(place.containerIdPrefix, `${label}.containerIdPrefix`);
    if (!/^[A-Z]{1,6}$/.test(place.containerIdPrefix)) {
      fail(`${label}.containerIdPrefix must contain 1-6 uppercase letters.`);
    }

    if (!place.map || typeof place.map !== 'object' || Array.isArray(place.map)) {
      fail(`${label}.map must be an object.`);
    }
    if (!Array.isArray(place.map.center) || place.map.center.length !== 2) {
      fail(`${label}.map.center must be [lat, lon].`);
    }
    assertNumber(place.map.center[0], `${label}.map.center[0]`);
    assertNumber(place.map.center[1], `${label}.map.center[1]`);
    assertNumber(place.map.zoom, `${label}.map.zoom`);

    assertString(place.sourceUrl, `${label}.sourceUrl`);

    if (!place.paths || typeof place.paths !== 'object' || Array.isArray(place.paths)) {
      fail(`${label}.paths must be an object.`);
    }
    assertString(place.paths.containers, `${label}.paths.containers`);
    if (Object.prototype.hasOwnProperty.call(place.paths, 'coverage')) {
      assertString(place.paths.coverage, `${label}.paths.coverage`);
    }
    if (Object.prototype.hasOwnProperty.call(place.paths, 'addressIndex')) {
      assertString(place.paths.addressIndex, `${label}.paths.addressIndex`);
    }
    if (Boolean(place.paths.coverage) !== Boolean(place.paths.addressIndex)) {
      fail(`${label}.paths.coverage and ${label}.paths.addressIndex must be configured together.`);
    }
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertNumber(value, label) {
  if (!Number.isFinite(value)) {
    fail(`${label} must be a finite number.`);
  }
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    fail(`${label} must be an integer.`);
  }
}

function assertNonNegativeInteger(value, label) {
  assertInteger(value, label);
  if (value < 0) {
    fail(`${label} must be a non-negative integer.`);
  }
}

function getStreamStatus(stream, label) {
  if (!Object.prototype.hasOwnProperty.call(stream, 'status')) {
    return DEFAULT_CONTAINER_STATUS;
  }

  assertString(stream.status, `${label}.status`);
  if (!VALID_CONTAINER_STATUSES.has(stream.status)) {
    fail(`${label}.status must be one of: ${Array.from(VALID_CONTAINER_STATUSES).join(', ')}. Received: ${stream.status}`);
  }

  return stream.status;
}

function validateContainerStream(stream, label) {
  if (!stream || typeof stream !== 'object' || Array.isArray(stream)) {
    fail(`${label} must be an object.`);
  }

  assertString(stream.type, `${label}.type`);
  if (!VALID_CONTAINER_TYPES.has(stream.type)) {
    fail(`${label}.type must be one of: ${Array.from(VALID_CONTAINER_TYPES).join(', ')}. Received: ${stream.type}`);
  }

  const status = getStreamStatus(stream, label);
  const category = `${status}:${stream.type}`;
  if (!VALID_CONTAINER_CATEGORIES.has(category)) {
    fail(`${label} has unsupported status/type combination: ${category}`);
  }
}

function validateContainerClassification(container, label) {
  if (!Array.isArray(container.streams) || container.streams.length === 0) {
    fail(`${label}.streams must be a non-empty array.`);
  }

  if (Object.prototype.hasOwnProperty.call(container, 'type') || Object.prototype.hasOwnProperty.call(container, 'status')) {
    fail(`${label} must use streams instead of legacy type/status fields.`);
  }

  const seenTypes = new Set();
  for (const [streamIndex, stream] of container.streams.entries()) {
    validateContainerStream(stream, `${label}.streams[${streamIndex}]`);
    if (seenTypes.has(stream.type)) {
      fail(`${label}.streams contains duplicate type: ${stream.type}`);
    }
    seenTypes.add(stream.type);
  }
}

function validateContainerAccess(container, label) {
  if (!Object.prototype.hasOwnProperty.call(container, 'access')) {
    return;
  }

  const access = container.access;
  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    fail(`${label}.access must be an object.`);
  }

  if (access.scope !== PRIVATE_ACCESS_SCOPE) {
    fail(`${label}.access.scope must be "${PRIVATE_ACCESS_SCOPE}". Received: ${access.scope}`);
  }

  assertString(access.label, `${label}.access.label`);

  if (!Array.isArray(access.allowedAddresses) || access.allowedAddresses.length === 0) {
    fail(`${label}.access.allowedAddresses must be a non-empty array.`);
  }

  for (const [ruleIndex, rule] of access.allowedAddresses.entries()) {
    const ruleLabel = `${label}.access.allowedAddresses[${ruleIndex}]`;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      fail(`${ruleLabel} must be an object.`);
    }

    assertString(rule.street, `${ruleLabel}.street`);
    assertString(rule.houseNumbers, `${ruleLabel}.houseNumbers`);
  }

  const accessError = validateAllowedAddressRules(access.allowedAddresses);
  if (accessError) {
    fail(`${label}.access.allowedAddresses is invalid: ${accessError}`);
  }
}

function validateContainerMetadata(container, label) {
  if (Object.prototype.hasOwnProperty.call(container, 'hvcContainerId')) {
    assertString(container.hvcContainerId, `${label}.hvcContainerId`);
  }
}

function validateContainers(containers, place) {
  if (!Array.isArray(containers) || containers.length === 0) {
    fail(`${place.id} container-locations.json must contain a non-empty array.`);
  }

  const containerIdPattern = getContainerIdPattern(place);
  const containerIdFormat = getContainerIdFormat(place);
  const seenIds = new Set();
  const containersById = new Map();
  for (const [index, container] of containers.entries()) {
    const label = `${place.id} container at index ${index}`;
    assertString(container.id, `${label}.id`);
    if (!containerIdPattern.test(container.id)) {
      fail(`${label}.id must match ${containerIdFormat}. Received: ${container.id}`);
    }
    if (seenIds.has(container.id)) {
      fail(`Duplicate container id in ${place.id}: ${container.id}`);
    }
    seenIds.add(container.id);

    if (index > 0 && compareContainersById(containers[index - 1], container) > 0) {
      fail(`${place.id} container-locations.json must be sorted by id. ${container.id} should appear before ${containers[index - 1].id}.`);
    }

    assertString(container.address, `${label}.address`);
    assertNumber(container.lat, `${label}.lat`);
    assertNumber(container.lon, `${label}.lon`);
    assertString(container.accuracy, `${label}.accuracy`);
    validateContainerMetadata(container, label);
    validateContainerClassification(container, label);
    validateContainerAccess(container, label);
    containersById.set(container.id, container);
  }

  return containersById;
}

function validateSummary(coverage, houses, containers) {
  const summary = coverage.summary || {};
  const restafvalContainerCount = countRestafvalContainers(Array.from(containers.values()));
  if (summary.totalAddresses !== houses.length) {
    fail(`summary.totalAddresses (${summary.totalAddresses}) must equal houses.length (${houses.length}).`);
  }
  if (summary.containerCount !== restafvalContainerCount) {
    fail(`summary.containerCount (${summary.containerCount}) must equal restafval container count (${restafvalContainerCount}).`);
  }
  if (summary.analysisAddressScope !== ANALYSIS_SCOPE_TYPE) {
    fail(`summary.analysisAddressScope must be "${ANALYSIS_SCOPE_TYPE}". Received: ${summary.analysisAddressScope}`);
  }

  const actualCounts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0
  };

  for (const house of houses) {
    actualCounts[house.coverageStatus] += 1;
  }

  for (const [status, count] of Object.entries(actualCounts)) {
    if (summary.counts?.[status] !== count) {
      fail(`summary.counts.${status} (${summary.counts?.[status]}) must equal actual count (${count}).`);
    }
  }
}

function validateAnalysisScope(coverage, houses, place) {
  const scope = coverage.analysisScope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    fail(`${place.id} house-coverage.json must contain an analysisScope object.`);
  }

  if (scope.type !== ANALYSIS_SCOPE_TYPE) {
    fail(`analysisScope.type must be "${ANALYSIS_SCOPE_TYPE}". Received: ${scope.type}`);
  }
  const analysisScopeLabel = getAnalysisScopeLabel(place);
  if (scope.label !== analysisScopeLabel) {
    fail(`analysisScope.label must be "${analysisScopeLabel}". Received: ${scope.label}`);
  }

  const source = scope.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    fail('analysisScope.source must be an object.');
  }

  if (source.dataset !== 'BRT TOP10NL') {
    fail(`analysisScope.source.dataset must be "BRT TOP10NL". Received: ${source.dataset}`);
  }
  if (!BRT_BUILT_UP_AREA_COLLECTIONS.has(source.collection)) {
    fail(`analysisScope.source.collection must be one of: ${Array.from(BRT_BUILT_UP_AREA_COLLECTIONS).join(', ')}. Received: ${source.collection}`);
  }
  assertString(source.featureId, 'analysisScope.source.featureId');
  if (source.name !== place.name) {
    fail(`analysisScope.source.name must be "${place.name}". Received: ${source.name}`);
  }
  if (source.builtUpArea !== 'ja') {
    fail(`analysisScope.source.builtUpArea must be "ja". Received: ${source.builtUpArea}`);
  }
  if (source.areaType !== 'woonkern') {
    fail(`analysisScope.source.areaType must be "woonkern". Received: ${source.areaType}`);
  }
  if (source.isBagPlace !== 'ja') {
    fail(`analysisScope.source.isBagPlace must be "ja". Received: ${source.isBagPlace}`);
  }
  assertString(source.sourceActuality, 'analysisScope.source.sourceActuality');
  assertString(source.sourceDescription, 'analysisScope.source.sourceDescription');

  const addresses = scope.addresses;
  if (!addresses || typeof addresses !== 'object' || Array.isArray(addresses)) {
    fail('analysisScope.addresses must be an object.');
  }

  assertNonNegativeInteger(addresses.totalBagAddresses, 'analysisScope.addresses.totalBagAddresses');
  assertNonNegativeInteger(addresses.includedAddresses, 'analysisScope.addresses.includedAddresses');
  assertNonNegativeInteger(addresses.excludedAddresses, 'analysisScope.addresses.excludedAddresses');

  if (addresses.totalBagAddresses !== addresses.includedAddresses + addresses.excludedAddresses) {
    fail('analysisScope.addresses.totalBagAddresses must equal includedAddresses + excludedAddresses.');
  }
  if (addresses.includedAddresses < houses.length) {
    fail('analysisScope.addresses.includedAddresses must be at least houses.length.');
  }

  const summary = coverage.summary || {};
  if (summary.sourceAddressCount !== addresses.totalBagAddresses) {
    fail('summary.sourceAddressCount must match analysisScope.addresses.totalBagAddresses.');
  }
  if (summary.includedAddressCount !== addresses.includedAddresses) {
    fail('summary.includedAddressCount must match analysisScope.addresses.includedAddresses.');
  }
  if (summary.excludedAddressCount !== addresses.excludedAddresses) {
    fail('summary.excludedAddressCount must match analysisScope.addresses.excludedAddresses.');
  }
  if (!summary.limitedRun && addresses.includedAddresses !== houses.length) {
    fail('analysisScope.addresses.includedAddresses must equal houses.length for full coverage runs.');
  }
}

function validateNearestContainers(house, index, containersById) {
  if (!Array.isArray(house.nearestContainers)) {
    fail(`house at index ${index}.nearestContainers must be an array.`);
  }
  if (house.nearestContainers.length > 3) {
    fail(`house at index ${index}.nearestContainers must contain at most 3 entries.`);
  }
  if (house.nearestContainerId && house.nearestContainers.length === 0) {
    fail(`house at index ${index} has nearestContainerId but no nearestContainers entries.`);
  }

  const seenIds = new Set();
  for (const [rankingIndex, container] of house.nearestContainers.entries()) {
    const label = `house at index ${index}.nearestContainers[${rankingIndex}]`;
    assertString(container.id, `${label}.id`);
    const sourceContainer = containersById.get(container.id);
    if (!sourceContainer) {
      fail(`${label}.id references unknown container id: ${container.id}`);
    }
    if (!hasRestafvalStream(sourceContainer)) {
      fail(`${label}.id references non-restafval container id: ${container.id}`);
    }
    if (seenIds.has(container.id)) {
      fail(`${label}.id is duplicated in the same ranking: ${container.id}`);
    }
    seenIds.add(container.id);

    if (sourceContainer.access?.scope === PRIVATE_ACCESS_SCOPE
      && !isAddressAllowedByRules(house.address, sourceContainer.access.allowedAddresses)) {
      fail(`${label}.id references private container ${container.id} for disallowed address: ${house.address}`);
    }

    if (!Array.isArray(container.routeGeometry)) {
      fail(`${label}.routeGeometry must be an array.`);
    }
    if (container.routeGeometry.length > 0 && container.routeGeometry.length < 2) {
      fail(`${label}.routeGeometry must contain at least 2 points when present.`);
    }
    for (const [pointIndex, point] of container.routeGeometry.entries()) {
      if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        fail(`${label}.routeGeometry[${pointIndex}] must be [lat, lon] with finite numbers.`);
      }
    }
    if (container.routeGeometry.length === 0 && container.routeError !== null && typeof container.routeError !== 'string') {
      fail(`${label}.routeError must be null or a string.`);
    }
    if (Object.prototype.hasOwnProperty.call(container, 'routeCacheKey')) {
      assertString(container.routeCacheKey, `${label}.routeCacheKey`);
    }
  }

  if (house.nearestContainerId && !containersById.has(house.nearestContainerId)) {
    fail(`house at index ${index}.nearestContainerId references unknown container id: ${house.nearestContainerId}`);
  }
  if (house.nearestContainerId && house.nearestContainers[0]?.id !== house.nearestContainerId) {
    fail(`house at index ${index}.nearestContainers[0].id must match nearestContainerId.`);
  }
}

function validateHouses(coverage, containersById, place) {
  const houses = coverage.houses;
  if (!Array.isArray(houses)) {
    fail(`${place.id} house-coverage.json must contain a houses array.`);
  }

  for (const [index, house] of houses.entries()) {
    const label = `house at index ${index}`;
    assertString(house.id, `${label}.id`);
    assertString(house.address, `${label}.address`);
    assertNumber(house.lat, `${label}.lat`);
    assertNumber(house.lon, `${label}.lon`);

    if (!VALID_COVERAGE_STATUSES.has(house.coverageStatus)) {
      fail(`${label}.coverageStatus is invalid: ${house.coverageStatus}`);
    }

    validateNearestContainers(house, index, containersById);
  }

  return houses;
}

function validateCoverageMetadata(coverage, place) {
  if (coverage.schemaVersion !== EXPECTED_COVERAGE_SCHEMA_VERSION) {
    fail(`${place.id} house-coverage.json schemaVersion must be ${EXPECTED_COVERAGE_SCHEMA_VERSION}. Received: ${coverage.schemaVersion}`);
  }
  if (coverage.placeName !== place.name) {
    fail(`${place.id} house-coverage.json placeName must be "${place.name}". Received: ${coverage.placeName}`);
  }
}

function validateAddressIndex(addressIndex, coverage, place) {
  if (!Array.isArray(addressIndex)) {
    fail(`${place.id} address-index.json must contain an array.`);
  }

  const houses = Array.isArray(coverage.houses) ? coverage.houses : [];
  if (addressIndex.length !== houses.length) {
    fail(`${place.id} address-index.json length (${addressIndex.length}) must equal houses.length (${houses.length}).`);
  }

  const allowedKeys = ['address', 'city', 'id', 'lat', 'lon', 'placeId', 'postcode'];
  const indexById = new Map(addressIndex.map((entry) => [entry.id, entry]));

  for (const [index, house] of houses.entries()) {
    const entry = indexById.get(house.id);
    if (!entry) {
      fail(`${place.id} address-index.json is missing house id ${house.id}.`);
    }

    const keys = Object.keys(entry).sort();
    if (keys.join(',') !== allowedKeys.join(',')) {
      fail(`${place.id} address-index entry for ${house.id} must only contain: ${allowedKeys.join(', ')}.`);
    }

    if (entry.placeId !== place.id) {
      fail(`${place.id} address-index entry ${house.id}.placeId must be "${place.id}".`);
    }
    if (entry.address !== house.address) {
      fail(`${place.id} address-index entry ${house.id}.address must match coverage house at index ${index}.`);
    }
    if ((entry.postcode || '') !== (house.postcode || '')) {
      fail(`${place.id} address-index entry ${house.id}.postcode must match coverage.`);
    }
    if ((entry.city || '') !== (house.city || place.name)) {
      fail(`${place.id} address-index entry ${house.id}.city must match coverage.`);
    }
    if (entry.lat !== house.lat || entry.lon !== house.lon) {
      fail(`${place.id} address-index entry ${house.id} coordinates must match coverage.`);
    }
  }
}

export async function validateData() {
  await generateAddressIndexes({ verbose: false });

  const places = await readPlacesManifest();
  validatePlacesManifest(places);

  let totalContainers = 0;
  let totalHouses = 0;

  for (const place of places) {
    const containers = await readJson(resolvePlaceDataPath(place, 'containers'), `${place.id} container-locations.json`);
    const containersById = validateContainers(containers, place);

    totalContainers += containers.length;

    if (place.paths.coverage && place.paths.addressIndex) {
      const coverage = await readJson(resolvePlaceDataPath(place, 'coverage'), `${place.id} house-coverage.json`);
      const addressIndex = await readJson(resolvePlaceDataPath(place, 'addressIndex'), `${place.id} address-index.json`);

      validateCoverageMetadata(coverage, place);
      const houses = validateHouses(coverage, containersById, place);
      validateAnalysisScope(coverage, houses, place);
      validateSummary(coverage, houses, containersById);
      validateAddressIndex(addressIndex, coverage, place);

      totalHouses += houses.length;
    }
  }

  console.log(`Validated ${places.length} place(s), ${totalContainers} containers, and ${totalHouses} covered addresses.`);
}
