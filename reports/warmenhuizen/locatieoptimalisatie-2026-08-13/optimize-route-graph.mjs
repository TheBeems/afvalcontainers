#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const ROUTE_SNAPSHOT = "9631171:data/places/warmenhuizen/house-coverage.json";
const THRESHOLDS = [100, 125, 150, 175, 200, 225, 250, 275];
const EARTH_RADIUS_M = 6_371_008.8;

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

function buildGraph(snapshot) {
  const nodes = [];
  const nodeIndexes = new Map();
  const edges = new Map();

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

  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (const { from, to, weight } of edges.values()) {
    adjacency[from].push({ node: to, weight });
    adjacency[to].push({ node: from, weight });
  }
  return { nodes, nodeIndexes, adjacency, edgeCount: edges.size };
}

function dijkstra(adjacency, start) {
  const distances = new Float32Array(adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const queue = new MinHeap();
  queue.push({ node: start, distance: 0 });
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < distances[edge.node]) {
        distances[edge.node] = nextDistance;
        queue.push({ node: edge.node, distance: distances[edge.node] });
      }
    }
  }
  return distances;
}

function greedyCover(distanceRows, demandWeights, threshold) {
  const candidateCoverage = Array.from({ length: distanceRows[0].length }, () => []);
  for (let demand = 0; demand < distanceRows.length; demand += 1) {
    const distances = distanceRows[demand];
    for (let candidate = 0; candidate < distances.length; candidate += 1) {
      if (distances[candidate] <= threshold) candidateCoverage[candidate].push(demand);
    }
  }

  const uncovered = new Uint8Array(distanceRows.length);
  uncovered.fill(1);
  let uncoveredCount = distanceRows.length;
  const selected = [];
  while (uncoveredCount > 0) {
    let bestCandidate = -1;
    let bestWeight = -1;
    let bestCount = -1;
    for (let candidate = 0; candidate < candidateCoverage.length; candidate += 1) {
      let weight = 0;
      let count = 0;
      for (const demand of candidateCoverage[candidate]) {
        if (!uncovered[demand]) continue;
        weight += demandWeights[demand];
        count += 1;
      }
      if (weight > bestWeight || (weight === bestWeight && count > bestCount)) {
        bestCandidate = candidate;
        bestWeight = weight;
        bestCount = count;
      }
    }
    if (bestCandidate < 0 || bestCount <= 0) throw new Error(`No covering candidate at ${threshold} m`);
    selected.push(bestCandidate);
    for (const demand of candidateCoverage[bestCandidate]) {
      if (uncovered[demand]) {
        uncovered[demand] = 0;
        uncoveredCount -= 1;
      }
    }
  }

  const coverCounts = new Uint16Array(distanceRows.length);
  for (const candidate of selected) {
    for (const demand of candidateCoverage[candidate]) coverCounts[demand] += 1;
  }
  const retained = [];
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const candidate = selected[index];
    const removable = candidateCoverage[candidate].every((demand) => coverCounts[demand] > 1);
    if (removable) {
      for (const demand of candidateCoverage[candidate]) coverCounts[demand] -= 1;
    } else {
      retained.push(candidate);
    }
  }
  retained.reverse();
  return retained;
}

function packingLowerBound(distanceRows, threshold) {
  const degrees = distanceRows.map((distances, demand) => {
    let degree = 0;
    for (let other = 0; other < distanceRows.length; other += 1) {
      if (other !== demand && distances[demandNodes[other]] <= 2 * threshold) degree += 1;
    }
    return degree;
  });
  const orderedDemands = [...distanceRows.keys()].sort((left, right) => (
    degrees[left] - degrees[right] || left - right
  ));
  const selectedDemands = [];
  for (const demand of orderedDemands) {
    if (selectedDemands.every((selected) => distanceRows[demand][demandNodes[selected]] > 2 * threshold)) {
      selectedDemands.push(demand);
    }
  }
  return selectedDemands.length;
}

const current = readJson(new URL("data/places/warmenhuizen/house-coverage.json", REPO_DIR));
let snapshot;
try {
  snapshot = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
  throw new Error(`Pipe the historical route snapshot into this script: git show ${ROUTE_SNAPSHOT} | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/optimize-route-graph.mjs`, { cause: error });
}
const currentIds = new Set(current.houses.map(({ id }) => id));
const oldById = new Map(snapshot.houses.map((house) => [house.id, house]));
const graph = buildGraph(snapshot);
const demandByNode = new Map();

for (const house of current.houses) {
  const oldHouse = oldById.get(house.id);
  const geometry = oldHouse?.nearestContainers?.find(({ routeGeometry }) => routeGeometry?.length)?.routeGeometry;
  if (!geometry) throw new Error(`Missing historical route for ${house.id}`);
  const key = nodeKey(geometry[0][0], geometry[0][1]);
  const node = graph.nodeIndexes.get(key);
  if (node === undefined) throw new Error(`Missing graph node for ${house.id}`);
  if (!demandByNode.has(node)) demandByNode.set(node, []);
  demandByNode.get(node).push(house.id);
}

const demandNodes = [...demandByNode.keys()];
const demandWeights = demandNodes.map((node) => demandByNode.get(node).length);
const distanceRows = demandNodes.map((node) => dijkstra(graph.adjacency, node));
const scenarios = THRESHOLDS.map((threshold) => {
  const selected = greedyCover(distanceRows, demandWeights, threshold);
  return {
    maximumWalkingDistanceM: threshold,
    foundSiteCount: selected.length,
    packingLowerBound: packingLowerBound(distanceRows, threshold),
    selectedNodes: selected.map((node) => ({ node, ...graph.nodes[node] })),
  };
});

const result = {
  generatedAt: new Date().toISOString(),
  inputs: {
    currentCoverageGeneratedAt: current.generatedAt,
    historicalRouteSnapshot: ROUTE_SNAPSHOT,
    currentResidentialAddresses: current.houses.length,
    currentIdsPresentInHistoricalSnapshot: [...currentIds].every((id) => oldById.has(id)),
  },
  graph: {
    nodes: graph.nodes.length,
    undirectedEdges: graph.edgeCount,
    uniqueDemandNodes: demandNodes.length,
    weight: "haversine length of deduplicated historical OSRM route segments",
  },
  method: {
    upperBound: "weighted greedy set cover followed by reverse redundancy pruning",
    lowerBound: "greedy demand packing with pairwise network distance greater than twice the threshold",
    caveat: "Both bounds are deterministic certificates for this reconstructed graph, not proof that the upper bound is globally minimal or physically buildable.",
  },
  scenarios,
};

writeFileSync(new URL("route-graph-optimization.json", REPORT_DIR), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ graph: result.graph, scenarios: scenarios.map(({ selectedNodes: _nodes, ...scenario }) => scenario) }, null, 2));
