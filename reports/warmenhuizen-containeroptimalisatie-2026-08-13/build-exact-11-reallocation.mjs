#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const matrixPath = resolve(scriptDirectory, 'walking-matrix.json');
const coveragePath = resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json');
const outputPath = resolve(scriptDirectory, 'exact-11-reallocation.json');

const EXPECTED_MATRIX_SHA256 = '2bd7e4f43880fae5d65f9dc35fda0f55c61bfc8b170c64e4606e49373a3c3bfc';
const EXPECTED_COVERAGE_SHA256 = '3a037f47f6d0d1eeb62fb2c668a2c0262ef10e1c0c8c487b8a8812f494bc3551';
const EXPECTED_SELECTED_IDS = [
  'WH25', 'M004', 'M154', 'M168', 'WH13', 'WH29',
  'WH06', 'M027', 'WH19', 'M144', 'WH11'
];
const TARGET_COUNT = 11;

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function objectiveScore(distances) {
  const finite = distances.filter(Number.isFinite);
  const maximum = Math.max(...finite);
  const percentile95 = quantile(finite, 0.95);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  return maximum * 1e9 + percentile95 * 1e4 + mean;
}

function computeNearestDistances(matrix, selectedIndexes) {
  return matrix.map((row) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (const candidateIndex of selectedIndexes) {
      if (Number.isFinite(row[candidateIndex])) nearest = Math.min(nearest, row[candidateIndex]);
    }
    return nearest;
  });
}

function greedySelection(matrix, targetCount) {
  const selectedIndexes = [];
  const selectedSet = new Set();
  const nearest = Array(matrix.length).fill(Number.POSITIVE_INFINITY);

  while (selectedIndexes.length < targetCount) {
    let bestCandidateIndex = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let candidateIndex = 0; candidateIndex < matrix[0].length; candidateIndex += 1) {
      if (selectedSet.has(candidateIndex)) continue;
      const trialDistances = nearest.map((distance, houseIndex) => {
        const candidateDistance = matrix[houseIndex][candidateIndex];
        return Number.isFinite(candidateDistance) ? Math.min(distance, candidateDistance) : distance;
      });
      const score = objectiveScore(trialDistances);
      if (score < bestScore) {
        bestScore = score;
        bestCandidateIndex = candidateIndex;
      }
    }

    if (bestCandidateIndex === null) break;
    selectedIndexes.push(bestCandidateIndex);
    selectedSet.add(bestCandidateIndex);
    for (let houseIndex = 0; houseIndex < matrix.length; houseIndex += 1) {
      const candidateDistance = matrix[houseIndex][bestCandidateIndex];
      if (Number.isFinite(candidateDistance)) nearest[houseIndex] = Math.min(nearest[houseIndex], candidateDistance);
    }
  }

  return selectedIndexes;
}

function refineSelectionBySwaps(matrix, initialSelectedIndexes) {
  let selectedIndexes = [...initialSelectedIndexes];
  let selectedSet = new Set(selectedIndexes);
  let currentDistances = computeNearestDistances(matrix, selectedIndexes);
  let currentScore = objectiveScore(currentDistances);
  let swapCount = 0;

  while (true) {
    let bestSwap = null;
    let bestScore = currentScore;
    let bestDistances = currentDistances;

    for (let selectedPosition = 0; selectedPosition < selectedIndexes.length; selectedPosition += 1) {
      for (let candidateIndex = 0; candidateIndex < matrix[0].length; candidateIndex += 1) {
        if (selectedSet.has(candidateIndex)) continue;
        const trialIndexes = [...selectedIndexes];
        trialIndexes[selectedPosition] = candidateIndex;
        const trialDistances = computeNearestDistances(matrix, trialIndexes);
        const score = objectiveScore(trialDistances);
        if (score < bestScore) {
          bestScore = score;
          bestSwap = { selectedPosition, candidateIndex };
          bestDistances = trialDistances;
        }
      }
    }

    if (!bestSwap) break;
    selectedSet.delete(selectedIndexes[bestSwap.selectedPosition]);
    selectedIndexes[bestSwap.selectedPosition] = bestSwap.candidateIndex;
    selectedSet.add(bestSwap.candidateIndex);
    currentDistances = bestDistances;
    currentScore = bestScore;
    swapCount += 1;
  }

  return { selectedIndexes, distances: currentDistances, swapCount };
}

function distanceBand(distance) {
  if (!Number.isFinite(distance)) return 'unreachable';
  if (distance <= 100) return 'within_100';
  if (distance <= 125) return 'between_100_125';
  if (distance <= 150) return 'between_125_150';
  if (distance <= 275) return 'between_150_275';
  return 'over_275';
}

function summarize(distances) {
  const finite = distances.filter(Number.isFinite);
  return {
    addresses: distances.length,
    routedAddresses: finite.length,
    mean: round(finite.reduce((sum, value) => sum + value, 0) / finite.length, 2),
    p50: round(quantile(finite, 0.5)),
    p90: round(quantile(finite, 0.9)),
    p95: round(quantile(finite, 0.95)),
    p99: round(quantile(finite, 0.99)),
    max: round(Math.max(...finite)),
    within225: finite.filter((value) => value <= 225).length,
    within275: finite.filter((value) => value <= 275).length,
    distanceBands: distances.reduce((counts, distance) => {
      counts[distanceBand(distance)] += 1;
      return counts;
    }, {
      within_100: 0,
      between_100_125: 0,
      between_125_150: 0,
      between_150_275: 0,
      over_275: 0,
      unreachable: 0
    })
  };
}

async function main() {
  const [matrixText, coverageText] = await Promise.all([
    readFile(matrixPath, 'utf8'),
    readFile(coveragePath, 'utf8')
  ]);
  const matrixSha256 = createHash('sha256').update(matrixText).digest('hex');
  const coverageSha256 = createHash('sha256').update(coverageText).digest('hex');
  if (matrixSha256 !== EXPECTED_MATRIX_SHA256) {
    throw new Error(`Unexpected walking-matrix snapshot: ${matrixSha256}`);
  }
  if (coverageSha256 !== EXPECTED_COVERAGE_SHA256) {
    throw new Error(`Unexpected house-coverage snapshot: ${coverageSha256}`);
  }

  const matrixData = JSON.parse(matrixText);
  const coverage = JSON.parse(coverageText);
  if (matrixData.houseIds.length !== coverage.houses.length || matrixData.distances.length !== coverage.houses.length) {
    throw new Error('Walking matrix and current BAG coverage do not contain the same number of addresses.');
  }
  coverage.houses.forEach((house, index) => {
    if (house.id !== matrixData.houseIds[index]) throw new Error(`House order differs at row ${index}.`);
  });

  const greedyIndexes = greedySelection(matrixData.distances, TARGET_COUNT);
  const refined = refineSelectionBySwaps(matrixData.distances, greedyIndexes);
  const selectedIds = refined.selectedIndexes.map((index) => matrixData.candidateIds[index]);
  if (selectedIds.join(',') !== EXPECTED_SELECTED_IDS.join(',')) {
    throw new Error(`Exact-11 audit changed: expected ${EXPECTED_SELECTED_IDS.join(',')}, received ${selectedIds.join(',')}.`);
  }

  const selectedCandidates = refined.selectedIndexes.map((index) => matrixData.candidates[index]);
  const loads = Object.fromEntries(selectedIds.map((id) => [id, 0]));
  const houses = coverage.houses.map((house, houseIndex) => {
    const eligible = refined.selectedIndexes.map((candidateIndex, selectedPosition) => ({
      selectedPosition,
      distance: matrixData.distances[houseIndex][candidateIndex]
    })).filter(({ distance }) => Number.isFinite(distance)).sort((left, right) => (
      left.distance - right.distance
      || selectedIds[left.selectedPosition].localeCompare(selectedIds[right.selectedPosition], 'en', { numeric: true })
    ));
    const bestPosition = eligible[0]?.selectedPosition ?? -1;
    const bestDistance = eligible[0]?.distance ?? Number.POSITIVE_INFINITY;
    const assignedContainerId = bestPosition >= 0 ? selectedIds[bestPosition] : null;
    if (assignedContainerId) loads[assignedContainerId] += 1;
    return {
      id: house.id,
      address: house.address,
      postcode: house.postcode,
      city: house.city,
      lat: house.lat,
      lon: house.lon,
      assignedContainerId,
      walkingDistanceM: Number.isFinite(bestDistance) ? bestDistance : null,
      coverageStatus: distanceBand(bestDistance),
      nearestLocations: eligible.slice(0, 3).map(({ selectedPosition, distance }, index) => ({
        rank: index + 1,
        id: selectedIds[selectedPosition],
        walkingDistanceM: distance,
        coverageStatus: distanceBand(distance)
      })),
      routeGeometry: []
    };
  });
  const metrics = summarize(refined.distances);
  const uniqueCandidateCoordinateCount = new Set(matrixData.candidates.map((candidate) => (
    `${candidate.lat},${candidate.lon}`
  ))).size;
  const capacitySensitivity = [100, 75].map((capacityPerContainerAddressEquivalents) => ({
    capacityPerContainerAddressEquivalents,
    nominalMinimumPhysicalBins: Math.ceil(houses.length / capacityPerContainerAddressEquivalents),
    physicalBinsUnderNearestAssignment: Object.values(loads).reduce((sum, load) => (
      sum + Math.ceil(load / capacityPerContainerAddressEquivalents)
    ), 0)
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    presentation: {
      title: 'Theoretische herverdeling van precies elf assets',
      subtitle: 'Lokale minimax-heuristiek over 207 als bruikbaar gemarkeerde kandidaatrecords · geen bewezen optimum of bouwplan',
      note: 'Lokale OSM-loopafstanden ≠ historische OSRM-kaarten. M168: vraaganker 73,6 m verschoven naar Energiestraat.',
      locationIntro: 'Dit scenario onderzoekt wat met precies elf vrij verplaatsbare assets theoretisch mogelijk is. Slechts WH06 is een bestaande HVC-locatie; vijf punten zijn gemeentelijke voorstellen en vijf punten zijn analytische ankers. Geen van de nieuwe pinnen is met KLIC, eigendom, kraanopstelling en maatvoering integraal vrijgegeven. De lokale OSM-loopafstanden hebben een andere routebasis dan de behoudscenario’s.',
      showSourceIds: true
    },
    scenario: {
      scenarioType: 'exact-eleven-free-reallocation-local-search',
      walkingDistanceReferenceM: 275,
      walkingDistanceReferenceRole: 'ex-post service benchmark; not an optimization constraint',
      targetAssetCount: TARGET_COUNT,
      selectedLocationCount: selectedIds.length,
      selectedCandidateIds: selectedIds,
      greedyCandidateIds: greedyIndexes.map((index) => matrixData.candidateIds[index]),
      oneForOneSwapCount: refined.swapCount,
      averageModeledWalkingDistanceM: metrics.mean,
      p50ModeledWalkingDistanceM: metrics.p50,
      p90ModeledWalkingDistanceM: metrics.p90,
      p95ModeledWalkingDistanceM: metrics.p95,
      p99ModeledWalkingDistanceM: metrics.p99,
      maximumModeledWalkingDistanceM: metrics.max,
      householdsWithin225M: metrics.within225,
      householdsWithin275M: metrics.within275,
      distanceBands: metrics.distanceBands,
      assignedHouseholdsByLocation: loads,
      capacitySensitivity,
      allHouseholdsWithinTarget: metrics.within275 === houses.length
    },
    method: {
      objective: 'lexicographic minimax approximation: maximum route distance, then p95, then unweighted mean',
      algorithm: 'one deterministic greedy start followed by a complete scan of all strict best-improving one-for-one swaps until that one-swap neighborhood contains no improvement',
      proofStatus: 'one-swap local-search result from one start; no multi-start or global optimality proof',
      demandWeight: 'one equal proxy per BAG address with woonfunctie inside the repository built-up boundary',
      candidatePrecondition: '207 records flagged generalPublicEligible on 186 unique coordinates in the local candidate snapshot; actual public and technical suitability is not established',
      routeModel: matrixData.source,
      passAllocation: 'Each household row includes its three nearest selected locations, matching the municipal policy of access to the three nearest containers.',
      calibration: matrixData.calibration,
      limitations: [
        'The candidate eligibility flag is a desk-screen, not cadastral, KLIC, crane or HVC approval.',
        'Five selected sites are analytical anchors and five are municipal proposal coordinates; only WH06 is an existing HVC site.',
        'Walking distances come from a local OSM pedestrian approximation and differ from the repository OSRM batch.',
        'The objective does not include local waste volume, container cost, vehicle service time or relocation cost from Nevrlý et al.',
        'The committed walking-matrix snapshot and BAG coverage input are verified by SHA-256.',
        'The 207 candidate records contain 186 unique coordinates; duplicate-coordinate records can represent different candidate provenance.',
        'At least M154 and M156 have identical distance columns, so an equivalent result can carry a different candidate ID.',
        'If “eleven containers” means eleven physical bins rather than eleven sites/assets, the nominal 100/75-address sensitivities already require 26/35 bins before location-specific loading; these arbitrary sensitivities are not operational capacity evidence.'
      ]
    },
    sourceSnapshot: {
      walkingMatrixPath: 'walking-matrix.json',
      walkingMatrixGeneratedAt: matrixData.generatedAt,
      walkingMatrixSha256: matrixSha256,
      candidateCount: matrixData.candidateIds.length,
      uniqueCandidateCoordinateCount,
      addressCount: matrixData.houseIds.length,
      coverageSource: '../../data/places/warmenhuizen/house-coverage.json',
      coverageSha256
    },
    locations: selectedCandidates.map((candidate, index) => ({
      ...candidate,
      role: candidate.id === 'WH06' ? 'existing-public' : 'reallocation-candidate',
      selectionOrder: index + 1,
      assignedHouseholds: loads[candidate.id],
      coordinateMeaning: candidate.exactExistingCoordinate
        ? 'existing HVC coordinate in repository'
        : 'candidate/search anchor; not a build-ready pin'
    })),
    houses
  };

  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    matrixSha256,
    swapCount: refined.swapCount,
    selectedIds,
    metrics,
    loads
  }, null, 2));
}

await main();
