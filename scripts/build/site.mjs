import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { build as viteBuild } from 'vite';
import { splitHouseCoverage } from '../split-house-coverage.mjs';
import {
  getDefaultPlace,
  getPublishablePlaces,
  publishablePlaceFilePathKeys,
  readPlacesManifest,
  resolveProjectPath
} from '../places.mjs';
import { escapeHtml } from '../../src/shared/html.js';
import { formatDuration, formatMeters, formatPercent } from '../../src/shared/format.js';
import {
  getAnalysesUrl,
  getFeedbackUrl,
  getMethodologyUrl,
  getPlaceDescription,
  getPlaceOgDescription,
  getPlaceSlug,
  getPlaceTitle,
  getPlaceUrl,
  getSurveyUrl,
  ORGANIZATION_ID,
  ORGANIZATION_NAME,
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
const GOOGLE_SITE_VERIFICATION = 'ES3ubYr2R7I0_Pg-HaWZvCWxyjLok_cc0ehza4pJauU';
const DATASET_LICENSE_NAME = 'CC BY 4.0';
const DATASET_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const SURVEY_ANALYSIS_PATH = resolve(projectRoot, 'data/places/warmenhuizen/survey-analysis-2026-07-02.json');

const ANALYSIS_HEADER_DESCRIPTIONS = {
  'Gem. afstand': 'De gemiddelde loopafstand: alle afstanden bij elkaar opgeteld en gedeeld door het aantal adressen.',
  'Gem. tijd': 'De gemiddelde looptijd naar de dichtstbijzijnde container, gerekend met rustig wandelen van 4 km per uur.',
  'Mediaan': 'De middelste afstand: de helft van de adressen loopt korter en de andere helft loopt langer.',
  'P90': 'De afstand waar 90% van de adressen onder blijft. Alleen de laatste 10% loopt verder dan dit.',
  'Max.': 'De grootste loopafstand in deze groep adressen.',
  'Max. afstand': 'De grootste loopafstand voor adressen waarvoor deze container de dichtstbijzijnde is.',
  '>=150 m': 'Het aantal adressen dat 150 meter of meer moet lopen naar de dichtstbijzijnde container.',
  '>275 m': 'Het aantal adressen dat verder dan 275 meter moet lopen naar de dichtstbijzijnde container.',
  'Straten gem. >=150 m': 'Het aantal straten waarvan de gemiddelde loopafstand 150 meter of meer is.'
};

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

async function writeRuntimeManifest(fileName, places) {
  const manifestDestination = resolve(distDir, `data/${fileName}`);
  await mkdir(dirname(manifestDestination), { recursive: true });
  await writeFile(manifestDestination, `${JSON.stringify(places, null, 2)}\n`, 'utf8');
}

async function copyRuntimeData(places, sourcePlaces = places) {
  await writeRuntimeManifest('places.json', places);
  await writeRuntimeManifest('places-catalog.json', sourcePlaces);

  for (const place of places) {
    for (const key of publishablePlaceFilePathKeys) {
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

function buildPlaceMapLinks(places, prefix = './') {
  return places
    .map((place) => `<a href="${escapeHtml(prefix)}${escapeHtml(getPlaceSlug(place))}/#kaart">Kaart ${escapeHtml(place.name)}</a>`)
    .join('\n      ');
}

function buildFooterLinks(places) {
  const rootPath = (path) => `${SITE_BASE_PATH}${path}`;

  return [
    ...places.map((place) => `<a href="${escapeHtml(rootPath(`${getPlaceSlug(place)}/`))}">${escapeHtml(place.name)}</a>`),
    `<a href="${escapeHtml(rootPath('analyses/'))}">Analyses</a>`,
    `<a href="${escapeHtml(rootPath('enquete/'))}">Enquête</a>`,
    `<a href="${escapeHtml(rootPath('methodiek/'))}">Methodiek</a>`,
    `<a href="${escapeHtml(rootPath('terugkoppeling/'))}">Terugkoppeling</a>`,
    `<a href="${DATASET_LICENSE_URL}" rel="license">Data: ${DATASET_LICENSE_NAME}</a>`
  ].join('\n        ');
}

function replaceSidebarFooterNav(html, places) {
  const footerNav = `<nav class="sidebar-footer-nav" aria-label="Secundaire navigatie">
        ${buildFooterLinks(places)}
      </nav>`;
  return html.replace(/<nav class="sidebar-footer-nav"[\s\S]*?<\/nav>/, footerNav);
}

function buildPlaceSourceReference(place) {
  return place.sourceUrl
    ? `<a id="place-source-link" href="${escapeHtml(place.sourceUrl)}">aangekondigd</a>`
    : '<span id="place-source-link">aangekondigd</span>';
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
  <meta name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}" />
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
    inLanguage: 'nl',
    publisher: { '@id': ORGANIZATION_ID }
  };
}

function buildOrganizationStructuredData() {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: ORGANIZATION_NAME,
    url: SITE_URL
  };
}

function buildWebPageStructuredData({ url, name, description, image = false }) {
  const page = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': `${SITE_URL}#website` },
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'nl'
  };

  if (image) {
    page.primaryImageOfPage = {
      '@type': 'ImageObject',
      url: SOCIAL_IMAGE_URL,
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT
    };
  }

  return [
    buildOrganizationStructuredData(),
    buildWebsiteStructuredData(),
    page
  ];
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
    keywords: [
      'restafvalcontainers',
      'loopafstand',
      'ondergrondse containers',
      place.name,
      'gemeente Schagen'
    ],
    measurementTechnique: 'Kortste looproute via straten en paden op basis van openbare adres- en kaartgegevens.',
    license: DATASET_LICENSE_URL,
    isAccessibleForFree: true,
    creator: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
    distribution: [
      {
        '@type': 'DataDownload',
        name: `Samenvatting loopafstandsanalyse ${place.name}`,
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
      ...buildWebPageStructuredData({
        url: canonicalUrl,
        name: title,
        description,
        image: true
      }),
      dataset
    ]
  };
}

function buildMethodologyStructuredData() {
  const url = getMethodologyUrl();
  const description = 'Korte uitleg voor bewoners van dorpen in de gemeente Schagen over de loopafstandsanalyse en de onderzoeken waarop de afstandscategorieen zijn gebaseerd.';
  return {
    '@context': 'https://schema.org',
    '@graph': buildWebPageStructuredData({
      url,
      name: 'Methodiek en onderzoeksbasis',
      description
    })
  };
}

function buildMunicipalSourceLinks(places) {
  return places
    .filter((place) => place.sourceUrl)
    .map((place) => `<li><a href="${escapeHtml(place.sourceUrl)}">Gemeente Schagen: ${escapeHtml(place.name)}</a></li>`)
    .join('\n      ');
}

function buildAnalysesStructuredData() {
  const url = getAnalysesUrl();
  const description = 'Uitgebreide analyses van loopafstanden naar restafvalcontainers per dorp, straat en containerlocatie.';
  const title = 'Analyses loopafstanden restafvalcontainers';
  return {
    '@context': 'https://schema.org',
    '@graph': buildWebPageStructuredData({
      url,
      name: title,
      description
    })
  };
}

function buildSurveyStructuredData() {
  const url = getSurveyUrl();
  const description = 'Voorlopige analyse van de enquête over restafvalcontainers in Warmenhuizen, met samengevoegde online en papieren uitkomsten en privacyveilige straatgroepen.';
  const title = 'Voorlopige enquêteanalyse Warmenhuizen';
  return {
    '@context': 'https://schema.org',
    '@graph': buildWebPageStructuredData({
      url,
      name: title,
      description
    })
  };
}

function buildFeedbackStructuredData() {
  const url = getFeedbackUrl();
  const description = 'Korte terugkoppeling over wat de Dorpsraad Warmenhuizen met reacties op de enquête over restafvalcontainers doet.';
  const title = 'Dank voor je reactie';
  return {
    '@context': 'https://schema.org',
    '@graph': buildWebPageStructuredData({
      url,
      name: title,
      description
    })
  };
}

function buildFeedbackReturnScript(places) {
  const placeSlugsJson = escapeScriptJson(JSON.stringify(places.map((place) => getPlaceSlug(place)).filter(Boolean)));

  return `<script>
    (() => {
      const returnLink = document.querySelector('[data-feedback-return-link]');
      if (!returnLink) {
        return;
      }

      const placeSlugs = new Set(${placeSlugsJson});
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      if (!returnTo) {
        return;
      }

      let returnUrl;
      try {
        returnUrl = new URL(returnTo, window.location.origin);
      } catch {
        return;
      }

      const pathSegments = returnUrl.pathname.split('/').filter(Boolean);
      if (returnUrl.origin !== window.location.origin || pathSegments.length !== 1 || !placeSlugs.has(pathSegments[0])) {
        return;
      }

      returnUrl.search = '';
      returnUrl.hash = '#kaart';
      returnLink.href = returnUrl.pathname + returnUrl.hash;
    })();
  </script>`;
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

function applyInitialPlaceContent(html, place, coverageSummary, places) {
  const metrics = getIntroMetrics(coverageSummary);
  let pageHtml = replaceSidebarFooterNav(html, places);

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
  pageHtml = replaceElementHtml(pageHtml, 'place-source-reference', buildPlaceSourceReference(place));
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
    .replaceAll('srcset="./assets/', `srcset="${assetPrefix}assets/`)
    .replaceAll(', ./assets/', `, ${assetPrefix}assets/`)
    .replaceAll('href="./assets/', `href="${assetPrefix}assets/`)
    .replaceAll('href="./analyses/"', `href="${assetPrefix}analyses/"`)
    .replaceAll('href="./methodiek/"', `href="${assetPrefix}methodiek/"`);
}

async function readCoverageSummary(place) {
  return JSON.parse(await readFile(resolveProjectPath(place.paths.coverageSummary), 'utf8'));
}

function getNearestRoute(house) {
  return house.nearestContainers?.[0] || {
    id: house.nearestContainerId,
    walkingDistance: house.walkingDistance,
    walkingDuration: house.walkingDuration,
    coverageStatus: house.coverageStatus
  };
}

function getMedian(sortedNumbers) {
  if (sortedNumbers.length === 0) {
    return 0;
  }

  const midpoint = Math.floor(sortedNumbers.length / 2);
  return sortedNumbers.length % 2 === 1
    ? sortedNumbers[midpoint]
    : (sortedNumbers[midpoint - 1] + sortedNumbers[midpoint]) / 2;
}

function getPercentile(sortedNumbers, percentile) {
  if (sortedNumbers.length === 0) {
    return 0;
  }

  const index = Math.min(sortedNumbers.length - 1, Math.ceil(sortedNumbers.length * percentile) - 1);
  return sortedNumbers[index];
}

function summarizeRows(rows) {
  if (rows.length === 0) {
    return {
      addressCount: 0,
      averageDistance: 0,
      averageDuration: 0,
      medianDistance: 0,
      p90Distance: 0,
      maxDistance: 0,
      maxAddress: '',
      over150Count: 0,
      over275Count: 0
    };
  }

  const sortedDistances = rows.map((row) => row.walkingDistance).sort((a, b) => a - b);
  const totalDistance = rows.reduce((sum, row) => sum + row.walkingDistance, 0);
  const totalDuration = rows.reduce((sum, row) => sum + (row.walkingDuration || 0), 0);
  const over150Count = rows.filter((row) => row.walkingDistance >= 150).length;
  const over275Count = rows.filter((row) => row.walkingDistance > 275).length;
  const maxRow = rows.reduce((current, row) => (
    !current || row.walkingDistance > current.walkingDistance ? row : current
  ), null);

  return {
    addressCount: rows.length,
    averageDistance: totalDistance / rows.length,
    averageDuration: totalDuration / rows.length,
    medianDistance: getMedian(sortedDistances),
    p90Distance: getPercentile(sortedDistances, 0.9),
    maxDistance: maxRow?.walkingDistance || 0,
    maxAddress: maxRow?.address || '',
    over150Count,
    over275Count
  };
}

function getMostCommonContainerId(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (row.containerId) {
      counts.set(row.containerId, (counts.get(row.containerId) || 0) + 1);
    }
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

async function readPlaceAnalysis(place) {
  const coverageSummary = await readCoverageSummary(place);
  const detailDirectory = resolveProjectPath(place.paths.houseDetailsBase);
  const detailFiles = (await readdir(detailDirectory))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, 'nl'));
  const rowsByStreet = new Map();
  const rows = [];

  for (const detailFile of detailFiles) {
    const bundle = JSON.parse(await readFile(resolve(detailDirectory, detailFile), 'utf8'));
    const streetRows = rowsByStreet.get(bundle.street) || [];

    for (const house of bundle.houses || []) {
      const nearestRoute = getNearestRoute(house);
      const walkingDistance = nearestRoute.walkingDistance;

      if (!Number.isFinite(walkingDistance)) {
        continue;
      }

      const row = {
        street: bundle.street,
        address: house.address,
        containerId: house.nearestContainerId || nearestRoute.id || '',
        containerAddress: house.nearestContainerAddress || nearestRoute.address || '',
        straightDistance: nearestRoute.straightDistance,
        walkingDistance,
        walkingDuration: nearestRoute.walkingDuration,
        coverageStatus: nearestRoute.coverageStatus || house.coverageStatus
      };

      rows.push(row);
      streetRows.push(row);
    }

    rowsByStreet.set(bundle.street, streetRows);
  }

  const streetStats = Array.from(rowsByStreet.entries())
    .map(([street, streetRows]) => {
      const summary = summarizeRows(streetRows);
      return {
        street,
        ...summary,
        over150Percent: summary.addressCount > 0 ? summary.over150Count / summary.addressCount : 0,
        over275Percent: summary.addressCount > 0 ? summary.over275Count / summary.addressCount : 0,
        mainContainerId: getMostCommonContainerId(streetRows)
      };
    })
    .sort((a, b) => a.street.localeCompare(b.street, 'nl'));

  const containerRows = new Map();
  for (const row of rows) {
    if (!row.containerId) {
      continue;
    }

    const values = containerRows.get(row.containerId) || [];
    values.push(row);
    containerRows.set(row.containerId, values);
  }

  const containerStats = Array.from(containerRows.entries())
    .map(([containerId, containerStatRows]) => ({
      containerId,
      ...summarizeRows(containerStatRows)
    }))
    .sort((a, b) => b.addressCount - a.addressCount || a.containerId.localeCompare(b.containerId, 'nl'));

  const routeRatioStats = Array.from(rowsByStreet.entries())
    .map(([street, streetRows]) => {
      const ratioRows = streetRows
        .filter((row) => Number.isFinite(row.straightDistance) && row.straightDistance > 25)
        .map((row) => ({
          ...row,
          ratio: row.walkingDistance / row.straightDistance
        }))
        .filter((row) => Number.isFinite(row.ratio));

      if (ratioRows.length === 0) {
        return null;
      }

      const highestRatioRow = ratioRows.reduce((current, row) => (
        !current || row.ratio > current.ratio ? row : current
      ), null);

      return {
        street,
        addressCount: ratioRows.length,
        averageRatio: ratioRows.reduce((sum, row) => sum + row.ratio, 0) / ratioRows.length,
        highestRatio: highestRatioRow.ratio,
        highestRatioAddress: highestRatioRow.address,
        highestRatioContainerId: highestRatioRow.containerId,
        highestRatioContainerAddress: highestRatioRow.containerAddress,
        highestRatioStraightDistance: highestRatioRow.straightDistance,
        highestRatioWalkingDistance: highestRatioRow.walkingDistance
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.averageRatio - a.averageRatio);

  return {
    place,
    coverageSummary,
    summary: coverageSummary.summary || {},
    streetStats,
    containerStats,
    routeRatioStats
  };
}

async function createAppPage(templateHtml, place, places, { runtimeBasePath, assetPrefix }) {
  const coverageSummary = await readCoverageSummary(place);
  const title = getPlaceTitle(place);
  const pageHtml = replaceSeoBlock(
    applyInitialPlaceContent(rewriteAppRelativePaths(templateHtml, assetPrefix), place, coverageSummary, places),
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

function buildMethodologyPage(places, sourcePlaces = places) {
  const title = 'Methodiek en onderzoeksbasis';
  const description = 'Korte uitleg voor bewoners van dorpen in de gemeente Schagen over de loopafstandsanalyse en de onderzoeken waarop de afstandscategorieen zijn gebaseerd.';
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

    .lead {
      max-width: 760px;
      color: var(--text);
      font-size: 21px;
    }

    h2 {
      margin-top: 40px;
      border-top: 1px solid var(--line);
      padding-top: 28px;
      font-size: 28px;
      line-height: 1.2;
    }

    h3 {
      margin: 28px 0 10px;
      font-size: 21px;
      line-height: 1.25;
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

    .source-list {
      display: grid;
      gap: 10px;
      padding-left: 22px;
    }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Hoofdnavigatie">
      ${buildPlaceMapLinks(places, '../')}
      <a href="../analyses/">Analyses</a>
      <a href="../enquete/">Enquête</a>
      <a href="../terugkoppeling/">Terugkoppeling</a>
    </nav>

    <h1>Methodiek en onderzoeksbasis</h1>
    <p class="lead">Deze pagina legt kort uit hoe de kaarten voor de dorpen in de gemeente Schagen zijn gemaakt en waarom de kleuren op de kaart juist deze afstanden gebruiken.</p>

    <h2>Wat laat de kaart zien?</h2>
    <p>De kaart kijkt per dorp (momenteel alleen Warmenhuizen en Tuitjenhorn) naar woonadressen binnen de bebouwde kom en laat zien hoe ver bewoners echt moeten lopen naar de dichtstbijzijnde geplande restafvalcontainer.</p>
    <p>Daarbij telt niet de rechte lijn op de kaart, maar de route via straten en paden. Dat verschil is belangrijk: een container kan hemelsbreed dichtbij lijken, terwijl de werkelijke looproute langer is.</p>

    <h2>Waarom deze methode?</h2>
    <p>De gemeente Schagen noemt een afstand van maximaal ongeveer 275 meter. Deze website maakt zichtbaar wat dat in de praktijk betekent per straat en per adres.</p>
    <p>De analyse is vooraf gemaakt met openbare adres- en kaartgegevens. De uitkomst is bedoeld als hulpmiddel voor bewoners: waar is de afstand beperkt, waar wordt het onhandig en welke adressen vragen extra aandacht?</p>

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
        <tr><td>0-100 m</td><td>Dichtbij. In onderzoeken blijft tevredenheid hier meestal hoger.</td><td>Groen</td></tr>
        <tr><td>100-125 m</td><td>Nog beperkt, maar de route en bereikbaarheid gaan meer tellen.</td><td>Geel</td></tr>
        <tr><td>125-150 m</td><td>Aandachtsgebied. Sommige gemeenten kiezen juist rond 150 meter als strengere grens.</td><td>Oranje</td></tr>
        <tr><td>150-275 m</td><td>Binnen de Schagense richtafstand, maar met meer kans op klachten over afstand en gemak.</td><td>Rood</td></tr>
        <tr><td>&gt;275 m</td><td>Verder dan de afstand die Schagen ongeveer noemt. Deze adressen vragen extra aandacht.</td><td>Donkerrood</td></tr>
      </tbody>
    </table>

    <h2>Onderzoeksbasis</h2>
    <p>Er is geen landelijke vaste grens waarbij iedereen tevreden of ontevreden wordt. Gemeenten meten dat verschillend. De lijn in de evaluaties is wel duidelijk: hoe verder of lastiger de route voelt, hoe lager de tevredenheid meestal wordt.</p>
    <table>
      <thead>
        <tr>
          <th>Onderzoek</th>
          <th>Belangrijkste les voor dorpen en laagbouwwijken</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Woerden / Kamerik</td><td>De afstand tot de container was een sterke voorspeller van tevredenheid. Bewoners die moesten fietsen of rijden waren duidelijk minder tevreden dan bewoners die lopend konden gaan.</td></tr>
        <tr><td>Wageningen</td><td>Bij laagbouw daalde de waardering voor restafval toen bewoners hun afval moesten wegbrengen. Vooral afstand en moeite speelden mee.</td></tr>
        <tr><td>Nijmegen</td><td>Boven 100 meter daalde de tevredenheid over de loopafstand duidelijk. Daarom krijgt de grens van 100 meter een aparte plek in deze kaart.</td></tr>
        <tr><td>Zeist</td><td>Een deel van de bewoners vond de afstand acceptabel, maar langere routes zorgden vaker voor moeite met het wegbrengen van restafval.</td></tr>
        <tr><td>Amersfoort / Nieuwland</td><td>Bij een norm rond 150 meter was de acceptatie relatief hoog. Dat ondersteunt 150 meter als belangrijk omslagpunt.</td></tr>
        <tr><td>Lisse</td><td>Bewoners noemden naast afstand ook volle containers, bijplaatsingen en de wens om minder ver te lopen.</td></tr>
        <tr><td>Vijfheerenlanden / Vianen</td><td>Ontevredenheid hing samen met loopafstand, hulpbehoefte en de praktische werking van het systeem.</td></tr>
        <tr><td>Papendrecht</td><td>Afstand, draagvlak, communicatie en maatwerk voor lastig bereikbare delen bleven belangrijke discussiepunten.</td></tr>
        <tr><td>Hoonhorst / Dalfsen</td><td>Draagvlak kan er zijn, maar vooral wanneer de uitvoering praktisch werkbaar is en bewoners goed worden meegenomen.</td></tr>
        <tr><td>Roosendaal</td><td>Restafval op afstand kan alleen rekenen op draagvlak als de loopafstand beperkt blijft.</td></tr>
      </tbody>
    </table>

    <h2>Wat betekent dit?</h2>
    <p>Voor de dorpen in de gemeente Schagen is vooral de vergelijking met andere dorpen en laagbouwwijken relevant. Daar is de verandering groot: van een grijze bak aan huis naar zelf restafval wegbrengen.</p>
    <p>Een afstand van 275 meter op papier betekent daarom niet automatisch dat de voorziening voor bewoners redelijk voelt. De werkelijke route, oversteken, sociale veiligheid, volle containers en fysieke belasting bepalen samen of het systeem werkbaar is.</p>

    <h2>Bronnen</h2>
    <h3>Gemeente Schagen</h3>
    <ul class="source-list">
      ${buildMunicipalSourceLinks(sourcePlaces)}
    </ul>

    <h3>Onderzoeken over loopafstand en afvalinzameling</h3>
    <ul class="source-list">
      <li><a href="https://vang-hha.nl/publish/pages/106165/omgekeerd_inzamelen_woerden_2014.pdf">Omgekeerd inzamelen in Woerden</a></li>
      <li><a href="https://vang-hha.nl/kennisbibliotheek/resultaten-nieuwe/">Resultaten het nieuwe inzamelen Wageningen</a></li>
      <li><a href="https://nijmegen.bestuurlijkeinformatie.nl/Document/View/e23597f6-57b4-4904-8ebd-75554a6d0645">Onderzoek ondergrondse restafvalcontainers Nijmegen</a></li>
      <li><a href="https://zeist.raadsinformatie.nl/document/7330194/1/01-19RV006_Omgekeerd_inzamelen_afval_-_Bijlage_1_Adviesnota_RMN_omgekeerd_inzamelen_Zeist">Adviesnota omgekeerd inzamelen Zeist</a></li>
      <li><a href="https://vang-hha.nl/kennisbibliotheek/resultaten-pilot-1/">Resultaten pilot omgekeerd inzamelen Amersfoort</a></li>
      <li><a href="https://vang-hha.nl/publish/pages/195170/gemeente-lisse-evaluatie-afvalbeleid_2017-2018-bijlage-2-burgeronderzoek.pdf">Burgeronderzoek evaluatie afvalbeleid Lisse</a></li>
      <li><a href="https://www.waardlanden.nl/images/Tussentijdse_evaluatie_Strategienota_2021-2025_Waardlanden_def2_copy.pdf">Tussentijdse evaluatie Waardlanden</a></li>
      <li><a href="https://raad.papendrecht.nl/Documenten/Bijlage-1-Evaluatie-en-voorstel-na-pilot-omgekeerd-inzamelen-Gft-campagne-en-onderzoek-nascheiding.pdf">Evaluatie en voorstel na pilot Papendrecht</a></li>
      <li><a href="https://ris.dalfsen.nl/Vergaderingen/Gemeenteraad/2012/26-november/19%3A30/Afvalbeleid/20121126---6---Afvalbeleid--resultaten-Hoonhorst.pdf">Resultaten afvalbeleid Hoonhorst</a></li>
      <li><a href="https://raad.roosendaal.nl/Vergaderingen/Inspraakbijeenkomst/2019/28-februari/19%3A30/Bijlage-1-Roosendaal-evaluatie-restafval-op-afstand.pdf">Evaluatie restafval op afstand Roosendaal</a></li>
    </ul>

    <h3>Broncode</h3>
    <p>De broncode van deze website is openbaar te bekijken op GitHub: <a href="https://github.com/TheBeems/afvalcontainers">github.com/TheBeems/afvalcontainers</a>.</p>
  </main>
</body>
</html>
`;
}

function formatInteger(value) {
  return Math.round(value || 0).toLocaleString('nl-NL');
}

function formatRatio(value) {
  return `${value.toFixed(2).replace('.', ',')}x`;
}

function formatCompactPercent(value) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function getPlaceMapPath(place) {
  return `../${escapeHtml(getPlaceSlug(place))}/`;
}

function renderCell(content, sortValue = '') {
  return `<td data-sort-value="${escapeHtml(String(sortValue ?? ''))}">${content}</td>`;
}

function renderContainerLink(place, containerId) {
  if (!containerId) {
    return '';
  }

  const containerParam = encodeURIComponent(containerId);
  return `<a href="${getPlaceMapPath(place)}?container=${containerParam}#kaart">${escapeHtml(containerId)}</a>`;
}

function renderContainerReference(place, containerId, containerAddress) {
  const containerLink = renderContainerLink(place, containerId);
  const address = String(containerAddress || '').trim();

  if (!containerLink) {
    return address ? escapeHtml(address) : '';
  }

  return address ? `${containerLink}<br>${escapeHtml(address)}` : containerLink;
}

function renderAnalysisTable(headers, rows, renderRow, { className = '' } = {}) {
  const normalizedHeaders = headers.map((header) => (
    typeof header === 'string'
      ? { label: header, description: ANALYSIS_HEADER_DESCRIPTIONS[header] || '' }
      : { description: ANALYSIS_HEADER_DESCRIPTIONS[header.label] || '', ...header }
  ));
  const wrapperClass = ['table-scroll', className].filter(Boolean).join(' ');

  return `<div class="${escapeHtml(wrapperClass)}">
      <table data-sortable-table>
        <thead>
          <tr>${normalizedHeaders.map((header, index) => `<th><button type="button" data-sort-index="${index}" aria-label="${escapeHtml(getSortButtonLabel(header))}">${renderTableHeaderLabel(header)}</button></th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join('\n          ')}
        </tbody>
      </table>
    </div>`;
}

function getSortButtonLabel(header) {
  const baseLabel = `Sorteer op ${header.label}`;
  const separator = baseLabel.endsWith('.') ? ' ' : '. ';
  return header.description ? `${baseLabel}${separator}Uitleg: ${header.description}` : baseLabel;
}

function renderTableHeaderLabel(header) {
  const label = escapeHtml(header.label);
  if (!header.description) {
    return label;
  }

  return `<span class="table-header-label">${label}</span><span class="table-tooltip" aria-hidden="true"><span class="table-tooltip-icon">?</span><span class="table-tooltip-text">${escapeHtml(header.description)}</span></span>`;
}

function renderStreetRow(place, row) {
  return `<tr>
            ${renderCell(escapeHtml(row.street), row.street)}
            ${renderCell(formatInteger(row.addressCount), row.addressCount)}
            ${renderCell(escapeHtml(formatMeters(row.averageDistance)), row.averageDistance)}
            ${renderCell(escapeHtml(formatDuration(row.averageDuration)), row.averageDuration)}
            ${renderCell(escapeHtml(formatMeters(row.medianDistance)), row.medianDistance)}
            ${renderCell(escapeHtml(formatMeters(row.p90Distance)), row.p90Distance)}
            ${renderCell(escapeHtml(formatMeters(row.maxDistance)), row.maxDistance)}
            ${renderCell(`${formatInteger(row.over150Count)} (${formatCompactPercent(row.over150Percent)})`, row.over150Count)}
            ${renderCell(`${formatInteger(row.over275Count)} (${formatCompactPercent(row.over275Percent)})`, row.over275Count)}
            ${renderCell(renderContainerLink(place, row.mainContainerId), row.mainContainerId)}
          </tr>`;
}

function renderContainerRow(place, row) {
  return `<tr>
            ${renderCell(renderContainerLink(place, row.containerId), row.containerId)}
            ${renderCell(formatInteger(row.addressCount), row.addressCount)}
            ${renderCell(escapeHtml(formatMeters(row.averageDistance)), row.averageDistance)}
            ${renderCell(escapeHtml(formatMeters(row.maxDistance)), row.maxDistance)}
            ${renderCell(formatInteger(row.over150Count), row.over150Count)}
            ${renderCell(formatInteger(row.over275Count), row.over275Count)}
          </tr>`;
}

function renderRouteRatioRow(place, row) {
  return `<tr>
            ${renderCell(escapeHtml(row.street), row.street)}
            ${renderCell(formatInteger(row.addressCount), row.addressCount)}
            ${renderCell(formatRatio(row.averageRatio), row.averageRatio)}
            ${renderCell(escapeHtml(row.highestRatioAddress), row.highestRatioAddress)}
            ${renderCell(formatRatio(row.highestRatio), row.highestRatio)}
            ${renderCell(renderContainerReference(place, row.highestRatioContainerId, row.highestRatioContainerAddress), row.highestRatioContainerId)}
            ${renderCell(`${escapeHtml(formatMeters(row.highestRatioStraightDistance))} naar ${escapeHtml(formatMeters(row.highestRatioWalkingDistance))}`, row.highestRatioWalkingDistance)}
          </tr>`;
}

function renderPlaceOverviewRow(analysis) {
  const summary = analysis.summary;
  const counts = summary.counts || {};
  const totalAddresses = summary.totalAddresses || 0;
  const longDistanceCount = (counts.between_150_275 || 0) + (counts.over_275 || 0);

  return `<tr>
            ${renderCell(`<a href="${getPlaceMapPath(analysis.place)}">${escapeHtml(analysis.place.name)}</a>`, analysis.place.name)}
            ${renderCell(formatInteger(totalAddresses), totalAddresses)}
            ${renderCell(escapeHtml(formatMeters(summary.averageWalkingDistance)), summary.averageWalkingDistance)}
            ${renderCell(escapeHtml(formatDuration(summary.averageWalkingDuration)), summary.averageWalkingDuration)}
            ${renderCell(`${formatInteger(longDistanceCount)} (${escapeHtml(formatPercent(longDistanceCount, totalAddresses))})`, longDistanceCount)}
            ${renderCell(`${formatInteger(counts.over_275 || 0)} (${escapeHtml(formatPercent(counts.over_275 || 0, totalAddresses))})`, counts.over_275 || 0)}
            ${renderCell(formatInteger(analysis.streetStats.length), analysis.streetStats.length)}
            ${renderCell(formatInteger(analysis.streetStats.filter((row) => row.averageDistance >= 150).length), analysis.streetStats.filter((row) => row.averageDistance >= 150).length)}
          </tr>`;
}

function getAnalysisSlices(analysis) {
  return {
    averageDistanceTop: analysis.streetStats
      .filter((row) => row.addressCount >= 5)
      .sort((a, b) => b.averageDistance - a.averageDistance)
      .slice(0, 15),
    over275Top: analysis.streetStats
      .filter((row) => row.over275Count > 0)
      .sort((a, b) => b.over275Count - a.over275Count || b.over275Percent - a.over275Percent)
      .slice(0, 15),
    over150Top: analysis.streetStats
      .filter((row) => row.over150Count > 0)
      .sort((a, b) => b.over150Count - a.over150Count || b.over150Percent - a.over150Percent)
      .slice(0, 15),
    bestCoverageTop: analysis.streetStats
      .filter((row) => row.addressCount >= 20)
      .sort((a, b) => a.averageDistance - b.averageDistance)
      .slice(0, 12),
    routeRatioTop: analysis.routeRatioStats
      .filter((row) => row.addressCount >= 5)
      .slice(0, 12)
  };
}

function renderPlaceAnalysisSection(analysis, { hidden = false } = {}) {
  const { place } = analysis;
  const summary = analysis.summary;
  const counts = summary.counts || {};
  const totalAddresses = summary.totalAddresses || 0;
  const longDistanceCount = (counts.between_150_275 || 0) + (counts.over_275 || 0);
  const slices = getAnalysisSlices(analysis);
  const streetHeaders = [
    'Straat',
    'Adressen',
    'Gem. afstand',
    'Gem. tijd',
    'Mediaan',
    'P90',
    'Max.',
    '>=150 m',
    '>275 m',
    'Meest dichtbij'
  ];

  return `<section data-analysis-place="${escapeHtml(place.id)}"${hidden ? ' hidden' : ''}>
    <h2>Kerncijfers ${escapeHtml(place.name)}</h2>
    <div class="metric-grid" aria-label="Kerncijfers ${escapeHtml(place.name)}">
      <div class="metric"><strong>${formatInteger(totalAddresses)}</strong><span>adressen binnen de bebouwde kom</span></div>
      <div class="metric"><strong>${escapeHtml(formatMeters(summary.averageWalkingDistance))}</strong><span>gemiddelde loopafstand</span></div>
      <div class="metric"><strong>${escapeHtml(formatDuration(summary.averageWalkingDuration))}</strong><span>gemiddelde looptijd bij 4 km/u</span></div>
      <div class="metric"><strong>${formatInteger(longDistanceCount)}</strong><span>adressen op 150 meter of meer (${escapeHtml(formatPercent(longDistanceCount, totalAddresses))})</span></div>
    </div>
    <p class="note">Er ${(counts.over_275 || 0) === 1 ? 'ligt' : 'liggen'} in ${escapeHtml(place.name)} ${formatInteger(counts.over_275 || 0)} adres${(counts.over_275 || 0) === 1 ? '' : 'sen'} boven 275 meter (${escapeHtml(formatPercent(counts.over_275 || 0, totalAddresses))}). Dat maakt vooral straten met veel rode en donkerrode adressen belangrijk voor overleg over locatiekeuzes.</p>

    <h2>Aandachtsstraten ${escapeHtml(place.name)}</h2>
    <p class="note">Deze ranglijst kijkt naar straten met minstens vijf adressen en sorteert op de hoogste gemiddelde loopafstand.</p>
    ${renderAnalysisTable(streetHeaders, slices.averageDistanceTop, (row) => renderStreetRow(place, row))}

    <h3>Meeste adressen boven 275 meter</h3>
    ${renderAnalysisTable(streetHeaders, slices.over275Top, (row) => renderStreetRow(place, row))}

    <h3>Meeste adressen op 150 meter of meer</h3>
    ${renderAnalysisTable(streetHeaders, slices.over150Top, (row) => renderStreetRow(place, row))}

    <h3>Beste dekking bij grotere straten</h3>
    <p class="note">Straten met minstens twintig adressen, gesorteerd op de laagste gemiddelde loopafstand.</p>
    ${renderAnalysisTable(streetHeaders, slices.bestCoverageTop, (row) => renderStreetRow(place, row))}

    <h2>Hemelsbreed versus werkelijke route</h2>
    <p class="note">Hier staat waar de looproute gemiddeld het sterkst afwijkt van de rechte lijn. Dit laat zien waarom een container hemelsbreed dichtbij kan lijken, terwijl de werkelijke route veel langer is.</p>
    ${renderAnalysisTable(
    ['Straat', 'Adressen', 'Gem. omweg', 'Hoogste adres', 'Hoogste omweg', 'Container', 'Hemelsbreed naar lopen'],
    slices.routeRatioTop,
    (row) => renderRouteRatioRow(place, row)
  )}

    <h2>Containerbereik ${escapeHtml(place.name)}</h2>
    <p class="note">Deze tabel telt voor hoeveel adressen een container de dichtstbijzijnde optie is. Dit is geen capaciteitsberekening, omdat afvalvolume en ledigingsfrequentie niet in de dataset zitten.</p>
    ${renderAnalysisTable(
    ['Container', 'Dichtstbij voor adressen', 'Gem. afstand', 'Max. afstand', '>=150 m', '>275 m'],
    analysis.containerStats,
    (row) => renderContainerRow(place, row)
  )}

    <details>
      <summary>Volledige straattabel ${escapeHtml(place.name)}</summary>
      ${renderAnalysisTable(streetHeaders, analysis.streetStats, (row) => renderStreetRow(place, row))}
    </details>
  </section>`;
}

async function readSurveyAnalysisData() {
  return JSON.parse(await readFile(SURVEY_ANALYSIS_PATH, 'utf8'));
}

function formatRatioPercent(value) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(Number.isFinite(value) ? value : 0);
}

function formatSurveyCount(value) {
  return formatInteger(value || 0);
}

function renderSurveyTable(headers, rows, { className = '', minWidth = 720 } = {}) {
  const wrapperClass = ['table-scroll', className].filter(Boolean).join(' ');
  return `<div class="${escapeHtml(wrapperClass)}">
      <table style="min-width: ${minWidth}px">
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('\n          ')}
        </tbody>
      </table>
    </div>`;
}

function renderSurveyMetrics(data) {
  const summary = data.summary;
  return `<div class="metric-grid" aria-label="Kerncijfers enquête">
      <div class="metric"><strong>${formatSurveyCount(summary.total)}</strong><span>geldige reacties</span></div>
      <div class="metric"><strong>${formatSurveyCount(summary.no)}</strong><span>Nee (${formatRatioPercent(summary.noRatio)})</span></div>
      <div class="metric"><strong>${formatSurveyCount(summary.yes)}</strong><span>Ja (${formatRatioPercent(summary.yesRatio)})</span></div>
      <div class="metric"><strong>${formatSurveyCount(data.quality.rawRecords)}</strong><span>ruwe records voor opschoning</span></div>
    </div>`;
}

function renderDistanceBandTable(data) {
  return renderSurveyTable(
    ['Afstandsband', 'Reacties', 'Ja', 'Nee', '% Nee'],
    data.distanceBands.map((row) => [
      escapeHtml(row.label),
      formatSurveyCount(row.total),
      formatSurveyCount(row.yes),
      formatSurveyCount(row.no),
      formatRatioPercent(row.noRatio)
    ])
  );
}

function renderReasonFlagTable(data) {
  return renderSurveyTable(
    ['Zorg', 'Aantal', '% van Nee'],
    data.reasonFlags.map((row) => [
      escapeHtml(row.label),
      formatSurveyCount(row.count),
      formatRatioPercent(row.ratioOfNo)
    ])
  );
}

function renderThemeTable(data) {
  const rows = [...data.themes]
    .sort((a, b) => b.no - a.no || b.total - a.total || a.label.localeCompare(b.label, 'nl'))
    .slice(0, 12);

  return renderSurveyTable(
    ['Thema uit geschreven antwoorden', 'Totaal', 'Bij Ja', '% van Ja', 'Bij Nee', '% van Nee'],
    rows.map((row) => [
      escapeHtml(row.label),
      formatSurveyCount(row.total),
      formatSurveyCount(row.yes),
      formatRatioPercent(row.yesRatio),
      formatSurveyCount(row.no),
      formatRatioPercent(row.noRatio)
    ]),
    { minWidth: 920 }
  );
}

function renderPositiveThemeTable(data) {
  const rows = [...data.themes]
    .filter((row) => row.yes > 0)
    .sort((a, b) => b.yes - a.yes || b.total - a.total || a.label.localeCompare(b.label, 'nl'))
    .slice(0, 8);

  return renderSurveyTable(
    ['Thema uit Ja-toelichtingen', 'Aantal', '% van Ja'],
    rows.map((row) => [
      escapeHtml(row.label),
      formatSurveyCount(row.yes),
      formatRatioPercent(row.yesRatio)
    ]),
    { minWidth: 680 }
  );
}

function renderBottleneckTable(data) {
  return renderSurveyTable(
    ['Straat', 'Reacties', 'Nee', 'Gem. loopafstand', '>=150 m', '>275 m', 'Dichtstbij'],
    data.distanceAndConcernBottlenecks.map((row) => [
      escapeHtml(row.label),
      formatSurveyCount(row.total),
      `${formatSurveyCount(row.no)} (${formatRatioPercent(row.noRatio)})`,
      escapeHtml(formatMeters(row.coverage.averageDistanceM)),
      `${formatSurveyCount(row.coverage.over150Count)} (${formatRatioPercent(row.coverage.over150Ratio)})`,
      `${formatSurveyCount(row.coverage.over275Count)} (${formatRatioPercent(row.coverage.over275Ratio)})`,
      renderContainerLink({ seo: { slug: 'warmenhuizen' } }, row.coverage.mainContainerId)
    ]),
    { minWidth: 920 }
  );
}

function renderStreetSurveyTable(data) {
  const rows = data.streetGroups.map((row) => [
    escapeHtml(row.label),
    formatSurveyCount(row.total),
    `${formatSurveyCount(row.no)} (${formatRatioPercent(row.noRatio)})`,
    row.coverage ? escapeHtml(formatMeters(row.coverage.averageDistanceM)) : '',
    row.coverage ? `${formatSurveyCount(row.coverage.over150Count)} (${formatRatioPercent(row.coverage.over150Ratio)})` : '',
    row.coverage ? `${formatSurveyCount(row.coverage.over275Count)} (${formatRatioPercent(row.coverage.over275Ratio)})` : '',
  ]);
  const other = data.otherStreetGroup;
  rows.push([
    'Overige straten',
    formatSurveyCount(other.total),
    `${formatSurveyCount(other.no)} (${formatRatioPercent(other.noRatio)})`,
    '',
    '',
    ''
  ]);

  return renderSurveyTable(
    ['Straatgroep', 'Reacties', 'Nee', 'Gem. loopafstand', '>=150 m', '>275 m'],
    rows,
    { minWidth: 840 }
  );
}

function renderSmallStreetList(data) {
  return data.otherStreetGroup.streetNames
    .map((street) => `<li>${escapeHtml(street)}</li>`)
    .join('\n        ');
}

async function buildSurveyPage(places) {
  const data = await readSurveyAnalysisData();
  const title = 'Voorlopige enquêteanalyse Warmenhuizen';
  const description = 'Voorlopige analyse van de enquête over restafvalcontainers in Warmenhuizen, met online en papieren reacties, zorgen van bewoners en privacyveilige straatgroepen.';
  const seoBlock = buildSeoBlock({
    title,
    description,
    ogDescription: description,
    canonicalUrl: getSurveyUrl(),
    runtimeBasePath: '../',
    assetPrefix: '../',
    structuredData: buildSurveyStructuredData()
  });
  const firstBand = data.distanceBands.find((row) => row.status === 'within_100');
  const lastBand = data.distanceBands.find((row) => row.status === 'over_275');

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
      --panel: #ffffff;
      --soft: #e2e8f0;
      --warning: #92400e;
      --warning-bg: #fffbeb;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
    }

    main {
      width: min(1120px, calc(100% - 32px));
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

    a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    h1 {
      max-width: 860px;
      margin: 0 0 16px;
      font-size: clamp(34px, 6vw, 56px);
      line-height: 1.05;
    }

    .lead {
      max-width: 860px;
      color: var(--text);
      font-size: 21px;
    }

    .status-note {
      max-width: 900px;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      background: var(--warning-bg);
      padding: 14px 16px;
      color: var(--warning);
      font-size: 17px;
    }

    h2 {
      margin-top: 44px;
      border-top: 1px solid var(--line);
      padding-top: 30px;
      font-size: 28px;
      line-height: 1.2;
    }

    h3 {
      margin: 28px 0 10px;
      font-size: 21px;
      line-height: 1.25;
    }

    p,
    li {
      color: var(--muted);
      font-size: 18px;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 28px 0;
    }

    .metric,
    .finding {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }

    .metric strong {
      display: block;
      color: var(--text);
      font-size: 26px;
      line-height: 1.1;
    }

    .metric span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.35;
    }

    .finding-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 22px 0;
    }

    .finding strong {
      display: block;
      margin-bottom: 6px;
      color: var(--text);
      font-size: 18px;
    }

    .finding p {
      margin: 0;
      font-size: 16px;
    }

    .table-scroll {
      overflow-x: auto;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 15px;
    }

    th {
      background: var(--soft);
      color: var(--text);
      font-size: 14px;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .small-street-list {
      columns: 3 220px;
      margin-top: 12px;
      padding-left: 22px;
    }

    .note {
      max-width: 900px;
    }

    @media (max-width: 780px) {
      .metric-grid,
      .finding-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 520px) {
      main {
        width: min(100% - 24px, 1120px);
        padding-top: 32px;
      }

      .metric-grid,
      .finding-grid {
        grid-template-columns: 1fr;
      }

      .lead {
        font-size: 19px;
      }
    }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Hoofdnavigatie">
      ${buildPlaceMapLinks(places, '../')}
      <a href="../analyses/">Analyses</a>
      <a href="../methodiek/">Methodiek</a>
      <a href="../terugkoppeling/">Terugkoppeling</a>
    </nav>

    <h1>Voorlopige enquêteanalyse Warmenhuizen</h1>
    <p class="lead">Deze pagina vat de online en papieren inzendingen over de geplande restafvalcontainers samen. Waar afstand een rol speelt, gebruiken we ook de bestaande <a href="../analyses/">straatanalyse</a> met loopafstanden.</p>
    <p class="status-note">Dit zijn online en papieren inzendingen tot en met ${escapeHtml(data.surveyDate)}. De pagina toont alleen samengevoegde uitkomsten; persoonsgegevens en letterlijke antwoorden zijn niet gepubliceerd.</p>

    ${renderSurveyMetrics(data)}

    <section aria-labelledby="survey-main-findings">
      <h2 id="survey-main-findings">Belangrijkste bevindingen</h2>
      <div class="finding-grid">
        <div class="finding"><strong>Afstand bepaalt veel van de weerstand</strong><p>Het aandeel Nee loopt op van ${formatRatioPercent(firstBand?.noRatio)} bij 0-100 meter naar ${formatRatioPercent(lastBand?.noRatio)} boven 275 meter.</p></div>
        <div class="finding"><strong>De zorg is breder dan afstand alleen</strong><p>Ouderen en mindervaliden, bijplaatsingen, stank, ongedierte en straatbeeld komen het vaakst terug in de gesloten redenen.</p></div>
        <div class="finding"><strong>Ook Ja-antwoorden zijn vaak niet zorgeloos</strong><p>Een Ja betekent meestal dat de wijziging acceptabel lijkt, maar toelichtingen noemen alsnog zorgen zoals afstand, VIOS en oud papier, straatbeeld, stank, bijplaatsingen of kosten.</p></div>
        <div class="finding"><strong>Zorgen en afstand vallen vaak samen</strong><p>Bij onder meer Bregweid, Krankhoorn, Dorpsstraat, Fabrieksstraat, Beuninge, De Fuik, Oudevaart, 't Eiland en Burg. Burgerstraat vallen veel Nee-reacties samen met grote loopafstanden in de <a href="../analyses/">straatanalyse</a>.</p></div>
      </div>
    </section>

    <section aria-labelledby="survey-distance">
      <h2 id="survey-distance">Afstand versus acceptatie</h2>
      <p class="note">De enquête laat een duidelijk patroon zien. Binnen 100 meter is nog steeds een meerderheid tegen, maar boven 150 meter neemt de afwijzing sterk toe en boven 275 meter is vrijwel iedereen tegen.</p>
      ${renderDistanceBandTable(data)}
    </section>

    <section aria-labelledby="survey-bottlenecks">
      <h2 id="survey-bottlenecks">Waar komen zorgen en afstand samen?</h2>
      <p class="note">Deze tabel legt straten met minimaal ${data.privacy.minimumGroupSize} reacties naast de bestaande <a href="../analyses/">straatanalyse</a>. Zo wordt zichtbaar waar veel bewoners tegen zijn én waar de berekende loopafstand voor veel adressen boven 150 of 275 meter komt.</p>
      ${renderBottleneckTable(data)}
    </section>

    <section aria-labelledby="survey-yes-reasons">
      <h2 id="survey-yes-reasons">Waarom zeggen bewoners Ja?</h2>
      <p class="note">Van de ${formatSurveyCount(data.summary.total)} geldige reacties zeggen ${formatSurveyCount(data.summary.yes)} bewoners Ja (${formatRatioPercent(data.summary.yesRatio)}). Alle ${formatSurveyCount(data.summary.writtenYesResponses)} Ja-reacties hadden een toelichting. Die Ja-antwoorden zijn dus geen zorgeloos akkoord: veel bewoners vinden de wijziging alleen acceptabel als de container dichtbij genoeg is, of noemen alsnog zorgen over onder meer afstand, VIOS en oud papier, straatbeeld, hygiene, bijplaatsingen of kosten. Een deel is vooral berustend positief: acceptabel of geen groot bezwaar, niet per se enthousiast.</p>
      ${renderPositiveThemeTable(data)}
    </section>

    <section aria-labelledby="survey-concerns">
      <h2 id="survey-concerns">Waarom zeggen bewoners Nee?</h2>
      <p class="note">De aangekruiste redenen laten zien welke zorgen breed worden gedeeld onder de Nee-stemmers. De geschreven antwoorden zijn niet gepubliceerd, maar wel per onderwerp ingedeeld.</p>
      ${renderReasonFlagTable(data)}

      <h3>Thema's uit geschreven antwoorden</h3>
      <p class="note">Er zijn ${formatSurveyCount(data.summary.writtenYesResponses + data.summary.writtenNoOtherResponses)} geschreven toelichtingen per onderwerp ingedeeld: ${formatSurveyCount(data.summary.writtenYesResponses)} bij Ja en ${formatSurveyCount(data.summary.writtenNoOtherResponses)} bij Nee of een andere reden.</p>
      ${renderThemeTable(data)}
    </section>

    <section aria-labelledby="survey-streets">
      <h2 id="survey-streets">Straatgroepen</h2>
      <p class="note">Alleen straten met minimaal ${data.privacy.minimumGroupSize} reacties worden afzonderlijk getoond. Kleinere straatgroepen zijn samengenomen onder Overige straten; de straatnamen staan hieronder, maar de inzendingen zijn alleen samen geteld.</p>
      ${renderStreetSurveyTable(data)}

      <h3>Straten onder Overige straten</h3>
      <ul class="small-street-list">
        ${renderSmallStreetList(data)}
      </ul>
    </section>

    <section aria-labelledby="survey-privacy">
      <h2 id="survey-privacy">Privacy en beperkingen</h2>
      <p class="note">Deze publicatie bevat geen e-mailadressen, persoonlijke codes, tijdstippen, bronregels of letterlijke antwoorden. Straten en containers met minder dan ${data.privacy.minimumGroupSize} reacties zijn samengevoegd. De uitkomsten blijven een enquêtebeeld: online en papieren reacties samen, maar niet automatisch een volledige afspiegeling van heel Warmenhuizen.</p>
    </section>
  </main>
</body>
</html>
`;
}

async function buildAnalysesPage(places) {
  const analyses = await Promise.all(places.map((place) => readPlaceAnalysis(place)));
  const defaultAnalysis = analyses.find((analysis) => analysis.place.id === getDefaultPlace(places).id) || analyses[0];
  const title = 'Analyses loopafstanden restafvalcontainers';
  const description = 'Uitgebreide analyses van loopafstanden naar restafvalcontainers per dorp, straat en containerlocatie.';
  const seoBlock = buildSeoBlock({
    title,
    description,
    ogDescription: description,
    canonicalUrl: getAnalysesUrl(),
    runtimeBasePath: '../',
    assetPrefix: '../',
    structuredData: buildAnalysesStructuredData()
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
      --panel: #ffffff;
      --soft: #e2e8f0;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
    }

    main {
      width: min(1120px, calc(100% - 32px));
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
      max-width: 820px;
      margin: 0 0 16px;
      font-size: clamp(34px, 6vw, 56px);
      line-height: 1.05;
    }

    .lead {
      max-width: 820px;
      color: var(--text);
      font-size: 21px;
    }

    h2 {
      margin-top: 44px;
      border-top: 1px solid var(--line);
      padding-top: 30px;
      font-size: 28px;
      line-height: 1.2;
    }

    h3 {
      margin: 28px 0 10px;
      font-size: 21px;
      line-height: 1.25;
    }

    p,
    li {
      color: var(--muted);
      font-size: 18px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      color: var(--text);
      font-size: 15px;
      font-weight: 700;
    }

    select {
      width: min(360px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 10px 12px;
      color: var(--text);
      font: inherit;
      font-size: 16px;
      line-height: 1.4;
    }

    select:focus-visible,
    th button:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .analysis-selector {
      margin: 28px 0 8px;
    }

    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 28px 0;
    }

    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
    }

    .metric strong {
      display: block;
      color: var(--text);
      font-size: 26px;
      line-height: 1.1;
    }

    .metric span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.35;
    }

    .table-scroll {
      overflow-x: auto;
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    table {
      width: 100%;
      min-width: 860px;
      border-collapse: collapse;
      background: var(--panel);
    }

    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 15px;
    }

    th {
      background: var(--soft);
      color: var(--text);
      font-size: 14px;
    }

    th button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      border: 0;
      background: transparent;
      padding: 0;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
    }

    th button::after {
      content: "\\2195";
      color: var(--muted);
      font-size: 12px;
      font-weight: 400;
    }

    .table-header-label {
      min-width: 0;
    }

    .table-scroll--place-overview table {
      min-width: 760px;
    }

    .table-scroll--place-overview th,
    .table-scroll--place-overview td {
      padding-right: 9px;
      padding-left: 9px;
    }

    @media (min-width: 900px) {
      .table-scroll--place-overview table {
        min-width: 0;
        table-layout: fixed;
      }

      .table-scroll--place-overview th:nth-child(1) {
        width: 14%;
      }

      .table-scroll--place-overview th:nth-child(2) {
        width: 10%;
      }

      .table-scroll--place-overview th:nth-child(3) {
        width: 14%;
      }

      .table-scroll--place-overview th:nth-child(4) {
        width: 13%;
      }

      .table-scroll--place-overview th:nth-child(5) {
        width: 13%;
      }

      .table-scroll--place-overview th:nth-child(6) {
        width: 12%;
      }

      .table-scroll--place-overview th:nth-child(7) {
        width: 8%;
      }

      .table-scroll--place-overview th:nth-child(8) {
        width: 16%;
      }
    }

    .table-tooltip {
      position: relative;
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
    }

    .table-tooltip-icon {
      width: 18px;
      height: 18px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
    }

    .table-tooltip-text {
      position: absolute;
      z-index: 5;
      top: calc(100% + 8px);
      left: 50%;
      width: min(240px, 70vw);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--text);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
      color: #ffffff;
      font-size: 13px;
      font-weight: 400;
      line-height: 1.35;
      opacity: 0;
      padding: 8px 10px;
      pointer-events: none;
      text-align: left;
      transform: translate(-50%, 4px);
      transition: opacity 120ms ease, transform 120ms ease;
      white-space: normal;
    }

    th:last-child .table-tooltip-text {
      right: 0;
      left: auto;
      transform: translate(0, 4px);
    }

    th button:hover .table-tooltip-text,
    th button:focus-visible .table-tooltip-text {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    th:last-child button:hover .table-tooltip-text,
    th:last-child button:focus-visible .table-tooltip-text {
      transform: translate(0, 0);
    }

    th button[aria-sort="ascending"]::after {
      content: "\\2191";
      color: var(--accent);
    }

    th button[aria-sort="descending"]::after {
      content: "\\2193";
      color: var(--accent);
    }

    tr:last-child td {
      border-bottom: 0;
    }

    details {
      margin-top: 18px;
    }

    summary {
      cursor: pointer;
      color: var(--accent);
      font-size: 18px;
      font-weight: 700;
    }

    .note {
      max-width: 840px;
    }

    @media (max-width: 780px) {
      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 520px) {
      main {
        width: min(100% - 24px, 1120px);
        padding-top: 32px;
      }

      .metric-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Hoofdnavigatie">
      ${buildPlaceMapLinks(places, '../')}
      <a href="../enquete/">Enquête</a>
      <a href="../methodiek/">Methodiek</a>
      <a href="../terugkoppeling/">Terugkoppeling</a>
    </nav>

    <h1>Analyses loopafstanden restafvalcontainers</h1>
    <p class="lead">Deze pagina vat de vooraf berekende loopafstanden samen per dorp, straat en dichtstbijzijnde container. De cijfers komen uit dezelfde JSON-data als de kaart.</p>

    <div class="analysis-selector">
      <label for="analysis-place-select">Selecteer dorp</label>
      <select id="analysis-place-select">
        ${analyses.map((analysis) => `<option value="${escapeHtml(analysis.place.id)}"${analysis.place.id === defaultAnalysis.place.id ? ' selected' : ''}>${escapeHtml(analysis.place.name)}</option>`).join('\n        ')}
      </select>
    </div>

    <h2>Vergelijking per dorp</h2>
    ${renderAnalysisTable(
    ['Dorp', 'Adressen', 'Gem. afstand', 'Gem. tijd', '>=150 m', '>275 m', 'Straten', 'Straten gem. >=150 m'],
    analyses,
    renderPlaceOverviewRow,
    { className: 'table-scroll--place-overview' }
  )}

    ${analyses.map((analysis) => renderPlaceAnalysisSection(analysis, {
    hidden: analysis.place.id !== defaultAnalysis.place.id
  })).join('\n\n    ')}
  </main>
  <script>
    (() => {
      function getSortValue(row, index) {
        const cell = row.cells[index];
        const value = cell?.dataset.sortValue ?? cell?.textContent ?? '';
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : value.toLocaleLowerCase('nl-NL');
      }

      function sortTable(table, index, direction) {
        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.rows);
        rows.sort((left, right) => {
          const leftValue = getSortValue(left, index);
          const rightValue = getSortValue(right, index);
          const result = typeof leftValue === 'number' && typeof rightValue === 'number'
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), 'nl-NL', { numeric: true });
          return direction === 'ascending' ? result : -result;
        });
        tbody.append(...rows);
      }

      document.querySelectorAll('[data-sortable-table]').forEach((table) => {
        table.querySelectorAll('th button[data-sort-index]').forEach((button) => {
          button.addEventListener('click', () => {
            const nextDirection = button.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
            table.querySelectorAll('th button[aria-sort]').forEach((activeButton) => {
              activeButton.removeAttribute('aria-sort');
            });
            button.setAttribute('aria-sort', nextDirection);
            sortTable(table, Number(button.dataset.sortIndex), nextDirection);
          });
        });
      });

      const placeSelect = document.getElementById('analysis-place-select');
      const placeSections = Array.from(document.querySelectorAll('[data-analysis-place]'));
      placeSelect?.addEventListener('change', () => {
        for (const section of placeSections) {
          section.hidden = section.dataset.analysisPlace !== placeSelect.value;
        }
      });
    })();
  </script>
</body>
</html>
`;
}

function buildFeedbackPage(places) {
  const title = 'Dank voor je reactie';
  const description = 'Korte terugkoppeling over wat de Dorpsraad Warmenhuizen met reacties op de enquête over restafvalcontainers doet.';
  const seoBlock = buildSeoBlock({
    title,
    description,
    ogDescription: description,
    canonicalUrl: getFeedbackUrl(),
    runtimeBasePath: '../',
    assetPrefix: '../',
    structuredData: buildFeedbackStructuredData()
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
      --panel: #ffffff;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.6;
    }

    main {
      width: min(820px, calc(100% - 32px));
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

    a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    h1 {
      max-width: 720px;
      margin: 0 0 16px;
      font-size: clamp(34px, 6vw, 56px);
      line-height: 1.05;
    }

    .lead {
      max-width: 720px;
      margin: 0 0 28px;
      color: var(--text);
      font-size: 21px;
    }

    section {
      border-top: 1px solid var(--line);
      padding-top: 28px;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 28px;
      line-height: 1.2;
    }

    p,
    li {
      color: var(--muted);
      font-size: 18px;
    }

    ul {
      display: grid;
      gap: 10px;
      margin: 0 0 28px;
      padding-left: 22px;
    }

    .next-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      border-radius: 8px;
      background: var(--accent);
      padding: 10px 16px;
      color: #ffffff;
      line-height: 1.25;
      text-decoration: none;
    }

    .next-link:hover {
      background: #115e59;
    }

    @media (max-width: 520px) {
      main {
        width: min(100% - 24px, 820px);
        padding-top: 32px;
      }

      .lead {
        font-size: 19px;
      }
    }
  </style>
</head>
<body>
  <main>
    <nav aria-label="Hoofdnavigatie">
      ${buildPlaceMapLinks(places, '../')}
      <a href="../analyses/">Analyses</a>
      <a href="../enquete/">Enquête</a>
      <a href="../methodiek/">Methodiek</a>
    </nav>

    <h1>Dank voor je reactie</h1>
    <p class="lead">Je reactie is ontvangen. Daarmee help je de Dorpsraad Warmenhuizen om duidelijker te laten zien wat de geplande restafvalcontainers in de praktijk betekenen.</p>

    <section aria-labelledby="feedback-next-title">
      <h2 id="feedback-next-title">Wat doen we met jouw input?</h2>
      <ul>
        <li>We bundelen reacties per straat en containerlocatie.</li>
        <li>We gebruiken de uitkomsten om aandachtspunten en mogelijke knelpunten concreet terug te koppelen aan de gemeente Schagen.</li>
      </ul>
      <p><a class="next-link" href="../warmenhuizen/#kaart" data-feedback-return-link>Terug naar de kaart</a></p>
    </section>
  </main>
  ${buildFeedbackReturnScript(places)}
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

async function writeSeoPages(places, sourcePlaces = places) {
  const templateHtml = await readFile(resolve(distDir, 'index.html'), 'utf8');
  const defaultPlace = getDefaultPlace(places);

  await writeFile(resolve(distDir, 'index.html'), await createAppPage(templateHtml, defaultPlace, places, {
    runtimeBasePath: './',
    assetPrefix: './'
  }), 'utf8');

  for (const place of places) {
    const slug = getPlaceSlug(place);
    const placeDir = resolve(distDir, slug);
    await mkdir(placeDir, { recursive: true });
    await writeFile(resolve(placeDir, 'index.html'), await createAppPage(templateHtml, place, places, {
      runtimeBasePath: '../',
      assetPrefix: '../'
    }), 'utf8');
  }

  await mkdir(resolve(distDir, 'methodiek'), { recursive: true });
  await writeFile(resolve(distDir, 'methodiek/index.html'), buildMethodologyPage(places, sourcePlaces), 'utf8');

  await mkdir(resolve(distDir, 'analyses'), { recursive: true });
  await writeFile(resolve(distDir, 'analyses/index.html'), await buildAnalysesPage(places), 'utf8');

  await mkdir(resolve(distDir, 'enquete'), { recursive: true });
  await writeFile(resolve(distDir, 'enquete/index.html'), await buildSurveyPage(places), 'utf8');

  await mkdir(resolve(distDir, 'terugkoppeling'), { recursive: true });
  await writeFile(resolve(distDir, 'terugkoppeling/index.html'), buildFeedbackPage(places), 'utf8');
}

async function writeRobotsTxt() {
  await writeFile(resolve(distDir, 'robots.txt'), `User-agent: *
Allow: ${SITE_BASE_PATH}
Sitemap: ${SITE_URL}sitemap.xml
`, 'utf8');
}

function getValidLastModified(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function writeSitemap(places) {
  const placeEntries = await Promise.all(places.map(async (place) => ({
    url: getPlaceUrl(place),
    lastmod: getValidLastModified((await readCoverageSummary(place))?.generatedAt)
  })));
  const latestPlaceLastmod = placeEntries
    .map((entry) => entry.lastmod)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const urls = [
    ...placeEntries,
    { url: getAnalysesUrl(), lastmod: latestPlaceLastmod },
    { url: getSurveyUrl(), lastmod: null },
    { url: getMethodologyUrl(), lastmod: null },
    { url: getFeedbackUrl(), lastmod: null }
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((entry) => `  <url>
    <loc>${escapeHtml(entry.url)}</loc>${entry.lastmod ? `
    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(resolve(distDir, 'sitemap.xml'), sitemap, 'utf8');
}

export async function buildSite() {
  await splitHouseCoverage({ verbose: false });
  await rm(distDir, { recursive: true, force: true });
  const configuredPlaces = await readPlacesManifest();
  const places = await getPublishablePlaces(configuredPlaces);
  if (places.length === 0) {
    throw new Error('No publishable places found. Add complete runtime data under data/places/<id>/ before building.');
  }
  await viteBuild({
    configFile: resolve(projectRoot, 'vite.config.js')
  });
  await copyRuntimeData(places, configuredPlaces);
  await copySeoAssets();
  await writeSeoPages(places, configuredPlaces);
  await writeRobotsTxt();
  await writeSitemap(places);

  await writeFile(resolve(distDir, '.nojekyll'), '', 'utf8');
  console.log(`Built static site in ${distDir}`);
}
