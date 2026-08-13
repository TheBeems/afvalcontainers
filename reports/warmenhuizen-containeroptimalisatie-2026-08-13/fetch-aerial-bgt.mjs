#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPORT_DIR = new URL("./", import.meta.url);
const AERIAL_DIR = new URL("aerial/", REPORT_DIR);
const BGT_DIR = new URL("bgt/", REPORT_DIR);
const RECOMMENDATION_URL = new URL("recommended-locations.json", REPORT_DIR);
const BGT_BASE_URL = "https://api.pdok.nl/lv/bgt/ogc/v1";
const AERIAL_WMS_URL = "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0";
const SNAPSHOT_TIME = "2026-08-13T23:59:59Z";
const VILLAGE_BBOX = "4.724,52.710,4.754,52.733";

const COLLECTIONS = [
  "wegdeel",
  "ondersteunendwegdeel",
  "onbegroeidterreindeel",
  "begroeidterreindeel",
  "waterdeel",
  "pand",
  "overigbouwwerk",
  "mast",
  "paal",
  "vegetatieobject_punt",
  "vegetatieobject_vlak",
  "straatmeubilair",
  "kast",
  "bord",
  "weginrichtingselement_punt",
  "weginrichtingselement_lijn",
  "weginrichtingselement_vlak",
  "scheiding_lijn",
];

function curlText(url) {
  return execFileSync("curl", ["-fsSL", url], {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
}

function curlFile(url, outputPath) {
  execFileSync("curl", ["-fsSL", url, "-o", outputPath], { encoding: "utf8" });
}

function fetchCollection(collection) {
  let url = `${BGT_BASE_URL}/collections/${collection}/items?f=json&bbox=${VILLAGE_BBOX}&datetime=${encodeURIComponent(SNAPSHOT_TIME)}&limit=1000`;
  const features = [];
  while (url) {
    const page = JSON.parse(curlText(url));
    features.push(...(page.features ?? []));
    const next = page.links?.find(({ rel }) => rel === "next")?.href;
    url = next ?? null;
  }
  return { type: "FeatureCollection", collection, snapshotTime: SNAPSHOT_TIME, features };
}

function toLocal([longitude, latitude], originLatitude) {
  const radians = Math.PI / 180;
  return [
    longitude * 111_320 * Math.cos(originLatitude * radians),
    latitude * 110_540,
  ];
}

function pointInRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  if (!polygon[0] || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

function distanceToSegment(point, start, end, originLatitude) {
  const [px, py] = toLocal(point, originLatitude);
  const [ax, ay] = toLocal(start, originLatitude);
  const [bx, by] = toLocal(end, originLatitude);
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToLine(point, line, originLatitude) {
  if (line.length === 1) return distanceToSegment(point, line[0], line[0], originLatitude);
  let minimum = Infinity;
  for (let index = 1; index < line.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegment(point, line[index - 1], line[index], originLatitude));
  }
  return minimum;
}

function geometryDistanceM(point, geometry) {
  const originLatitude = point[1];
  if (!geometry) return Infinity;
  if (geometry.type === "Point") return distanceToSegment(point, geometry.coordinates, geometry.coordinates, originLatitude);
  if (geometry.type === "MultiPoint") return Math.min(...geometry.coordinates.map((coordinate) => distanceToSegment(point, coordinate, coordinate, originLatitude)));
  if (geometry.type === "LineString") return distanceToLine(point, geometry.coordinates, originLatitude);
  if (geometry.type === "MultiLineString") return Math.min(...geometry.coordinates.map((line) => distanceToLine(point, line, originLatitude)));
  if (geometry.type === "Polygon") {
    if (pointInPolygon(point, geometry.coordinates)) return 0;
    return Math.min(...geometry.coordinates.map((ring) => distanceToLine(point, ring, originLatitude)));
  }
  if (geometry.type === "MultiPolygon") {
    return Math.min(...geometry.coordinates.map((polygon) => {
      if (pointInPolygon(point, polygon)) return 0;
      return Math.min(...polygon.map((ring) => distanceToLine(point, ring, originLatitude)));
    }));
  }
  return Infinity;
}

function propertySummary(properties) {
  const fields = [
    "functie",
    "plus_functie",
    "fysiek_voorkomen",
    "plus_fysiek_voorkomen",
    "type",
    "plus_type",
    "status",
  ];
  return Object.fromEntries(fields.filter((field) => properties?.[field] != null).map((field) => [field, properties[field]]));
}

function buildAerialUrl(site, halfExtentM = 75, sizePx = 900) {
  const latitudeDelta = halfExtentM / 110_540;
  const longitudeDelta = halfExtentM / (111_320 * Math.cos(site.latitude * Math.PI / 180));
  const bbox = [
    site.longitude - longitudeDelta,
    site.latitude - latitudeDelta,
    site.longitude + longitudeDelta,
    site.latitude + latitudeDelta,
  ].join(",");
  const parameters = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: "2026_orthoHR",
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: bbox,
    WIDTH: String(sizePx),
    HEIGHT: String(sizePx),
    FORMAT: "image/jpeg",
  });
  return `${AERIAL_WMS_URL}?${parameters.toString()}`;
}

function annotateAerial(inputPath, outputPath, site, sizePx = 900) {
  const center = sizePx / 2;
  const label = `Site ${site.site} | ${site.referenceAddress}`.replaceAll("'", "");
  execFileSync("convert", [
    inputPath,
    "-stroke", "#ff2020",
    "-strokewidth", "4",
    "-fill", "none",
    "-draw", `circle ${center},${center} ${center},${center - 15} line ${center - 28},${center} ${center + 28},${center} line ${center},${center - 28} ${center},${center + 28}`,
    "-fill", "rgba(0,0,0,0.72)",
    "-stroke", "none",
    "-draw", "rectangle 0,0 899,42",
    "-fill", "white",
    "-pointsize", "23",
    "-gravity", "northwest",
    "-annotate", "+14+9", label,
    outputPath,
  ], { encoding: "utf8" });
}

mkdirSync(AERIAL_DIR, { recursive: true });
mkdirSync(BGT_DIR, { recursive: true });
const temporaryDirectory = mkdtempSync(join(tmpdir(), "warmenhuizen-aerial-"));
const recommendation = JSON.parse(readFileSync(RECOMMENDATION_URL, "utf8"));

const bgt = {};
for (const collection of COLLECTIONS) {
  const cacheUrl = new URL(`${collection}.json`, BGT_DIR);
  const data = existsSync(cacheUrl)
    ? JSON.parse(readFileSync(cacheUrl, "utf8"))
    : fetchCollection(collection);
  bgt[collection] = data.features;
  if (!existsSync(cacheUrl)) writeFileSync(cacheUrl, `${JSON.stringify(data)}\n`);
  console.log(`BGT ${collection}: ${data.features.length}`);
}

const sites = recommendation.sites.map((site) => {
  const point = [site.longitude, site.latitude];
  const nearby = [];
  for (const [collection, features] of Object.entries(bgt)) {
    for (const feature of features) {
      const distanceM = geometryDistanceM(point, feature.geometry);
      if (distanceM <= 20) {
        nearby.push({
          collection,
          id: feature.id,
          distanceM: Number(distanceM.toFixed(1)),
          properties: propertySummary(feature.properties),
        });
      }
    }
  }
  nearby.sort((a, b) => a.distanceM - b.distanceM || a.collection.localeCompare(b.collection));

  const aerialName = `site-${String(site.site).padStart(2, "0")}.jpg`;
  const rawPath = join(temporaryDirectory, `raw-${aerialName}`);
  const outputPath = fileURLToPath(new URL(aerialName, AERIAL_DIR));
  const aerialUrl = buildAerialUrl(site);
  if (!existsSync(outputPath)) {
    curlFile(aerialUrl, rawPath);
    annotateAerial(rawPath, outputPath, site);
  }
  console.log(`luchtfoto site ${site.site}`);

  return {
    site: site.site,
    referenceAddress: site.referenceAddress,
    latitude: site.latitude,
    longitude: site.longitude,
    aerialImage: `aerial/${aerialName}`,
    aerialSourceUrl: aerialUrl,
    googleStreetViewUrl: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${site.latitude},${site.longitude}`,
    bgtNearbyWithin20M: nearby,
    bgtAtPoint: nearby.filter(({ distanceM }) => distanceM === 0),
    nearestByCollection: Object.values(Object.groupBy(nearby, ({ collection }) => collection)).map((items) => items[0]),
  };
});

writeFileSync(new URL("aerial-bgt-screen.json", REPORT_DIR), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  aerial: {
    source: AERIAL_WMS_URL,
    layer: "2026_orthoHR",
    title: "Luchtfoto 2026 Ortho 5 en 8cm RGB",
    extent: "150 x 150 meter per zoekpunt",
  },
  bgt: {
    source: BGT_BASE_URL,
    snapshotTime: SNAPSHOT_TIME,
    collections: COLLECTIONS,
    searchRadiusM: 20,
  },
  sites,
}, null, 2)}\n`);

rmSync(temporaryDirectory, { recursive: true, force: true });
console.log(`gereed: ${sites.length} sites`);
