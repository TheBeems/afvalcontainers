#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const inputUrl = new URL('fixed-existing-household-coverage-275.json', reportDirectory);
const outputUrl = new URL('ownership-screen-275.json', reportDirectory);
const ownershipUrl = 'https://geoservices.noord-holland.nl/ags/rest/services/pnh_op/pnh_brk_percelen/MapServer/1/query';

function queryOwnership(lon, lat, distance = 0) {
  const argumentsList = [
    '-fsSL',
    '--get',
    ownershipUrl,
    '--data-urlencode', 'f=json',
    '--data-urlencode', `geometry=${lon},${lat}`,
    '--data-urlencode', 'geometryType=esriGeometryPoint',
    '--data-urlencode', 'inSR=4326',
    '--data-urlencode', 'spatialRel=esriSpatialRelIntersects',
    '--data-urlencode', 'outFields=perceelsaanduiding,naam,aardzakelijkrecht',
    '--data-urlencode', 'returnGeometry=false'
  ];
  if (distance > 0) {
    argumentsList.push(
      '--data-urlencode', `distance=${distance}`,
      '--data-urlencode', 'units=esriSRUnit_Meter'
    );
  }
  const response = JSON.parse(execFileSync('curl', argumentsList, { encoding: 'utf8' }));
  if (response.error) throw new Error(response.error.message);
  return (response.features ?? []).map(({ attributes }) => attributes);
}

const scenario = JSON.parse(readFileSync(inputUrl, 'utf8'));
const additionalLocations = scenario.locations.filter(({ role, kind }) => (
  !String(role ?? kind ?? '').includes('existing')
));

const sites = additionalLocations.map((location) => {
  const exactParcels = queryOwnership(location.lon, location.lat);
  const nearbyParcels = queryOwnership(location.lon, location.lat, 25);
  const exactMunicipal = exactParcels.filter(({ naam }) => naam === 'Gemeente Schagen');
  const nearbyMunicipal = nearbyParcels.filter(({ naam }) => naam === 'Gemeente Schagen');
  return {
    id: location.id,
    latitude: location.lat,
    longitude: location.lon,
    exactMunicipal: exactMunicipal.length > 0,
    exactMunicipalParcels: [...new Set(exactMunicipal.map(({ perceelsaanduiding }) => perceelsaanduiding).filter(Boolean))],
    municipalParcelWithin25M: nearbyMunicipal.length > 0,
    nearbyMunicipalParcels: [...new Set(nearbyMunicipal.map(({ perceelsaanduiding }) => perceelsaanduiding).filter(Boolean))],
    exactParcelRecordCount: exactParcels.length,
    nearbyParcelRecordCount: nearbyParcels.length
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  source: ownershipUrl,
  note: 'Openbare BRK-grootgrondgebruiksscreening; geen juridische eigendomsverklaring, volledige kadastrale recherche, KLIC- of terreintoets. Niet-gemeentelijke eigenaarsnamen zijn bewust niet opgeslagen.',
  searchRadiusM: 25,
  counts: {
    sites: sites.length,
    exactMunicipal: sites.filter(({ exactMunicipal }) => exactMunicipal).length,
    municipalWithin25M: sites.filter(({ municipalParcelWithin25M }) => municipalParcelWithin25M).length
  },
  sites
};

writeFileSync(outputUrl, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.counts, null, 2));
