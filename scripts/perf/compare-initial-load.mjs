import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_BASELINE_DIR = '/tmp/afvalcontainers-main-perf-codex/dist';
const DEFAULT_CANDIDATE_DIR = path.join(ROOT_DIR, 'dist');
const DEFAULT_APP_PATH = '/warmenhuizen/';
const DEFAULT_RUNS = 7;
const EXTERNAL_URL_PATTERNS = [
  'https://tile.openstreetmap.org/**',
  'https://routing.openstreetmap.de/**',
  'https://tally.so/embed/**'
];

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};

function parseArgs(argv) {
  const args = {
    baselineDir: DEFAULT_BASELINE_DIR,
    candidateDir: DEFAULT_CANDIDATE_DIR,
    appPath: DEFAULT_APP_PATH,
    json: false,
    runs: DEFAULT_RUNS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--baseline-dir') {
      args.baselineDir = path.resolve(value);
      index += 1;
    } else if (arg === '--candidate-dir') {
      args.candidateDir = path.resolve(value);
      index += 1;
    } else if (arg === '--app-path') {
      args.appPath = value.startsWith('/') ? value : `/${value}`;
      index += 1;
    } else if (arg === '--runs') {
      args.runs = Number.parseInt(value, 10);
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    }
  }

  if (!Number.isInteger(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer');
  }

  return args;
}

function resolveRequestPath(distDir, requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://127.0.0.1');
  const decodedPath = decodeURIComponent(pathname);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!existsSync(filePath) && !path.extname(filePath)) {
    const indexPath = path.join(filePath, 'index.html');
    if (existsSync(indexPath)) {
      filePath = indexPath;
    }
  }

  if (!existsSync(filePath)) {
    return null;
  }

  return filePath;
}

function startStaticServer(distDir) {
  const absoluteDistDir = path.resolve(distDir);
  if (!existsSync(absoluteDistDir)) {
    throw new Error(`Dist directory does not exist: ${absoluteDistDir}`);
  }

  const server = http.createServer((request, response) => {
    const filePath = resolveRequestPath(absoluteDistDir, request.url || '/');
    if (!filePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME_TYPES[extension] || 'application/octet-stream'
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value) {
  return value === null ? null : Math.round(value);
}

function summarizeRuns(runs) {
  const keys = [
    'domContentLoadedMs',
    'loadMs',
    'firstContentfulPaintMs',
    'largestContentfulPaintMs',
    'storyVisibleMs',
    'coverageVisibleMs',
    'localRequestCount',
    'localEncodedBytes',
    'jsEncodedBytes',
    'cssEncodedBytes',
    'imageEncodedBytes',
    'jsonEncodedBytes'
  ];
  return Object.fromEntries(keys.map((key) => [key, round(median(runs.map((run) => run[key])))]));
}

function collectResourceStats(entries, origin) {
  const localResources = entries.filter((entry) => entry.name.startsWith(origin));
  const byType = (type) => sum(localResources
    .filter((entry) => entry.initiatorType === type)
    .map((entry) => entry.encodedBodySize || 0));

  return {
    localRequestCount: localResources.length,
    localEncodedBytes: sum(localResources.map((entry) => entry.encodedBodySize || 0)),
    jsEncodedBytes: byType('script'),
    cssEncodedBytes: byType('link') + byType('css'),
    imageEncodedBytes: byType('img'),
    jsonEncodedBytes: byType('fetch') + byType('xmlhttprequest')
  };
}

async function installStableRoutes(page) {
  for (const pattern of EXTERNAL_URL_PATTERNS) {
    await page.route(pattern, async (route) => {
      if (pattern.includes('tally.so')) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>Tally formulier</title>'
        });
        return;
      }

      await route.fulfill({ status: 204, body: '' });
    });
  }
}

async function collectPageMetrics(page, origin, extra = {}) {
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])
    );
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpEntries.at(-1)?.startTime ?? null;

    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadMs: navigation?.loadEventEnd ?? null,
      firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
      largestContentfulPaintMs: lcp,
      resources: performance.getEntriesByType('resource').map((entry) => ({
        encodedBodySize: entry.encodedBodySize,
        initiatorType: entry.initiatorType,
        name: entry.name
      }))
    };
  });

  const resourceStats = collectResourceStats(metrics.resources, origin);
  return {
    ...metrics,
    ...resourceStats,
    ...extra,
    resources: undefined
  };
}

async function measureStory(browser, baseUrl, appPath) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 }
  });
  const page = await context.newPage();
  await installStableRoutes(page);

  try {
    const start = performance.now();
    await page.goto(`${baseUrl}${appPath}`, { waitUntil: 'load' });
    await page.waitForSelector('#story-title', { state: 'visible' });
    const storyVisibleMs = performance.now() - start;
    await page.waitForLoadState('networkidle');
    return await collectPageMetrics(page, baseUrl, { storyVisibleMs });
  } finally {
    await context.close();
  }
}

async function measureMap(browser, baseUrl, appPath) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 }
  });
  const page = await context.newPage();
  await installStableRoutes(page);

  try {
    const start = performance.now();
    await page.goto(`${baseUrl}${appPath}#kaart`, { waitUntil: 'load' });
    await page.waitForSelector('#coverage-summary:not([hidden])', { state: 'visible' });
    const coverageVisibleMs = performance.now() - start;
    await page.waitForLoadState('networkidle');
    return await collectPageMetrics(page, baseUrl, { coverageVisibleMs });
  } finally {
    await context.close();
  }
}

async function measureVariant(browser, server, runs, appPath) {
  const storyRuns = [];
  const mapRuns = [];

  for (let run = 0; run < runs; run += 1) {
    storyRuns.push(await measureStory(browser, server.baseUrl, appPath));
    mapRuns.push(await measureMap(browser, server.baseUrl, appPath));
  }

  return {
    story: {
      runs: storyRuns,
      median: summarizeRuns(storyRuns)
    },
    map: {
      runs: mapRuns,
      median: summarizeRuns(mapRuns)
    }
  };
}

function formatBytes(bytes) {
  if (bytes === null) {
    return '-';
  }

  return `${Math.round(bytes / 1024)} kB`;
}

function formatDelta(baseline, candidate, formatter = (value) => `${value} ms`) {
  if (baseline === null || candidate === null) {
    return '-';
  }

  const delta = candidate - baseline;
  const sign = delta > 0 ? '+' : '';
  const percentage = baseline === 0 ? '' : ` (${sign}${Math.round((delta / baseline) * 100)}%)`;
  return `${sign}${formatter(delta)}${percentage}`;
}

function printSummary(results) {
  const rows = [
    ['Story DOM ready', 'story', 'domContentLoadedMs', (value) => `${value} ms`],
    ['Story load', 'story', 'loadMs', (value) => `${value} ms`],
    ['Story zichtbaar', 'story', 'storyVisibleMs', (value) => `${value} ms`],
    ['Story requests', 'story', 'localRequestCount', (value) => String(value)],
    ['Story lokale bytes', 'story', 'localEncodedBytes', formatBytes],
    ['Story JS bytes', 'story', 'jsEncodedBytes', formatBytes],
    ['Story image bytes', 'story', 'imageEncodedBytes', formatBytes],
    ['Kaart DOM ready', 'map', 'domContentLoadedMs', (value) => `${value} ms`],
    ['Kaart load', 'map', 'loadMs', (value) => `${value} ms`],
    ['Kaart zichtbaar', 'map', 'coverageVisibleMs', (value) => `${value} ms`],
    ['Kaart requests', 'map', 'localRequestCount', (value) => String(value)],
    ['Kaart lokale bytes', 'map', 'localEncodedBytes', formatBytes]
  ];

  console.log(`Runs per variant: ${results.runs}`);
  console.log(`App path: ${results.appPath}`);
  console.log('');
  console.log('| Metric | main mediaan | feature mediaan | verschil feature-main |');
  console.log('| --- | ---: | ---: | ---: |');

  for (const [label, scenario, key, formatter] of rows) {
    const baseline = results.baseline[scenario].median[key];
    const candidate = results.candidate[scenario].median[key];
    console.log(`| ${label} | ${formatter(baseline)} | ${formatter(candidate)} | ${formatDelta(baseline, candidate, formatter)} |`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselineServer = await startStaticServer(args.baselineDir);
  const candidateServer = await startStaticServer(args.candidateDir);
  const browser = await chromium.launch();

  try {
    const results = {
      runs: args.runs,
      appPath: args.appPath,
      baselineDir: args.baselineDir,
      candidateDir: args.candidateDir,
      baseline: await measureVariant(browser, baselineServer, args.runs, args.appPath),
      candidate: await measureVariant(browser, candidateServer, args.runs, args.appPath)
    };

    printSummary(results);
    if (args.json) {
      console.log('');
      console.log(JSON.stringify(results, null, 2));
    }
  } finally {
    await browser.close();
    await baselineServer.close();
    await candidateServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
