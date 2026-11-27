// Regression guard: the existing user flows keep working.
import { test, expect } from '@playwright/test';
import { open3d, openRender } from './helpers.js';

test('no page errors while loading the 3D view', async ({ page }) => {
  const errors = await open3d(page);
  expect(errors).toEqual([]);
});

test('find an apartment: towers → floor → apartment card', async ({ page }) => {
  await open3d(page);
  await page.locator('#start').click();
  await expect(page.locator('#explorer')).toBeVisible();
  await page.locator('.tower-list button[data-tower="III"]').click();
  await expect(page.locator('.floor-grid button[data-floor="20"]')).toBeVisible();
  await page.locator('.floor-grid button[data-floor="20"]').click();
  await expect(page.locator('.apt-list button').first()).toBeVisible();
  await page.locator('.apt-list button').first().click();
  await expect(page.locator('#apt-card')).toBeVisible();
  await expect(page.locator('#apt-card h2')).toContainText('№');
  await page.locator('#apt-card [data-close]').click();
  await expect(page.locator('#apt-card')).toBeHidden();
});

test('filters sheet opens and closes', async ({ page }) => {
  await open3d(page);
  await page.locator('#filter-open').click();
  await expect(page.locator('#filters')).toBeVisible();
  await page.locator('#filters .x[data-close]').click();
  await expect(page.locator('#filters')).toBeHidden();
});

test('language switch', async ({ page }) => {
  await open3d(page);
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#start')).toHaveText('Find an apartment');
});

test('blocks menu and places panel open', async ({ page }) => {
  await open3d(page);
  await page.locator('#block-btn').click();
  await expect(page.locator('#block-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#places-btn').click();
  await expect(page.locator('#places-panel')).toBeVisible();
});

test('intro collapses and expands', async ({ page }) => {
  await open3d(page);
  const before = await page.locator('#intro-toggle').getAttribute('aria-expanded');
  await page.locator('#intro-toggle').click();
  await expect(page.locator('#intro-toggle')).not.toHaveAttribute('aria-expanded', before);
});

test('switches from render to 3D and back', async ({ page }) => {
  await openRender(page);
  await page.locator('#view-toggle').click();
  await expect(page.locator('#render-view')).toBeHidden();
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 45_000 });
  await page.locator('#view-toggle').click();
  await expect(page.locator('#render-view')).toBeVisible();
});

test('light switch changes the scene to night', async ({ page }) => {
  await open3d(page);
  await page.locator('.light button[data-light="night"]').click();
  await expect(page.locator('#app')).toHaveClass(/night/);
});

test('360° button is named "360° ხედი" / "360° View"', async ({ page }) => {
  await open3d(page);
  await expect(page.locator('#intro-tour')).toHaveText('360° ხედი');
  await page.locator('#lang').click();
  await expect(page.locator('#intro-tour')).toHaveText('360° View');
});

test('apartment data is revalidated on every load, so refreshes show at once', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.__dataFetch = [];
    window.fetch = (url, init) => { if (String(url).includes('data/apartments.json')) window.__dataFetch.push(init?.cache || 'default'); return orig(url, init); };
  });
  await open3d(page);
  expect(await page.evaluate(() => window.__dataFetch)).toEqual(['no-cache']);
});
