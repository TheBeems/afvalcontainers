#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prior = resolve(here, '../locatieoptimalisatie-2026-08-13');
const matrix = JSON.parse(readFileSync(resolve(prior, 'walking-matrix.json'), 'utf8'));
const existing = JSON.parse(readFileSync(resolve(prior, 'existing-11-household-coverage.json'), 'utf8'));

const fixed = ['WH03', 'WH05', 'WH06', 'WH08', 'WH14', 'WH26', 'WH27', 'WH33', 'WH34'];
const additions = [
  'WH18', 'M044', 'M016', 'M101', 'M004', 'M149', 'M027', 'WH19', 'M154',
  'WH10', 'M020', 'M093', 'WH13', 'M041', 'M134', 'M018', 'M100', 'M024',
  'M051', 'WH30', 'WH02', 'M045', 'WH12', 'M094', 'M104', 'M157'
];
const privateLocationIds = new Set(['WH23', 'WH24']);
const privateIds = new Set(existing.houses
  .filter(({ nearestLocationId }) => privateLocationIds.has(nearestLocationId))
  .map(({ id }) => id));
const publicIndexes = matrix.houseIds.flatMap((id, index) => privateIds.has(id) ? [] : [index]);
const candidateIndex = new Map(matrix.candidateIds.map((id, index) => [id, index]));

if (privateIds.size !== 7) throw new Error(`Expected seven allowlisted private addresses, found ${privateIds.size}.`);
if (publicIndexes.length !== 2572) throw new Error(`Expected 2572 public addresses, found ${publicIndexes.length}.`);

function auction(siteIds) {
  const capacity = 90;
  const slots = siteIds.flatMap((id, siteIndex) => Array.from({ length: capacity }, (_, slotIndex) => ({
    siteIndex,
    reserved: !fixed.includes(id) && slotIndex < 60
  })));
  const realCount = publicIndexes.length;
  const count = slots.length;
  const prices = new Float64Array(count);
  const owner = new Int32Array(count);
  const assignment = new Int32Array(count);
  const columns = siteIds.map((id) => {
    const index = candidateIndex.get(id);
    if (index === undefined) throw new Error(`Candidate ${id} is missing from the walking matrix.`);
    return index;
  });
  const cost = (person, slot) => person >= realCount
    ? slots[slot].reserved ? 10_000 : 0
    : matrix.distances[publicIndexes[person]][columns[slots[slot].siteIndex]];

  for (const epsilon of [64, 16, 4, 1, 0.25, 0.05, 0.01]) {
    owner.fill(-1);
    assignment.fill(-1);
    const queue = Array.from({ length: count }, (_, index) => index);
    let cursor = 0;
    while (cursor < queue.length) {
      const person = queue[cursor++];
      let bestSlot = -1;
      let best = -Infinity;
      let second = -Infinity;
      for (let slot = 0; slot < count; slot += 1) {
        const value = -cost(person, slot) - prices[slot];
        if (value > best) {
          second = best;
          best = value;
          bestSlot = slot;
        } else if (value > second) {
          second = value;
        }
      }
      prices[bestSlot] += best - second + epsilon;
      const displaced = owner[bestSlot];
      owner[bestSlot] = person;
      assignment[person] = bestSlot;
      if (displaced >= 0) queue.push(displaced);
    }
  }

  const distances = [];
  const loads = Object.fromEntries(siteIds.map((id) => [id, 0]));
  for (let person = 0; person < realCount; person += 1) {
    const siteIndex = slots[assignment[person]].siteIndex;
    const id = siteIds[siteIndex];
    loads[id] += 1;
    distances.push(matrix.distances[publicIndexes[person]][columns[siteIndex]]);
  }
  distances.sort((a, b) => a - b);
  const total = distances.reduce((sum, value) => sum + value, 0);
  return {
    total: Number(total.toFixed(1)),
    average: Number((total / distances.length).toFixed(3)),
    p50: distances[Math.ceil(0.50 * distances.length) - 1],
    p90: distances[Math.ceil(0.90 * distances.length) - 1],
    p95: distances[Math.ceil(0.95 * distances.length) - 1],
    maximum: distances.at(-1),
    bands: {
      within100: distances.filter((distance) => distance <= 100).length,
      between100And125: distances.filter((distance) => distance > 100 && distance <= 125).length,
      between125And150: distances.filter((distance) => distance > 125 && distance <= 150).length,
      between150And275: distances.filter((distance) => distance > 150 && distance <= 275).length,
      over275: distances.filter((distance) => distance > 275).length
    },
    loads
  };
}

const results = additions.map((removed) => ({
  removed,
  ...auction([...fixed, ...additions.filter((id) => id !== removed)])
})).sort((a, b) => a.total - b.total || a.p95 - b.p95 || a.removed.localeCompare(b.removed));

const evaluation = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: 'Complete capacity-constrained leave-one-out comparison of all 26 starting additions',
  fixedPublicIds: fixed,
  startingAdditionIds: additions,
  privateLocationIds: [...privateLocationIds],
  privateHouseholds: privateIds.size,
  publicHouseholds: publicIndexes.length,
  results
};

writeFileSync(resolve(here, 'private-access-leave-one-out.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
console.log(JSON.stringify({
  output: 'private-access-leave-one-out.json',
  publicHouseholds: evaluation.publicHouseholds,
  selectedRemoval: results[0]
}, null, 2));
