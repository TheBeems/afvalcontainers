#!/usr/bin/env node

import { generateHouseCoverage } from './generator/house-coverage.mjs';

generateHouseCoverage().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
