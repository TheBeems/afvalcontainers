#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAddressAllowedByRules } from "../../src/shared/address.js";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const output = JSON.parse(readFileSync(
  new URL("adjusted-fixed-existing-household-coverage-225.json", REPORT_DIR),
  "utf8",
));
const summary = JSON.parse(readFileSync(
  new URL("adjusted-fixed-existing-route-optimization.json", REPORT_DIR),
  "utf8",
));
const sourceCoverage = JSON.parse(readFileSync(
  new URL("data/places/warmenhuizen/house-coverage.json", REPO_DIR),
  "utf8",
));

const EXPECTED_FIXED_IDS = [
  "WH03", "WH05", "WH06", "WH08", "WH14", "WH23",
  "WH24", "WH26", "WH27", "WH33", "WH34",
];
const REMOVED_IDS = ["model-225-04", "model-225-08", "model-225-24"];
const EXPECTED_BANDS = [
  "within_100",
  "between_100_125",
  "between_125_150",
  "between_150_275",
  "over_275",
  "unreachable",
];
const EARTH_RADIUS_M = 6_371_008.8;

function haversineMeters(left, right) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitude1 = toRadians(left[0]);
  const latitude2 = toRadians(right[0]);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = toRadians(right[1] - left[1]);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(value));
}

function expectedStatus(distance) {
  if (!Number.isFinite(distance)) return "unreachable";
  if (distance <= 100) return "within_100";
  if (distance <= 125) return "between_100_125";
  if (distance <= 150) return "between_125_150";
  if (distance <= 275) return "between_150_275";
  return "over_275";
}

assert.equal(output.houses.length, 2579);
assert.equal(new Set(output.houses.map(({ id }) => id)).size, 2579);
assert.deepEqual(
  [...output.houses.map(({ id }) => id)].sort(),
  [...sourceCoverage.houses.map(({ id }) => id)].sort(),
  "Adjusted output must contain exactly the source household population",
);

const fixed = output.locations.filter(({ kind }) => kind === "existing");
const additional = output.locations.filter(({ kind }) => kind === "additional-model-site");
assert.deepEqual(fixed.map(({ id }) => id).sort(), [...EXPECTED_FIXED_IDS].sort());
assert.equal(fixed.length, 11);
assert.equal(additional.length, 35);
assert.equal(output.locations.length, 46);
assert.equal(new Set(output.locations.map(({ id }) => id)).size, 46);
assert.deepEqual(
  fixed.filter(({ accessScope }) => accessScope === "private").map(({ id }) => id),
  ["WH23"],
);
assert.equal(fixed.find(({ id }) => id === "WH24").accessScope, "public");
for (const id of REMOVED_IDS) assert.ok(!output.locations.some((location) => location.id === id));

const a13 = additional.find(({ id }) => id === "model-225-13");
const a36 = additional.find(({ id }) => id === "model-225-36");
assert.equal(a13.graphNode, 3282);
assert.match(a13.adjustmentStatus, /replacement/);
assert.equal(a13.buildReadiness, "not-approved");
assert.equal(a36.graphNode, 969);
assert.match(a36.adjustmentStatus, /relocated/);
assert.notEqual(a36.lat, 52.716574);

const locationById = new Map(output.locations.map((location) => [location.id, location]));
const calculatedBands = Object.fromEntries(EXPECTED_BANDS.map((key) => [key, 0]));
let maximumReported = 0;
let maximumGraphCore = 0;
let above225 = 0;
for (const house of output.houses) {
  assert.ok(locationById.has(house.nearestLocationId), `Unknown location for ${house.id}`);
  assert.ok(Number.isFinite(house.graphCoreWalkingDistanceM));
  assert.ok(Number.isFinite(house.doorToRouteSnapLowerBoundM));
  assert.ok(Number.isFinite(house.reportedWalkingDistanceM));
  assert.ok(house.routeGeometry.length > 0, `Missing route geometry for ${house.id}`);
  const location = locationById.get(house.nearestLocationId);
  const routeLength = house.routeGeometry.slice(1).reduce((total, point, index) => (
    total + haversineMeters(house.routeGeometry[index], point)
  ), 0);
  assert.ok(
    Math.abs(routeLength - house.graphCoreWalkingDistanceM) <= 0.03,
    `Route geometry length differs from graph core for ${house.id}`,
  );
  assert.ok(
    Math.abs(haversineMeters(
      [house.lat, house.lon],
      house.routeGeometry[0],
    ) - house.doorToRouteSnapLowerBoundM) <= 0.03,
    `BAG-to-route-snap distance differs for ${house.id}`,
  );
  assert.deepEqual(
    house.routeGeometry.at(-1),
    [location.graphLat, location.graphLon],
    `Route does not end at selected graph node for ${house.id}`,
  );
  assert.ok(
    Math.abs(
      house.reportedWalkingDistanceM
      - house.graphCoreWalkingDistanceM
      - house.doorToRouteSnapLowerBoundM
    ) <= 0.02,
    `Inconsistent access-sensitivity distance for ${house.id}`,
  );
  assert.equal(house.coverageStatus, expectedStatus(house.reportedWalkingDistanceM));
  calculatedBands[house.coverageStatus] += 1;
  maximumReported = Math.max(maximumReported, house.reportedWalkingDistanceM);
  maximumGraphCore = Math.max(maximumGraphCore, house.graphCoreWalkingDistanceM);
  if (house.reportedWalkingDistanceM > 225) above225 += 1;
  if (house.nearestLocationId === "WH23") {
    assert.ok(
      isAddressAllowedByRules(house.address, locationById.get("WH23").allowedAddresses),
      `${house.address} is not allowed to use WH23`,
    );
  }
}

assert.deepEqual(Object.keys(output.scenario.distanceBands), EXPECTED_BANDS);
assert.deepEqual(calculatedBands, output.scenario.distanceBands);
assert.deepEqual(calculatedBands, summary.scenario.distanceBands);
assert.equal(Object.values(calculatedBands).reduce((sum, count) => sum + count, 0), 2579);
assert.equal(above225, output.scenario.householdsAbove225M);
assert.equal(above225, 50);
assert.equal(output.scenario.allHouseholdsWithinTarget, false);
assert.ok(maximumGraphCore <= 225);
assert.ok(maximumReported > 225 && maximumReported <= 275);
assert.equal(output.scenario.fixedPublicLocationCount, 10);
assert.equal(output.scenario.fixedPrivateLocationCount, 1);
assert.equal(output.scenario.additionalSiteCount, 35);
assert.equal(output.scenario.totalPhysicalLocationCount, 46);
assert.equal(output.scenario.topologyBridges.length, 9);
assert.equal(output.adjustments.removed.length, 3);
assert.equal(summary.capacitySensitivity, null);

console.log(JSON.stringify({
  valid: true,
  households: output.houses.length,
  locations: { fixed: fixed.length, additional: additional.length, total: output.locations.length },
  access: { publicFixed: 10, privateFixed: 1, privateId: "WH23" },
  distanceBands: calculatedBands,
  householdsAbove225M: above225,
  maximumGraphCoreWalkingDistanceM: maximumGraphCore,
  maximumReportedAccessSensitivityM: maximumReported,
}, null, 2));
