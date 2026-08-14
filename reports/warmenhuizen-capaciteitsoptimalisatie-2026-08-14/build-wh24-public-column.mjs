#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(reportDirectory, '../..');
const paths = {
  coverage: resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json'),
  containers: resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json'),
  network: resolve(projectRoot, 'reports/warmenhuizen-containeroptimalisatie-2026-08-13/osm-highways.json'),
  output: resolve(reportDirectory, 'wh24-public-column.json')
};

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function haversineMeters(left, right) {
  const earthRadiusMeters = 6_371_008.8;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(right.lon - left.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

function isPedestrianWay(way) {
  const highway = way.tags?.highway;
  if (!highway || way.tags?.area === 'yes') return false;
  if (['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'raceway'].includes(highway)) return false;
  return !['no', 'private'].includes(way.tags?.access) && way.tags?.foot !== 'no';
}

function edgeWeight(left, right, tags) {
  const distance = haversineMeters(left, right);
  return tags.highway === 'steps' ? distance * 1.35 : distance;
}

function buildGraph(overpassData) {
  const coordinateByNodeId = new Map();
  const adjacency = new Map();
  const namesByNodeId = new Map();
  const addEdge = (from, to, weight) => {
    const edges = adjacency.get(from) ?? [];
    edges.push({ nodeId: to, weight });
    adjacency.set(from, edges);
  };

  for (const way of overpassData.elements.filter((element) => element.type === 'way' && isPedestrianWay(element))) {
    if (!Array.isArray(way.nodes) || !Array.isArray(way.geometry) || way.nodes.length !== way.geometry.length) continue;
    for (let index = 0; index < way.nodes.length; index += 1) {
      const nodeId = way.nodes[index];
      const coordinate = { lat: way.geometry[index].lat, lon: way.geometry[index].lon };
      coordinateByNodeId.set(nodeId, coordinate);
      if (way.tags?.name) {
        const names = namesByNodeId.get(nodeId) ?? new Set();
        names.add(way.tags.name);
        namesByNodeId.set(nodeId, names);
      }
      if (index === 0) continue;
      const previousNodeId = way.nodes[index - 1];
      const previousCoordinate = way.geometry[index - 1];
      const weight = edgeWeight(previousCoordinate, coordinate, way.tags ?? {});
      addEdge(previousNodeId, nodeId, weight);
      addEdge(nodeId, previousNodeId, weight);
    }
  }
  return { coordinateByNodeId, adjacency, namesByNodeId };
}

function nearestGraphNode(point, coordinateByNodeId) {
  let nodeId = null;
  let snapDistanceM = Infinity;
  for (const [candidateNodeId, coordinate] of coordinateByNodeId) {
    const distance = haversineMeters(point, coordinate);
    if (distance < snapDistanceM) {
      nodeId = candidateNodeId;
      snapDistanceM = distance;
    }
  }
  return { nodeId, snapDistanceM };
}

class MinHeap {
  constructor() { this.items = []; }
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
      const child = right < this.items.length && this.items[right].distance < this.items[left].distance ? right : left;
      if (this.items[child].distance >= last.distance) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return first;
  }
  get length() { return this.items.length; }
}

function dijkstra(adjacency, sourceNodeId) {
  const distances = new Map([[sourceNodeId, 0]]);
  const heap = new MinHeap();
  heap.push({ nodeId: sourceNodeId, distance: 0 });
  while (heap.length) {
    const current = heap.pop();
    if (current.distance !== distances.get(current.nodeId)) continue;
    for (const edge of adjacency.get(current.nodeId) ?? []) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < (distances.get(edge.nodeId) ?? Infinity)) {
        distances.set(edge.nodeId, nextDistance);
        heap.push({ nodeId: edge.nodeId, distance: nextDistance });
      }
    }
  }
  return distances;
}

const coverage = JSON.parse(readFileSync(paths.coverage, 'utf8'));
const containers = JSON.parse(readFileSync(paths.containers, 'utf8'));
const network = JSON.parse(readFileSync(paths.network, 'utf8'));
const wh24 = containers.find(({ id }) => id === 'WH24');
if (!wh24) throw new Error('WH24 is missing from container-locations.json.');
const { coordinateByNodeId, adjacency, namesByNodeId } = buildGraph(network);
const containerSnap = nearestGraphNode(wh24, coordinateByNodeId);
const networkDistances = dijkstra(adjacency, containerSnap.nodeId);
const distances = coverage.houses.map((house) => {
  const houseSnap = nearestGraphNode(house, coordinateByNodeId);
  const networkDistance = networkDistances.get(houseSnap.nodeId);
  return Number.isFinite(networkDistance)
    ? Number((houseSnap.snapDistanceM + networkDistance + containerSnap.snapDistanceM).toFixed(1))
    : null;
});

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  reason: 'User scenario change on 2026-08-14: fixed existing WH24 becomes publicly accessible.',
  source: {
    dataset: 'same committed OpenStreetMap Overpass snapshot and pedestrian approximation as walking-matrix.json',
    profile: 'pedestrian, bidirectional approximation',
    stepsWeightMultiplier: 1.35,
    limitation: 'The local graph does not model every legal access rule, surface, barrier or current construction condition.'
  },
  graph: {
    nodes: coordinateByNodeId.size,
    directedEdges: [...adjacency.values()].reduce((sum, edges) => sum + edges.length, 0)
  },
  candidate: {
    id: 'WH24',
    address: wh24.address,
    lat: wh24.lat,
    lon: wh24.lon,
    sourceType: 'hvc-existing-user-confirmed-public',
    exactExistingCoordinate: true,
    generalPublicEligible: true,
    footNetworkSnapDistance: Number(containerSnap.snapDistanceM.toFixed(1)),
    footNetworkRoadNames: [...(namesByNodeId.get(containerSnap.nodeId) ?? [])].sort()
  },
  houseIds: coverage.houses.map(({ id }) => id),
  distances,
  inputs: {
    coverage: { path: relative(projectRoot, paths.coverage), sha256: sha256(paths.coverage) },
    containers: { path: relative(projectRoot, paths.containers), sha256: sha256(paths.containers) },
    network: { path: relative(projectRoot, paths.network), sha256: sha256(paths.network) }
  }
};

writeFileSync(paths.output, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({
  output: relative(projectRoot, paths.output),
  candidate: output.candidate,
  householdCount: distances.length,
  routedHouseholds: distances.filter(Number.isFinite).length,
  minimumM: Math.min(...distances.filter(Number.isFinite)),
  maximumM: Math.max(...distances.filter(Number.isFinite))
}, null, 2));
