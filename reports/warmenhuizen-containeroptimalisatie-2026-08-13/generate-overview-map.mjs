#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const osm = JSON.parse(readFileSync(new URL("osm-highways.json", REPORT_DIR), "utf8"));
const zones = JSON.parse(readFileSync(new URL("recommended-search-zones.geojson", REPORT_DIR), "utf8"));
const width = 1280;
const height = 1440;
const frame = { left: 70, top: 165, right: 70, bottom: 120 };
const sites = zones.features.map(({ geometry, properties }) => ({
  longitude: geometry.coordinates[0],
  latitude: geometry.coordinates[1],
  site: properties.site,
  rating: properties.aerialRating,
}));
const longitudeValues = sites.map(({ longitude }) => longitude);
const latitudeValues = sites.map(({ latitude }) => latitude);
const bounds = {
  west: Math.min(...longitudeValues) - 0.0012,
  east: Math.max(...longitudeValues) + 0.0012,
  south: Math.min(...latitudeValues) - 0.0012,
  north: Math.max(...latitudeValues) + 0.0012,
};
const latitudeScale = Math.cos(((bounds.north + bounds.south) / 2) * Math.PI / 180);
const mapWidth = width - frame.left - frame.right;
const mapHeight = height - frame.top - frame.bottom;
const physicalWidth = (bounds.east - bounds.west) * latitudeScale;
const physicalHeight = bounds.north - bounds.south;
const scale = Math.min(mapWidth / physicalWidth, mapHeight / physicalHeight);
const drawnWidth = physicalWidth * scale;
const drawnHeight = physicalHeight * scale;
const offsetX = frame.left + (mapWidth - drawnWidth) / 2;
const offsetY = frame.top + (mapHeight - drawnHeight) / 2;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function project(longitude, latitude) {
  return {
    x: offsetX + (longitude - bounds.west) * latitudeScale * scale,
    y: offsetY + (bounds.north - latitude) * scale,
  };
}

function highwayStyle(highway) {
  if (["primary", "secondary"].includes(highway)) return { color: "#64748b", width: 4.2 };
  if (["tertiary", "unclassified"].includes(highway)) return { color: "#94a3b8", width: 3.0 };
  if (["residential", "living_street", "service"].includes(highway)) return { color: "#cbd5e1", width: 1.8 };
  return { color: "#e2e8f0", width: 1.0, dash: "4 4" };
}

const roadPaths = osm.elements
  .filter(({ type, geometry }) => type === "way" && geometry?.length > 1)
  .map((way) => {
    const style = highwayStyle(way.tags?.highway);
    const points = way.geometry.map(({ lon, lat }) => project(lon, lat));
    const path = points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    return `<path d="${path}" fill="none" stroke="${style.color}" stroke-width="${style.width}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" />`;
  })
  .join("\n");

const labelNames = new Set([
  "Debbemeerweg", "Dergmeerweg", "Dorpsstraat", "Oostwal", "Oudewal", "Stationsstraat", "Veilingweg",
]);
const labelWays = new Map();
for (const way of osm.elements) {
  if (way.type !== "way" || !way.geometry?.length || !labelNames.has(way.tags?.name)) continue;
  const previous = labelWays.get(way.tags.name);
  if (!previous || way.geometry.length > previous.geometry.length) labelWays.set(way.tags.name, way);
}
const roadLabels = [...labelWays.values()]
  .map((way) => {
    const point = way.geometry[Math.floor(way.geometry.length / 2)];
    const position = project(point.lon, point.lat);
    return `<text x="${position.x.toFixed(1)}" y="${position.y.toFixed(1)}" class="road-label">${escapeXml(way.tags.name)}</text>`;
  })
  .join("\n");

const ratingColors = {
  groen: "#15803d",
  oranje: "#d97706",
  rood: "#b91c1c",
};
const siteMarkers = sites.map((site) => {
  const point = project(site.longitude, site.latitude);
  const color = ratingColors[site.rating] ?? "#475569";
  return [
    `<g aria-label="Site ${site.site}, ${escapeXml(site.rating)}">`,
    `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="13" fill="${color}" stroke="#ffffff" stroke-width="3" />`,
    `<text x="${point.x.toFixed(1)}" y="${(point.y + 4).toFixed(1)}" class="site-label">${site.site}</text>`,
    "</g>",
  ].join("");
}).join("\n");

const metersPerPixel = 1 / (scale / 111_320);
const scaleBarMeters = 250;
const scaleBarPixels = scaleBarMeters / metersPerPixel;
const legendX = 820;
const legendItems = [
  ["groen", "direct technisch inmeten (8)"],
  ["oranje", "lokale variant onderzoeken (14)"],
  ["rood", "anker verlaten/herontwerpen (21)"],
].map(([rating, label], index) => {
  const y = 94 + index * 28;
  return `<circle cx="${legendX}" cy="${y}" r="8" fill="${ratingColors[rating]}" /><text x="${legendX + 16}" y="${y + 5}" class="legend-label">${escapeXml(label)}</text>`;
}).join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Afstandsoptimale zoekankers voor restafvalcontainers in Warmenhuizen</title>
  <desc id="description">Kaart van 43 analytische zoekankers op het OpenStreetMap-wegennet. Acht groen, veertien oranje en eenentwintig rood. De punten zijn geen bouwpinnen.</desc>
  <style>
    .title { font: 700 29px system-ui, sans-serif; fill: #0f172a; }
    .subtitle { font: 17px system-ui, sans-serif; fill: #475569; }
    .road-label { font: 14px system-ui, sans-serif; fill: #64748b; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
    .site-label { font: 700 10px system-ui, sans-serif; fill: #ffffff; text-anchor: middle; }
    .legend-label { font: 15px system-ui, sans-serif; fill: #334155; }
    .note { font: 15px system-ui, sans-serif; fill: #334155; }
  </style>
  <defs>
    <clipPath id="map-clip"><rect x="${offsetX.toFixed(1)}" y="${offsetY.toFixed(1)}" width="${drawnWidth.toFixed(1)}" height="${drawnHeight.toFixed(1)}" rx="8" /></clipPath>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc" />
  <text x="70" y="50" class="title">Warmenhuizen — 43 analytische zoekankers</text>
  <text x="70" y="82" class="subtitle">Afstandsmodel 225 m; luchtfoto/BGT-triage — onderzoeksankers, geen bouwpinnen</text>
  ${legendItems}
  <rect x="${offsetX.toFixed(1)}" y="${offsetY.toFixed(1)}" width="${drawnWidth.toFixed(1)}" height="${drawnHeight.toFixed(1)}" rx="8" fill="#ffffff" stroke="#cbd5e1" />
  <g clip-path="url(#map-clip)">
    <g>${roadPaths}</g>
    <g>${roadLabels}</g>
    <g>${siteMarkers}</g>
  </g>
  <g transform="translate(88 ${height - 72})">
    <line x1="0" y1="0" x2="${scaleBarPixels.toFixed(1)}" y2="0" stroke="#0f172a" stroke-width="4" />
    <line x1="0" y1="-7" x2="0" y2="7" stroke="#0f172a" stroke-width="3" />
    <line x1="${scaleBarPixels.toFixed(1)}" y1="-7" x2="${scaleBarPixels.toFixed(1)}" y2="7" stroke="#0f172a" stroke-width="3" />
    <text x="${(scaleBarPixels / 2).toFixed(1)}" y="24" class="note" text-anchor="middle">250 m</text>
  </g>
  <text x="${width - 70}" y="${height - 66}" class="note" text-anchor="end">Wegennet: OpenStreetMap-snapshot · locaties: rapport 13-08-2026</text>
</svg>
`;

writeFileSync(new URL("search-zones-overview.svg", REPORT_DIR), svg);
console.log(JSON.stringify({ sites: sites.length, output: new URL("search-zones-overview.svg", REPORT_DIR).pathname }, null, 2));
