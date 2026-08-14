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
  wh24Column: resolve(reportDirectory, 'wh24-public-column.json'),
  screening: resolve(reportDirectory, 'location-screening.json'),
  plan: resolve(reportDirectory, 'capacity-plan.json'),
  assignments: resolve(reportDirectory, 'household-assignment.json'),
  tsv: resolve(reportDirectory, 'locations.tsv'),
  geojson: resolve(reportDirectory, 'locations.geojson')
};

const FIXED_PUBLIC_IDS = ['WH03', 'WH05', 'WH06', 'WH08', 'WH14', 'WH24', 'WH26', 'WH27', 'WH33', 'WH34'];
const FIXED_PRIVATE_IDS = ['WH23'];
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
  const counts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0
  };
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

function augmentMatrix(matrix, wh24Column) {
  assert(wh24Column.houseIds.length === matrix.houseIds.length, 'WH24 column has a different household count.');
  wh24Column.houseIds.forEach((houseId, index) => {
    assert(houseId === matrix.houseIds[index], `WH24 household order differs at row ${index}.`);
  });
  assert(!matrix.candidateIds.includes('WH24'), 'WH24 unexpectedly already occurs in the public matrix.');
  matrix.candidateIds.push('WH24');
  matrix.candidates.push(wh24Column.candidate);
  matrix.distances.forEach((row, index) => row.push(wh24Column.distances[index]));
}

function buildSites(ids, matrix, screeningById) {
  const candidateById = new Map(matrix.candidates.map((candidate, candidateIndex) => [candidate.id, { ...candidate, candidateIndex }]));
  return ids.map((id) => {
    const candidate = candidateById.get(id);
    assert(candidate, `Candidate ${id} is missing from the augmented matrix.`);
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
    return {
      houseIndex,
      siteIndex,
      walkingDistanceM: matrix.distances[houseIndex][columns[siteIndex]]
    };
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

function scenario(sites, result, rows) {
  return {
    publicLocationCount: sites.length,
    fixedPublicLocationCount: sites.filter(({ kind }) => kind === 'existing').length,
    newPublicLocationCount: sites.filter(({ kind }) => kind === 'new').length,
    averageHouseholdsPerPublicContainer: round(rows.length / sites.length, 3),
    targetHouseholdsPerContainer: TARGET,
    newLocationPolicyBand: [NEW_MINIMUM, PUBLIC_MAXIMUM],
    assignedHouseholdsByLocation: Object.fromEntries(sites.map(({ id }, index) => [id, result.loads[index]])),
    distance: summarize(rows),
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
      minimumPolicyLoad: site.kind === 'new' ? NEW_MINIMUM : null,
      maximumPolicyLoad: PUBLIC_MAXIMUM,
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

function privateRows(existingCoverage) {
  return existingCoverage.houses.filter(({ nearestLocationId }) => nearestLocationId === 'WH23').map((house) => ({
    houseId: house.id,
    address: house.address,
    postcode: house.postcode,
    lat: house.lat,
    lon: house.lon,
    assignedContainerId: 'WH23',
    assignedLocationKind: 'existing',
    assignedLocationAccessScope: 'private',
    walkingDistanceM: round(house.walkingDistanceM, 2),
    coverageStatus: distanceBand(house.walkingDistanceM),
    routeGeometry: house.routeGeometry ?? []
  }));
}

function writeLocationFiles(locations) {
  const columns = ['id', 'kind', 'sourceType', 'address', 'lat', 'lon', 'accessScope', 'assignedHouseholds', 'targetHouseholds', 'screeningRating'];
  const tsv = [columns.join('\t'), ...locations.map((location) => columns.map((column) => String(location[column] ?? '').replaceAll('\t', ' ')).join('\t'))].join('\n');
  writeFileSync(paths.tsv, `${tsv}\n`);
  writeFileSync(paths.geojson, `${JSON.stringify({
    type: 'FeatureCollection',
    name: 'Warmenhuizen capacity-first plan, approximately 75 BAG residential address proxies per bin',
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
const wh24Column = readJson(paths.wh24Column);
const screening = readJson(paths.screening);
augmentMatrix(matrix, wh24Column);
const screeningById = new Map(screening.locations.map((location) => [location.id, location]));
const houseById = new Map(coverage.houses.map((house) => [house.id, house]));
const privateAssignmentRows = privateRows(existingCoverage);
assert(privateAssignmentRows.length === 3, `Expected three WH23-private addresses, found ${privateAssignmentRows.length}.`);
const privateHouseIds = new Set(privateAssignmentRows.map(({ houseId }) => houseId));
const publicIndexes = matrix.houseIds.flatMap((houseId, index) => privateHouseIds.has(houseId) ? [] : [index]);
assert(publicIndexes.length === 2576, `Expected 2576 public address proxies, found ${publicIndexes.length}.`);

const selectedNewIds = screening.locations.filter(({ role }) => role === 'new').map(({ id }) => id);
assert(selectedNewIds.length === 25, `Expected 25 selected new locations, found ${selectedNewIds.length}.`);
const recommendedSites = buildSites([...FIXED_PUBLIC_IDS, ...selectedNewIds], matrix, screeningById);
const recommendedResult = assign({ matrix, publicIndexes, sites: recommendedSites });
const recommendedRows = publicAssignmentRows(recommendedResult, recommendedSites, matrix, houseById);
const recommendedScenario = scenario(recommendedSites, recommendedResult, recommendedRows);
recommendedSites.forEach((site, index) => {
  const load = recommendedResult.loads[index];
  assert(load <= PUBLIC_MAXIMUM, `${site.id} exceeds ${PUBLIC_MAXIMUM}.`);
  if (site.kind === 'new') assert(load >= NEW_MINIMUM, `${site.id} is below ${NEW_MINIMUM}.`);
  const expectedLoad = screeningById.get(site.id)?.assignedHouseholds;
  assert(load === expectedLoad, `${site.id} load changed: expected ${expectedLoad}, received ${load}.`);
});

const municipalSites = buildSites([...FIXED_PUBLIC_IDS, ...MUNICIPAL_REST_IDS], matrix, screeningById);
const municipalResult = assign({ matrix, publicIndexes, sites: municipalSites });
const municipalRows = publicAssignmentRows(municipalResult, municipalSites, matrix, houseById);
const municipalScenario = scenario(municipalSites, municipalResult, municipalRows);

const wh23 = containers.find(({ id }) => id === 'WH23');
const privateLocation = {
  id: 'WH23',
  kind: 'existing',
  status: 'existing',
  address: wh23.address,
  hvcContainerId: wh23.hvcContainerId,
  lat: wh23.lat,
  lon: wh23.lon,
  sourceType: 'hvc-existing-private',
  accessScope: 'private',
  accessLabel: wh23.access.label,
  allowedAddresses: wh23.access.allowedAddresses,
  capacityUnits: 1,
  assignedHouseholds: privateAssignmentRows.length,
  screeningRating: 'private-fixed'
};
const locations = [...enrichedLocations(recommendedSites, recommendedResult.loads, screeningById), privateLocation];
const allRowsById = new Map([...recommendedRows, ...privateAssignmentRows].map((row) => [row.houseId, row]));
const allRows = matrix.houseIds.map((houseId) => allRowsById.get(houseId));
assert(allRows.every(Boolean), 'Final assignment is not one-to-one for every BAG address proxy.');
const allDistance = summarize(allRows);
const reduction = municipalScenario.distance.totalWalkingDistanceM - recommendedScenario.distance.totalWalkingDistanceM;

const plan = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  title: 'Capaciteitsgestuurde verdeling restafvalcontainers Warmenhuizen',
  decision: {
    existingPhysicalContainersRetained: 11,
    existingPublicContainers: 10,
    existingPrivateContainers: 1,
    publicAccessChange: 'WH24 public by explicit user instruction; WH23 remains private.',
    newPublicContainers: selectedNewIds.length,
    publicContainers: recommendedSites.length,
    totalPhysicalContainers: locations.length,
    currentBagResidentialAddressProxies: coverage.houses.length,
    publicBagResidentialAddressProxies: publicIndexes.length,
    privateAllowlistedAddressProxies: privateAssignmentRows.length,
    targetHouseholdsPerContainer: TARGET,
    interpretation: 'Approximately 75: each new public site is assigned 60-90 BAG residential address proxies; fixed public sites are not forced to an artificial minimum and have a 90-proxy ceiling.',
    target75ContainerCount: {
      requiredPublicContainers: Math.ceil(publicIndexes.length / TARGET),
      requiredNewPublicContainers: Math.ceil(publicIndexes.length / TARGET) - FIXED_PUBLIC_IDS.length,
      totalIncludingOnePrivateContainer: Math.ceil(publicIndexes.length / TARGET) + 1
    }
  },
  recommendedScenario: {
    ...recommendedScenario,
    totalPhysicalLocationCount: locations.length,
    totalDistanceIncludingPrivate: allDistance,
    selectedNewIds,
    selectedMunicipalConceptIds: selectedNewIds.filter((id) => MUNICIPAL_REST_IDS.includes(id)),
    selectedIndependentSearchAnchorIds: selectedNewIds.filter((id) => !MUNICIPAL_REST_IDS.includes(id)),
    wh24ReplacementChoice: {
      removedSearchAnchorId: 'M154',
      retainedNearbySearchAnchorId: 'M157',
      method: 'Full 60-90 bounded assignment for the five best leave-one-out candidates after an all-26 uncapacitated screen.',
      runnerUp: 'Removing M157 increased total public walking distance by 1207.6 m.'
    }
  },
  municipalConceptComparison: {
    ...municipalScenario,
    proposalCountReconciled: 21,
    totalPhysicalLocationCountIncludingPrivate: municipalSites.length + 1,
    clarification: '20 underground rest sites plus WH01 semi-underground; WH26, WH27, WH31 and WH32 are GFE-only additions and are not new rest capacity.',
    unconfirmedRepoOnlyIdExcluded: 'WH35'
  },
  comparison: {
    additionalPublicContainers: recommendedSites.length - municipalSites.length,
    totalWalkingDistanceReductionM: round(reduction, 1),
    totalWalkingDistanceReductionPercent: round(100 * reduction / municipalScenario.distance.totalWalkingDistanceM, 2),
    averageWalkingDistanceReductionM: round(municipalScenario.distance.averageWalkingDistanceM - recommendedScenario.distance.averageWalkingDistanceM, 1),
    p95WalkingDistanceReductionM: round(municipalScenario.distance.p95WalkingDistanceM - recommendedScenario.distance.p95WalkingDistanceM, 1),
    over275Reduction: municipalScenario.distance.distanceBands.over_275 - recommendedScenario.distance.distanceBands.over_275
  },
  model: {
    formulation: 'capacitated facility-location / p-median with fixed existing facilities and binary unique household assignment',
    objectives: [
      'retain all 11 existing physical containers at their exact input coordinates',
      'fix 25 new public containers from the policy target of an average close to 75',
      'minimize total pedestrian-network distance under the 60-90 new-location policy band',
      'report p95, maximum and repository distance bands as fairness diagnostics'
    ],
    locationSelection: 'BGT-aware greedy and cluster-medoid local search, followed by a complete leave-one-out comparison after WH24 became public. This is the best found local solution, not a proof of global MILP optimality.',
    assignment: recommendedScenario.assignmentSolver,
    routeDistance: matrix.source,
    candidateRecordsBeforeCoordinateDeduplication: 207,
    uniqueCandidateCoordinates: 186,
    distanceThresholdUse: '275 m is not a constraint; it is only a map and equity reporting band.',
    paperTranslation: 'The paper motivates explicit trade-offs. Here sunk existing facilities are fixed, households are indivisible, a count-based policy band replaces waste-volume capacity and a pedestrian graph replaces straight-line distance.'
  },
  futureDemand: {
    dergmeerweg: 'The municipal project page states 88 homes. They are not added blindly to this current BAG snapshot; reserve space and re-optimize for at least two further bins when an authoritative address schedule is available.',
    landsheer: 'The municipal project page states 153 homes. First verify which units were already present in the 2026-08-13 BAG snapshot.'
  },
  locations,
  inputs: Object.fromEntries(['coverage', 'containers', 'matrix', 'existingCoverage', 'wh24Column', 'screening'].map((name) => [name, {
    path: relative(projectRoot, paths[name]),
    sha256: sha256(paths[name])
  }]))
};

const assignments = {
  schemaVersion: 1,
  generatedAt: plan.generatedAt,
  scenario: {
    scenarioType: 'capacity-first-fixed-existing-wh24-public',
    targetHouseholdsPerContainer: TARGET,
    mandatoryExistingIds: [...FIXED_PUBLIC_IDS, ...FIXED_PRIVATE_IDS],
    fixedExistingLocationCount: 11,
    fixedPublicLocationCount: 10,
    fixedPrivateLocationCount: 1,
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
    title: 'Capaciteitsplan Warmenhuizen: circa 75 huishoudens per container',
    subtitle: '11 bestaande locaties blijven · WH24 openbaar · 25 nieuwe zoekzones · loopafstand stuurt de toewijzing',
    note: '275 meter is alleen een kleur- en kwaliteitsindicator. Zoekankers zijn geen bouwpinnen en vereisen veld-, KLIC-, eigendoms- en HVC-validatie.',
    locationIntro: 'Groen vierkant: bestaande publieke container. Paars: WH23 privé. Blauwe cirkel: nieuwe zoekzone. Huishoudkleuren volgen de bestaande repo-afstandsbanden.',
    showSourceIds: true
  },
  method: plan.model,
  sourcePlan: 'capacity-plan.json'
};

writeFileSync(paths.plan, `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(paths.assignments, `${JSON.stringify(assignments, null, 2)}\n`);
writeLocationFiles(locations);
console.log(JSON.stringify({ decision: plan.decision, recommended: plan.recommendedScenario, municipal: plan.municipalConceptComparison, comparison: plan.comparison }, null, 2));
