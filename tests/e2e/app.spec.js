import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route('https://routing.openstreetmap.de/**', async (route) => {
    await route.fulfill({ status: 503, body: '{}' });
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

test('opens address feedback entry point without a configured Tally form', async ({ page }) => {
  await page.goto('/#kaart');

  const search = page.getByRole('combobox', { name: 'Zoek je adres' });
  await search.fill('Appelvinkstraat 12');
  await page.getByRole('option', { name: /Appelvinkstraat 12/ }).click();

  const surveyButton = page.getByRole('button', { name: 'Deel wat deze afstand voor jou betekent' });
  await expect(surveyButton).toBeVisible();
  await expect(surveyButton).toHaveAttribute('data-tally-street', 'Appelvinkstraat');

  await surveyButton.click();
  await expect(page.locator('#coverage-status')).toContainText('Enquêteformulier is nog niet gekoppeld');
});
