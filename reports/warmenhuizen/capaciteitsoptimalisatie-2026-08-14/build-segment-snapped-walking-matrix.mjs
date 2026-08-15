#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(reportDirectory, '../../..');
const priorReport = resolve(reportDirectory, '../locatieoptimalisatie-2026-08-13');
const paths = {
  coverage: resolve(projectRoot, 'data/places/warmenhuizen/house-coverage.json'),
  containers: resolve(projectRoot, 'data/places/warmenhuizen/container-locations.json'),
  sourceMatrix: resolve(priorReport, 'walking-matrix.json'),
  roads: resolve(priorReport, 'osm-highways.json'),
  output: resolve(reportDirectory, 'walking-matrix-segment-snapped.json')
};

const EXCLUDED_HIGHWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'raceway'
]);
const EXCLUDED_ACCESS = new Set(['no', 'private']);
const STEPS_WEIGHT_MULTIPLIER = 1.35;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function haversineMeters(left, right) {
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(right.lat - left.lat);
  const longitudeDelta = toRadians(right.lon - left.lon);
  const leftLatitude = toRadians(left.lat);
  const rightLatitude = toRadians(right.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(haversine));
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
}

function buildGraph(roads) {
  const nodes = new Map();
  const edges = new Map();
  const segments = [];

  for (const way of roads.elements) {
    if (EXCLUDED_HIGHWAYS.has(way.tags?.highway) || EXCLUDED_ACCESS.has(way.tags?.access)) continue;
    for (let index = 0; index < way.nodes.length; index += 1) {
      nodes.set(way.nodes[index], { id: way.nodes[index], ...way.geometry[index] });
    }
    for (let index = 1; index < way.nodes.length; index += 1) {
      const from = way.nodes[index - 1];
      const to = way.nodes[index];
      if (from === to) continue;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const multiplier = way.tags?.highway === 'steps' ? STEPS_WEIGHT_MULTIPLIER : 1;
      const length = haversineMeters(nodes.get(from), nodes.get(to));
      const weight = length * multiplier;
      const previous = edges.get(key);
      if (!previous || weight < previous.weight) {
        edges.set(key, { from, to, length, weight, highway: way.tags?.highway, name: way.tags?.name ?? null });
      }
    }
  }

  const nodeIds = [...nodes.keys()];
  const nodeIndexById = new Map(nodeIds.map((id, index) => [id, index]));
  const adjacency = Array.from({ length: nodeIds.length }, () => []);
  for (const edge of edges.values()) {
    const fromIndex = nodeIndexById.get(edge.from);
    const toIndex = nodeIndexById.get(edge.to);
    adjacency[fromIndex].push({ node: toIndex, weight: edge.weight });
    adjacency[toIndex].push({ node: fromIndex, weight: edge.weight });
    segments.push({
      ...edge,
      fromIndex,
      toIndex,
      fromCoordinate: nodes.get(edge.from),
      toCoordinate: nodes.get(edge.to)
    });
  }

  return { nodes, nodeIds, adjacency, segments };
}

function snapToNearestSegment(point, segments) {
  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE * Math.cos(point.lat * Math.PI / 180);
  let best = null;
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const startX = (segment.fromCoordinate.lon - point.lon) * metersPerLongitudeDegree;
    const startY = (segment.fromCoordinate.lat - point.lat) * METERS_PER_LATITUDE_DEGREE;
    const endX = (segment.toCoordinate.lon - point.lon) * metersPerLongitudeDegree;
    const endY = (segment.toCoordinate.lat - point.lat) * METERS_PER_LATITUDE_DEGREE;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const squaredLength = deltaX ** 2 + deltaY ** 2;
    const fraction = squaredLength === 0
      ? 0
      : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / squaredLength));
    const projectedX = startX + fraction * deltaX;
    const projectedY = startY + fraction * deltaY;
    const accessDistance = Math.hypot(projectedX, projectedY);
    if (!best || accessDistance < best.accessDistance) {
      best = { segmentIndex, fraction, accessDistance };
    }
  }
  return best;
}

function dijkstraFromSnap(graph, snap) {
  const segment = graph.segments[snap.segmentIndex];
  const distances = new Float64Array(graph.adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const queue = new MinHeap();
  const sources = [
    { node: segment.fromIndex, distance: snap.accessDistance + snap.fraction * segment.weight },
    { node: segment.toIndex, distance: snap.accessDistance + (1 - snap.fraction) * segment.weight }
  ];
  for (const source of sources) {
    if (source.distance >= distances[source.node]) continue;
    distances[source.node] = source.distance;
    queue.push(source);
  }
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of graph.adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance >= distances[edge.node]) continue;
      distances[edge.node] = nextDistance;
      queue.push({ node: edge.node, distance: nextDistance });
    }
  }
  return distances;
}

function distanceBetweenSnaps(graph, sourceSnap, sourceDistances, destinationSnap) {
  const segment = graph.segments[destinationSnap.segmentIndex];
  const viaFrom = sourceDistances[segment.fromIndex]
    + destinationSnap.accessDistance
    + destinationSnap.fraction * segment.weight;
  const viaTo = sourceDistances[segment.toIndex]
    + destinationSnap.accessDistance
    + (1 - destinationSnap.fraction) * segment.weight;
  let distance = Math.min(viaFrom, viaTo);
  if (sourceSnap.segmentIndex === destinationSnap.segmentIndex) {
    distance = Math.min(
      distance,
      sourceSnap.accessDistance
        + destinationSnap.accessDistance
        + Math.abs(sourceSnap.fraction - destinationSnap.fraction) * segment.weight
    );
  }
  return distance;
}

const coverage = readJson(paths.coverage);
const containers = readJson(paths.containers);
const sourceMatrix = readJson(paths.sourceMatrix);
const roads = readJson(paths.roads);
const graph = buildGraph(roads);
const wh24 = containers.find(({ id }) => id === 'WH24');
if (!wh24) throw new Error('WH24 is missing from container-locations.json.');

const candidates = [
  ...sourceMatrix.candidates,
  {
    id: wh24.id,
    address: wh24.address,
    lat: wh24.lat,
    lon: wh24.lon,
    sourceType: wh24.sourceType,
    exactExistingCoordinate: true,
    generalPublicEligible: true,
    privateAccess: null,
    modelScenarios: [],
    nearbyModelAddresses: [wh24.address]
  }
];
const houseSnaps = coverage.houses.map((house) => snapToNearestSegment(house, graph.segments));
const candidateSnaps = candidates.map((candidate) => snapToNearestSegment(candidate, graph.segments));
const distances = Array.from({ length: coverage.houses.length }, () => Array(candidates.length));

candidateSnaps.forEach((candidateSnap, candidateIndex) => {
  const networkDistances = dijkstraFromSnap(graph, candidateSnap);
  houseSnaps.forEach((houseSnap, houseIndex) => {
    distances[houseIndex][candidateIndex] = round(
      distanceBetweenSnaps(graph, candidateSnap, networkDistances, houseSnap),
      1
    );
  });
});

const output = {
  generatedAt: new Date().toISOString(),
  source: {
    dataset: 'OpenStreetMap highway ways from the committed osm-highways.json snapshot',
    bbox: sourceMatrix.source.bbox,
    profile: 'pedestrian, bidirectional approximation with nearest-segment snapping',
    excludedHighways: [...EXCLUDED_HIGHWAYS],
    excludedAccess: [...EXCLUDED_ACCESS],
    stepsWeightMultiplier: STEPS_WEIGHT_MULTIPLIER,
    limitation: 'BAG points and container anchors are connected to their nearest eligible OSM segment by a straight access leg; this remains a screening model, not a surveyed door-to-container route.'
  },
  graph: {
    nodes: graph.nodeIds.length,
    undirectedEdges: graph.segments.length,
    directedEdges: graph.segments.length * 2,
    snapMethod: 'nearest eligible segment with projected along-segment distance'
  },
  predecessorMatrix: 'reports/warmenhuizen/locatieoptimalisatie-2026-08-13/walking-matrix.json',
  houseIds: coverage.houses.map(({ id }) => id),
  candidateIds: candidates.map(({ id }) => id),
  candidates: candidates.map((candidate, index) => ({
    ...candidate,
    footNetworkSnapDistance: round(candidateSnaps[index].accessDistance, 1),
    footNetworkRoadNames: [graph.segments[candidateSnaps[index].segmentIndex].name].filter(Boolean)
  })),
  distances
};

writeFileSync(paths.output, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({
  output: paths.output,
  houses: output.houseIds.length,
  candidates: output.candidateIds.length,
  graph: output.graph,
  m094: Object.fromEntries(['De Baan 13', 'De Baan 15', 'De Baan 17', 'Tuinfluiterstraat 30'].map((address) => {
    const houseIndex = coverage.houses.findIndex((house) => house.address === address);
    const candidateIndex = output.candidateIds.indexOf('M094');
    return [address, output.distances[houseIndex][candidateIndex]];
  }))
}, null, 2));
