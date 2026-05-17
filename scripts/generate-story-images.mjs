#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import sharp from 'sharp';

const projectRoot = resolve(import.meta.dirname, '..');
const sourceDir = resolve(projectRoot, 'src/assets/story');
const outputDir = resolve(sourceDir, 'generated');
const landscapeWidths = [960, 1400, 1672];
const portraitWidths = [720, 960];
const landscapeImages = [
  'ophalen-aan-huis.png',
  'brengsysteem.png',
  'werkelijke-looproute.png',
  'loopafstand-ervaring.png',
  'praktische-gevolgen.png'
];
const portraitImages = [
  'ophalen-aan-huis-portrait.png',
  'brengsysteem-portrait.png',
  'werkelijke-looproute-portrait.png',
  'loopafstand-ervaring-portrait.png',
  'praktische-gevolgen-portrait.png'
];

function getOutputPath(fileName, width, extension) {
  const name = basename(fileName, '.png');
  return resolve(outputDir, `${name}-${width}.${extension}`);
}

async function generateImageVariants(fileName, widths, { includePng = true } = {}) {
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

  if (includePng) {
    const fallbackWidth = Math.max(...widths);

    await sharp(inputPath)
      .resize({
        width: fallbackWidth,
        withoutEnlargement: true
      })
      .png({ palette: true, quality: 82, compressionLevel: 9 })
      .toFile(getOutputPath(fileName, fallbackWidth, 'png'));
  }
}

await mkdir(outputDir, { recursive: true });

for (const image of landscapeImages) {
  await generateImageVariants(image, landscapeWidths);
}

for (const image of portraitImages) {
  await generateImageVariants(image, portraitWidths, { includePng: false });
}

const generatedCount = (landscapeImages.length * ((landscapeWidths.length * 2) + 1))
  + (portraitImages.length * (portraitWidths.length * 2));

console.log(`Generated ${generatedCount} story image variants in ${outputDir}`);
