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
  const description = 'Korte uitleg voor bewoners van Warmenhuizen over de loopafstandsanalyse en de onderzoeken waarop de afstandscategorieen zijn gebaseerd.';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebsiteStructuredData(),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: 'Methodiek en onderzoeksbasis',
        description,
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
  const title = 'Methodiek en onderzoeksbasis';
  const description = 'Korte uitleg voor bewoners van Warmenhuizen over de loopafstandsanalyse en de onderzoeken waarop de afstandscategorieen zijn gebaseerd.';
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
      <a href="../warmenhuizen/">Kaart Warmenhuizen</a>
      <a href="../tuitjenhorn/">Kaart Tuitjenhorn</a>
    </nav>

    <h1>Methodiek en onderzoeksbasis</h1>
    <p class="lead">Deze pagina legt kort uit hoe de kaart voor Warmenhuizen is gemaakt en waarom de kleuren op de kaart juist deze afstanden gebruiken.</p>

    <h2>Wat laat de kaart zien?</h2>
    <p>De kaart kijkt naar woonadressen binnen de bebouwde kom van Warmenhuizen en laat zien hoe ver bewoners echt moeten lopen naar de dichtstbijzijnde geplande restafvalcontainer.</p>
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
          <th>Belangrijkste les voor Warmenhuizen</th>
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
    <p>Voor Warmenhuizen is vooral de vergelijking met dorpen en laagbouwwijken relevant. Daar is de verandering groot: van een grijze bak aan huis naar zelf restafval wegbrengen.</p>
    <p>Een afstand van 275 meter op papier betekent daarom niet automatisch dat de voorziening voor bewoners redelijk voelt. De werkelijke route, oversteken, sociale veiligheid, volle containers en fysieke belasting bepalen samen of het systeem werkbaar is.</p>

    <h2>Broncode</h2>
    <p>De broncode van deze website is openbaar te bekijken op GitHub: <a href="https://github.com/TheBeems/afvalcontainers">github.com/TheBeems/afvalcontainers</a>.</p>

    <h2>Bronnen</h2>
    <ul class="source-list">
      <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-warmenhuizen">Gemeente Schagen: Warmenhuizen</a></li>
      <li><a href="https://www.schagen.nl/plaatsing-ondergrondse-restafvalcontainers-tuitjenhorn">Gemeente Schagen: Tuitjenhorn</a></li>
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
