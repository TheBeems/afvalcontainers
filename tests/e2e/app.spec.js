import { expect, test } from '@playwright/test';

const SITE_URL = 'https://afvalcontainers-warmenhuizen.nl/';

async function captureContainerDownloads(page) {
  await page.addInitScript(() => {
    window.__containerEditorDownloads = [];
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = (blob) => {
      const url = originalCreateObjectUrl(blob);
      if (blob instanceof Blob) {
        void blob.text().then((text) => {
          window.__containerEditorDownloads.push({ url, text });
        });
      }
      return url;
    };

    HTMLAnchorElement.prototype.click = function click() {
      window.__containerEditorDownloads.push({
        download: this.download,
        href: this.href
      });
      return originalAnchorClick.call(this);
    };
  });
}

async function downloadContainerDataset(page) {
  const downloadButton = page.getByRole('button', { name: 'Download JSON' });
  await expect(downloadButton).toBeEnabled();
  await downloadButton.dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.__containerEditorDownloads.length)).toBeGreaterThanOrEqual(2);
  const downloads = await page.evaluate(() => window.__containerEditorDownloads);
  const clickEntry = downloads.find((entry) => entry.download);
  const blobEntry = downloads.find((entry) => entry.text);

  return {
    filename: clickEntry.download,
    payload: JSON.parse(blobEntry.text)
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route('https://routing.openstreetmap.de/**', async (route) => {
    await route.fulfill({ status: 503, body: '{}' });
  });
  await page.route('https://tally.so/embed/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Tally formulier</title>'
    });
  });
});

test('loads the app shell and precomputed coverage data', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/#kaart');

  await expect(page).toHaveTitle(/Werkelijke loopafstand naar restafvalcontainers/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}warmenhuizen/`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${SITE_URL}social/afvalcontainers-schagen-preview.png`);
  await expect(page.getByRole('heading', { name: /Werkelijke loopafstand naar restafvalcontainers/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Zoek je adres' })).toBeVisible();

  const placeSelect = page.getByLabel('Selecteer dorp');
  await expect(placeSelect).toBeVisible();
  await expect.poll(() => placeSelect.locator('option').count()).toBeGreaterThan(0);

  const summary = page.locator('#coverage-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('adressen binnen bebouwde kom');
  await expect(summary).toContainText('containers');
  expect(pageErrors).toEqual([]);
});

test('shows the visual introduction and focuses search from the CTA', async ({ page }) => {
  await page.goto('/');

  const story = page.locator('#visuele-uitleg');
  const mapShell = page.locator('.map-shell');

  await expect(page.locator('#visuele-uitleg')).toBeVisible();
  await expect(page.locator('#story-title')).toContainText('Warmenhuizen');
  await expect(page.getByRole('heading', { name: 'Afstand bepaalt de ervaring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meer dan 40% loopt 150 meter of meer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ga naar stap 2: Van bak aan huis naar zelf wegbrengen' })).toBeVisible();

  await page.getByRole('link', { name: 'Bekijk mijn loopafstand' }).click();

  await expect(page).toHaveURL(/#kaart$/);
  await expect(story).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Zoek je adres' })).toBeFocused();
  await expect.poll(async () => Math.round((await mapShell.boundingBox()).y)).toBe(0);

  await page.getByRole('link', { name: 'Bekijk de visuele uitleg opnieuw' }).click();
  await expect(page).toHaveURL(/#visuele-uitleg$/);
  await expect(story).toBeVisible();
  await expect(page.locator('#story-title')).toContainText('Warmenhuizen');

  await page.getByRole('link', { name: 'Direct naar kaart' }).click();
  await expect(story).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Zoek je adres' })).toBeFocused();
});

test('starts map data immediately while deferring later story media', async ({ page }) => {
  const requestedUrls = [];
  page.on('request', (request) => {
    requestedUrls.push(request.url());
  });

  await page.goto('/warmenhuizen/');
  await expect(page.locator('#visuele-uitleg')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Direct naar kaart' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);

  expect(requestedUrls.some((url) => url.includes('/house-map.json'))).toBe(true);
  expect(requestedUrls.some((url) => url.startsWith('https://tile.openstreetmap.org/'))).toBe(true);
  expect(requestedUrls.some((url) => /brengsysteem/.test(url))).toBe(true);
  expect(requestedUrls.some((url) => /werkelijke-looproute|loopafstand-ervaring|praktische-gevolgen/.test(url))).toBe(false);

  await page.getByRole('link', { name: 'Direct naar kaart' }).click();
  await expect(page.locator('#visuele-uitleg')).toBeHidden();
  await expect(page.locator('#coverage-summary')).toBeVisible();
});

test('focuses search while initial map data finishes and selects an address', async ({ page }) => {
  let releaseHouseMap;
  const houseMapDelay = new Promise((resolve) => {
    releaseHouseMap = resolve;
  });
  let houseMapRequested = false;

  await page.route('**/house-map.json', async (route) => {
    houseMapRequested = true;
    await houseMapDelay;
    await route.continue();
  });

  await page.goto('/warmenhuizen/');
  await expect(page.locator('#visuele-uitleg')).toBeVisible();
  await expect.poll(() => houseMapRequested).toBe(true);

  await page.getByRole('link', { name: 'Direct naar kaart' }).click();

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  await expect(search).toBeFocused();
  await expect(page.locator('#coverage-summary')).toBeHidden();

  await search.fill('Appelvinkstraat 12');
  const option = page.getByRole('option', { name: /Appelvinkstraat 12/ });
  await expect(option).toBeVisible();
  await option.click();

  releaseHouseMap();
  await expect(page.locator('#coverage-summary')).toBeVisible();
  await expect(page.locator('.house-map-info')).toContainText('Appelvinkstraat 12');
});

test('serves the root as the Warmenhuizen app without a client-side redirect', async ({ page }) => {
  const response = await page.request.get('/');
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).toContain('id="visuele-uitleg"');
  expect(html).toContain(`href="${SITE_URL}warmenhuizen/"`);
  expect(html).not.toContain('http-equiv="refresh"');
  expect(html).not.toContain('window.location.replace');
});

test('hides configured villages without complete runtime data from public pages', async ({ page }) => {
  const hiddenVillageNames = [
    'Dirkshorn',
    'Sint Maarten',
    'Waarland',
    'Burgerbrug',
    'Oudesluis',
    'Schagerbrug'
  ];

  await page.goto('/#kaart');

  const placeSelect = page.getByLabel('Selecteer dorp');
  await expect(placeSelect).toBeVisible();
  await expect.poll(() => placeSelect.locator('option').count()).toBe(2);
  const optionText = await placeSelect.locator('option').allTextContents();
  expect(optionText).toEqual(['Warmenhuizen', 'Tuitjenhorn']);

  const footerText = await page.locator('.sidebar-footer-nav').innerText();
  for (const villageName of hiddenVillageNames) {
    expect(footerText).not.toContain(villageName);
  }

  await page.goto('/analyses/');
  const analysesText = await page.locator('main').innerText();
  for (const villageName of hiddenVillageNames) {
    expect(analysesText).not.toContain(villageName);
  }

  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  for (const villageSlug of ['dirkshorn', 'sint-maarten', 'waarland', 'burgerbrug', 'oudesluis', 'schagerbrug']) {
    expect(sitemap).not.toContain(`/${villageSlug}/`);
  }
});

test('creates a container JSON draft for an unpublished catalog village from the editor', async ({ page }) => {
  await captureContainerDownloads(page);

  await page.goto('/#kaart');

  const publicPlaceSelect = page.getByLabel('Selecteer dorp');
  await expect.poll(() => publicPlaceSelect.locator('option').count()).toBe(2);

  await page.getByRole('button', { name: 'Containereditor openen' }).click();
  const editorPlaceSelect = page.getByLabel('Containerdataset voor dorp');
  await expect(editorPlaceSelect).toBeVisible();
  await expect(editorPlaceSelect).toContainText('Waarland');
  await editorPlaceSelect.selectOption('waarland');

  await expect(page.locator('#container-editor-status')).toContainText('Nieuwe containerdataset voor Waarland');

  await page.getByRole('button', { name: 'Nieuwe container' }).click();
  await page.locator('.leaflet-container').click({ position: { x: 420, y: 320 } });

  const idInput = page.locator('#container-edit-form input[name="id"]');
  await expect(idInput).toHaveValue('WL01');
  await page.locator('#container-edit-form input[name="address"]').fill('Testlocatie Waarland');
  await page.getByRole('button', { name: 'Opslaan' }).click();

  const { filename, payload } = await downloadContainerDataset(page);

  expect(filename).toBe('waarland-container-locations.json');
  expect(payload).toHaveLength(1);
  expect(payload[0]).toMatchObject({
    id: 'WL01',
    address: 'Testlocatie Waarland',
    accuracy: 'handmatig bepaald (zeer hoog, onzekerheid -1 m)'
  });
});

test('ignores stale container-editor loads after switching villages quickly', async ({ page }) => {
  await captureContainerDownloads(page);

  let releaseWaarlandContainers;
  const waarlandContainerDelay = new Promise((resolve) => {
    releaseWaarlandContainers = resolve;
  });
  let waarlandContainersRequested = false;

  await page.route('**/data/places/waarland/container-locations.json', async (route) => {
    waarlandContainersRequested = true;
    await waarlandContainerDelay;
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{}'
    });
  });

  await page.goto('/#kaart');

  await page.getByRole('button', { name: 'Containereditor openen' }).click();
  const editorPlaceSelect = page.getByLabel('Containerdataset voor dorp');
  await editorPlaceSelect.selectOption('waarland');
  await expect.poll(() => waarlandContainersRequested).toBe(true);

  await editorPlaceSelect.selectOption('tuitjenhorn');
  await expect(page.locator('#container-editor-status')).toContainText('Containerdataset voor Tuitjenhorn geladen.');

  releaseWaarlandContainers();
  await expect(editorPlaceSelect).toHaveValue('tuitjenhorn');
  await expect(page.locator('#container-editor-status')).toContainText('Containerdataset voor Tuitjenhorn geladen.');

  await page.getByRole('button', { name: 'Nieuwe container' }).click();
  await page.locator('.leaflet-container').click({ position: { x: 420, y: 320 } });

  const idInput = page.locator('#container-edit-form input[name="id"]');
  await expect(idInput).toHaveValue('TH25');
  await page.locator('#container-edit-form input[name="address"]').fill('Testlocatie Tuitjenhorn');
  await page.getByRole('button', { name: 'Opslaan' }).click();

  const { filename, payload } = await downloadContainerDataset(page);

  expect(filename).toBe('tuitjenhorn-container-locations.json');
  expect(payload).toHaveLength(25);
  expect(payload.at(-1)).toMatchObject({
    id: 'TH25',
    address: 'Testlocatie Tuitjenhorn'
  });
  expect(payload.every((container) => container.id.startsWith('TH'))).toBe(true);
});

test('keeps the mobile menu out of the visual introduction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const toggle = page.locator('#mobile-sidebar-toggle');
  await expect(toggle).toBeHidden();

  await page.getByRole('link', { name: 'Bekijk mijn loopafstand' }).click();
  await expect(toggle).toBeVisible();
});

test('shows the mobile map behind search when jumping from the story', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const body = page.locator('body');
  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  const mapShell = page.locator('.map-shell');
  const expectMapAtTop = async () => {
    await expect.poll(async () => Math.round((await mapShell.boundingBox()).y)).toBe(0);
  };

  await page.getByRole('link', { name: 'Direct naar kaart' }).click();
  await expect(search).toBeFocused();
  await expect(page.locator('#visuele-uitleg')).toBeHidden();
  await expect(body).toHaveClass(/mobile-search-active/);
  await expectMapAtTop();

  await page.goto('/');
  await page.locator('#story-gevolgen').scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Ga naar de kaart en zoek je adres' }).click();
  await expect(search).toBeFocused();
  await expect(page.locator('#visuele-uitleg')).toBeHidden();
  await expect(body).toHaveClass(/mobile-search-active/);
  await expectMapAtTop();
});

test('keeps the mobile search visible in visual viewport focus mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  const searchPanel = page.locator('.map-search-panel');
  const body = page.locator('body');

  const expectInsideVisualViewport = async (locator) => {
    const bounds = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;

      return {
        rect: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left
        },
        viewport: {
          top: viewportTop,
          right: viewportLeft + (viewport?.width || window.innerWidth),
          bottom: viewportTop + (viewport?.height || window.innerHeight),
          left: viewportLeft
        }
      };
    });

    expect(bounds.rect.top).toBeGreaterThanOrEqual(bounds.viewport.top - 1);
    expect(bounds.rect.left).toBeGreaterThanOrEqual(bounds.viewport.left - 1);
    expect(bounds.rect.right).toBeLessThanOrEqual(bounds.viewport.right + 1);
    expect(bounds.rect.bottom).toBeLessThanOrEqual(bounds.viewport.bottom + 1);
  };

  await page.getByRole('link', { name: 'Bekijk mijn loopafstand' }).click();
  await expect(search).toBeFocused();
  await expect(body).toHaveClass(/mobile-search-active/);
  await expect(searchPanel).toHaveCSS('position', 'fixed');
  await expectInsideVisualViewport(search);

  await page.setViewportSize({ width: 390, height: 520 });
  await expectInsideVisualViewport(search);

  await search.fill('Appelvinkstraat 12');
  const option = page.getByRole('option', { name: /Appelvinkstraat 12/ });
  await expect(option).toBeVisible();
  await expectInsideVisualViewport(search);
  await expectInsideVisualViewport(page.locator('#search-results'));

  await option.click();
  await expect(body).not.toHaveClass(/mobile-search-active/);

  await page.goto('/#kaart');
  await page.setViewportSize({ width: 390, height: 844 });
  await search.click();
  await expect(search).toBeFocused();
  await expect(body).toHaveClass(/mobile-search-active/);

  await search.evaluate((input) => input.blur());
  await expect(body).not.toHaveClass(/mobile-search-active/);

  await search.click();
  await expect(body).toHaveClass(/mobile-search-active/);
  await page.keyboard.press('Escape');
  await expect(body).not.toHaveClass(/mobile-search-active/);
});

test('scrolls to the mobile map after selecting an address from search focus mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#kaart');

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  const mapShell = page.locator('.map-shell');

  await search.click();
  await expect(page.locator('body')).toHaveClass(/mobile-search-active/);
  await search.fill('Appelvinkstraat 12');
  await page.getByRole('option', { name: /Appelvinkstraat 12/ }).click();

  await expect(page.locator('body')).not.toHaveClass(/mobile-search-active/);
  await expect.poll(async () => Math.round((await mapShell.boundingBox()).y)).toBe(0);
});

test('serves place-specific SEO metadata from clean place URLs', async ({ page }) => {
  await page.goto('/tuitjenhorn/');

  await expect(page).toHaveTitle('Werkelijke loopafstand naar restafvalcontainers in Tuitjenhorn');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_URL}tuitjenhorn/`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Tuitjenhorn/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${SITE_URL}tuitjenhorn/`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'http://127.0.0.1:8000/favicon.svg');
  await expect(page.locator('#story-title')).toContainText('Tuitjenhorn');
  await page.getByRole('link', { name: 'Direct naar kaart' }).click();
  await expect(page.locator('#app-title')).toContainText('Tuitjenhorn');
  await expect(page.locator('#coverage-summary')).toContainText('adressen binnen bebouwde kom');
  await expect(page.getByRole('link', { name: 'Bekijk uitgebreide analyses' })).toHaveAttribute('href', 'http://127.0.0.1:8000/analyses/');
  await expect(page.getByRole('link', { name: 'Bekijk methodiek en onderzoeksbasis' })).toHaveAttribute('href', 'http://127.0.0.1:8000/methodiek/');
});

test('replaces query place URLs with clean place URLs', async ({ page }) => {
  await page.goto('/?plaats=tuitjenhorn');

  await expect(page).toHaveURL(/\/tuitjenhorn\/$/);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'http://127.0.0.1:8000/favicon.svg');
  await expect(page.locator('#story-title')).toContainText('Tuitjenhorn');
  await page.getByRole('link', { name: 'Direct naar kaart' }).click();
  await expect(page.locator('#app-title')).toContainText('Tuitjenhorn');
  await page.getByRole('link', { name: 'Bekijk methodiek en onderzoeksbasis' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:8000/methodiek/');
  await expect(page.getByRole('heading', { name: 'Methodiek en onderzoeksbasis' })).toBeVisible();
});

test('serves crawl support files and methodology page', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain(`Sitemap: ${SITE_URL}sitemap.xml`);

  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain(`${SITE_URL}warmenhuizen/`);
  expect(sitemapText).toContain(`${SITE_URL}tuitjenhorn/`);
  expect(sitemapText).toContain(`${SITE_URL}analyses/`);
  expect(sitemapText).toContain(`${SITE_URL}methodiek/`);
  expect(sitemapText).not.toContain(`<loc>${SITE_URL}</loc>`);

  const methodology = await page.request.get('/methodiek/');
  expect(methodology.status()).toBe(200);
  const methodologyText = await methodology.text();
  expect(methodologyText).toContain('Methodiek en onderzoeksbasis');
  expect(methodologyText).toContain('Gemeente Schagen');
  expect(methodologyText).toContain('Onderzoeken over loopafstand en afvalinzameling');
  for (const villageName of ['Dirkshorn', 'Sint Maarten', 'Waarland', 'Burgerbrug', 'Oudesluis', 'Schagerbrug']) {
    expect(methodologyText).toContain(`Gemeente Schagen: ${villageName}`);
  }
});

test('serves sortable analyses for each place with container map links', async ({ page }) => {
  await page.goto('/analyses/');

  await expect(page).toHaveTitle('Analyses loopafstanden restafvalcontainers');
  await expect(page.getByRole('heading', { name: 'Analyses loopafstanden' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kerncijfers Warmenhuizen' })).toBeVisible();

  const placeSelect = page.getByLabel('Selecteer dorp');
  await placeSelect.selectOption('tuitjenhorn');
  await expect(page.getByRole('heading', { name: 'Kerncijfers Tuitjenhorn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kerncijfers Warmenhuizen' })).toBeHidden();

  await page.getByRole('button', { name: 'Sorteer op Adressen' }).first().click();
  await expect(page.getByRole('button', { name: 'Sorteer op Adressen' }).first()).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('button', { name: 'Sorteer op Adressen' }).first().click();
  await expect(page.getByRole('button', { name: 'Sorteer op Adressen' }).first()).toHaveAttribute('aria-sort', 'descending');

  await expect(page.getByRole('link', { name: /^TH\d{2}$/ }).first()).toHaveAttribute('href', /\/tuitjenhorn\/\?container=TH\d{2}#kaart$/);
});

test('opens container deeplinks with the intro collapsed', async ({ page }) => {
  await page.goto('/tuitjenhorn/?container=TH21#kaart');

  await expect(page).toHaveURL(/\/tuitjenhorn\/\?container=TH21#kaart$/);
  await expect(page.locator('#visuele-uitleg')).toBeHidden();
  await expect(page.locator('#coverage-status')).toContainText('Geselecteerde container TH21');
  await page.waitForTimeout(500);
  await expect(page.locator('#sidebar-header-panel')).not.toHaveAttribute('open', '');

  await page.getByLabel('Selecteer dorp').selectOption('warmenhuizen');

  await expect(page).toHaveURL(/\/warmenhuizen\/#kaart$/);
});

test('opens and closes the mobile sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#kaart');

  const toggle = page.locator('#mobile-sidebar-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Menu openen');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Menu sluiten');
  await expect(page.locator('body')).toHaveClass(/mobile-sidebar-open/);

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Menu openen');
});

test('opens address feedback entry point with privacy-safe Tally hidden fields', async ({ page }) => {
  await page.addInitScript(() => {
    window.__tallyLoadEmbedsCalls = 0;
    window.Tally = {
      loadEmbeds: () => {
        window.__tallyLoadEmbedsCalls += 1;
        document.querySelectorAll('iframe[data-tally-src]:not([src])').forEach((iframe) => {
          iframe.src = iframe.dataset.tallySrc;
        });
      }
    };
  });

  await page.goto('/#kaart');

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  await search.fill('Appelvinkstraat 12');
  await page.getByRole('option', { name: /Appelvinkstraat 12/ }).click();

  const surveyButton = page.getByRole('button', { name: 'Geef je mening' });
  await expect(surveyButton).toBeVisible();
  await expect(surveyButton).not.toHaveAttribute('data-tally-open', 'WODW1v');
  await expect(surveyButton).toHaveAttribute('data-tally-street', 'Appelvinkstraat');

  await surveyButton.click();

  const dialog = page.getByRole('dialog', { name: 'Enquête over containers' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Enquête sluiten' })).toBeVisible();

  const frame = dialog.locator('iframe.tally-survey-frame');
  const tallySrc = await frame.getAttribute('data-tally-src');
  const tallyUrl = new URL(tallySrc);
  expect(tallyUrl.origin).toBe('https://tally.so');
  expect(tallyUrl.pathname).toBe('/embed/WODW1v');
  expect(tallyUrl.searchParams.has('alignLeft')).toBe(false);
  expect(tallyUrl.searchParams.get('transparentBackground')).toBe('1');
  expect(tallyUrl.searchParams.get('dynamicHeight')).toBe('1');
  expect(Object.fromEntries(tallyUrl.searchParams)).toMatchObject({
    place: 'Warmenhuizen',
    street: 'Appelvinkstraat',
    coverage_status: expect.any(String),
    walking_distance_m: expect.any(String),
    walking_duration_s: expect.any(String),
    container_id: expect.any(String)
  });
  expect(tallyUrl.searchParams.has('address')).toBe(false);
  expect(tallyUrl.searchParams.has('house_number')).toBe(false);
  expect(tallyUrl.searchParams.has('postcode')).toBe(false);
  expect(Array.from(tallyUrl.searchParams.values())).not.toContain('Appelvinkstraat 12');
  await expect(frame).toHaveAttribute('src', tallySrc);
  expect(await page.evaluate(() => window.__tallyLoadEmbedsCalls)).toBe(1);

  await dialog.getByRole('button', { name: 'Enquête sluiten' }).click();
  await expect(page.locator('.tally-survey-dialog')).toHaveCount(0);
  await expect(surveyButton).toBeFocused();

  await surveyButton.click();
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://tally.so',
      data: JSON.stringify({
        event: 'Tally.FormSubmitted',
        payload: { formId: 'WODW1v' }
      })
    }));
  });
  await expect(page.locator('.tally-survey-dialog')).toHaveCount(0);
});
