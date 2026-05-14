import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import { splitHouseCoverage } from '../split-house-coverage.mjs';
import { readPlacesManifest, resolveProjectPath } from '../places.mjs';
import { escapeHtml } from '../../src/shared/html.js';
import { formatPercent } from '../../src/shared/format.js';
import {
  getMethodologyUrl,
  getPlaceDescription,
  getPlaceOgDescription,
  getPlaceSlug,
  getPlaceTitle,
  getPlaceUrl,
  SITE_BASE_PATH,
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE_ALT,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_PATH,
  SOCIAL_IMAGE_URL,
  SOCIAL_IMAGE_WIDTH
} from '../../src/shared/seo.js';

export const projectRoot = resolve(import.meta.dirname, '../..');
export const distDir = resolve(projectRoot, 'dist');

const seoBlockPattern = /  <!-- SEO_META_START -->[\s\S]*?  <!-- SEO_META_END -->/;

const placeFilePathKeys = [
  'containers',
  'coverageSummary',
  'houseMap',
  'addressIndex'
];

function getDistPathForProjectPath(path) {
  return resolve(distDir, relative(projectRoot, path));
}

async function copyProjectFile(path) {
  const destination = getDistPathForProjectPath(path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(path, destination);
}

async function copyProjectDirectory(path) {
  const destination = getDistPathForProjectPath(path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(path, destination, { recursive: true });
}

async function copyRuntimeData(places) {
  await copyProjectFile(resolve(projectRoot, 'data/places.json'));

  for (const place of places) {
    for (const key of placeFilePathKeys) {
      await copyProjectFile(resolveProjectPath(place.paths[key]));
    }
    await copyProjectDirectory(resolveProjectPath(place.paths.houseDetailsBase));
  }
}

function stripProjectRelativePrefix(path) {
  return String(path || '').replace(/^\.\//, '');
}

function escapeScriptJson(json) {
  return json.replace(/</g, '\\u003c');
}

function replaceElementHtml(html, id, value) {
  const pattern = new RegExp(`(<([a-z0-9-]+)[^>]+id="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`, 'i');
  return html.replace(pattern, `$1${value}$3`);
}

function replaceSeoBlock(html, seoBlock) {
  if (!seoBlockPattern.test(html)) {
    throw new Error('SEO metadata block not found in built index.html.');
  }
  return html.replace(seoBlockPattern, seoBlock);
}

function buildSeoBlock({
  title,
  description,
  ogDescription,
  canonicalUrl,
  runtimeBasePath,
  assetPrefix,
  structuredData
}) {
  const structuredDataJson = escapeScriptJson(JSON.stringify(structuredData));

  return `  <!-- SEO_META_START -->
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta name="app-base-path" content="${escapeHtml(runtimeBasePath)}" />
  <meta name="google-site-verification" content="ES3ubYr2R7I0_Pg-HaWZvCWxyjLok_cc0ehza4pJauU" />
  <link rel="icon" href="${escapeHtml(assetPrefix)}favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="${escapeHtml(assetPrefix)}favicon.png" type="image/png" sizes="64x64" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />
  <meta property="og:image:width" content="${SOCIAL_IMAGE_WIDTH}" />
  <meta property="og:image:height" content="${SOCIAL_IMAGE_HEIGHT}" />
  <meta property="og:image:alt" content="${escapeHtml(SOCIAL_IMAGE_ALT)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_IMAGE_ALT)}" />
  <script type="application/ld+json">${structuredDataJson}</script>
  <!-- SEO_META_END -->`;
}

function buildWebsiteStructuredData() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: 'nl'
  };
}

function buildPlaceStructuredData(place, coverageSummary) {
  const canonicalUrl = getPlaceUrl(place);
  const title = getPlaceTitle(place);
  const description = getPlaceDescription(place);
  const dataset = {
    '@type': 'Dataset',
    '@id': `${canonicalUrl}#dataset`,
    name: `Loopafstandsanalyse restafvalcontainers ${place.name}`,
    description,
    url: canonicalUrl,
    inLanguage: 'nl',
    spatialCoverage: {
      '@type': 'Place',
      name: place.name
    },
    creator: {
      '@type': 'Organization',
      name: 'Dorpsraad Warmenhuizen'
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}${stripProjectRelativePrefix(place.paths.coverageSummary)}`
      }
    ]
  };

  if (coverageSummary?.generatedAt) {
    dataset.dateModified = coverageSummary.generatedAt;
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebsiteStructuredData(),
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: title,
        description,
        isPartOf: { '@id': `${SITE_URL}#website` },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: SOCIAL_IMAGE_URL,
          width: SOCIAL_IMAGE_WIDTH,
          height: SOCIAL_IMAGE_HEIGHT
        },
        inLanguage: 'nl'
      },
      dataset
    ]
  };
}

function buildMethodologyStructuredData() {
  const url = getMethodologyUrl();
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebsiteStructuredData(),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: 'Methodiek en bronnen voor de loopafstandsanalyse',
        description: 'Uitleg van de databronnen, afstandscategorieen en berekening van werkelijke loopafstanden naar restafvalcontainers.',
        isPartOf: { '@id': `${SITE_URL}#website` },
        inLanguage: 'nl'
      }
    ]
  };
}

function getIntroMetrics(coverageSummary) {
  const summary = coverageSummary?.summary || {};
  const counts = summary.counts || {};
  const totalAddresses = Number.isFinite(summary.totalAddresses) ? summary.totalAddresses : 0;
  const longDistanceCount = (counts.between_150_275 || 0) + (counts.over_275 || 0);
  const overReferenceCount = counts.over_275 || 0;
  const roundedLongDistancePercent = totalAddresses > 0
    ? Math.floor((longDistanceCount / totalAddresses) * 100)
    : 0;

  return {
    totalAddresses,
    longDistanceCount,
    overReferenceCount,
    roundedLongDistancePercent,
    longDistancePercent: formatPercent(longDistanceCount, totalAddresses),
    overReferencePercent: formatPercent(overReferenceCount, totalAddresses)
  };
}

function applyInitialPlaceContent(html, place, coverageSummary) {
  const metrics = getIntroMetrics(coverageSummary);
  let pageHtml = html;

  pageHtml = pageHtml.replace(/(<span data-place-name>)([\s\S]*?)(<\/span>)/g, `$1${escapeHtml(place.name)}$3`);
  pageHtml = replaceElementHtml(pageHtml, 'app-title', escapeHtml(getPlaceTitle(place)));
  pageHtml = replaceElementHtml(pageHtml, 'story-gevolgen-title', `Meer dan ${metrics.roundedLongDistancePercent}% loopt 150 meter of meer`);
  pageHtml = pageHtml.replace(
    /aria-label="Ga naar stap 5: Meer dan \d+% loopt 150 meter of meer"/,
    `aria-label="Ga naar stap 5: Meer dan ${metrics.roundedLongDistancePercent}% loopt 150 meter of meer"`
  );
  pageHtml = replaceElementHtml(pageHtml, 'story-long-distance-count', metrics.longDistanceCount.toLocaleString('nl-NL'));
  pageHtml = replaceElementHtml(pageHtml, 'story-total-address-count', metrics.totalAddresses.toLocaleString('nl-NL'));
  pageHtml = replaceElementHtml(pageHtml, 'story-over-reference-count', metrics.overReferenceCount.toLocaleString('nl-NL'));
  pageHtml = replaceElementHtml(pageHtml, 'intro-long-distance-count', metrics.longDistanceCount.toLocaleString('nl-NL'));
  pageHtml = replaceElementHtml(pageHtml, 'intro-total-address-count', metrics.totalAddresses.toLocaleString('nl-NL'));
  pageHtml = replaceElementHtml(pageHtml, 'intro-long-distance-percent', metrics.longDistancePercent);
  pageHtml = replaceElementHtml(
    pageHtml,
    'intro-over-reference-text',
    `Daarvan liggen <strong>${metrics.overReferenceCount.toLocaleString('nl-NL')}</strong> adressen boven <em>275 meter</em> (${metrics.overReferencePercent}).`
  );
  pageHtml = pageHtml.replace(
    /(<a id="place-source-link" href=")[^"]+(")/,
    `$1${escapeHtml(place.sourceUrl)}$2`
  );
  pageHtml = pageHtml.replace(
    /aria-label="Kaart van [^"]+"/,
    `aria-label="Kaart van ${escapeHtml(place.name)} met containerlocaties en batchanalyse"`
  );

  return pageHtml;
}

function rewriteAppRelativePaths(html, assetPrefix) {
  if (assetPrefix === './') {
    return html;
  }

  return html
    .replaceAll('src="./assets/', `src="${assetPrefix}assets/`)
    .replaceAll('href="./assets/', `href="${assetPrefix}assets/`)
    .replaceAll('href="./methodiek/"', `href="${assetPrefix}methodiek/"`);
}

async function readCoverageSummary(place) {
  return JSON.parse(await readFile(resolveProjectPath(place.paths.coverageSummary), 'utf8'));
}

async function createAppPage(templateHtml, place, { runtimeBasePath, assetPrefix }) {
  const coverageSummary = await readCoverageSummary(place);
  const title = getPlaceTitle(place);
  const pageHtml = replaceSeoBlock(
    applyInitialPlaceContent(rewriteAppRelativePaths(templateHtml, assetPrefix), place, coverageSummary),
    buildSeoBlock({
      title,
      description: getPlaceDescription(place),
      ogDescription: getPlaceOgDescription(place),
      canonicalUrl: getPlaceUrl(place),
      runtimeBasePath,
      assetPrefix,
      structuredData: buildPlaceStructuredData(place, coverageSummary)
    })
  );

  return pageHtml;
}

function buildMethodologyPage() {
  const title = 'Methodiek en bronnen voor de loopafstandsanalyse';
  const description = 'Uitleg van databronnen, afstandscategorieen en berekening van werkelijke loopafstanden naar restafvalcontainers in de gemeente Schagen.';
  const seoBlock = buildSeoBlock({
    title,
    description,
    ogDescription: description,
    canonicalUrl: getMethodologyUrl(),
    runtimeBasePath: '../',
    assetPrefix: '../',
    structuredData: buildMethodologyStructuredData()
  });

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${seoBlock}
  <style>
    :root {
      color-scheme: light;
      --text: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --accent: #0f766e;
      --bg: #f8fafc;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
    }

    main {
      width: min(920px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0 64px;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 32px;
    }

    a {
      color: var(--accent);
      font-weight: 700;
    }

    h1 {
      max-width: 760px;
      margin: 0 0 16px;
      font-size: clamp(34px, 6vw, 56px);
      line-height: 1.05;
    }

    h2 {
      margin-top: 40px;
      border-top: 1px solid var(--line);
      padding-top: 28px;
      font-size: 28px;
      line-height: 1.2;
    }

    p,
    li {
      color: var(--muted);
      font-size: 18px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }

    th,
    td {
      border: 1px solid var(--line);
      padding: 12px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #e2e8f0;
      color: var(--text);
    }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Hoofdnavigatie">
      <a href="../warmenhuizen/">Kaart Warmenhuizen</a>
      <a href="../tuitjenhorn/">Kaart Tuitjenhorn</a>
    </nav>

    <h1>Methodiek en bronnen</h1>
    <p>Deze website berekent per woonadres binnen de bebouwde kom de werkelijke loopafstand naar de dichtstbijzijnde restafvalcontainers. De analyse gebruikt looproutes via wegen en paden, omdat hemelsbrede afstanden in de praktijk niet laten zien hoe ver bewoners echt moeten lopen.</p>

    <h2>Berekening</h2>
    <p>Adressen komen uit PDOK BAG. De bebouwde-komgrens komt uit BRT TOP10NL. Looproutes worden batchgewijs berekend met OSRM op basis van OpenStreetMap. De browser gebruikt de vooraf berekende JSON-data; alleen wanneer een opgeslagen routegeometrie ontbreekt, mag de kaart live OSRM gebruiken als visuele fallback.</p>

    <h2>Afstandscategorieen</h2>
    <table>
      <thead>
        <tr>
          <th>Loopafstand</th>
          <th>Betekenis</th>
          <th>Kleur</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>0-100 m</td><td>Laag risico op afstandsklachten.</td><td>Groen</td></tr>
        <tr><td>100-125 m</td><td>Overgangszone waarin route en bereikbaarheid belangrijker worden.</td><td>Geel</td></tr>
        <tr><td>125-150 m</td><td>Waarschuwingszone rond een striktere afstandsnorm.</td><td>Oranje</td></tr>
        <tr><td>150-275 m</td><td>Verhoogde kans op ontevredenheid, ook al valt dit binnen de Schagense richtafstand.</td><td>Rood</td></tr>
        <tr><td>&gt;275 m</td><td>Boven de door Schagen genoemde richtafstand.</td><td>Donkerrood</td></tr>
      </tbody>
    </table>

    <h2>Bronnen</h2>
    <ul>
      <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen">Gemeente Schagen: Warmenhuizen</a></li>
      <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-tuitjenhorn">Gemeente Schagen: Tuitjenhorn</a></li>
      <li><a href="https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1">PDOK BAG</a></li>
      <li><a href="https://api.pdok.nl/brt/top10nl/ogc/v1/collections/plaats_multivlak?f=html">PDOK BRT TOP10NL</a></li>
      <li><a href="https://www.openstreetmap.org/">OpenStreetMap</a></li>
      <li><a href="https://project-osrm.org/">OSRM</a></li>
      <li><a href="https://github.com/TheBeems/afvalcontainers/blob/main/README.md">Volledige onderzoeksbasis en evaluatiebronnen</a></li>
    </ul>
  </main>
</body>
</html>
`;
}

async function copySeoAssets() {
  await copyFile(resolve(projectRoot, 'src/assets/seo/favicon.svg'), resolve(distDir, 'favicon.svg'));
  await copyFile(resolve(projectRoot, 'src/assets/seo/favicon.png'), resolve(distDir, 'favicon.png'));
  await mkdir(resolve(distDir, 'social'), { recursive: true });
  await copyFile(
    resolve(projectRoot, 'src/assets/seo/afvalcontainers-schagen-preview.png'),
    resolve(distDir, SOCIAL_IMAGE_PATH)
  );
}

async function writeSeoPages(places) {
  const templateHtml = await readFile(resolve(distDir, 'index.html'), 'utf8');
  const defaultPlace = places.find((place) => place.id === 'warmenhuizen') || places[0];

  await writeFile(resolve(distDir, 'index.html'), await createAppPage(templateHtml, defaultPlace, {
    runtimeBasePath: './',
    assetPrefix: './'
  }), 'utf8');

  for (const place of places) {
    const slug = getPlaceSlug(place);
    const placeDir = resolve(distDir, slug);
    await mkdir(placeDir, { recursive: true });
    await writeFile(resolve(placeDir, 'index.html'), await createAppPage(templateHtml, place, {
      runtimeBasePath: '../',
      assetPrefix: '../'
    }), 'utf8');
  }

  await mkdir(resolve(distDir, 'methodiek'), { recursive: true });
  await writeFile(resolve(distDir, 'methodiek/index.html'), buildMethodologyPage(), 'utf8');
}

async function writeRobotsTxt() {
  await writeFile(resolve(distDir, 'robots.txt'), `User-agent: *
Allow: ${SITE_BASE_PATH}
Sitemap: ${SITE_URL}sitemap.xml
`, 'utf8');
}

async function writeSitemap(places) {
  const urls = [
    ...places.map((place) => getPlaceUrl(place)),
    getMethodologyUrl()
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${escapeHtml(url)}</loc>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(resolve(distDir, 'sitemap.xml'), sitemap, 'utf8');
}

export async function buildSite() {
  await splitHouseCoverage({ verbose: false });
  await rm(distDir, { recursive: true, force: true });
  const places = await readPlacesManifest();
  await viteBuild({
    configFile: resolve(projectRoot, 'vite.config.js')
  });
  await copyRuntimeData(places);
  await copySeoAssets();
  await writeSeoPages(places);
  await writeRobotsTxt();
  await writeSitemap(places);

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}
