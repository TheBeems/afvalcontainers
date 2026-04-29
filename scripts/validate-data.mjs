#!/usr/bin/env node

import { validateData } from './validation/data.mjs';

validateData().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
