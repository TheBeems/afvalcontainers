#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const REPORT_DIR = new URL("./", import.meta.url);
const REPO_DIR = new URL("../../", REPORT_DIR);

const screened = JSON.parse(readFileSync(new URL("distance-optimal-sites-screened.json", REPORT_DIR), "utf8"));
const osm = JSON.parse(readFileSync(new URL("osm-highways.json", REPORT_DIR), "utf8"));
const containers = JSON.parse(readFileSync(new URL("data/places/warmenhuizen/container-locations.json", REPO_DIR), "utf8"));
const capacity = JSON.parse(readFileSync(new URL("capacitated-solution.json", REPORT_DIR), "utf8"));
const capacity100 = capacity.scenarios.find(({ capacityPerContainer }) => capacityPerContainer === 100);
const capacity75 = capacity.scenarios.find(({ capacityPerContainer }) => capacityPerContainer === 75);

const MUNICIPAL_POSITIVE_IDS = new Set([
  "WH01", "WH02", "WH03", "WH05", "WH06", "WH07", "WH09", "WH10", "WH11", "WH12",
  "WH13", "WH14", "WH15", "WH16", "WH17", "WH18", "WH19", "WH20", "WH21", "WH22",
  "WH25", "WH26", "WH27", "WH28", "WH29", "WH30", "WH33", "WH34", "WH35",
]);
const NON_MUNICIPAL_NOTES = {
  WH04: "exacte conceptpin op HHNK-perceel; gemeentelijke percelen binnen circa 10 m",
  WH08: "niet-gemeentelijke eigenaar in openbare BRK-grootgrondeigendomsscreen",
  WH23: "particuliere Angelaparklocatie; geen algemeen openbaar netwerkpunt",
  WH24: "particuliere Angelaparklocatie; geen algemeen openbaar netwerkpunt",
};
const VEHICLE_HIGHWAYS = new Set([
  "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service",
]);

function toLocal(point, latitude) {
  const rad = Math.PI / 180;
  return {
    x: point.lon * 111_320 * Math.cos(latitude * rad),
    y: point.lat * 110_540,
  };
}

function distanceMeters(a, b) {
  const latitude = (a.lat + b.lat) / 2;
  const pa = toLocal(a, latitude);
  const pb = toLocal(b, latitude);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

function distanceToSegment(point, start, end) {
  const latitude = (point.lat + start.lat + end.lat) / 3;
  const p = toLocal(point, latitude);
  const a = toLocal(start, latitude);
  const b = toLocal(end, latitude);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearestHighway(site, predicate = () => true) {
  const point = { lat: site.latitude, lon: site.longitude };
  let best = null;
  for (const way of osm.elements.filter(({ type, geometry }) => type === "way" && geometry?.length > 1)) {
    if (!predicate(way)) continue;
    for (let index = 1; index < way.geometry.length; index += 1) {
      const distanceM = distanceToSegment(point, way.geometry[index - 1], way.geometry[index]);
      if (!best || distanceM < best.distanceM) {
        best = {
          osmWayId: way.id,
          distanceM,
          highway: way.tags?.highway ?? null,
          name: way.tags?.name ?? null,
          access: way.tags?.access ?? null,
          service: way.tags?.service ?? null,
        };
      }
    }
  }
  const accessAllowed = !["private", "no"].includes(best?.access);
  return {
    ...best,
    distanceM: Number(best.distanceM.toFixed(1)),
    vehicleNetworkPositive: Boolean(VEHICLE_HIGHWAYS.has(best?.highway) && accessAllowed),
  };
}

function nearestContainer(site, pool) {
  const point = { lat: site.latitude, lon: site.longitude };
  return pool
    .map((container) => ({
      id: container.id,
      address: container.address,
      latitude: container.lat,
      longitude: container.lon,
      streams: container.streams,
      distanceM: distanceMeters(point, { lat: container.lat, lon: container.lon }),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .map((container) => ({ ...container, distanceM: Number(container.distanceM.toFixed(1)) }))[0] ?? null;
}

const restContainers = containers.filter(({ streams }) => streams.some(({ type }) => ["rest", "semi-rest"].includes(type)));
const publicRestContainers = restContainers.filter(({ id }) => MUNICIPAL_POSITIVE_IDS.has(id));

const sites = screened.sites.map((site) => {
  const {
    capacityUnitsAt100: nearestLoadCapacityUnitsAt100,
    capacityUnitsAt75: nearestLoadCapacityUnitsAt75,
    ...siteWithoutNaiveCapacity
  } = site;
  const highway = nearestHighway(site);
  const nearestVehicleHighway = nearestHighway(site, (way) => {
    const accessAllowed = !["private", "no"].includes(way.tags?.access);
    return VEHICLE_HIGHWAYS.has(way.tags?.highway) && accessAllowed;
  });
  const nearestPublished = nearestContainer(site, restContainers);
  const nearestMunicipalPublished = nearestContainer(site, publicRestContainers);
  let screeningDecision = "voorkeurszoekpunt-op-gemeentegrond";
  const warnings = [];

  if (!site.exactMunicipal && site.municipalParcelWithin25M) {
    screeningDecision = "verplaats-binnen-25m-naar-gemeentegrond";
    warnings.push("modelpunt ligt niet exact op gemeentegrond");
  } else if (!site.exactMunicipal) {
    screeningDecision = "herlocatie-of-individueel-maatwerk";
    warnings.push("geen gemeentelijk perceel binnen 25 m in openbare screen");
  }
  if (nearestVehicleHighway.distanceM > 8) {
    screeningDecision = screeningDecision === "voorkeurszoekpunt-op-gemeentegrond"
      ? "nadere-hvc-toegangstoets"
      : screeningDecision;
    warnings.push(`dichtstbijzijnde openbare voertuigroute ligt circa ${nearestVehicleHighway.distanceM} m van het modelpunt`);
  }
  if (site.referenceSnapM > 50) {
    screeningDecision = "handmatige-route-en-terreintoets";
    warnings.push(`grote BAG-netwerksnap van ${site.referenceSnapM} m`);
  }
  if (nearestMunicipalPublished?.distanceM <= 50) {
    warnings.push(`gepubliceerde gemeentelijke restlocatie ${nearestMunicipalPublished.id} ligt ${nearestMunicipalPublished.distanceM} m verderop en verdient voorkeur als bouwpin`);
  }

  return {
    ...siteWithoutNaiveCapacity,
    nearestLoadCapacityUnitsAt100,
    nearestLoadCapacityUnitsAt75,
    recommendedCapacityUnitsAt100: 1 + (capacity100.additionalAtSites[String(site.site)] ?? 0),
    recommendedCapacityUnitsAt75: 1 + (capacity75.additionalAtSites[String(site.site)] ?? 0),
    nearestHighway: highway,
    nearestPublicVehicleHighway: nearestVehicleHighway,
    nearestPublishedRestLocation: nearestPublished,
    nearestMunicipalPublishedRestLocation: nearestMunicipalPublished,
    screeningDecision,
    warnings,
  };
});

const summary = {
  sites: sites.length,
  exactMunicipal: sites.filter(({ exactMunicipal }) => exactMunicipal).length,
  municipalWithin25M: sites.filter(({ municipalParcelWithin25M }) => municipalParcelWithin25M).length,
  publicVehicleRouteWithin8M: sites.filter(({ nearestPublicVehicleHighway }) => nearestPublicVehicleHighway.distanceM <= 8).length,
  publishedMunicipalRestLocationWithin50M: sites.filter(({ nearestMunicipalPublishedRestLocation }) => nearestMunicipalPublishedRestLocation?.distanceM <= 50).length,
  largeReferenceSnap: sites.filter(({ referenceSnapM }) => referenceSnapM > 50).length,
  exactCapacityPlanAt100: capacity100.containers,
  exactCapacityPlanAt75: capacity75.containers,
  nearestLoadUnitsAt100: sites.reduce((sum, { nearestLoadCapacityUnitsAt100 }) => sum + nearestLoadCapacityUnitsAt100, 0),
  nearestLoadUnitsAt75: sites.reduce((sum, { nearestLoadCapacityUnitsAt75 }) => sum + nearestLoadCapacityUnitsAt75, 0),
};

writeFileSync(new URL("recommended-locations.json", REPORT_DIR), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  recommendation: {
    designMaximumWalkingDistanceM: 225,
    policyExceptionCeilingM: 275,
    locationCount: 43,
    status: "analytische zoekpunten; bouwpinnen pas na gemeentelijke/HVC-terreintoets",
  },
  ownershipSource: screened.source,
  ownershipNote: screened.note,
  publishedLocationOwnershipNotes: NON_MUNICIPAL_NOTES,
  summary,
  sites,
}, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
