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

  await page.getByRole('link', { name: 'Zoek mijn loopafstand' }).click();

  await expect(page).toHaveURL(/#kaart$/);
  await expect(page.getByRole('combobox', { name: 'Zoek je adres' })).toBeFocused();
});

test('keeps the mobile menu out of the visual introduction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const toggle = page.locator('#mobile-sidebar-toggle');
  await expect(toggle).toBeHidden();

  await page.getByRole('link', { name: 'Zoek mijn loopafstand' }).click();
  await expect(toggle).toBeVisible();
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
