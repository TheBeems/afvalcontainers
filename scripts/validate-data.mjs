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

function validateContainers(containers) {
  if (!Array.isArray(containers) || containers.length === 0) {
    fail('container-locations.json must contain a non-empty array.');
  }

  const seenIds = new Set();
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
  }

  return seenIds;
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

function validateNearestContainers(house, index, containerIds) {
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
    if (!containerIds.has(container.id)) {
      fail(`${label}.id references unknown container id: ${container.id}`);
    }
    if (seenIds.has(container.id)) {
      fail(`${label}.id is duplicated in the same ranking: ${container.id}`);
    }
    seenIds.add(container.id);

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

  if (house.nearestContainerId && !containerIds.has(house.nearestContainerId)) {
    fail(`house at index ${index}.nearestContainerId references unknown container id: ${house.nearestContainerId}`);
  }
  if (house.nearestContainerId && house.nearestContainers[0]?.id !== house.nearestContainerId) {
    fail(`house at index ${index}.nearestContainers[0].id must match nearestContainerId.`);
  }
}

function validateHouses(coverage, containerIds) {
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

    validateNearestContainers(house, index, containerIds);
  }

  return houses;
}

async function main() {
  const containers = await readJson(containerPath, 'container-locations.json');
  const coverage = await readJson(coveragePath, 'house-coverage.json');
  if (coverage.schemaVersion !== 3) {
    fail(`house-coverage.json schemaVersion must be 3. Received: ${coverage.schemaVersion}`);
  }
  const containerIds = validateContainers(containers);
  const houses = validateHouses(coverage, containerIds);
  validateSummary(coverage, houses, containerIds);

  console.log(`Validated ${containers.length} containers and ${houses.length} covered addresses.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
