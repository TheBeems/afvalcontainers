#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(reportDirectory, '../..');
const priorReport = resolve(projectRoot, 'reports/warmenhuizen-containeroptimalisatie-2026-08-13');
const paths = {
  coverage: resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json'),
  containers: resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json'),
  matrix: resolve(priorReport, 'walking-matrix.json'),
  existingCoverage: resolve(priorReport, 'existing-11-household-coverage.json'),
  screening: resolve(reportDirectory, 'location-screening.json'),
  evaluation: resolve(reportDirectory, 'private-access-leave-one-out.json'),
  plan: resolve(reportDirectory, 'capacity-plan.json'),
  assignments: resolve(reportDirectory, 'household-assignment.json'),
  tsv: resolve(reportDirectory, 'locations.tsv'),
  geojson: resolve(reportDirectory, 'locations.geojson')
};

const FIXED_PUBLIC_IDS = ['WH03', 'WH05', 'WH06', 'WH08', 'WH14', 'WH26', 'WH27', 'WH33', 'WH34'];
const FIXED_PRIVATE_IDS = ['WH23', 'WH24'];
const MUNICIPAL_REST_IDS = [
  'WH01', 'WH02', 'WH04', 'WH07', 'WH09', 'WH10', 'WH11', 'WH12', 'WH13',
  'WH15', 'WH16', 'WH17', 'WH18', 'WH19', 'WH20', 'WH21', 'WH22', 'WH25',
  'WH28', 'WH29', 'WH30'
];
const TARGET = 75;
const NEW_MINIMUM = 60;
const PUBLIC_MAXIMUM = 90;
const EPSILONS = [64, 16, 4, 1, 0.25, 0.05, 0.01];

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function round(value, digits = 1) { return Number(value.toFixed(digits)); }
function assert(condition, message) { if (!condition) throw new Error(message); }

function distanceBand(distance) {
  if (!Number.isFinite(distance)) return 'unreachable';
  if (distance <= 100) return 'within_100';
  if (distance <= 125) return 'between_100_125';
  if (distance <= 150) return 'between_125_150';
  if (distance <= 275) return 'between_150_275';
  return 'over_275';
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function summarize(rows) {
  const values = rows.map(({ walkingDistanceM }) => walkingDistanceM).filter(Number.isFinite).sort((a, b) => a - b);
  const counts = { within_100: 0, between_100_125: 0, between_125_150: 0, between_150_275: 0, over_275: 0, unreachable: 0 };
  rows.forEach(({ walkingDistanceM }) => { counts[distanceBand(walkingDistanceM)] += 1; });
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    householdCount: rows.length,
    reachableCount: values.length,
    totalWalkingDistanceM: round(total, 2),
    averageWalkingDistanceM: round(total / values.length, 3),
    p50WalkingDistanceM: round(quantile(values, 0.5), 1),
    p90WalkingDistanceM: round(quantile(values, 0.9), 1),
    p95WalkingDistanceM: round(quantile(values, 0.95), 1),
    maximumWalkingDistanceM: round(values.at(-1), 1),
    distanceBands: counts
  };
}

function buildSites(ids, matrix, screeningById) {
  const candidateById = new Map(matrix.candidates.map((candidate, candidateIndex) => [candidate.id, { ...candidate, candidateIndex }]));
  return ids.map((id) => {
    const candidate = candidateById.get(id);
    assert(candidate, `Candidate ${id} is missing from the walking matrix.`);
    const screened = screeningById.get(id);
    const kind = FIXED_PUBLIC_IDS.includes(id) ? 'existing' : 'new';
    return {
      id,
      kind,
      status: kind === 'existing' ? 'existing' : 'proposed',
      address: screened?.address ?? candidate.address,
      lat: candidate.lat,
      lon: candidate.lon,
      sourceType: screened?.source ?? candidate.sourceType,
      accessScope: 'public',
      screeningRating: screened?.rating ?? 'not-screened-municipal-concept',
      candidateIndex: candidate.candidateIndex
    };
  });
}

function assign({ matrix, publicIndexes, sites }) {
  const slots = sites.flatMap((site, siteIndex) => Array.from({ length: PUBLIC_MAXIMUM }, (_, slotIndex) => ({
    siteIndex,
    reserved: site.kind === 'new' && slotIndex < NEW_MINIMUM
  })));
  const realCount = publicIndexes.length;
  const personCount = slots.length;
  assert(personCount >= realCount, 'Selected public locations do not provide enough slots.');
  const columns = sites.map(({ candidateIndex }) => candidateIndex);
  const prices = new Float64Array(personCount);
  const owner = new Int32Array(personCount);
  const assignment = new Int32Array(personCount);
  const cost = (person, slot) => person >= realCount
    ? slots[slot].reserved ? 10_000 : 0
    : matrix.distances[publicIndexes[person]][columns[slots[slot].siteIndex]];

  for (const epsilon of EPSILONS) {
    owner.fill(-1);
    assignment.fill(-1);
    const queue = Array.from({ length: personCount }, (_, index) => index);
    let cursor = 0;
    while (cursor < queue.length) {
      const person = queue[cursor++];
      let bestSlot = -1;
      let bestValue = -Infinity;
      let secondValue = -Infinity;
      for (let slot = 0; slot < personCount; slot += 1) {
        const value = -cost(person, slot) - prices[slot];
        if (value > bestValue) {
          secondValue = bestValue;
          bestValue = value;
          bestSlot = slot;
        } else if (value > secondValue) {
          secondValue = value;
        }
      }
      prices[bestSlot] += bestValue - secondValue + epsilon;
      const displaced = owner[bestSlot];
      owner[bestSlot] = person;
      assignment[person] = bestSlot;
      if (displaced >= 0) queue.push(displaced);
    }
  }

  const loads = Array(sites.length).fill(0);
  const rows = publicIndexes.map((houseIndex, person) => {
    const siteIndex = slots[assignment[person]].siteIndex;
    loads[siteIndex] += 1;
    return { houseIndex, siteIndex, walkingDistanceM: matrix.distances[houseIndex][columns[siteIndex]] };
  });
  return { rows, loads, unusedSlots: personCount - realCount, epsilon: EPSILONS.at(-1) };
}

function publicAssignmentRows(result, sites, matrix, houseById) {
  return result.rows.map(({ houseIndex, siteIndex, walkingDistanceM }) => {
    const house = houseById.get(matrix.houseIds[houseIndex]);
    const site = sites[siteIndex];
    return {
      houseId: house.id,
      address: house.address,
      postcode: house.postcode,
      lat: house.lat,
      lon: house.lon,
      assignedContainerId: site.id,
      assignedLocationKind: site.kind,
      assignedLocationAccessScope: 'public',
      walkingDistanceM: round(walkingDistanceM, 2),
      coverageStatus: distanceBand(walkingDistanceM),
      routeGeometry: []
    };
  });
}

function nearestRows({ matrix, publicIndexes, sites }) {
  const columns = sites.map(({ candidateIndex }) => candidateIndex);
  return publicIndexes.map((houseIndex) => ({
    walkingDistanceM: Math.min(...columns.map((column) => matrix.distances[houseIndex][column]))
  }));
}

function scenario(sites, result, rows, nearestSiteRows) {
  return {
    publicLocationCount: sites.length,
    fixedPublicLocationCount: sites.filter(({ kind }) => kind === 'existing').length,
    newPublicLocationCount: sites.filter(({ kind }) => kind === 'new').length,
    averageHouseholdsPerPublicContainer: round(rows.length / sites.length, 3),
    targetHouseholdsPerContainer: TARGET,
    chosenModelBandForNewLocations: [NEW_MINIMUM, PUBLIC_MAXIMUM],
    assignedHouseholdsByLocation: Object.fromEntries(sites.map(({ id }, index) => [id, result.loads[index]])),
    capacityBalancedDistance: summarize(rows),
    nearestSiteAccessSensitivity: summarize(nearestSiteRows),
    assignmentSolver: {
      method: 'deterministic epsilon-scaling auction over individual capacity slots',
      finalEpsilonM: result.epsilon,
      unusedCapacitySlots: result.unusedSlots
    }
  };
}

function enrichedLocations(sites, loads, screeningById) {
  return sites.map((site, index) => {
    const screen = screeningById.get(site.id);
    return {
      id: site.id,
      kind: site.kind,
      status: site.status,
      address: site.address,
      lat: site.lat,
      lon: site.lon,
      sourceType: site.sourceType,
      accessScope: 'public',
      capacityUnits: 1,
      targetHouseholds: TARGET,
      minimumModelLoad: site.kind === 'new' ? NEW_MINIMUM : null,
      maximumModelLoad: PUBLIC_MAXIMUM,
      assignedHouseholds: loads[index],
      screeningRating: site.screeningRating,
      bgtDistancesM: screen ? {
        vehicleRoad: screen.roadM ?? null,
        openSpace: screen.openSpaceM ?? null,
        facade: screen.facadeM ?? null,
        water: screen.waterM ?? null,
        tree: screen.treeM ?? null,
        obstacle: screen.obstacleM ?? null
      } : null
    };
  });
}

function buildPrivateRows(existingCoverage) {
  const privateLocationIds = new Set(FIXED_PRIVATE_IDS);
  return existingCoverage.houses
    .filter(({ nearestLocationId }) => privateLocationIds.has(nearestLocationId))
    .map((house) => ({
      houseId: house.id,
      address: house.address,
      postcode: house.postcode,
      lat: house.lat,
      lon: house.lon,
      assignedContainerId: house.nearestLocationId,
      assignedLocationKind: 'existing',
      assignedLocationAccessScope: 'private',
      walkingDistanceM: round(house.walkingDistanceM, 2),
      coverageStatus: distanceBand(house.walkingDistanceM),
      routeGeometry: house.routeGeometry ?? []
    }));
}

function buildPrivateLocations(containers, privateAssignmentRows) {
  const containerById = new Map(containers.map((container) => [container.id, container]));
  return FIXED_PRIVATE_IDS.map((id) => {
    const container = containerById.get(id);
    assert(container?.access?.scope === 'private', `${id} is not marked private in container-locations.json.`);
    return {
      id,
      kind: 'existing',
      status: 'existing',
      address: container.address,
      hvcContainerId: container.hvcContainerId,
      lat: container.lat,
      lon: container.lon,
      sourceType: 'hvc-existing-private',
      accessScope: 'private',
      accessLabel: container.access.label,
      allowedAddresses: container.access.allowedAddresses,
      capacityUnits: 1,
      assignedHouseholds: privateAssignmentRows.filter(({ assignedContainerId }) => assignedContainerId === id).length,
      screeningRating: 'private-fixed'
    };
  });
}

function writeLocationFiles(locations) {
  const columns = ['id', 'kind', 'sourceType', 'address', 'lat', 'lon', 'accessScope', 'assignedHouseholds', 'targetHouseholds', 'screeningRating'];
  const tsv = [columns.join('\t'), ...locations.map((location) => columns.map((column) => String(location[column] ?? '').replaceAll('\t', ' ')).join('\t'))].join('\n');
  writeFileSync(paths.tsv, `${tsv}\n`);
  writeFileSync(paths.geojson, `${JSON.stringify({
    type: 'FeatureCollection',
    name: 'Warmenhuizen capacity-first plan, approximately 75 BAG residential address proxies per public bin',
    features: locations.map(({ lat, lon, ...properties }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties
    }))
  }, null, 2)}\n`);
}

const coverage = readJson(paths.coverage);
const containers = readJson(paths.containers);
const matrix = readJson(paths.matrix);
const existingCoverage = readJson(paths.existingCoverage);
const screening = readJson(paths.screening);
const evaluation = readJson(paths.evaluation);
const screeningById = new Map(screening.locations.map((location) => [location.id, location]));
const houseById = new Map(coverage.houses.map((house) => [house.id, house]));
const privateAssignmentRows = buildPrivateRows(existingCoverage);
assert(privateAssignmentRows.length === 7, `Expected seven private addresses, found ${privateAssignmentRows.length}.`);
const privateHouseIds = new Set(privateAssignmentRows.map(({ houseId }) => houseId));
const publicIndexes = matrix.houseIds.flatMap((houseId, index) => privateHouseIds.has(houseId) ? [] : [index]);
assert(publicIndexes.length === 2572, `Expected 2572 public address proxies, found ${publicIndexes.length}.`);

assert(evaluation.publicHouseholds === publicIndexes.length, 'Leave-one-out evaluation uses another public demand count.');
assert(JSON.stringify(evaluation.fixedPublicIds) === JSON.stringify(FIXED_PUBLIC_IDS), 'Leave-one-out evaluation uses other fixed public sites.');
assert(evaluation.results.length === evaluation.startingAdditionIds.length, 'Leave-one-out evaluation is incomplete.');
const selectionWinner = evaluation.results[0];
const selectedNewIds = evaluation.startingAdditionIds.filter((id) => id !== selectionWinner.removed);
const requiredPublicContainers = Math.round(publicIndexes.length / TARGET);
assert(requiredPublicContainers === FIXED_PUBLIC_IDS.length + selectedNewIds.length, 'Selected site count does not match the soft target count.');
selectedNewIds.forEach((id) => assert(screeningById.has(id), `Selected location ${id} has no screening record.`));

const recommendedSites = buildSites([...FIXED_PUBLIC_IDS, ...selectedNewIds], matrix, screeningById);
const recommendedResult = assign({ matrix, publicIndexes, sites: recommendedSites });
const recommendedRows = publicAssignmentRows(recommendedResult, recommendedSites, matrix, houseById);
const recommendedScenario = scenario(recommendedSites, recommendedResult, recommendedRows, nearestRows({ matrix, publicIndexes, sites: recommendedSites }));
recommendedSites.forEach((site, index) => {
  const load = recommendedResult.loads[index];
  assert(load <= PUBLIC_MAXIMUM, `${site.id} exceeds ${PUBLIC_MAXIMUM}.`);
  if (site.kind === 'new') assert(load >= NEW_MINIMUM, `${site.id} is below ${NEW_MINIMUM}.`);
});
assert(round(recommendedScenario.capacityBalancedDistance.totalWalkingDistanceM, 1) === selectionWinner.total, 'Selected leave-one-out total differs from rebuilt assignment.');

const municipalSites = buildSites([...FIXED_PUBLIC_IDS, ...MUNICIPAL_REST_IDS], matrix, screeningById);
const municipalResult = assign({ matrix, publicIndexes, sites: municipalSites });
const municipalRows = publicAssignmentRows(municipalResult, municipalSites, matrix, houseById);
const municipalScenario = scenario(municipalSites, municipalResult, municipalRows, nearestRows({ matrix, publicIndexes, sites: municipalSites }));

const privateLocations = buildPrivateLocations(containers, privateAssignmentRows);
const locations = [...enrichedLocations(recommendedSites, recommendedResult.loads, screeningById), ...privateLocations];
const allRowsById = new Map([...recommendedRows, ...privateAssignmentRows].map((row) => [row.houseId, row]));
const allRows = matrix.houseIds.map((houseId) => allRowsById.get(houseId));
assert(allRows.every(Boolean), 'Final assignment is not one-to-one for every BAG address proxy.');
const allDistance = summarize(allRows);
const capacityReduction = municipalScenario.capacityBalancedDistance.totalWalkingDistanceM - recommendedScenario.capacityBalancedDistance.totalWalkingDistanceM;
const nearestReduction = municipalScenario.nearestSiteAccessSensitivity.totalWalkingDistanceM - recommendedScenario.nearestSiteAccessSensitivity.totalWalkingDistanceM;
const hard75PublicContainers = Math.ceil(publicIndexes.length / TARGET);

const plan = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  title: 'Capaciteitsgestuurde verdeling restafvalcontainers Warmenhuizen',
  decision: {
    existingPhysicalContainersRetained: 11,
    existingPublicContainers: FIXED_PUBLIC_IDS.length,
    existingPrivateContainers: FIXED_PRIVATE_IDS.length,
    publicAccessChange: 'None; WH23 and WH24 retain their source-defined private allowlists.',
    newPublicContainers: selectedNewIds.length,
    publicContainers: recommendedSites.length,
    totalPhysicalContainers: locations.length,
    currentBagResidentialAddressProxies: coverage.houses.length,
    publicBagResidentialAddressProxies: publicIndexes.length,
    privateAllowlistedAddressProxies: privateAssignmentRows.length,
    targetHouseholdsPerContainer: TARGET,
    interpretation: 'Soft target: choose the whole public-container count with an average closest to 75, then assign each new public site 60-90 BAG residential address proxies. Existing public sites have no artificial minimum and a 90-proxy ceiling.',
    softTargetContainerCount: {
      rule: 'round(public BAG residential address proxies / 75)',
      requiredPublicContainers,
      requiredNewPublicContainers: requiredPublicContainers - FIXED_PUBLIC_IDS.length,
      totalIncludingPrivateContainers: requiredPublicContainers + FIXED_PRIVATE_IDS.length,
      resultingAveragePublicLoad: round(publicIndexes.length / requiredPublicContainers, 3)
    },
    hardMaximum75ArithmeticSensitivity: {
      rule: 'ceil(public BAG residential address proxies / 75)',
      scope: 'Arithmetic container count only; no 26-site selection or maximum-75 assignment was evaluated.',
      requiredPublicContainers: hard75PublicContainers,
      requiredNewPublicContainers: hard75PublicContainers - FIXED_PUBLIC_IDS.length,
      totalIncludingPrivateContainers: hard75PublicContainers + FIXED_PRIVATE_IDS.length
    }
  },
  recommendedScenario: {
    ...recommendedScenario,
    totalPhysicalLocationCount: locations.length,
    totalDistanceIncludingPrivate: allDistance,
    selectedNewIds,
    selectedMunicipalConceptIds: selectedNewIds.filter((id) => MUNICIPAL_REST_IDS.includes(id)),
    selectedIndependentSearchAnchorIds: selectedNewIds.filter((id) => !MUNICIPAL_REST_IDS.includes(id)),
    recordedCandidatePoolSelection: {
      removedSearchAnchorId: selectionWinner.removed,
      method: evaluation.method,
      evaluatedRemovalCount: evaluation.results.length,
      runnerUpRemovedId: evaluation.results[1].removed,
      runnerUpAdditionalDistanceM: round(evaluation.results[1].total - selectionWinner.total, 1)
    }
  },
  municipalConceptComparison: {
    ...municipalScenario,
    proposalCountReconciled: 21,
    totalPhysicalLocationCountIncludingPrivate: municipalSites.length + privateLocations.length,
    clarification: '20 underground rest sites plus WH01 semi-underground; WH26, WH27, WH31 and WH32 are GFE-only additions and are not new rest capacity.',
    unconfirmedRepoOnlyIdExcluded: 'WH35'
  },
  comparison: {
    interpretation: 'The primary figures compare exclusive, capacity-balanced assignments and combine location choice with four additional public containers. They do not predict which of three accessible bins a resident will actually use.',
    additionalPublicContainers: recommendedSites.length - municipalSites.length,
    capacityBalanced: {
      totalWalkingDistanceReductionM: round(capacityReduction, 1),
      totalWalkingDistanceReductionPercent: round(100 * capacityReduction / municipalScenario.capacityBalancedDistance.totalWalkingDistanceM, 2),
      averageWalkingDistanceReductionM: round(municipalScenario.capacityBalancedDistance.averageWalkingDistanceM - recommendedScenario.capacityBalancedDistance.averageWalkingDistanceM, 1),
      p95WalkingDistanceReductionM: round(municipalScenario.capacityBalancedDistance.p95WalkingDistanceM - recommendedScenario.capacityBalancedDistance.p95WalkingDistanceM, 1),
      over275Reduction: municipalScenario.capacityBalancedDistance.distanceBands.over_275 - recommendedScenario.capacityBalancedDistance.distanceBands.over_275
    },
    nearestSiteAccessSensitivity: {
      interpretation: 'Optimistic nearest-site sensitivity without capacity balancing: every public address chooses its nearest selected public site. The difference between both scenario minima is not a bound on actual resident behaviour.',
      totalWalkingDistanceReductionM: round(nearestReduction, 1),
      totalWalkingDistanceReductionPercent: round(100 * nearestReduction / municipalScenario.nearestSiteAccessSensitivity.totalWalkingDistanceM, 2),
      averageWalkingDistanceReductionM: round(municipalScenario.nearestSiteAccessSensitivity.averageWalkingDistanceM - recommendedScenario.nearestSiteAccessSensitivity.averageWalkingDistanceM, 1),
      p95WalkingDistanceReductionM: round(municipalScenario.nearestSiteAccessSensitivity.p95WalkingDistanceM - recommendedScenario.nearestSiteAccessSensitivity.p95WalkingDistanceM, 1),
      over275Reduction: municipalScenario.nearestSiteAccessSensitivity.distanceBands.over_275 - recommendedScenario.nearestSiteAccessSensitivity.distanceBands.over_275
    }
  },
  model: {
    formulation: 'capacitated facility-location / p-median with fixed existing facilities and binary unique household assignment',
    objectives: [
      'retain all 11 existing physical containers at their exact input coordinates and access scopes',
      'fix 25 new public containers from the soft target of an average closest to 75',
      'minimize total estimated pedestrian-network distance under the chosen 60-90 new-location model band',
      'report p95, maximum and repository distance bands as fairness diagnostics'
    ],
    locationSelection: 'A recorded 26-site pool from the prior BGT-aware local search is reduced by a complete capacity-constrained leave-one-out comparison. The final-stage selection is reproducible; the upstream candidate search is a fixed input and this is not a proof of global facility-location optimality.',
    assignment: recommendedScenario.assignmentSolver,
    routeDistance: matrix.source,
    privateRouteDistance: 'The seven private rows preserve their stored routes and OSRM distances from existing-11-household-coverage.json. Both compared public scenarios use only the local OSM matrix, so the comparison itself does not mix route models.',
    routeUncertainty: 'Estimated distance over a local bidirectional OSM pedestrian graph. Prior calibration against the stored routing dataset had MAE 29.9 m and P95 absolute error 80.9 m; reported metres are model values, not field precision.',
    candidateRecordsBeforeCoordinateDeduplication: 207,
    uniqueCandidateCoordinates: 186,
    distanceThresholdUse: 'Within this model, 275 m is not a constraint; it is a map and equity reporting band.',
    paperTranslation: 'Nevrlý et al. study plastic-waste collection and motivate explicit trade-offs. This report adapts that method to residual waste: sunk existing facilities are fixed, households are indivisible, a count-based model band replaces waste-volume capacity and a pedestrian graph replaces straight-line distance.'
  },
  scope: {
    includedBagResidentialAddressProxies: coverage.houses.length,
    excludedOutsideBuiltUpArea: 303,
    boundary: 'The stored 2025-07-01 BRT built-up-area polygon used by the repository. The 303 excluded Warmenhuizen place-query addresses remain a policy-scope decision, not evidence that they need no service.'
  },
  futureDemand: {
    dergmeerweg: 'The municipal project page states 88 homes. Reserve room for one or two bins depending on net-new BAG addresses, spatial distribution, waste volume and spare capacity; do not add them blindly to this current BAG snapshot.',
    landsheer: 'The municipal project page states 153 homes. First verify which units were already present in the 2026-08-13 BAG snapshot.'
  },
  locations,
  inputs: Object.fromEntries(['coverage', 'containers', 'matrix', 'existingCoverage', 'screening', 'evaluation'].map((name) => [name, {
    path: relative(projectRoot, paths[name]),
    sha256: sha256(paths[name])
  }]))
};

const assignments = {
  schemaVersion: 2,
  generatedAt: plan.generatedAt,
  scenario: {
    scenarioType: 'capacity-first-fixed-existing-private-access-preserved',
    targetHouseholdsPerContainer: TARGET,
    mandatoryExistingIds: [...FIXED_PUBLIC_IDS, ...FIXED_PRIVATE_IDS],
    fixedExistingLocationCount: 11,
    fixedPublicLocationCount: FIXED_PUBLIC_IDS.length,
    fixedPrivateLocationCount: FIXED_PRIVATE_IDS.length,
    additionalSiteCount: selectedNewIds.length,
    totalPhysicalLocationCount: locations.length,
    publiclyUsableLocationCount: recommendedSites.length,
    averageModeledWalkingDistanceM: allDistance.averageWalkingDistanceM,
    p95ModeledWalkingDistanceM: allDistance.p95WalkingDistanceM,
    maximumModeledWalkingDistanceM: allDistance.maximumWalkingDistanceM,
    distanceBands: allDistance.distanceBands,
    assignedHouseholdsByLocation: Object.fromEntries(locations.map(({ id, assignedHouseholds }) => [id, assignedHouseholds])),
    selectedAdditionalSites: selectedNewIds
  },
  locations,
  houses: allRows,
  presentation: {
    title: 'Warmenhuizen · circa 75 adressen per openbare container',
    subtitle: '11 bestaande behouden · 2 privé · 25 nieuwe zoekzones · capaciteitsgestuurde modelafstand',
    note: 'Binnen dit model is 275 meter alleen een kleur- en kwaliteitsindicator. Zoekankers zijn geen bouwpinnen en vereisen veld-, KLIC-, eigendoms- en HVC-validatie.',
    locationIntro: 'Donker vierkant: bestaande openbare HVC-locatie. Blauwe ruit: bestaande privélocatie WH23 of WH24. Magenta pluscirkel: nieuw modelanker. Huishoudkleuren volgen de repo-afstandsbanden.',
    showSourceIds: true
  },
  method: plan.model,
  sourcePlan: 'capacity-plan.json'
};

writeFileSync(paths.plan, `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(paths.assignments, `${JSON.stringify(assignments, null, 2)}\n`);
writeLocationFiles(locations);
console.log(JSON.stringify({ decision: plan.decision, selectedRemoval: selectionWinner.removed, recommended: plan.recommendedScenario, municipal: plan.municipalConceptComparison, comparison: plan.comparison }, null, 2));
