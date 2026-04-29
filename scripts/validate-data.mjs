#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const containerPath = resolve(projectRoot, 'data/container-locations.json');
const coveragePath = resolve(projectRoot, 'data/house-coverage.json');

const VALID_COVERAGE_STATUSES = new Set([
  'within_100',
  'between_100_125',
  'between_125_150',
  'between_150_275',
  'over_275',
  'unreachable'
]);

const VALID_CONTAINER_TYPES = new Set(['rest', 'semi-rest', 'gfe']);
const DEFAULT_CONTAINER_STATUS = 'new';
const VALID_CONTAINER_STATUSES = new Set(['new', 'existing']);
const PRIVATE_ACCESS_SCOPE = 'private';
const VALID_CONTAINER_CATEGORIES = new Set([
  'new:rest',
  'existing:rest',
  'new:semi-rest',
  'new:gfe'
]);

function fail(message) {
  throw new Error(message);
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
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

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function getAddressBaseHouseNumber(address, street) {
  const normalizedStreet = normalizeWhitespace(street);
  const normalizedAddress = normalizeWhitespace(address);
  const prefix = `${normalizedStreet} `;

  if (!normalizedStreet || !normalizedAddress.startsWith(prefix)) {
    return null;
  }

  const houseNumberMatch = normalizedAddress.slice(prefix.length).match(/^(\d+)/);
  if (!houseNumberMatch) {
    return null;
  }

  return Number.parseInt(houseNumberMatch[1], 10);
}

function isAddressInAllowedRange(address, range) {
  if (!range) {
    return false;
  }

  const houseNumber = getAddressBaseHouseNumber(address, range.street);
  return Number.isInteger(houseNumber)
    && houseNumber >= range.minHouseNumber
    && houseNumber <= range.maxHouseNumber;
}

function getContainerStatus(container, label) {
  if (!Object.prototype.hasOwnProperty.call(container, 'status')) {
    return DEFAULT_CONTAINER_STATUS;
  }

  assertString(container.status, `${label}.status`);
  if (!VALID_CONTAINER_STATUSES.has(container.status)) {
    fail(`${label}.status must be one of: ${Array.from(VALID_CONTAINER_STATUSES).join(', ')}. Received: ${container.status}`);
  }

  return container.status;
}

function validateContainerClassification(container, label) {
  assertString(container.type, `${label}.type`);
  if (!VALID_CONTAINER_TYPES.has(container.type)) {
    fail(`${label}.type must be one of: ${Array.from(VALID_CONTAINER_TYPES).join(', ')}. Received: ${container.type}`);
  }

  const status = getContainerStatus(container, label);
  const category = `${status}:${container.type}`;
  if (!VALID_CONTAINER_CATEGORIES.has(category)) {
    fail(`${label} has unsupported status/type combination: ${category}`);
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

  const range = access.allowedAddressRange;
  if (!range || typeof range !== 'object' || Array.isArray(range)) {
    fail(`${label}.access.allowedAddressRange must be an object.`);
  }

  assertString(range.street, `${label}.access.allowedAddressRange.street`);
  assertInteger(range.minHouseNumber, `${label}.access.allowedAddressRange.minHouseNumber`);
  assertInteger(range.maxHouseNumber, `${label}.access.allowedAddressRange.maxHouseNumber`);

  if (range.minHouseNumber > range.maxHouseNumber) {
    fail(`${label}.access.allowedAddressRange.minHouseNumber must be <= maxHouseNumber.`);
  }
}

function validateContainers(containers) {
  if (!Array.isArray(containers) || containers.length === 0) {
    fail('container-locations.json must contain a non-empty array.');
  }

  const seenIds = new Set();
  const containersById = new Map();
  for (const [index, container] of containers.entries()) {
    const label = `container at index ${index}`;
    assertString(container.id, `${label}.id`);
    if (!/^WH\d{2}$/.test(container.id)) {
      fail(`${label}.id must match WHNN. Received: ${container.id}`);
    }
    if (seenIds.has(container.id)) {
      fail(`Duplicate container id: ${container.id}`);
    }
    seenIds.add(container.id);

    assertString(container.address, `${label}.address`);
    assertNumber(container.lat, `${label}.lat`);
    assertNumber(container.lon, `${label}.lon`);
    assertString(container.accuracy, `${label}.accuracy`);
    validateContainerClassification(container, label);
    validateContainerAccess(container, label);
    containersById.set(container.id, container);
  }

  return containersById;
}

function validateSummary(coverage, houses, containers) {
  const summary = coverage.summary || {};
  if (summary.totalAddresses !== houses.length) {
    fail(`summary.totalAddresses (${summary.totalAddresses}) must equal houses.length (${houses.length}).`);
  }
  if (summary.containerCount !== containers.size) {
    fail(`summary.containerCount (${summary.containerCount}) must equal container count (${containers.size}).`);
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
    if (seenIds.has(container.id)) {
      fail(`${label}.id is duplicated in the same ranking: ${container.id}`);
    }
    seenIds.add(container.id);

    if (sourceContainer.access?.scope === PRIVATE_ACCESS_SCOPE
      && !isAddressInAllowedRange(house.address, sourceContainer.access.allowedAddressRange)) {
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
  }

  if (house.nearestContainerId && !containersById.has(house.nearestContainerId)) {
    fail(`house at index ${index}.nearestContainerId references unknown container id: ${house.nearestContainerId}`);
  }
  if (house.nearestContainerId && house.nearestContainers[0]?.id !== house.nearestContainerId) {
    fail(`house at index ${index}.nearestContainers[0].id must match nearestContainerId.`);
  }
}

function validateHouses(coverage, containersById) {
  const houses = coverage.houses;
  if (!Array.isArray(houses)) {
    fail('house-coverage.json must contain a houses array.');
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

async function main() {
  const containers = await readJson(containerPath, 'container-locations.json');
  const coverage = await readJson(coveragePath, 'house-coverage.json');
  if (coverage.schemaVersion !== 3) {
    fail(`house-coverage.json schemaVersion must be 3. Received: ${coverage.schemaVersion}`);
  }
  const containersById = validateContainers(containers);
  const houses = validateHouses(coverage, containersById);
  validateSummary(coverage, houses, containersById);

  console.log(`Validated ${containers.length} containers and ${houses.length} covered addresses.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
