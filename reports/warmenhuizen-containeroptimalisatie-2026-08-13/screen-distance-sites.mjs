#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const INPUT_URL = new URL("distance-optimal-sites.tsv", REPORT_DIR);
const OUTPUT_URL = new URL("distance-optimal-sites-screened.json", REPORT_DIR);
const OWNERSHIP_URL = "https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1/query";

function parseTsv(text) {
  const [header, ...lines] = text.trim().split("\n");
  const fields = header.split("\t");
  return lines.map((line) => Object.fromEntries(line.split("\t").map((value, index) => [fields[index], value])));
}

function queryOwnership(lon, lat, distance = 0) {
  const args = [
    "-fsSL",
    "--get",
    OWNERSHIP_URL,
    "--data-urlencode", "f=json",
    "--data-urlencode", `geometry=${lon},${lat}`,
    "--data-urlencode", "geometryType=esriGeometryPoint",
    "--data-urlencode", "inSR=4326",
    "--data-urlencode", "spatialRel=esriSpatialRelIntersects",
    "--data-urlencode", "outFields=perceelsaanduiding,naam,aardzakelijkrecht",
    "--data-urlencode", "returnGeometry=false",
  ];
  if (distance > 0) {
    args.push("--data-urlencode", `distance=${distance}`, "--data-urlencode", "units=esriSRUnit_Meter");
  }
  const result = execFileSync("curl", args, { encoding: "utf8" });
  const json = JSON.parse(result);
  if (json.error) throw new Error(json.error.message);
  return json.features.map(({ attributes }) => attributes);
}

const sites = parseTsv(readFileSync(INPUT_URL, "utf8"));
const screened = sites.map((site) => {
  const exactParcels = queryOwnership(site.lon, site.lat);
  const nearbyParcels = queryOwnership(site.lon, site.lat, 25);
  const exactMunicipal = exactParcels.find(({ naam }) => naam === "Gemeente Schagen");
  const nearbyMunicipal = nearbyParcels.filter(({ naam }) => naam === "Gemeente Schagen");
  const capacityUnitsAt100 = Math.ceil(Number(site.load) / 100);
  const capacityUnitsAt75 = Math.ceil(Number(site.load) / 75);

  return {
    site: Number(site.site),
    node: Number(site.node),
    latitude: Number(site.lat),
    longitude: Number(site.lon),
    street: site.straat,
    referenceAddress: site.referentieadres,
    referenceSnapM: Number(site.ref_m),
    assignedAddresses: Number(site.load),
    meanWalkingDistanceM: Number(site.mean_m),
    p95WalkingDistanceM: Number(site.p95_m),
    maxWalkingDistanceM: Number(site.max_m),
    capacityUnitsAt100,
    capacityUnitsAt75,
    exactParcels,
    exactMunicipal: Boolean(exactMunicipal),
    exactMunicipalParcel: exactMunicipal?.perceelsaanduiding ?? null,
    municipalParcelWithin25M: nearbyMunicipal.length > 0,
    nearbyMunicipalParcels: nearbyMunicipal,
  };
});

writeFileSync(OUTPUT_URL, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: OWNERSHIP_URL,
  note: "Openbare BRK-grootgrondgebruiksscreening; geen juridische eigendomsverklaring en geen KLIC- of terreintoets.",
  sites: screened,
}, null, 2)}\n`);

const counts = screened.reduce((acc, site) => {
  acc.exactMunicipal += Number(site.exactMunicipal);
  acc.municipalWithin25M += Number(site.municipalParcelWithin25M);
  acc.capacityUnitsAt100 += site.capacityUnitsAt100;
  acc.capacityUnitsAt75 += site.capacityUnitsAt75;
  return acc;
}, { exactMunicipal: 0, municipalWithin25M: 0, capacityUnitsAt100: 0, capacityUnitsAt75: 0 });

console.log(JSON.stringify(counts, null, 2));
