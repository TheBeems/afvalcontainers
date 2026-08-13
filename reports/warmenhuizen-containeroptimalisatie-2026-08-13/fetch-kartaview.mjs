#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const OUTPUT_DIR = new URL("streetview/", REPORT_DIR);
const INPUT_URL = new URL("recommended-locations.json", REPORT_DIR);
const API_URL = "https://api.openstreetcam.org/2.0/photo/";

function curlJson(url) {
  return JSON.parse(execFileSync("curl", ["-fsSL", url], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
}

function curlFile(url, outputPath) {
  execFileSync("curl", ["-fsSL", url, "-o", fileURLToPath(outputPath)], { encoding: "utf8" });
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const recommendation = JSON.parse(readFileSync(INPUT_URL, "utf8"));
const results = [];

for (const site of recommendation.sites) {
  const url = `${API_URL}?lat=${site.latitude}&lng=${site.longitude}&radius=500`;
  const response = curlJson(url);
  const photos = response?.result?.data ?? [];
  const nearest = photos
    .filter(({ visibility }) => visibility === "public")
    .sort((a, b) => Number(a.distance) - Number(b.distance))[0] ?? null;
  let localImage = null;
  if (nearest?.imageProcUrl) {
    localImage = `site-${String(site.site).padStart(2, "0")}-${nearest.id}.jpg`;
    curlFile(nearest.imageProcUrl, new URL(localImage, OUTPUT_DIR));
  }
  results.push({
    site: site.site,
    referenceAddress: site.referenceAddress,
    latitude: site.latitude,
    longitude: site.longitude,
    queryUrl: url,
    photoCount: photos.length,
    nearest: nearest ? {
      id: nearest.id,
      latitude: Number(nearest.lat),
      longitude: Number(nearest.lng),
      reportedDistanceM: Number(nearest.distance),
      heading: Number(nearest.heading),
      shotDate: nearest.shotDate,
      sequenceId: nearest.sequenceId,
      imageUrl: nearest.imageProcUrl,
      detailsUrl: `https://kartaview.org/details/${nearest.sequenceId}/${nearest.sequenceIndex}/track-info`,
      localImage: `streetview/${localImage}`,
    } : null,
  });
  console.log(`site ${site.site}: ${nearest ? `${nearest.distance} m, ${nearest.shotDate}` : "geen beeld"}`);
}

writeFileSync(new URL("kartaview-coverage.json", REPORT_DIR), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: API_URL,
  note: "Openbare KartaView-beelden; visuele observaties blijven indicatief en tijdsgebonden.",
  sites: results,
}, null, 2)}\n`);
