#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDirectory = dirname(fileURLToPath(import.meta.url));

async function readJson(name) {
  return JSON.parse(await readFile(resolve(reportDirectory, name), 'utf8'));
}

function ownershipScreen(site) {
  if (!site) return null;
  if (site.exactMunicipal) return 'municipal-parcel-at-anchor';
  if (site.municipalParcelWithin25M) return 'municipal-parcel-within-25m';
  return 'no-municipal-parcel-within-25m';
}

function capacityScenario(scenario, capacity) {
  return scenario.capacitySensitivity.find((entry) => (
    entry.capacityPerContainerAddressEquivalents === capacity
  ));
}

function capacityUnits(scenario, locationId, capacity) {
  const entry = capacityScenario(scenario, capacity);
  return entry?.feasible ? 1 + Number(entry.extraContainersByLocation?.[locationId] ?? 0) : null;
}

const [scenario, screened, aerialNorth, aerialSouth] = await Promise.all([
  readJson('fixed-existing-household-coverage-225.json'),
  readJson('recommended-locations.json'),
  readJson('aerial-assessment-sites-01-22.json'),
  readJson('aerial-assessment-sites-23-43.json')
]);

const screenedByNode = new Map(screened.sites.map((site) => [site.node, site]));
const aerialBySite = new Map([...aerialNorth.sites, ...aerialSouth.sites].map((site) => [site.site, site]));
const assignedByLocation = scenario.scenario.assignedHouseholdsByLocation;

const features = scenario.locations.map((location) => {
  const isAdditional = location.kind !== 'existing';
  const oldSite = isAdditional ? screenedByNode.get(location.graphNode) : null;
  const aerial = oldSite ? aerialBySite.get(oldSite.site) : null;
  if (isAdditional && (!oldSite || !aerial)) {
    throw new Error(`Additional location ${location.id} cannot be linked to its prior screen.`);
  }
  const aerialRating = aerial?.status ?? aerial?.rating ?? null;
  const visibleConstraints = aerial?.keyRisks ?? aerial?.visibleConstraints ?? [];
  return {
    type: 'Feature',
    id: location.id,
    geometry: {
      type: 'Point',
      coordinates: [location.lon, location.lat]
    },
    properties: {
      id: location.id,
      kind: location.kind,
      accessScope: location.accessScope,
      status: isAdditional ? 'search-zone-anchor-not-build-pin' : 'fixed-existing-hvc-location',
      address: location.address ?? oldSite?.referenceAddress ?? null,
      graphNode: location.graphNode,
      nearestHouseholdsUncapacitated: assignedByLocation[location.id] ?? 0,
      assignedHouseholdsAt100AddressCapacity: capacityScenario(scenario, 100)
        ?.assignedHouseholdsByLocation?.[location.id] ?? null,
      assignedHouseholdsAt75AddressCapacity: capacityScenario(scenario, 75)
        ?.assignedHouseholdsByLocation?.[location.id] ?? null,
      containersAt100AddressCapacity: capacityUnits(scenario, location.id, 100),
      containersAt75AddressCapacity: capacityUnits(scenario, location.id, 75),
      oldSite: oldSite?.site ?? null,
      oldReferenceAddress: oldSite?.referenceAddress ?? null,
      ownershipScreen: ownershipScreen(oldSite),
      exactMunicipalParcel: oldSite?.exactMunicipalParcel ?? null,
      municipalParcelWithin25M: oldSite?.municipalParcelWithin25M ?? null,
      aerialRating,
      aerialAssessment: aerial?.visibleSpace ?? aerial?.surfaceAndSpace ?? null,
      aerialHvcRouteAssessment: aerial?.hvcRoute ?? aerial?.hvcVehicleRoute ?? null,
      localShiftInstruction: aerial?.preferredAdjustment ?? aerial?.recommendation ?? null,
      visibleConstraints,
      screeningWarnings: oldSite?.warnings ?? [],
      coordinateMeaning: location.coordinateMeaning ?? (
        isAdditional
          ? 'search anchor on reconstructed walking graph; not a build-ready pin'
          : 'exact HVC coordinate from the repository audit'
      )
    }
  };
});

const additionalFeatures = features.filter((feature) => feature.properties.status === 'search-zone-anchor-not-build-pin');
const ratingCounts = Object.fromEntries(['groen', 'oranje', 'rood'].map((rating) => [
  rating,
  additionalFeatures.filter((feature) => feature.properties.aerialRating === rating).length
]));

const collection = {
  type: 'FeatureCollection',
  name: 'Warmenhuizen fixed-existing scenario: HVC-locaties en aanvullende onderzoekszones',
  generatedAt: scenario.generatedAt,
  coordinateReferenceSystem: 'WGS84 (EPSG:4326)',
  scenario: {
    maximumWalkingDistanceTargetM: scenario.scenario.maximumWalkingDistanceTargetM,
    maximumModeledWalkingDistanceM: scenario.scenario.maximumModeledWalkingDistanceM,
    totalPhysicalLocationCount: scenario.scenario.totalPhysicalLocationCount,
    fixedExistingLocationCount: scenario.scenario.fixedExistingLocationCount,
    fixedPublicLocationCount: scenario.scenario.fixedPublicLocationCount,
    fixedPrivateLocationCount: scenario.scenario.fixedPrivateLocationCount,
    additionalSiteCount: scenario.scenario.additionalSiteCount,
    aerialRatingCountsForAdditionalSites: ratingCounts,
    totalContainersAt100AddressCapacity: capacityScenario(scenario, 100)?.testedContainerCount ?? null,
    totalContainersAt75AddressCapacity: capacityScenario(scenario, 75)?.testedContainerCount ?? null,
    note: 'Additional features are analytical search-zone anchors, not build-ready pins.'
  },
  sourceFiles: [
    'fixed-existing-household-coverage-225.json',
    'recommended-locations.json',
    'aerial-assessment-sites-01-22.json',
    'aerial-assessment-sites-23-43.json'
  ],
  features
};

if (features.length !== scenario.scenario.totalPhysicalLocationCount) throw new Error('Feature count mismatch.');
if (additionalFeatures.length !== scenario.scenario.additionalSiteCount) throw new Error('Additional feature count mismatch.');
if (additionalFeatures.some((feature) => !Number.isInteger(feature.properties.oldSite) || !feature.properties.aerialRating)) {
  throw new Error('An additional feature lacks its prior site or aerial assessment.');
}

const output = resolve(reportDirectory, 'fixed-existing-recommended-search-zones.geojson');
await writeFile(output, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, features: features.length, additions: additionalFeatures.length, ratingCounts }, null, 2));
