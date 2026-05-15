import { expect, test } from '@playwright/test';

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

  await page.goto('/');

  await expect(page).toHaveTitle(/Werkelijke loopafstand naar restafvalcontainers/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://thebeems.github.io/afvalcontainers/warmenhuizen/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://thebeems.github.io/afvalcontainers/social/afvalcontainers-schagen-preview.png');
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

  await expect(page.locator('#visuele-uitleg')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inzicht voor Warmenhuizen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Afstand bepaalt de ervaring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meer dan 40% loopt 150 meter of meer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ga naar stap 2: Van bak aan huis naar zelf wegbrengen' })).toBeVisible();

  await page.getByRole('link', { name: 'Bekijk mijn loopafstand' }).click();

  await expect(page).toHaveURL(/#kaart$/);
  await expect(page.getByRole('combobox', { name: 'Zoek je adres' })).toBeFocused();
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
  await expect(body).toHaveClass(/mobile-search-active/);
  await expectMapAtTop();

  await page.goto('/');
  await page.locator('#story-gevolgen').scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Ga naar de kaart en zoek je adres' }).click();
  await expect(search).toBeFocused();
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
  await page.goto('/');

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  const mapShell = page.locator('.map-shell');

  await search.evaluate((input) => input.focus({ preventScroll: true }));
  await expect(page.locator('body')).toHaveClass(/mobile-search-active/);
  await search.fill('Appelvinkstraat 12');
  await page.getByRole('option', { name: /Appelvinkstraat 12/ }).click();

  await expect(page.locator('body')).not.toHaveClass(/mobile-search-active/);
  await expect.poll(async () => Math.round((await mapShell.boundingBox()).y)).toBe(0);
});

test('serves place-specific SEO metadata from clean place URLs', async ({ page }) => {
  await page.goto('/tuitjenhorn/');

  await expect(page).toHaveTitle('Werkelijke loopafstand naar restafvalcontainers in Tuitjenhorn');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://thebeems.github.io/afvalcontainers/tuitjenhorn/');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Tuitjenhorn/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://thebeems.github.io/afvalcontainers/tuitjenhorn/');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'http://127.0.0.1:8000/favicon.svg');
  await expect(page.getByRole('heading', { name: 'Inzicht voor Tuitjenhorn' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Werkelijke loopafstand naar restafvalcontainers in Tuitjenhorn/ })).toBeVisible();
  await expect(page.locator('#coverage-summary')).toContainText('adressen binnen bebouwde kom');
  await expect(page.getByRole('link', { name: 'Bekijk uitgebreide analyses' })).toHaveAttribute('href', 'http://127.0.0.1:8000/analyses/');
  await expect(page.getByRole('link', { name: 'Bekijk methodiek en onderzoeksbasis' })).toHaveAttribute('href', 'http://127.0.0.1:8000/methodiek/');
});

test('replaces query place URLs with clean place URLs', async ({ page }) => {
  await page.goto('/?plaats=tuitjenhorn');

  await expect(page).toHaveURL(/\/tuitjenhorn\/$/);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', 'http://127.0.0.1:8000/favicon.svg');
  await expect(page.getByRole('heading', { name: /Werkelijke loopafstand naar restafvalcontainers in Tuitjenhorn/ })).toBeVisible();
  await page.getByRole('link', { name: 'Bekijk methodiek en onderzoeksbasis' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:8000/methodiek/');
  await expect(page.getByRole('heading', { name: 'Methodiek en onderzoeksbasis' })).toBeVisible();
});

test('serves crawl support files and methodology page', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain('Sitemap: https://thebeems.github.io/afvalcontainers/sitemap.xml');

  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain('https://thebeems.github.io/afvalcontainers/warmenhuizen/');
  expect(sitemapText).toContain('https://thebeems.github.io/afvalcontainers/tuitjenhorn/');
  expect(sitemapText).toContain('https://thebeems.github.io/afvalcontainers/analyses/');
  expect(sitemapText).toContain('https://thebeems.github.io/afvalcontainers/methodiek/');
  expect(sitemapText).not.toContain('<loc>https://thebeems.github.io/afvalcontainers/</loc>');

  const methodology = await page.request.get('/methodiek/');
  expect(methodology.status()).toBe(200);
  const methodologyText = await methodology.text();
  expect(methodologyText).toContain('Methodiek en onderzoeksbasis');
  expect(methodologyText).toContain('Gemeente Schagen');
});

test('serves sortable analyses for each place with container map links', async ({ page }) => {
  await page.goto('/analyses/');

  await expect(page).toHaveTitle('Analyses loopafstanden');
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
