#!/usr/bin/env node

import { buildSite } from './build/site.mjs';

buildSite().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
