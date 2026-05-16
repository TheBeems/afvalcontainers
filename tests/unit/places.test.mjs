import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import {
  getPublishablePlaces,
  isPublishablePlace,
  normalizePlace
} from '../../scripts/places.mjs';

function makePlace(id, baseDir) {
  return normalizePlace({
    id,
    name: 'Testdorp',
    containerIdPrefix: 'TD',
    map: {
      center: [52.7, 4.7],
      zoom: 16
    },
    paths: {
      containers: join(baseDir, id, 'container-locations.json'),
      coverageSummary: join(baseDir, id, 'coverage-summary.json'),
      houseMap: join(baseDir, id, 'house-map.json'),
      addressIndex: join(baseDir, id, 'address-index.compact.json'),
      houseDetailsBase: join(baseDir, id, 'house-details')
    }
  });
}

async function writeCompletePlaceData(place) {
  await mkdir(place.paths.houseDetailsBase, { recursive: true });
  await writeFile(place.paths.containers, '[]\n', 'utf8');
  await writeFile(place.paths.coverageSummary, '{}\n', 'utf8');
  await writeFile(place.paths.houseMap, '[]\n', 'utf8');
  await writeFile(place.paths.addressIndex, '[]\n', 'utf8');
  await writeFile(join(place.paths.houseDetailsBase, 'dummy.json'), '{}\n', 'utf8');
}

describe('place publishing', () => {
  it('keeps configured places hidden until complete runtime data exists', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'afvalcontainers-places-'));
    const missingPlace = makePlace('missing-dorp', baseDir);
    const completePlace = makePlace('complete-dorp', baseDir);

    await writeCompletePlaceData(completePlace);

    assert.equal(await isPublishablePlace(missingPlace), false);
    assert.equal(await isPublishablePlace(completePlace), true);
    assert.deepEqual(
      (await getPublishablePlaces([missingPlace, completePlace])).map((place) => place.id),
      ['complete-dorp']
    );
  });
});
