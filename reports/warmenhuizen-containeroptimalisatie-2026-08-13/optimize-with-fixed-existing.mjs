#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { isAddressAllowedByRules } from "../../src/shared/address.js";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const ROUTE_SNAPSHOT = "9631171:data/places/warmenhuizen/house-coverage.json";
const PRIOR_UNCONSTRAINED_RESULT = "route-graph-optimization.json";
const THRESHOLDS_M = [150, 175, 200, 225, 250, 275];
const DETAIL_THRESHOLD_M = 225;
const EARTH_RADIUS_M = 6_371_008.8;
const ROUTE_MODEL = "shortest path over deduplicated historical OSRM route segments";

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function nodeKey(latitude, longitude) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function haversineMeters(left, right) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitude1 = toRadians(left.latitude);
  const latitude2 = toRadians(right.latitude);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].distance <= item.distance) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      let child = left;
      if (right < this.items.length && this.items[right].distance < this.items[left].distance) child = right;
      if (this.items[child].distance >= last.distance) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return first;
  }
}

class Dinic {
  constructor(nodeCount) {
    this.graph = Array.from({ length: nodeCount }, () => []);
  }

  addEdge(from, to, capacity, metadata = null) {
    const forward = { to, reverse: this.graph[to].length, capacity, originalCapacity: capacity, metadata };
    const reverse = { to: from, reverse: this.graph[from].length, capacity: 0, originalCapacity: 0, metadata: null };
    this.graph[from].push(forward);
    this.graph[to].push(reverse);
    return forward;
  }

  maximumFlow(source, sink) {
    let totalFlow = 0;
    while (true) {
      const levels = new Int32Array(this.graph.length).fill(-1);
      const queue = [source];
      levels[source] = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const node = queue[index];
        for (const edge of this.graph[node]) {
          if (edge.capacity > 0 && levels[edge.to] < 0) {
            levels[edge.to] = levels[node] + 1;
            queue.push(edge.to);
          }
        }
      }
      if (levels[sink] < 0) return totalFlow;
      const cursors = new Int32Array(this.graph.length);
      const send = (node, available) => {
        if (node === sink) return available;
        while (cursors[node] < this.graph[node].length) {
          const edge = this.graph[node][cursors[node]];
          if (edge.capacity > 0 && levels[edge.to] === levels[node] + 1) {
            const flow = send(edge.to, Math.min(available, edge.capacity));
            if (flow > 0) {
              edge.capacity -= flow;
              this.graph[edge.to][edge.reverse].capacity += flow;
              return flow;
            }
          }
          cursors[node] += 1;
        }
        return 0;
      };
      while (true) {
        const flow = send(source, Number.MAX_SAFE_INTEGER);
        if (flow === 0) break;
        totalFlow += flow;
      }
    }
  }
}

function buildGraph(snapshot) {
  const nodes = [];
  const nodeIndexes = new Map();
  const edges = new Map();
  const endpointVotes = new Map();

  function ensureNode(latitude, longitude) {
    const roundedLatitude = Number(latitude.toFixed(6));
    const roundedLongitude = Number(longitude.toFixed(6));
    const key = nodeKey(roundedLatitude, roundedLongitude);
    if (!nodeIndexes.has(key)) {
      nodeIndexes.set(key, nodes.length);
      nodes.push({ latitude: roundedLatitude, longitude: roundedLongitude });
    }
    return nodeIndexes.get(key);
  }

  for (const house of snapshot.houses) {
    for (const candidate of house.nearestContainers ?? []) {
      const geometry = candidate.routeGeometry ?? [];
      for (let index = 1; index < geometry.length; index += 1) {
        const from = ensureNode(geometry[index - 1][0], geometry[index - 1][1]);
        const to = ensureNode(geometry[index][0], geometry[index][1]);
        if (from === to) continue;
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const weight = haversineMeters(nodes[from], nodes[to]);
        const previous = edges.get(key);
        if (!previous || weight < previous.weight) edges.set(key, { from, to, weight });
      }
    }
  }

  // Preserve the exact node-index construction order used by optimize-route-graph.mjs,
  // then resolve route endpoints in a second pass so its stored seed nodes stay comparable.
  for (const house of snapshot.houses) {
    for (const candidate of house.nearestContainers ?? []) {
      const endpointCoordinate = candidate.routeGeometry?.at(-1);
      if (!endpointCoordinate) continue;
      const endpoint = nodeIndexes.get(nodeKey(endpointCoordinate[0], endpointCoordinate[1]));
      if (endpoint === undefined) continue;
      if (!endpointVotes.has(candidate.id)) endpointVotes.set(candidate.id, new Map());
      const votes = endpointVotes.get(candidate.id);
      votes.set(endpoint, (votes.get(endpoint) ?? 0) + 1);
    }
  }

  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (const { from, to, weight } of edges.values()) {
    adjacency[from].push({ node: to, weight });
    adjacency[to].push({ node: from, weight });
  }
  return { nodes, nodeIndexes, adjacency, edgeCount: edges.size, endpointVotes };
}

function dijkstra(adjacency, start, includePrevious = false) {
  const distances = new Float32Array(adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const previous = includePrevious ? new Int32Array(adjacency.length).fill(-1) : null;
  const queue = new MinHeap();
  queue.push({ node: start, distance: 0 });
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < distances[edge.node]) {
        distances[edge.node] = nextDistance;
        if (previous) previous[edge.node] = current.node;
        queue.push({ node: edge.node, distance: distances[edge.node] });
      }
    }
  }
  return { distances, previous };
}

function multiSourceDijkstra(adjacency, sources) {
  const distances = new Float32Array(adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(adjacency.length).fill(-1);
  const sourceIndexes = new Int32Array(adjacency.length).fill(-1);
  const queue = new MinHeap();
  for (let index = 0; index < sources.length; index += 1) {
    const node = sources[index].graphNode;
    if (distances[node] === 0) continue;
    distances[node] = 0;
    sourceIndexes[node] = index;
    queue.push({ node, distance: 0 });
  }
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < distances[edge.node]) {
        distances[edge.node] = nextDistance;
        previous[edge.node] = current.node;
        sourceIndexes[edge.node] = sourceIndexes[current.node];
        queue.push({ node: edge.node, distance: distances[edge.node] });
      }
    }
  }
  return { distances, previous, sourceIndexes };
}

function resolveExistingGraphNode(container, graph) {
  const votes = graph.endpointVotes.get(container.id);
  if (votes?.size) {
    const [graphNode, voteCount] = [...votes.entries()].sort((left, right) => (
      right[1] - left[1]
      || haversineMeters(
        { latitude: container.lat, longitude: container.lon },
        graph.nodes[left[0]],
      ) - haversineMeters(
        { latitude: container.lat, longitude: container.lon },
        graph.nodes[right[0]],
      )
      || left[0] - right[0]
    ))[0];
    return { graphNode, voteCount, resolution: "most frequent historical route endpoint" };
  }

  let graphNode = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const distance = haversineMeters(
      { latitude: container.lat, longitude: container.lon },
      graph.nodes[index],
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      graphNode = index;
    }
  }
  return { graphNode, voteCount: 0, resolution: "nearest reconstructed graph node" };
}

function getCoverageStatus(distance) {
  if (!Number.isFinite(distance)) return "unreachable";
  if (distance <= 100) return "within_100";
  if (distance <= 125) return "between_100_125";
  if (distance <= 150) return "between_125_150";
  if (distance <= 275) return "between_150_275";
  return "over_275";
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function buildFixedCoverageCounts(distanceRows, demandGroups, fixedLocations, threshold) {
  const publicLocations = fixedLocations.filter(({ accessScope }) => accessScope === "public");
  const privateById = new Map(fixedLocations
    .filter(({ accessScope }) => accessScope === "private")
    .map((location) => [location.id, location]));
  const counts = new Uint16Array(demandGroups.length);
  for (let demand = 0; demand < demandGroups.length; demand += 1) {
    const distances = distanceRows[demand];
    for (const location of publicLocations) {
      if (distances[location.graphNode] <= threshold) counts[demand] += 1;
    }
    for (const locationId of demandGroups[demand].allowedPrivateLocationIds) {
      const location = privateById.get(locationId);
      if (location && distances[location.graphNode] <= threshold) counts[demand] += 1;
    }
  }
  return counts;
}

function buildCandidateCoverage(distanceRows, fixedNodes, threshold) {
  const coverage = Array.from({ length: distanceRows[0].length }, () => []);
  for (let demand = 0; demand < distanceRows.length; demand += 1) {
    const distances = distanceRows[demand];
    for (let candidate = 0; candidate < distances.length; candidate += 1) {
      if (!fixedNodes.has(candidate) && distances[candidate] <= threshold) {
        coverage[candidate].push(demand);
      }
    }
  }
  return coverage;
}

function greedyAdditionalCover(distanceRows, demandGroups, fixedLocations, threshold) {
  const fixedNodes = new Set(fixedLocations.map(({ graphNode }) => graphNode));
  const candidateCoverage = buildCandidateCoverage(distanceRows, fixedNodes, threshold);
  const coverCounts = buildFixedCoverageCounts(distanceRows, demandGroups, fixedLocations, threshold);
  const uncovered = new Uint8Array(demandGroups.length);
  let uncoveredGroupCount = 0;
  for (let demand = 0; demand < demandGroups.length; demand += 1) {
    if (coverCounts[demand] === 0) {
      uncovered[demand] = 1;
      uncoveredGroupCount += 1;
    }
  }
  const initiallyUncoveredGroups = [...uncovered.keys()].filter((index) => uncovered[index]);
  const selected = [];
  const selectedFlags = new Uint8Array(candidateCoverage.length);

  while (uncoveredGroupCount > 0) {
    let bestCandidate = -1;
    let bestWeight = -1;
    let bestGroupCount = -1;
    let bestDistanceSum = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < candidateCoverage.length; candidate += 1) {
      if (selectedFlags[candidate]) continue;
      let weight = 0;
      let groupCount = 0;
      let distanceSum = 0;
      for (const demand of candidateCoverage[candidate]) {
        if (!uncovered[demand]) continue;
        weight += demandGroups[demand].houseIds.length;
        groupCount += 1;
        distanceSum += distanceRows[demand][candidate] * demandGroups[demand].houseIds.length;
      }
      if (weight > bestWeight
        || (weight === bestWeight && groupCount > bestGroupCount)
        || (weight === bestWeight && groupCount === bestGroupCount && distanceSum < bestDistanceSum)
        || (weight === bestWeight && groupCount === bestGroupCount && distanceSum === bestDistanceSum && candidate < bestCandidate)) {
        bestCandidate = candidate;
        bestWeight = weight;
        bestGroupCount = groupCount;
        bestDistanceSum = distanceSum;
      }
    }
    if (bestCandidate < 0 || bestGroupCount <= 0) {
      throw new Error(`No additional graph node covers the remaining demand at ${threshold} m`);
    }
    selected.push(bestCandidate);
    selectedFlags[bestCandidate] = 1;
    for (const demand of candidateCoverage[bestCandidate]) {
      coverCounts[demand] += 1;
      if (uncovered[demand]) {
        uncovered[demand] = 0;
        uncoveredGroupCount -= 1;
      }
    }
  }

  const retainedReverse = [];
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidate = selected[index];
    const removable = candidateCoverage[candidate].every((demand) => coverCounts[demand] > 1);
    if (removable) {
      for (const demand of candidateCoverage[candidate]) coverCounts[demand] -= 1;
    } else {
      retainedReverse.push(candidate);
    }
  }
  return {
    selectedNodes: retainedReverse.reverse(),
    initiallyUncoveredGroups,
  };
}

function pruneAdditionalSeed(
  seedNodes,
  distanceRows,
  demandGroups,
  fixedLocations,
  threshold,
  pruneOrder = "reverse-seed",
  prepared = null,
) {
  const fixedNodes = prepared?.fixedNodes
    ?? new Set(fixedLocations.map(({ graphNode }) => graphNode));
  const candidateCoverage = prepared?.candidateCoverage
    ?? buildCandidateCoverage(distanceRows, fixedNodes, threshold);
  const uniqueSeed = [...new Set(seedNodes)].filter((node) => !fixedNodes.has(node));
  const coverCounts = prepared?.fixedCoverageCounts
    ? Uint16Array.from(prepared.fixedCoverageCounts)
    : buildFixedCoverageCounts(distanceRows, demandGroups, fixedLocations, threshold);
  for (const candidate of uniqueSeed) {
    for (const demand of candidateCoverage[candidate]) coverCounts[demand] += 1;
  }
  if ([...coverCounts].some((count) => count === 0)) return null;

  let ordered;
  if (pruneOrder === "least-unique-first") {
    ordered = [...uniqueSeed].sort((left, right) => (
      candidateCoverage[left].length - candidateCoverage[right].length || left - right
    ));
  } else if (pruneOrder === "most-covered-first") {
    ordered = [...uniqueSeed].sort((left, right) => (
      candidateCoverage[right].length - candidateCoverage[left].length || left - right
    ));
  } else if (pruneOrder === "node-ascending") {
    ordered = [...uniqueSeed].sort((left, right) => left - right);
  } else if (pruneOrder === "node-descending") {
    ordered = [...uniqueSeed].sort((left, right) => right - left);
  } else {
    ordered = [...uniqueSeed].reverse();
  }
  const retained = new Set(uniqueSeed);
  for (const candidate of ordered) {
    const removable = candidateCoverage[candidate].every((demand) => coverCounts[demand] > 1);
    if (!removable) continue;
    retained.delete(candidate);
    for (const demand of candidateCoverage[candidate]) coverCounts[demand] -= 1;
  }
  return [...retained];
}

function improveAdditionalSeed(
  seedNodes,
  distanceRows,
  demandGroups,
  fixedLocations,
  threshold,
  maximumCandidateTrials = 0,
) {
  const fixedNodes = new Set(fixedLocations.map(({ graphNode }) => graphNode));
  const candidateCoverage = buildCandidateCoverage(distanceRows, fixedNodes, threshold);
  const fixedCoverageCounts = buildFixedCoverageCounts(
    distanceRows,
    demandGroups,
    fixedLocations,
    threshold,
  );
  const prepared = { fixedNodes, candidateCoverage, fixedCoverageCounts };
  const pruneOrders = [
    "reverse-seed",
    "least-unique-first",
    "most-covered-first",
    "node-ascending",
    "node-descending",
  ];
  let best = pruneOrders
    .map((order) => pruneAdditionalSeed(
      seedNodes,
      distanceRows,
      demandGroups,
      fixedLocations,
      threshold,
      order,
      prepared,
    ))
    .filter(Boolean)
    .sort((left, right) => left.length - right.length || left.join(",").localeCompare(right.join(",")))[0];
  if (!best) return null;

  let improved = true;
  while (improved) {
    improved = false;
    const selected = new Set(best);
    const unselected = [...candidateCoverage.keys()].filter((node) => (
      !fixedNodes.has(node) && !selected.has(node) && candidateCoverage[node].length > 0
    ));
    for (const candidate of unselected.slice(0, maximumCandidateTrials)) {
      const augmented = [...best, candidate];
      const alternative = pruneOrders
        .map((order) => pruneAdditionalSeed(
          augmented,
          distanceRows,
          demandGroups,
          fixedLocations,
          threshold,
          order,
          prepared,
        ))
        .filter(Boolean)
        .sort((left, right) => left.length - right.length || left.join(",").localeCompare(right.join(",")))[0];
      if (alternative && alternative.length < best.length) {
        best = alternative;
        improved = true;
        break;
      }
    }
  }
  return best;
}

function residualPackingLowerBound(distanceRows, demandGroups, fixedLocations, threshold) {
  const fixedCoverageCounts = buildFixedCoverageCounts(distanceRows, demandGroups, fixedLocations, threshold);
  const residual = [...demandGroups.keys()].filter((demand) => fixedCoverageCounts[demand] === 0);
  const degrees = new Map(residual.map((demand) => {
    let degree = 0;
    for (const other of residual) {
      if (other !== demand && distanceRows[demand][demandGroups[other].graphNode] <= 2 * threshold) degree += 1;
    }
    return [demand, degree];
  }));
  const ordered = residual.sort((left, right) => degrees.get(left) - degrees.get(right) || left - right);
  const packed = [];
  for (const demand of ordered) {
    if (packed.every((selected) => (
      distanceRows[demand][demandGroups[selected].graphNode] > 2 * threshold
    ))) {
      packed.push(demand);
    }
  }
  return packed.length;
}

function sortAdditionalNodes(nodes, graph) {
  return [...nodes].sort((left, right) => (
    graph.nodes[right].latitude - graph.nodes[left].latitude
    || graph.nodes[left].longitude - graph.nodes[right].longitude
    || left - right
  ));
}

function makeAdditionalLocations(nodes, graph, threshold) {
  return sortAdditionalNodes(nodes, graph).map((graphNode, index) => ({
    id: `model-${threshold}-${String(index + 1).padStart(2, "0")}`,
    kind: "additional-model-site",
    accessScope: "public",
    status: "proposed",
    graphNode,
    lat: graph.nodes[graphNode].latitude,
    lon: graph.nodes[graphNode].longitude,
    coordinateMeaning: "search anchor on reconstructed walking graph; not a build-ready pin",
  }));
}

function nearestLocationForDemand(distanceRow, demandGroup, publicLocations, privateById) {
  let nearestLocation = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const location of publicLocations) {
    const distance = distanceRow[location.graphNode];
    if (distance < nearestDistance) {
      nearestLocation = location;
      nearestDistance = distance;
    }
  }
  for (const locationId of demandGroup.allowedPrivateLocationIds) {
    const location = privateById.get(locationId);
    if (!location) continue;
    const distance = distanceRow[location.graphNode];
    if (distance < nearestDistance) {
      nearestLocation = location;
      nearestDistance = distance;
    }
  }
  return { nearestLocation, nearestDistance };
}

function evaluateScenario(distanceRows, demandGroups, fixedLocations, additionalLocations, threshold) {
  const publicLocations = [
    ...fixedLocations.filter(({ accessScope }) => accessScope === "public"),
    ...additionalLocations,
  ];
  const privateById = new Map(fixedLocations
    .filter(({ accessScope }) => accessScope === "private")
    .map((location) => [location.id, location]));
  const distances = [];
  const counts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0,
  };
  const assignedHouseholdsByLocation = Object.fromEntries(
    [...fixedLocations, ...additionalLocations].map(({ id }) => [id, 0]),
  );
  for (let demand = 0; demand < demandGroups.length; demand += 1) {
    const { nearestLocation, nearestDistance } = nearestLocationForDemand(
      distanceRows[demand],
      demandGroups[demand],
      publicLocations,
      privateById,
    );
    const householdCount = demandGroups[demand].houseIds.length;
    if (nearestLocation) assignedHouseholdsByLocation[nearestLocation.id] += householdCount;
    counts[getCoverageStatus(nearestDistance)] += householdCount;
    for (let index = 0; index < householdCount; index += 1) distances.push(nearestDistance);
  }
  const finiteDistances = distances.filter(Number.isFinite).sort((left, right) => left - right);
  const sum = finiteDistances.reduce((total, distance) => total + distance, 0);
  return {
    maximumWalkingDistanceTargetM: threshold,
    fixedExistingLocationCount: fixedLocations.length,
    fixedPublicLocationCount: fixedLocations.filter(({ accessScope }) => accessScope === "public").length,
    fixedPrivateLocationCount: fixedLocations.filter(({ accessScope }) => accessScope === "private").length,
    additionalSiteCount: additionalLocations.length,
    totalPhysicalLocationCount: fixedLocations.length + additionalLocations.length,
    publiclyUsableLocationCount: publicLocations.length,
    maximumModeledWalkingDistanceM: round(finiteDistances.at(-1)),
    averageModeledWalkingDistanceM: round(sum / finiteDistances.length),
    p50ModeledWalkingDistanceM: round(quantile(finiteDistances, 0.5)),
    p90ModeledWalkingDistanceM: round(quantile(finiteDistances, 0.9)),
    p95ModeledWalkingDistanceM: round(quantile(finiteDistances, 0.95)),
    distanceBands: counts,
    assignedHouseholdsByLocation,
    allHouseholdsWithinTarget: finiteDistances.length === distances.length
      && finiteDistances.at(-1) <= threshold + 0.1,
  };
}

function evaluateBaseContainerCapacity(
  distanceRows,
  demandGroups,
  fixedLocations,
  additionalLocations,
  threshold,
  capacityPerContainer,
  extraContainersByLocation = {},
) {
  const locations = [...fixedLocations, ...additionalLocations];
  const source = 0;
  const demandOffset = 1;
  const locationOffset = demandOffset + demandGroups.length;
  const sink = locationOffset + locations.length;
  const flowNetwork = new Dinic(sink + 1);
  const assignmentEdges = [];

  for (let demand = 0; demand < demandGroups.length; demand += 1) {
    const householdCount = demandGroups[demand].houseIds.length;
    flowNetwork.addEdge(source, demandOffset + demand, householdCount);
    const allowedPrivateIds = new Set(demandGroups[demand].allowedPrivateLocationIds);
    for (let location = 0; location < locations.length; location += 1) {
      const candidate = locations[location];
      const accessAllowed = candidate.accessScope === "public" || allowedPrivateIds.has(candidate.id);
      if (!accessAllowed || distanceRows[demand][candidate.graphNode] > threshold) continue;
      const edge = flowNetwork.addEdge(
        demandOffset + demand,
        locationOffset + location,
        householdCount,
        { demand, location },
      );
      assignmentEdges.push(edge);
    }
  }
  for (let location = 0; location < locations.length; location += 1) {
    const containerCount = 1 + (extraContainersByLocation[locations[location].id] ?? 0);
    flowNetwork.addEdge(locationOffset + location, sink, capacityPerContainer * containerCount);
  }

  const assignedHouseholdCount = flowNetwork.maximumFlow(source, sink);
  const assignedHouseholdsByLocation = Object.fromEntries(locations.map(({ id }) => [id, 0]));
  for (const edge of assignmentEdges) {
    const used = edge.originalCapacity - edge.capacity;
    if (used > 0) assignedHouseholdsByLocation[locations[edge.metadata.location].id] += used;
  }
  const requiredHouseholdCount = demandGroups.reduce((total, group) => total + group.houseIds.length, 0);
  const extraContainerCount = Object.values(extraContainersByLocation)
    .reduce((total, count) => total + count, 0);
  const feasible = assignedHouseholdCount === requiredHouseholdCount;
  return {
    capacityPerContainerAddressEquivalents: capacityPerContainer,
    requiredMinimumContainersByLocationRule: locations.length,
    extraContainerCount,
    testedContainerCount: locations.length + extraContainerCount,
    extraContainersByLocation,
    nominalTotalCapacity: (locations.length + extraContainerCount) * capacityPerContainer,
    assignedHouseholdCount,
    unassignedHouseholdCount: requiredHouseholdCount - assignedHouseholdCount,
    feasibleWithOneContainerPerLocation: feasible && extraContainerCount === 0,
    feasible,
    assignedHouseholdsByLocation,
    limitation: "Address-equivalent capacity is a sensitivity parameter, not observed waste volume or fill-rate data; the feasible max-flow assignment does not minimize walking distance.",
  };
}

function findMinimumContainerCapacity(
  distanceRows,
  demandGroups,
  fixedLocations,
  additionalLocations,
  threshold,
  capacityPerContainer,
  maximumExtraContainers = 5,
) {
  const locations = [...fixedLocations, ...additionalLocations];
  let testedDistributions = 0;
  let solution = null;

  function testDistribution(indices) {
    const extraContainersByLocation = {};
    for (const index of indices) {
      const id = locations[index].id;
      extraContainersByLocation[id] = (extraContainersByLocation[id] ?? 0) + 1;
    }
    testedDistributions += 1;
    const result = evaluateBaseContainerCapacity(
      distanceRows,
      demandGroups,
      fixedLocations,
      additionalLocations,
      threshold,
      capacityPerContainer,
      extraContainersByLocation,
    );
    if (result.feasible) solution = result;
  }

  for (let extraCount = 0; extraCount <= maximumExtraContainers && !solution; extraCount += 1) {
    if (extraCount === 0) {
      testDistribution([]);
      continue;
    }
    const indices = new Array(extraCount).fill(0);
    const enumerate = (depth, minimumIndex) => {
      if (solution) return;
      if (depth === extraCount) {
        testDistribution(indices);
        return;
      }
      for (let index = minimumIndex; index < locations.length && !solution; index += 1) {
        indices[depth] = index;
        enumerate(depth + 1, index);
      }
    };
    enumerate(0, 0);
  }

  if (!solution) {
    const base = evaluateBaseContainerCapacity(
      distanceRows,
      demandGroups,
      fixedLocations,
      additionalLocations,
      threshold,
      capacityPerContainer,
    );
    return {
      ...base,
      exactMinimumProven: false,
      testedDistributions,
      searchLimitExtraContainers: maximumExtraContainers,
      exactness: `No feasible distribution was found through ${maximumExtraContainers} extra bins; no exact minimum is claimed.`,
    };
  }
  return {
    ...solution,
    exactMinimumProven: true,
    testedDistributions,
    searchLimitExtraContainers: maximumExtraContainers,
    exactness: `Exact for the stated fixed-site and capacity model: every smaller multiset of extra-bin placements was infeasible and integral max-flow proves this allocation feasible.`,
  };
}

function traceRouteGeometry(startNode, endNode, previous, graph) {
  const path = [];
  let current = startNode;
  const seen = new Set();
  while (current >= 0 && !seen.has(current)) {
    seen.add(current);
    path.push([graph.nodes[current].latitude, graph.nodes[current].longitude]);
    if (current === endNode) return path;
    current = previous[current];
  }
  return [];
}

const currentCoverage = readJson(new URL("data/places/warmenhuizen/house-coverage.json", REPO_DIR));
const sourceContainers = readJson(new URL("data/places/warmenhuizen/container-locations.json", REPO_DIR));
const priorUnconstrainedResult = readJson(new URL(PRIOR_UNCONSTRAINED_RESULT, REPORT_DIR));
let historicalSnapshot;
try {
  historicalSnapshot = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
  throw new Error(
    `Pipe the historical route snapshot into this script: git show ${ROUTE_SNAPSHOT} | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/optimize-with-fixed-existing.mjs`,
    { cause: error },
  );
}

const existingSourceContainers = sourceContainers.filter((container) => (
  container.streams.some(({ type, status }) => (
    status === "existing" && (type === "rest" || type === "semi-rest")
  ))
));
const graph = buildGraph(historicalSnapshot);
const fixedLocations = existingSourceContainers.map((container) => {
  const resolved = resolveExistingGraphNode(container, graph);
  const graphCoordinate = graph.nodes[resolved.graphNode];
  return {
    id: container.id,
    kind: "existing",
    status: "existing",
    address: container.address,
    hvcContainerId: container.hvcContainerId ?? null,
    accessScope: container.access?.scope === "private" ? "private" : "public",
    accessLabel: container.access?.label ?? null,
    allowedAddresses: container.access?.allowedAddresses ?? null,
    lat: container.lat,
    lon: container.lon,
    graphNode: resolved.graphNode,
    graphLat: graphCoordinate.latitude,
    graphLon: graphCoordinate.longitude,
    graphSnapDistanceM: round(haversineMeters(
      { latitude: container.lat, longitude: container.lon },
      graphCoordinate,
    )),
    graphNodeResolution: resolved.resolution,
    historicalEndpointVoteCount: resolved.voteCount,
  };
});

const oldById = new Map(historicalSnapshot.houses.map((house) => [house.id, house]));
const demandByKey = new Map();
const demandIndexByHouseId = new Map();
for (const house of currentCoverage.houses) {
  const historicalHouse = oldById.get(house.id);
  const geometry = historicalHouse?.nearestContainers?.find(({ routeGeometry }) => routeGeometry?.length)?.routeGeometry;
  if (!geometry) throw new Error(`Missing historical route geometry for ${house.id}`);
  const graphNode = graph.nodeIndexes.get(nodeKey(geometry[0][0], geometry[0][1]));
  if (graphNode === undefined) throw new Error(`Missing reconstructed graph node for ${house.id}`);
  const allowedPrivateLocationIds = fixedLocations
    .filter(({ accessScope, allowedAddresses }) => (
      accessScope === "private" && isAddressAllowedByRules(house.address, allowedAddresses)
    ))
    .map(({ id }) => id)
    .sort();
  const key = `${graphNode}|${allowedPrivateLocationIds.join(",")}`;
  if (!demandByKey.has(key)) {
    demandByKey.set(key, { graphNode, allowedPrivateLocationIds, houseIds: [] });
  }
  demandByKey.get(key).houseIds.push(house.id);
}

const demandGroups = [...demandByKey.values()];
for (let index = 0; index < demandGroups.length; index += 1) {
  for (const houseId of demandGroups[index].houseIds) demandIndexByHouseId.set(houseId, index);
}
const distanceRows = demandGroups.map(({ graphNode }) => dijkstra(graph.adjacency, graphNode).distances);

const scenarios = [];
const scenarioInternals = new Map();
for (const threshold of THRESHOLDS_M) {
  const { selectedNodes: residualGreedyNodes, initiallyUncoveredGroups } = greedyAdditionalCover(
    distanceRows,
    demandGroups,
    fixedLocations,
    threshold,
  );
  const priorScenario = priorUnconstrainedResult.scenarios.find(({ maximumWalkingDistanceM }) => (
    maximumWalkingDistanceM === threshold
  ));
  const seedResults = [
    { name: "fixed-residual-greedy", nodes: residualGreedyNodes },
    ...(priorScenario ? [{
      name: "prior-unconstrained-greedy",
      nodes: priorScenario.selectedNodes.map(({ node }) => node),
    }] : []),
  ].map((seed) => ({
    ...seed,
    prunedNodes: pruneAdditionalSeed(
      seed.nodes,
      distanceRows,
      demandGroups,
      fixedLocations,
      threshold,
      "reverse-seed",
    ),
  })).filter(({ prunedNodes }) => prunedNodes);
  if (threshold === DETAIL_THRESHOLD_M) {
    for (const seed of seedResults) {
      seed.improvedNodes = improveAdditionalSeed(
        seed.prunedNodes,
        distanceRows,
        demandGroups,
        fixedLocations,
        threshold,
        24,
      );
    }
  }
  const bestSeed = seedResults.sort((left, right) => (
    (left.improvedNodes?.length ?? left.prunedNodes.length)
      - (right.improvedNodes?.length ?? right.prunedNodes.length)
    || left.name.localeCompare(right.name)
  ))[0];
  const selectedNodes = bestSeed.improvedNodes ?? bestSeed.prunedNodes;
  const additionalLocations = makeAdditionalLocations(selectedNodes, graph, threshold);
  const evaluation = evaluateScenario(
    distanceRows,
    demandGroups,
    fixedLocations,
    additionalLocations,
    threshold,
  );
  const packingLowerBound = residualPackingLowerBound(
    distanceRows,
    demandGroups,
    fixedLocations,
    threshold,
  );
  const householdsAlreadyCoveredByExisting = currentCoverage.houses.length
    - initiallyUncoveredGroups.reduce((total, demand) => total + demandGroups[demand].houseIds.length, 0);
  scenarios.push({
    ...evaluation,
    householdsWithinTargetUsingExistingOnly: householdsAlreadyCoveredByExisting,
    householdsRequiringAdditionalCoverage: currentCoverage.houses.length - householdsAlreadyCoveredByExisting,
    additionalSitePackingLowerBound: packingLowerBound,
    additionalSiteHeuristicGap: additionalLocations.length - packingLowerBound,
    selectedHeuristic: bestSeed.name,
    heuristicStarts: seedResults.map((seed) => ({
      name: seed.name,
      inputSiteCount: seed.nodes.length,
      fixedAwarePrunedSiteCount: seed.prunedNodes.length,
      ...(seed.improvedNodes ? { localImprovementSiteCount: seed.improvedNodes.length } : {}),
    })),
    selectedAdditionalSites: additionalLocations,
  });
  scenarioInternals.set(threshold, { selectedNodes, additionalLocations });
}

const detailAdditionalLocations = scenarioInternals.get(DETAIL_THRESHOLD_M).additionalLocations;
const capacitySensitivity225M = [100, 75].map((capacityPerContainer) => (
  findMinimumContainerCapacity(
    distanceRows,
    demandGroups,
    fixedLocations,
    detailAdditionalLocations,
    DETAIL_THRESHOLD_M,
    capacityPerContainer,
  )
));

const output = {
  generatedAt: new Date().toISOString(),
  inputs: {
    currentCoverageGeneratedAt: currentCoverage.generatedAt,
    historicalRouteSnapshot: ROUTE_SNAPSHOT,
    residentialAddressCount: currentCoverage.houses.length,
    sourceContainerFile: "data/places/warmenhuizen/container-locations.json",
    fixedExistingRule: "a rest or semi-rest stream with status existing",
  },
  fixedExistingLocations: fixedLocations,
  graph: {
    nodes: graph.nodes.length,
    undirectedEdges: graph.edgeCount,
    uniqueDemandGroups: demandGroups.length,
    weight: "haversine length of deduplicated historical OSRM route segments",
  },
  method: {
    decision: "Keep every existing HVC rest/semi-rest location fixed and add public search anchors until every residential address is within the target graph distance.",
    privateAccess: "WH23 and WH24 remain physically present but only cover source addresses allowed by their access rules.",
    upperBound: "weighted greedy residual set cover followed by reverse redundancy pruning; fixed locations are never pruned",
    lowerBound: "greedy pairwise network-distance packing among demand not covered by fixed accessible locations",
    candidateMeaning: "every reconstructed route-graph node is a mathematical search anchor and still requires municipal-land, utility, safety and HVC vehicle checks",
    capacity: "The spatial frontier is uncapacitated. A separate 225 m max-flow sensitivity tests 100 and 75 address-equivalents per bin with at least one bin at every fixed and additional location; these parameters are not observed waste volumes.",
    routeDistance: ROUTE_MODEL,
    caveat: "The added-site result is a deterministic feasible upper bound, not a certificate of global minimum or buildability.",
  },
  scenarios,
  capacitySensitivity225M,
};

writeFileSync(
  new URL("fixed-existing-route-optimization.json", REPORT_DIR),
  `${JSON.stringify(output, null, 2)}\n`,
);

const detailedScenario = scenarios.find(({ maximumWalkingDistanceTargetM }) => (
  maximumWalkingDistanceTargetM === DETAIL_THRESHOLD_M
));
const publicLocations = [
  ...fixedLocations.filter(({ accessScope }) => accessScope === "public"),
  ...detailAdditionalLocations,
];
const privateLocations = fixedLocations.filter(({ accessScope }) => accessScope === "private");
const privateById = new Map(privateLocations.map((location) => [location.id, location]));
const publicRoutes = multiSourceDijkstra(graph.adjacency, publicLocations);
const privateRoutes = new Map(privateLocations.map((location) => [
  location.id,
  dijkstra(graph.adjacency, location.graphNode, true),
]));
const houses = currentCoverage.houses.map((house) => {
  const demandIndex = demandIndexByHouseId.get(house.id);
  const demand = demandGroups[demandIndex];
  const startNode = demand.graphNode;
  let nearestLocation = publicLocations[publicRoutes.sourceIndexes[startNode]];
  let walkingDistance = publicRoutes.distances[startNode];
  let previous = publicRoutes.previous;
  for (const locationId of demand.allowedPrivateLocationIds) {
    const location = privateById.get(locationId);
    const route = privateRoutes.get(locationId);
    if (location && route.distances[startNode] < walkingDistance) {
      nearestLocation = location;
      walkingDistance = route.distances[startNode];
      previous = route.previous;
    }
  }
  if (!nearestLocation || !Number.isFinite(walkingDistance)) {
    return {
      id: house.id,
      address: house.address,
      postcode: house.postcode,
      lat: house.lat,
      lon: house.lon,
      nearestLocationId: null,
      nearestLocationKind: null,
      nearestLocationAccessScope: null,
      walkingDistanceM: null,
      coverageStatus: "unreachable",
      routeGeometry: [],
    };
  }
  return {
    id: house.id,
    address: house.address,
    postcode: house.postcode,
    lat: house.lat,
    lon: house.lon,
    nearestLocationId: nearestLocation.id,
    nearestLocationKind: nearestLocation.kind,
    nearestLocationAccessScope: nearestLocation.accessScope,
    walkingDistanceM: round(walkingDistance, 2),
    coverageStatus: getCoverageStatus(walkingDistance),
    routeGeometry: traceRouteGeometry(startNode, nearestLocation.graphNode, previous, graph),
  };
});

const detailedOutput = {
  generatedAt: output.generatedAt,
  scenario: detailedScenario,
  capacitySensitivity: capacitySensitivity225M,
  locations: [...fixedLocations, ...detailAdditionalLocations],
  houses,
  method: {
    routeDistance: ROUTE_MODEL,
    geometry: "Graph-node path from the historical house route snap to the selected location route endpoint/search anchor.",
    access: "Public locations are eligible for all houses; private existing locations only for their configured allowed addresses.",
    caveat: "Geometry and distance omit the short straight access legs between exact BAG/container coordinates and their historical graph snaps. They are suitable for comparative screening, not engineering measurement.",
  },
};

writeFileSync(
  new URL("fixed-existing-household-coverage-225.json", REPORT_DIR),
  `${JSON.stringify(detailedOutput)}\n`,
);

console.log(JSON.stringify({
  fixedExistingLocations: fixedLocations.map(({ id, accessScope, graphSnapDistanceM }) => ({
    id,
    accessScope,
    graphSnapDistanceM,
  })),
  scenarios: scenarios.map(({ selectedAdditionalSites: _sites, assignedHouseholdsByLocation: _assignments, ...scenario }) => scenario),
  detailedHouseholds: houses.length,
}, null, 2));
