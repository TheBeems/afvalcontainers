#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import sharp from 'sharp';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDir = resolve(projectRoot, 'src/assets/story');
const outputDir = resolve(sourceDir, 'generated');
const widths = [960, 1400, 1672];
const images = [
  'ophalen-aan-huis.png',
  'brengsysteem.png',
  'werkelijke-looproute.png',
  'loopafstand-ervaring.png',
  'praktische-gevolgen.png'
];

function getOutputPath(fileName, width, extension) {
  const name = basename(fileName, '.png');
  return resolve(outputDir, `${name}-${width}.${extension}`);
}

async function generateImageVariants(fileName) {
  const inputPath = resolve(sourceDir, fileName);

  for (const width of widths) {
    const pipeline = sharp(inputPath).resize({
      width,
      withoutEnlargement: true
    });

    await pipeline
      .clone()
      .avif({ quality: 62, effort: 6 })
      .toFile(getOutputPath(fileName, width, 'avif'));

    await pipeline
      .clone()
      .webp({ quality: 78, effort: 5 })
      .toFile(getOutputPath(fileName, width, 'webp'));
  }
}

await mkdir(outputDir, { recursive: true });

for (const image of images) {
  await generateImageVariants(image);
}

console.log(`Generated ${images.length * widths.length * 2} story image variants in ${outputDir}`);
