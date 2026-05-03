#!/usr/bin/env node

import { splitHouseCoverage } from './split-house-coverage.mjs';

export async function generateAddressIndexes({ verbose = true } = {}) {
  return splitHouseCoverage({ verbose });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAddressIndexes().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
