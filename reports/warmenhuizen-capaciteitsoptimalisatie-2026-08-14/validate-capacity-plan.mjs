#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(reportDirectory, '../..');
const readJson = (name) => JSON.parse(readFileSync(resolve(reportDirectory, name), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const round = (value, digits = 2) => Number(value.toFixed(digits));

function band(distance) {
  if (!Number.isFinite(distance)) return 'unreachable';
  if (distance <= 100) return 'within_100';
  if (distance <= 125) return 'between_100_125';
  if (distance <= 150) return 'between_125_150';
  if (distance <= 275) return 'between_150_275';
  return 'over_275';
}

const plan = readJson('capacity-plan.json');
const assignments = readJson('household-assignment.json');
const screening = readJson('location-screening.json');
const geojson = readJson('locations.geojson');
const sourceContainers = JSON.parse(readFileSync(resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json'), 'utf8'));
const sourceCoverage = JSON.parse(readFileSync(resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json'), 'utf8'));
const sourceById = new Map(sourceContainers.map((container) => [container.id, container]));

assert(plan.decision.existingPhysicalContainersRetained === 11, 'Exactly 11 existing physical containers must remain.');
assert(plan.decision.existingPublicContainers === 10, 'WH24 change should produce 10 public existing locations.');
assert(plan.decision.existingPrivateContainers === 1, 'Only WH23 should remain private.');
assert(plan.decision.newPublicContainers === 25, 'Target-75 scenario should use 25 new public containers.');
assert(plan.decision.totalPhysicalContainers === 36, 'Expected 36 total physical containers.');
assert(plan.decision.target75ContainerCount.requiredNewPublicContainers === 25, 'Target-75 container count differs.');

assert(assignments.houses.length === sourceCoverage.houses.length, 'Assignment count differs from BAG coverage.');
assert(new Set(assignments.houses.map(({ houseId }) => houseId)).size === sourceCoverage.houses.length, 'Assignments are not unique by house ID.');
sourceCoverage.houses.forEach((house, index) => {
  assert(assignments.houses[index].houseId === house.id, `House order mismatch at ${index}.`);
});

const locationById = new Map(assignments.locations.map((location) => [location.id, location]));
const expectedExisting = sourceContainers.filter((container) => container.streams.some((stream) => stream.type === 'rest' && stream.status === 'existing'));
assert(expectedExisting.length === 11, 'Source no longer contains exactly 11 existing rest locations.');
for (const source of expectedExisting) {
  const location = locationById.get(source.id);
  assert(location, `Existing ${source.id} is missing.`);
  assert(location.lat === source.lat && location.lon === source.lon, `${source.id} coordinate moved.`);
}
assert(locationById.get('WH24').accessScope === 'public', 'WH24 must be public.');
assert(locationById.get('WH23').accessScope === 'private', 'WH23 must remain private.');
assert(!locationById.has('M154'), 'M154 should be the removed WH24 replacement candidate.');
assert(locationById.has('M157'), 'M157 should be retained at Dergmeerweg.');

const loads = Object.fromEntries(assignments.locations.map(({ id }) => [id, 0]));
for (const house of assignments.houses) {
  assert(locationById.has(house.assignedContainerId), `${house.houseId} points to an unknown location.`);
  assert(house.coverageStatus === band(house.walkingDistanceM), `${house.houseId} has an inconsistent distance band.`);
  loads[house.assignedContainerId] += 1;
}
for (const location of assignments.locations) {
  assert(loads[location.id] === location.assignedHouseholds, `${location.id} load differs from household rows.`);
  if (location.accessScope === 'public') assert(loads[location.id] <= 90, `${location.id} exceeds 90.`);
  if (location.kind === 'new') assert(loads[location.id] >= 60, `${location.id} is below 60.`);
}
assert(loads.WH23 === 3, 'WH23 must have exactly three private addresses.');
const wh23Addresses = assignments.houses.filter(({ assignedContainerId }) => assignedContainerId === 'WH23').map(({ address }) => address).sort();
assert(wh23Addresses.join('|') === ['Pastoor Willemsestraat 131', 'Pastoor Willemsestraat 224', 'Pastoor Willemsestraat 9'].sort().join('|'), 'WH23 allowlist changed.');
assert(assignments.houses.every(({ assignedContainerId }) => assignedContainerId !== 'WH24' || locationById.get('WH24').accessScope === 'public'), 'WH24 assignment is not public.');

const counts = { within_100: 0, between_100_125: 0, between_125_150: 0, between_150_275: 0, over_275: 0, unreachable: 0 };
let total = 0;
for (const house of assignments.houses) {
  counts[house.coverageStatus] += 1;
  total += house.walkingDistanceM;
}
assert(JSON.stringify(counts) === JSON.stringify(assignments.scenario.distanceBands), 'Scenario distance-band totals differ.');
assert(round(total) === plan.recommendedScenario.totalDistanceIncludingPrivate.totalWalkingDistanceM, 'Total distance differs.');
assert(plan.recommendedScenario.distance.householdCount === 2576, 'Public household count differs.');
assert(plan.recommendedScenario.distance.distanceBands.over_275 === 157, 'Expected 157 public addresses over 275 m.');
assert(plan.comparison.totalWalkingDistanceReductionPercent === 20.77, 'Municipal comparison changed.');

assert(screening.locations.length === 36, 'Screening must contain 35 public locations plus WH23.');
assert(geojson.features.length === assignments.locations.length, 'GeoJSON location count differs.');
const tsvLines = readFileSync(resolve(reportDirectory, 'locations.tsv'), 'utf8').trimEnd().split('\n');
assert(tsvLines.length === assignments.locations.length + 1, 'TSV location count differs.');

for (const [name, input] of Object.entries(plan.inputs)) {
  const path = resolve(projectRoot, input.path);
  assert(sha256(path) === input.sha256, `${name} SHA-256 differs.`);
}

const svg = readFileSync(resolve(reportDirectory, 'overview-map.svg'), 'utf8');
const html = readFileSync(resolve(reportDirectory, 'overview-map.html'), 'utf8');
for (const color of ['#15803d', '#eab308', '#f97316', '#dc2626', '#7f1d1d', '#64748b']) {
  assert(svg.includes(color) && html.includes(color), `Map color ${color} is missing.`);
}
assert(svg.includes('WH24') && html.includes('WH24'), 'WH24 is missing from maps.');
assert(svg.includes('25 nieuwe zoekzones'), 'Map subtitle does not state 25 new zones.');

console.log(JSON.stringify({
  status: 'ok',
  households: assignments.houses.length,
  locations: assignments.locations.length,
  existing: 11,
  publicExisting: 10,
  privateExisting: 1,
  newLocations: 25,
  loads: { minimumNew: Math.min(...assignments.locations.filter(({ kind }) => kind === 'new').map(({ assignedHouseholds }) => assignedHouseholds)), maximumPublic: Math.max(...assignments.locations.filter(({ accessScope }) => accessScope === 'public').map(({ assignedHouseholds }) => assignedHouseholds)) },
  distanceBands: counts,
  totalWalkingDistanceM: round(total)
}, null, 2));
