#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAddressAllowedByRules } from "../../src/shared/address.js";

const REPORT_DIR = new URL("./", import.meta.url);
const HOUSEHOLD_FILE = "fixed-existing-household-coverage-225.json";
const OPTIMIZATION_FILE = "fixed-existing-route-optimization.json";
const GEOJSON_FILE = "fixed-existing-recommended-search-zones.geojson";

function readJson(file) {
  return JSON.parse(readFileSync(new URL(file, REPORT_DIR), "utf8"));
}

function isStatusCompatible(distance, status) {
  const tolerance = 0.01;
  const ranges = {
    within_100: [-Infinity, 100 + tolerance],
    between_100_125: [100 - tolerance, 125 + tolerance],
    between_125_150: [125 - tolerance, 150 + tolerance],
    between_150_275: [150 - tolerance, 275 + tolerance],
    over_275: [275 - tolerance, Infinity],
  };
  const range = ranges[status];
  return Boolean(range && distance >= range[0] && distance <= range[1]);
}

function assertCapacity(entries) {
  const expectedContainers = new Map([[100, 49], [75, 51]]);
  assert.equal(entries.length, expectedContainers.size, "Unexpected number of capacity scenarios");
  for (const entry of entries) {
    assert.equal(
      entry.testedContainerCount,
      expectedContainers.get(entry.capacityPerContainerAddressEquivalents),
      `Unexpected container count for capacity ${entry.capacityPerContainerAddressEquivalents}`,
    );
    assert.equal(entry.feasible, true, "Capacity scenario must be feasible");
    assert.equal(entry.exactMinimumProven, true, "Capacity minimum must be proven exact");
  }
}

const householdOutput = readJson(HOUSEHOLD_FILE);
const optimizationOutput = readJson(OPTIMIZATION_FILE);
const geojson = readJson(GEOJSON_FILE);
const scenario = householdOutput.scenario;
const optimizationScenario = optimizationOutput.scenarios.find(({ maximumWalkingDistanceTargetM }) => (
  maximumWalkingDistanceTargetM === 225
));

assert.ok(optimizationScenario, "Missing 225 m optimization scenario");
assert.equal(householdOutput.houses.length, 2579, "Expected 2,579 houses");
assert.equal(new Set(householdOutput.houses.map(({ id }) => id)).size, 2579, "House IDs must be unique");

const locationIds = new Set(householdOutput.locations.map(({ id }) => id));
assert.equal(locationIds.size, 49, "Location IDs must be unique");
assert.equal(householdOutput.locations.length, 49, "Expected 49 physical locations");
const existingLocations = householdOutput.locations.filter(({ kind }) => kind === "existing");
const additionalLocations = householdOutput.locations.filter(({ kind }) => kind === "additional-model-site");
assert.equal(existingLocations.length, 11, "Expected 11 fixed existing locations");
assert.equal(additionalLocations.length, 38, "Expected 38 additional search anchors");
assert.equal(existingLocations.filter(({ accessScope }) => accessScope === "public").length, 9);
assert.equal(existingLocations.filter(({ accessScope }) => accessScope === "private").length, 2);
assert.deepEqual(
  existingLocations.filter(({ accessScope }) => accessScope === "private").map(({ id }) => id).sort(),
  ["WH23", "WH24"],
  "WH23 and WH24 must be the only private existing locations",
);

assert.equal(scenario.fixedExistingLocationCount, 11);
assert.equal(scenario.additionalSiteCount, 38);
assert.equal(scenario.totalPhysicalLocationCount, 49);
assert.equal(scenario.fixedPublicLocationCount, 9);
assert.equal(scenario.fixedPrivateLocationCount, 2);
assert.equal(optimizationScenario.fixedExistingLocationCount, 11);
assert.equal(optimizationScenario.additionalSiteCount, 38);
assert.equal(optimizationScenario.totalPhysicalLocationCount, 49);

const calculatedBands = {
  within_100: 0,
  between_100_125: 0,
  between_125_150: 0,
  between_150_275: 0,
  over_275: 0,
  unreachable: 0,
};
let maximumDistance = 0;
for (const house of householdOutput.houses) {
  assert.ok(locationIds.has(house.nearestLocationId), `Unknown location for ${house.id}`);
  assert.ok(Number.isFinite(house.walkingDistanceM), `Invalid walking distance for ${house.id}`);
  assert.ok(house.walkingDistanceM <= 225, `Walking distance exceeds 225 m for ${house.id}`);
  assert.ok(
    isStatusCompatible(house.walkingDistanceM, house.coverageStatus),
    `Incorrect distance status for ${house.id}`,
  );
  calculatedBands[house.coverageStatus] += 1;
  maximumDistance = Math.max(maximumDistance, house.walkingDistanceM);
}

assert.deepEqual(calculatedBands, scenario.distanceBands, "House statuses do not match scenario bands");
assert.deepEqual(calculatedBands, optimizationScenario.distanceBands, "Optimization bands differ");
assert.equal(Object.values(calculatedBands).reduce((sum, count) => sum + count, 0), 2579);
assert.ok(
  Math.abs(maximumDistance - scenario.maximumModeledWalkingDistanceM) <= 0.05,
  "Detailed and scenario maximum distances differ after rounding",
);
assert.ok(maximumDistance <= 225);

const privateById = new Map(existingLocations
  .filter(({ accessScope }) => accessScope === "private")
  .map((location) => [location.id, location]));
for (const house of householdOutput.houses.filter(({ nearestLocationId }) => privateById.has(nearestLocationId))) {
  const location = privateById.get(house.nearestLocationId);
  assert.ok(
    isAddressAllowedByRules(house.address, location.allowedAddresses),
    `${house.address} is not allowed to use ${location.id}`,
  );
}

assert.equal(geojson.type, "FeatureCollection");
assert.equal(geojson.features.length, 49, "GeoJSON must contain 49 location features");
const geojsonIds = new Set(geojson.features.map((feature) => feature.properties?.id));
assert.equal(geojsonIds.size, 49, "GeoJSON location IDs must be unique");
assert.deepEqual([...geojsonIds].sort(), [...locationIds].sort(), "GeoJSON and household location IDs differ");
for (const feature of geojson.features) {
  if (feature.properties.kind === "existing") {
    assert.equal(feature.properties.oldSite, null, `${feature.id} must not inherit a prior free-model site`);
    assert.equal(feature.properties.aerialRating, null, `${feature.id} must not inherit an aerial rating`);
    assert.equal(feature.properties.ownershipScreen, null, `${feature.id} must not inherit an ownership screen`);
    assert.equal(feature.properties.localShiftInstruction, null, `${feature.id} must not inherit a shift instruction`);
  } else {
    assert.ok(Number.isInteger(feature.properties.oldSite), `${feature.id} needs a prior screen site`);
    assert.ok(["groen", "oranje", "rood"].includes(feature.properties.aerialRating));
  }
}
assert.equal(
  geojson.features.reduce((sum, feature) => (
    sum + feature.properties.nearestHouseholdsUncapacitated
  ), 0),
  2579,
  "GeoJSON nearest-household counts must sum to 2,579",
);
for (const capacity of [100, 75]) {
  const assignmentField = `assignedHouseholdsAt${capacity}AddressCapacity`;
  const containerField = `containersAt${capacity}AddressCapacity`;
  assert.equal(
    geojson.features.reduce((sum, feature) => sum + feature.properties[assignmentField], 0),
    2579,
    `GeoJSON capacity-${capacity} assignments must sum to 2,579`,
  );
  assert.equal(
    geojson.features.reduce((sum, feature) => sum + feature.properties[containerField], 0),
    capacity === 100 ? 49 : 51,
    `GeoJSON capacity-${capacity} container count is inconsistent`,
  );
}

assertCapacity(householdOutput.capacitySensitivity);
assertCapacity(optimizationOutput.capacitySensitivity225M);

console.log(JSON.stringify({
  valid: true,
  houses: householdOutput.houses.length,
  locations: {
    existing: existingLocations.length,
    additional: additionalLocations.length,
    total: householdOutput.locations.length,
    publicExisting: 9,
    privateExisting: 2,
  },
  maximumWalkingDistanceM: maximumDistance,
  distanceBands: calculatedBands,
  geojsonFeatures: geojson.features.length,
  exactCapacityContainerCounts: { 100: 49, 75: 51 },
}, null, 2));
