#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

function sorted(values) { return [...values].sort((left, right) => left.localeCompare(right, 'nl', { numeric: true })); }

const plan = readJson('capacity-plan.json');
const assignments = readJson('household-assignment.json');
const screening = readJson('location-screening.json');
const evaluation = readJson('private-access-leave-one-out.json');
const aerial = readJson('selected-aerial-bgt.json');
const geojson = readJson('locations.geojson');
const artifact = readJson('artifact.json');
const sourceContainers = JSON.parse(readFileSync(resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json'), 'utf8'));
const sourceCoverage = JSON.parse(readFileSync(resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json'), 'utf8'));
const sourceById = new Map(sourceContainers.map((container) => [container.id, container]));

assert(plan.schemaVersion === 2 && assignments.schemaVersion === 2, 'Expected capacity-report schema version 2.');
assert(plan.decision.existingPhysicalContainersRetained === 11, 'Exactly 11 existing physical containers must remain.');
assert(plan.decision.existingPublicContainers === 10, 'Expected ten public existing locations including WH24.');
assert(plan.decision.existingPrivateContainers === 1, 'Only WH23 should remain private.');
assert(plan.decision.newPublicContainers === 26, 'Decision scenario should use 26 new public containers.');
assert(plan.decision.publicContainers === 36 && plan.decision.totalPhysicalContainers === 37, 'Decision-scenario location counts differ.');
assert(plan.decision.softTargetContainerCount.requiredNewPublicContainers === 24, 'Soft target arithmetic count differs.');
assert(plan.decision.hardMaximum75ArithmeticSensitivity.requiredNewPublicContainers === 25, 'Hard-75 arithmetic count differs.');
assert(plan.decision.hardMaximum75ArithmeticSensitivity.scope.includes('Arithmetic minimum only'), 'Hard-75 count is not scoped as arithmetic-only.');
assert(plan.decision.publicBagResidentialAddressProxies === 2576 && plan.decision.privateAllowlistedAddressProxies === 3, 'Public/private demand counts differ.');

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
  const expectedAccessScope = source.id === 'WH24' ? 'public' : (source.access?.scope ?? 'public');
  assert(location.accessScope === expectedAccessScope, `${source.id} access scope differs from the decision scenario.`);
}
assert(locationById.get('WH23').accessScope === 'private', 'WH23 must remain private.');
assert(locationById.get('WH24').accessScope === 'public', 'WH24 must be public in the decision scenario.');
assert(!locationById.has('M154'), 'M154 should be the removed addition candidate.');
assert(locationById.has('M157'), 'M157 should be retained at Dergmeerweg.');
for (const id of ['M027', 'M044', 'M055', 'M056', 'M082', 'M094']) assert(locationById.has(id), `${id} is missing from the selected variant.`);
assert(!locationById.has('WH02') && !locationById.has('WH30'), 'Superseded WH02 or WH30 remains in the selected variant.');

const loads = Object.fromEntries(assignments.locations.map(({ id }) => [id, 0]));
for (const house of assignments.houses) {
  const location = locationById.get(house.assignedContainerId);
  assert(location, `${house.houseId} points to an unknown location.`);
  assert(house.assignedLocationAccessScope === location.accessScope, `${house.houseId} has a stale access label.`);
  assert(house.coverageStatus === band(house.walkingDistanceM), `${house.houseId} has an inconsistent distance band.`);
  loads[house.assignedContainerId] += 1;
}
for (const location of assignments.locations) {
  assert(loads[location.id] === location.assignedHouseholds, `${location.id} load differs from household rows.`);
  if (location.accessScope === 'public') assert(loads[location.id] <= 90, `${location.id} exceeds 90.`);
  if (location.kind === 'new') assert(loads[location.id] >= 60, `${location.id} is below 60.`);
}

const expectedPrivateAddresses = {
  WH23: ['Pastoor Willemsestraat 9', 'Pastoor Willemsestraat 131', 'Pastoor Willemsestraat 224']
};
for (const [id, addresses] of Object.entries(expectedPrivateAddresses)) {
  const assigned = assignments.houses.filter(({ assignedContainerId }) => assignedContainerId === id).map(({ address }) => address);
  assert(JSON.stringify(sorted(assigned)) === JSON.stringify(sorted(addresses)), `${id} private allowlist changed.`);
  assert(sourceById.get(id).access.scope === 'private', `${id} is no longer private in source data.`);
}
assert(assignments.houses.filter(({ assignedLocationAccessScope }) => assignedLocationAccessScope === 'private').length === 3, 'Unexpected private assignment count.');

const counts = { within_100: 0, between_100_125: 0, between_125_150: 0, between_150_275: 0, over_275: 0, unreachable: 0 };
let total = 0;
for (const house of assignments.houses) {
  counts[house.coverageStatus] += 1;
  total += house.walkingDistanceM;
}
assert(JSON.stringify(counts) === JSON.stringify(assignments.scenario.distanceBands), 'Scenario distance-band totals differ.');
assert(round(total) === plan.recommendedScenario.totalDistanceIncludingPrivate.totalWalkingDistanceM, 'Total distance differs.');
assert(plan.recommendedScenario.capacityBalancedDistance.householdCount === 2576, 'Public household count differs.');
assert(plan.recommendedScenario.capacityBalancedDistance.distanceBands.over_275 === 88, 'Expected 88 public addresses over 275 m.');
assert(plan.recommendedScenario.capacityBalancedDistance.totalWalkingDistanceM === 345441.9, 'Recommended objective changed.');
assert(plan.comparison.capacityBalanced.totalWalkingDistanceReductionPercent === 24.98, 'Capacity-balanced comparison changed.');
assert(plan.comparison.nearestSiteAccessSensitivity.totalWalkingDistanceReductionPercent === 22.02, 'Nearest-site comparison changed.');
assert(plan.decisionBaseline.capacityBalancedDistance.totalWalkingDistanceM === 364802.2, 'WH24-public baseline changed.');
assert(plan.locationChangeFindings.over275Reduction === 69, 'Location-change over-275 improvement changed.');
assert(plan.locationChangeFindings.samePhysicalCountSensitivity.extraContainerBenefit.over275Reduction === 4, 'M094-retention sensitivity changed.');
assert(plan.locationChangeFindings.focusAreas.deFuik.recommended.distanceBands.over_275 === 2, 'De Fuik result changed.');
assert(plan.locationChangeFindings.focusAreas.dorpsFabriekEiland.recommended.distanceBands.over_275 === 20, 'Dorpsstraat/Fabrieksstraat result changed.');
assert(plan.locationChangeFindings.focusAreas.eastNeighbourhood.recommended.distanceBands.over_275 === 0, 'East-neighbourhood result changed.');

assert(evaluation.results.length === 26 && evaluation.results[0].removed === 'M154', 'Complete 26-candidate selection differs.');
assert(evaluation.results[1].removed === 'M157', 'Expected M157 as selection runner-up.');
assert(round(evaluation.results[1].total - evaluation.results[0].total, 1) === 1207.6, 'Selection runner-up distance differs.');

assert(screening.locations.length === 37, 'Screening must contain the 37 selected physical locations.');
assert(screening.locations.every((location) => !Object.hasOwn(location, 'assignedHouseholds')), 'Screening must not contain model-output loads.');
assert(JSON.stringify(sorted(screening.locations.map(({ id }) => id))) === JSON.stringify(sorted(assignments.locations.map(({ id }) => id))), 'Screening and assignment location IDs differ.');
assert(geojson.features.length === assignments.locations.length, 'GeoJSON location count differs.');
const tsvLines = readFileSync(resolve(reportDirectory, 'locations.tsv'), 'utf8').trimEnd().split('\n');
assert(tsvLines.length === assignments.locations.length + 1, 'TSV location count differs.');

const selectedNewIds = assignments.locations.filter(({ kind }) => kind === 'new').map(({ id }) => id);
const currentAerialSites = aerial.sites.filter(({ id }) => selectedNewIds.includes(id));
assert(currentAerialSites.length === 23, 'Expected 23 retained orthophoto records.');
assert(!currentAerialSites.some(({ id }) => ['WH02', 'WH30'].includes(id)), 'Superseded site remains in the current orthophoto subset.');
assert(JSON.stringify(sorted(selectedNewIds.filter((id) => !currentAerialSites.some((site) => site.id === id)))) === JSON.stringify(['M055', 'M056', 'M082']), 'Unexpected current sites lack orthophotos.');
for (const site of currentAerialSites) {
  assert(existsSync(resolve(reportDirectory, site.aerialImage)), `Orthophoto ${site.aerialImage} is missing.`);
}

for (const [name, input] of Object.entries(plan.inputs)) {
  const path = resolve(projectRoot, input.path);
  assert(sha256(path) === input.sha256, `${name} SHA-256 differs.`);
}
assert(Object.hasOwn(plan.inputs, 'wh24Column'), 'WH24-public distance input is not recorded.');

const svg = readFileSync(resolve(reportDirectory, 'overview-map.svg'), 'utf8');
const mapHtml = readFileSync(resolve(reportDirectory, 'overview-map.html'), 'utf8');
const reportHtml = readFileSync(resolve(reportDirectory, 'warmenhuizen-capaciteitsplan.html'), 'utf8');
const contactSheet = readFileSync(resolve(reportDirectory, 'orthophoto-contact-sheet.html'), 'utf8');
for (const color of ['#15803d', '#eab308', '#f97316', '#dc2626', '#7f1d1d', '#64748b']) {
  assert(svg.includes(color) && mapHtml.includes(color), `Map color ${color} is missing.`);
}
assert(svg.includes('WH23') && svg.includes('WH24'), 'Private locations are missing from the map.');
assert(svg.includes('26 nieuwe zoekzones'), 'Map subtitle does not state 26 new zones.');
assert(svg.includes('WH24') && svg.includes('24 toegewezen adressen'), 'WH24 public load is missing from map tooltips.');
assert(svg.includes('M055') && svg.includes('M056') && svg.includes('M082') && svg.includes('M094'), 'Selected change locations are missing from the map.');
assert(svg.includes('title title-compact'), 'Long map title is not using the non-overlapping compact style.');
assert(mapHtml.includes('min-width: 1050px'), 'Mobile map does not retain readable text sizing.');
assert(reportHtml.includes('.chart{min-width:680px}') && reportHtml.includes('min-width:1050px'), 'Mobile report charts or map do not retain readable text sizing.');
assert(reportHtml.includes('blauwe ruit') && reportHtml.includes('magenta pluscirkel'), 'Report marker legend differs from the rendered map.');
assert(reportHtml.includes('WH24 openbaar') && mapHtml.includes('WH24 openbaar'), 'WH24-public wording is missing from HTML output.');
assert((contactSheet.match(/<figure>/gu) ?? []).length === 23, 'Contact sheet does not contain 23 retained orthophotos.');
assert(contactSheet.includes('M055, M056 en M082'), 'Contact sheet does not disclose the three missing current orthophotos.');
assert(contactSheet.includes('CSS-doelkruis') && contactSheet.includes('JPEG-bronuitsneden zijn ongewijzigd'), 'Contact-sheet overlay disclosure is missing.');
assert(artifact.manifest.description.includes('WH24 openbaar') && artifact.manifest.description.includes('WH23 privé'), 'Artifact description does not disclose access changes.');

console.log(JSON.stringify({
  status: 'ok',
  households: assignments.houses.length,
  locations: assignments.locations.length,
  existing: 11,
  publicExisting: 10,
  privateExisting: 1,
  newLocations: 26,
  loads: {
    minimumNew: Math.min(...assignments.locations.filter(({ kind }) => kind === 'new').map(({ assignedHouseholds }) => assignedHouseholds)),
    maximumPublic: Math.max(...assignments.locations.filter(({ accessScope }) => accessScope === 'public').map(({ assignedHouseholds }) => assignedHouseholds))
  },
  capacityBalancedPublic: plan.recommendedScenario.capacityBalancedDistance,
  nearestSitePublic: plan.recommendedScenario.nearestSiteAccessSensitivity,
  distanceBandsIncludingPrivate: counts,
  totalWalkingDistanceIncludingPrivateM: round(total)
}, null, 2));
