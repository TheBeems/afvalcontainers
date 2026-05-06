import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ status: 204 });
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

test('opens and closes the mobile sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const toggle = page.locator('#mobile-sidebar-toggle');
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
