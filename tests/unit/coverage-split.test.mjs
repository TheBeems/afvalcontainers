import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { splitCoverageForPlace } from '../../scripts/split-house-coverage.mjs';

test('splits straight-line coverage for accessible rest and semi-rest containers', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'afvalcontainers-coverage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const place = {
    id: 'testdorp',
    name: 'Testdorp',
    paths: {
      coverageSummary: join(directory, 'coverage-summary.json'),
      houseMap: join(directory, 'house-map.json'),
      addressIndex: join(directory, 'address-index.compact.json'),
      houseDetailsBase: join(directory, 'house-details')
    }
  };
  const containers = [
    { id: 'TD01', type: 'rest', lat: 52, lon: 4 },
    {
      id: 'TD02',
      type: 'semi-rest',
      lat: 52.007,
      lon: 4,
      access: { scope: 'private', allowedAddresses: [{ street: 'Kerkstraat', houseNumbers: '1' }] }
    },
    { id: 'TD03', type: 'gfe', lat: 52.01, lon: 4 },
    { id: 'TD04', type: 'rest', lat: 52.013, lon: 4 }
  ];
  const houses = [
    { id: 'near', address: 'Dorpstraat 1', lat: 52.00134, lon: 4, nearestContainerId: 'TD04', walkingDistance: 321.6, coverageStatus: 'over_275' },
    { id: 'far', address: 'Dorpstraat 2', lat: 52.00136, lon: 4, nearestContainerId: 'TD01', coverageStatus: 'between_150_275' },
    { id: 'allowed', address: 'Kerkstraat 1', lat: 52.007, lon: 4, coverageStatus: 'unreachable' },
    { id: 'denied', address: 'Kerkstraat 2', lat: 52.007, lon: 4, coverageStatus: 'over_275' },
    { id: 'gfe', address: 'Dorpstraat 3', lat: 52.01, lon: 4, coverageStatus: 'over_275' }
  ];

  await splitCoverageForPlace(place, { houses }, containers);

  const markerRows = JSON.parse(await readFile(place.paths.houseMap, 'utf8'));
  assert.deepEqual(
    markerRows.map(({ id, withinResidentialRadius }) => [id, withinResidentialRadius]),
    [['near', true], ['far', false], ['allowed', true], ['denied', false], ['gfe', false]]
  );
  assert.equal(markerRows[0].nearestContainerId, 'TD04');
  assert.equal(markerRows[0].walkingDistance, 321.6);
  assert.equal(markerRows[2].coverageStatus, 'unreachable');
  assert.equal(markerRows[2].walkingDistance, null);
});
