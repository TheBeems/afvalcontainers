#!/usr/bin/env node

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const sourcePath = resolve(projectRoot, 'docs/papieren-enquete.html');
const outputPath = resolve(projectRoot, 'docs/papieren-enquete.pdf');

async function generateSurveyPdf() {
  await mkdir(dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(sourcePath).toString(), { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      },
      printBackground: true,
      preferCSSPageSize: true,
      scale: 0.92,
      tagged: true
    });
  } finally {
    await browser.close();
  }

  console.log(`PDF gegenereerd: ${outputPath}`);
}

generateSurveyPdf().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
