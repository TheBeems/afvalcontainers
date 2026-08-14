#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { isAddressAllowedByRules } from "../../src/shared/address.js";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);
const BASELINE_FILE = new URL("fixed-existing-household-coverage-225.json", REPORT_DIR);
const DETAIL_OUTPUT = new URL("adjusted-fixed-existing-household-coverage-225.json", REPORT_DIR);
const SUMMARY_OUTPUT = new URL("adjusted-fixed-existing-route-optimization.json", REPORT_DIR);
const TSV_OUTPUT = new URL("adjusted-fixed-existing-225-sites.tsv", REPORT_DIR);
const ROUTE_SNAPSHOT = "9631171:data/places/warmenhuizen/house-coverage.json";
const TARGET_DISTANCE_M = 225;
const EARTH_RADIUS_M = 6_371_008.8;
const REMOVED_ADDITIONAL_IDS = new Set([
  "model-225-04",
  "model-225-08",
  "model-225-24",
]);
const REPLACEMENT_NODES = new Map([
  ["model-225-13", 3282],
  ["model-225-36", 969],
]);
const TOPOLOGY_BRIDGES = [
  { from: 704, to: 679, reason: "Door de gebruiker bevestigde voetpadverbinding A4-A2 bij De Fuik." },
  { from: 266, to: 275, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 275, to: 278, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 278, to: 276, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 276, to: 274, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 274, to: 261, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 261, to: 233, reason: "Diagnostische korte aansluiting in het Baljuw/Heergewaade-cluster." },
  { from: 1722, to: 1453, reason: "Diagnostische korte aansluiting bij Heergewaade." },
  { from: 1771, to: 1729, reason: "Diagnostische korte aansluiting bij Heergewaade." },
];

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nodeKey(latitude, longitude) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function haversineMeters(left, right) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitude1 = toRadians(left.latitude ?? left.lat);
  const latitude2 = toRadians(right.latitude ?? right.lat);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = toRadians((right.longitude ?? right.lon) - (left.longitude ?? left.lon));
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(value));
}

function getCoverageStatus(distance) {
  if (!Number.isFinite(distance)) return "unreachable";
  if (distance <= 100) return "within_100";
  if (distance <= 125) return "between_100_125";
  if (distance <= 150) return "between_125_150";
  if (distance <= 275) return "between_150_275";
  return "over_275";
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
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
        if (!previous || weight < previous.weight) edges.set(key, { from, to, weight, source: "historical-route" });
      }
    }
  }

  const addedBridges = [];
  for (const bridge of TOPOLOGY_BRIDGES) {
    if (!nodes[bridge.from] || !nodes[bridge.to]) {
      throw new Error(`Topology bridge references missing node ${bridge.from}-${bridge.to}`);
    }
    const key = bridge.from < bridge.to ? `${bridge.from}:${bridge.to}` : `${bridge.to}:${bridge.from}`;
    const weight = haversineMeters(nodes[bridge.from], nodes[bridge.to]);
    const previous = edges.get(key);
    if (!previous || weight < previous.weight) {
      edges.set(key, { from: bridge.from, to: bridge.to, weight, source: "scenario-assumption" });
    }
    addedBridges.push({ ...bridge, distanceM: round(weight, 1) });
  }

  const adjacency = Array.from({ length: nodes.length }, () => []);
  for (const edge of edges.values()) {
    adjacency[edge.from].push({ node: edge.to, weight: edge.weight });
    adjacency[edge.to].push({ node: edge.from, weight: edge.weight });
  }
  return { nodes, nodeIndexes, adjacency, edgeCount: edges.size, addedBridges };
}

function dijkstra(adjacency, start) {
  const distances = new Float64Array(adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const previous = new Int32Array(adjacency.length).fill(-1);
  const queue = new MinHeap();
  queue.push({ node: start, distance: 0 });
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < distances[edge.node]) {
        distances[edge.node] = nextDistance;
        previous[edge.node] = current.node;
        queue.push({ node: edge.node, distance: nextDistance });
      }
    }
  }
  return { distances, previous };
}

function multiSourceDijkstra(adjacency, sources) {
  const distances = new Float64Array(adjacency.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(adjacency.length).fill(-1);
  const sourceIndexes = new Int32Array(adjacency.length).fill(-1);
  const queue = new MinHeap();
  sources.forEach((source, sourceIndex) => {
    if (distances[source.graphNode] === 0) return;
    distances[source.graphNode] = 0;
    sourceIndexes[source.graphNode] = sourceIndex;
    queue.push({ node: source.graphNode, distance: 0 });
  });
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.distance > distances[current.node]) continue;
    for (const edge of adjacency[current.node]) {
      const nextDistance = current.distance + edge.weight;
      if (nextDistance < distances[edge.node]) {
        distances[edge.node] = nextDistance;
        previous[edge.node] = current.node;
        sourceIndexes[edge.node] = sourceIndexes[current.node];
        queue.push({ node: edge.node, distance: nextDistance });
      }
    }
  }
  return { distances, previous, sourceIndexes };
}

function traceRouteGeometry(startNode, endNode, previous, graph) {
  const path = [];
  const seen = new Set();
  let current = startNode;
  while (current >= 0 && !seen.has(current)) {
    seen.add(current);
    path.push([graph.nodes[current].latitude, graph.nodes[current].longitude]);
    if (current === endNode) return path;
    current = previous[current];
  }
  return [];
}

function summarize(houses, field) {
  const values = houses.map((house) => house[field]).filter(Number.isFinite);
  return {
    meanM: round(values.reduce((sum, value) => sum + value, 0) / values.length, 1),
    p50M: round(quantile(values, 0.5), 1),
    p90M: round(quantile(values, 0.9), 1),
    p95M: round(quantile(values, 0.95), 1),
    maximumM: round(Math.max(...values), 1),
  };
}

function countBands(houses) {
  const counts = {
    within_100: 0,
    between_100_125: 0,
    between_125_150: 0,
    between_150_275: 0,
    over_275: 0,
    unreachable: 0,
  };
  for (const house of houses) counts[house.coverageStatus] += 1;
  return counts;
}

const currentCoverage = readJson(new URL("data/places/warmenhuizen/house-coverage.json", REPO_DIR));
const baseline = readJson(BASELINE_FILE);
const priorRecommendations = readJson(new URL("recommended-locations.json", REPORT_DIR));
const priorReferenceByNode = new Map(
  priorRecommendations.sites.map((site) => [site.node, site.referenceAddress]),
);
let historicalSnapshot;
try {
  historicalSnapshot = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
  throw new Error(
    `Pipe the historical route snapshot into this script: git show ${ROUTE_SNAPSHOT} | node reports/warmenhuizen-containeroptimalisatie-2026-08-13/build-adjusted-fixed-existing-research.mjs`,
    { cause: error },
  );
}

const graph = buildGraph(historicalSnapshot);
const historicalById = new Map(historicalSnapshot.houses.map((house) => [house.id, house]));
const houseStartNodes = new Map();
for (const house of currentCoverage.houses) {
  const historicalHouse = historicalById.get(house.id);
  const geometry = historicalHouse?.nearestContainers?.find((candidate) => candidate.routeGeometry?.length)?.routeGeometry;
  if (!geometry) throw new Error(`Missing historical route geometry for ${house.id}`);
  const graphNode = graph.nodeIndexes.get(nodeKey(geometry[0][0], geometry[0][1]));
  if (graphNode === undefined) throw new Error(`Missing graph start node for ${house.id}`);
  houseStartNodes.set(house.id, graphNode);
}

const locations = baseline.locations
  .filter((location) => !REMOVED_ADDITIONAL_IDS.has(location.id))
  .map((location) => {
    const replacementNode = REPLACEMENT_NODES.get(location.id);
    const graphNode = replacementNode ?? location.graphNode;
    const graphCoordinate = graph.nodes[graphNode];
    if (!graphCoordinate) throw new Error(`Missing graph node ${graphNode} for ${location.id}`);
    const isAdditional = location.kind === "additional-model-site";
    const result = {
      ...location,
      ...(isAdditional ? { sourceOldId: location.id } : {}),
      address: location.address ?? priorReferenceByNode.get(location.graphNode) ?? null,
      graphNode,
      lat: replacementNode === undefined ? location.lat : graphCoordinate.latitude,
      lon: replacementNode === undefined ? location.lon : graphCoordinate.longitude,
      graphLat: graphCoordinate.latitude,
      graphLon: graphCoordinate.longitude,
      accessScope: location.id === "WH24" ? "public" : location.accessScope,
      allowedAddresses: location.id === "WH24" ? null : location.allowedAddresses,
      adjustmentStatus: isAdditional ? "retained" : "fixed-existing",
      adjustmentReason: isAdditional
        ? "Ongewijzigd analytisch zoekanker uit de vaste-bestaande variant."
        : "Bestaande HVC-locatie blijft als harde randvoorwaarde staan.",
    };
    if (location.id === "WH24") {
      result.adjustmentStatus = "access-opened-public-scenario";
      result.adjustmentReason = "Volgens de gebruikersscenario-overname wordt WH24 algemeen openbaar toegankelijk.";
      result.accessLabel = "Openbaar in de bijgestelde onderzoeksvariant";
    }
    if (location.id === "model-225-13") {
      result.adjustmentStatus = "replacement-anchor-unverified-public-edge";
      result.adjustmentReason = "Vervangt de afgewezen pin op het private parkeerterrein; openbare grond en HVC-inpassing zijn nog niet bevestigd.";
      result.address = "Vervangingszoekzone nabij Veilingweg 70D";
      result.replacesGraphNode = location.graphNode;
      result.buildReadiness = "not-approved";
    }
    if (location.id === "model-225-36") {
      result.adjustmentStatus = "relocated-not-reassessed";
      result.adjustmentReason = "Circa 60 meter noord/noordoost verplaatst; luchtfoto, eigendom en HVC-inpassing moeten opnieuw worden beoordeeld.";
      result.address = "Verplaatste zoekzone noord/noordoost van Debbemeerweg 33";
      result.replacesGraphNode = location.graphNode;
      result.buildReadiness = "not-reassessed";
    }
    return result;
  });

const fixedLocations = locations.filter((location) => location.kind === "existing");
const additionalLocations = locations.filter((location) => location.kind === "additional-model-site");
const publicLocations = locations.filter((location) => location.accessScope === "public");
const privateLocations = locations.filter((location) => location.accessScope === "private");
if (fixedLocations.length !== 11 || additionalLocations.length !== 35 || locations.length !== 46) {
  throw new Error(`Expected 11 fixed and 35 additional locations, received ${fixedLocations.length} and ${additionalLocations.length}`);
}
if (privateLocations.length !== 1 || privateLocations[0].id !== "WH23") {
  throw new Error("WH23 must be the only private location in the adjusted scenario");
}

const publicRoutes = multiSourceDijkstra(graph.adjacency, publicLocations);
const privateRoutes = new Map(privateLocations.map((location) => [
  location.id,
  dijkstra(graph.adjacency, location.graphNode),
]));

const houses = currentCoverage.houses.map((house) => {
  const startNode = houseStartNodes.get(house.id);
  let nearestLocation = publicLocations[publicRoutes.sourceIndexes[startNode]];
  let graphCoreDistance = publicRoutes.distances[startNode];
  let previous = publicRoutes.previous;
  for (const location of privateLocations) {
    if (!isAddressAllowedByRules(house.address, location.allowedAddresses)) continue;
    const route = privateRoutes.get(location.id);
    if (route.distances[startNode] < graphCoreDistance) {
      nearestLocation = location;
      graphCoreDistance = route.distances[startNode];
      previous = route.previous;
    }
  }
  if (!nearestLocation || !Number.isFinite(graphCoreDistance)) {
    return {
      id: house.id,
      address: house.address,
      postcode: house.postcode,
      lat: house.lat,
      lon: house.lon,
      nearestLocationId: null,
      nearestLocationKind: null,
      nearestLocationAccessScope: null,
      graphCoreWalkingDistanceM: null,
      doorToRouteSnapLowerBoundM: null,
      reportedWalkingDistanceM: null,
      walkingDistanceM: null,
      coverageStatus: "unreachable",
      routeGeometry: [],
    };
  }
  const startCoordinate = graph.nodes[startNode];
  const doorSnapDistance = haversineMeters(
    { latitude: house.lat, longitude: house.lon },
    startCoordinate,
  );
  const reportedDistance = graphCoreDistance + doorSnapDistance;
  const roundedGraphCoreDistance = round(graphCoreDistance);
  const roundedDoorSnapDistance = round(doorSnapDistance);
  const roundedReportedDistance = round(reportedDistance);
  return {
    id: house.id,
    address: house.address,
    postcode: house.postcode,
    lat: house.lat,
    lon: house.lon,
    nearestLocationId: nearestLocation.id,
    nearestLocationKind: nearestLocation.kind,
    nearestLocationAccessScope: nearestLocation.accessScope,
    graphCoreWalkingDistanceM: roundedGraphCoreDistance,
    houseGraphSnapDistanceM: roundedDoorSnapDistance,
    doorToRouteSnapLowerBoundM: roundedDoorSnapDistance,
    reportedWalkingDistanceM: roundedReportedDistance,
    walkingDistanceM: roundedReportedDistance,
    coverageStatus: getCoverageStatus(roundedReportedDistance),
    routeGeometry: traceRouteGeometry(startNode, nearestLocation.graphNode, previous, graph),
    routeWarning: "Indicatieve afstand: routegraaf plus hemelsbrede BAG-naar-routesnapbenadering; geen ingemeten deurroute.",
  };
});

const distanceBands = countBands(houses);
const graphCoreMetrics = summarize(houses, "graphCoreWalkingDistanceM");
const reportedMetrics = summarize(houses, "reportedWalkingDistanceM");
const householdsAbove225 = houses.filter((house) => house.reportedWalkingDistanceM > TARGET_DISTANCE_M).length;
const nearestHouseholdsByLocation = Object.fromEntries(locations.map((location) => [location.id, 0]));
for (const house of houses) {
  if (house.nearestLocationId) nearestHouseholdsByLocation[house.nearestLocationId] += 1;
}

const adjustments = {
  scenarioProvenance: "User-directed sensitivity scenario recorded on 2026-08-13; source container data was not changed.",
  removed: [
    { id: "A4", sourceOldId: "model-225-04", reason: "Vervalt door de bevestigde voetpadverbinding naar A2 bij De Fuik." },
    { id: "A8", sourceOldId: "model-225-08", reason: "Vervalt in de diagnostische korte-aansluitingenvariant; fysieke verificatie blijft vereist." },
    { id: "A24", sourceOldId: "model-225-24", reason: "Vervalt doordat WH24 in dit scenario openbaar wordt." },
  ],
  relocated: [
    { id: "A36", sourceOldId: "model-225-36", reason: "Verplaatst naar graph node 969, circa 60 meter noord/noordoost." },
  ],
  replacementAnchors: [
    { id: "A13", sourceOldId: "model-225-13", reason: "Afgewezen private pin vervangen door onbevestigd randanker op graph node 3282." },
  ],
  routeWarnings: [
    "A4-A2 gebruikt een door de gebruiker bevestigde voetpadverbinding.",
    "A8-A11 gebruikt uitsluitend de negen expliciet vastgelegde korte diagnostische graafbruggen; deze moeten buiten het model worden bevestigd.",
    "De gekleurde waarde telt een hemelsbrede BAG-naar-routesnapbenadering bij de routegraaf op en is geen bewezen deur-tot-containerloopafstand.",
  ],
  scopeWarnings: [
    "De 2.579 adressen zijn woonfunctieadressen binnen het gebruikte BRT-woonkernvlak; 303 woonfunctieadressen in de BAG-woonplaats vallen buiten deze kaartscope.",
    "Veilingweg 70D blijft als woonfunctie-in-gebruik in de vraag; actieve bewoning en afvalrecht zijn niet met BRP/HVC-data bevestigd.",
  ],
};

const scenario = {
  name: "adjusted-fixed-existing-user-directed-sensitivity",
  maximumWalkingDistanceTargetM: TARGET_DISTANCE_M,
  fixedExistingLocationCount: fixedLocations.length,
  fixedPublicLocationCount: fixedLocations.filter((location) => location.accessScope === "public").length,
  fixedPrivateLocationCount: fixedLocations.filter((location) => location.accessScope === "private").length,
  additionalSiteCount: additionalLocations.length,
  totalPhysicalLocationCount: locations.length,
  residentialAddressCount: houses.length,
  graphCoreMetrics,
  reportedAccessSensitivityMetrics: reportedMetrics,
  distanceBands,
  householdsAbove225M: householdsAbove225,
  allHouseholdsWithinTarget: householdsAbove225 === 0 && distanceBands.unreachable === 0,
  assignedHouseholdsByLocation: nearestHouseholdsByLocation,
  selectedAdditionalSites: additionalLocations,
  topologyBridges: graph.addedBridges,
  adjustments,
};

const generatedAt = new Date().toISOString();
const detailOutput = {
  generatedAt,
  mandatoryExistingIds: fixedLocations.map((location) => location.id),
  scenario,
  adjustments,
  locations,
  houses,
  method: {
    routeGraph: `Historical OSRM route segments from ${ROUTE_SNAPSHOT}, plus only the explicitly listed sensitivity bridges.`,
    graphCoreWalkingDistanceM: "Shortest path from the historical household route snap to the selected location graph node.",
    doorToRouteSnapLowerBoundM: "Haversine distance from BAG point to the historical household route snap; not a proven walkable access route.",
    reportedWalkingDistanceM: "Graph-core distance plus the straight BAG-to-route-snap lower bound used for map coloring.",
    locationAccessLeg: "No exact container-pin-to-route access leg is added; additional sites are graph-node research anchors.",
    access: "All locations are public in this scenario except WH23, which remains restricted to its configured allowlist. WH24-public is a user-supplied scenario assumption.",
    buildability: "A13 and A36 are not reassessed or approved build pins; every additional anchor still needs municipal-land, utilities, safety and HVC checks.",
  },
};

const summaryOutput = {
  generatedAt,
  inputs: {
    currentCoverageGeneratedAt: currentCoverage.generatedAt,
    baselineFile: "fixed-existing-household-coverage-225.json",
    historicalRouteSnapshot: ROUTE_SNAPSHOT,
  },
  graph: {
    nodes: graph.nodes.length,
    undirectedEdgesAfterBridges: graph.edgeCount,
    topologyBridges: graph.addedBridges,
  },
  scenario,
  capacitySensitivity: null,
  capacityNote: "Capacity was intentionally not recalculated: this map is a user-directed distance sensitivity, not a new operational container plan.",
};

const additionalRows = additionalLocations
  .sort((left, right) => Number(left.id.slice(-2)) - Number(right.id.slice(-2)))
  .map((location) => [
    `A${Number(location.id.slice(-2))}`,
    location.id,
    location.graphNode,
    location.lat.toFixed(6),
    location.lon.toFixed(6),
    location.adjustmentStatus,
    location.address ?? "",
    nearestHouseholdsByLocation[location.id],
    location.adjustmentReason,
  ]);
const tsv = [
  ["label", "id", "graph_node", "latitude", "longitude", "adjustment_status", "address_reference", "nearest_households", "adjustment_reason"],
  ...additionalRows,
].map((row) => row.join("\t")).join("\n");

writeFileSync(DETAIL_OUTPUT, `${JSON.stringify(detailOutput)}\n`);
writeFileSync(SUMMARY_OUTPUT, `${JSON.stringify(summaryOutput, null, 2)}\n`);
writeFileSync(TSV_OUTPUT, `${tsv}\n`);

console.log(JSON.stringify({
  generatedAt,
  households: houses.length,
  fixedExistingLocations: fixedLocations.length,
  publicFixedLocations: fixedLocations.filter((location) => location.accessScope === "public").length,
  privateFixedLocations: fixedLocations.filter((location) => location.accessScope === "private").length,
  additionalLocations: additionalLocations.length,
  totalLocations: locations.length,
  graphCoreMetrics,
  reportedAccessSensitivityMetrics: reportedMetrics,
  householdsAbove225,
  distanceBands,
}, null, 2));
