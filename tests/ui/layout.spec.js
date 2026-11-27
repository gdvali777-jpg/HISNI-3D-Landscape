// Layout: grouped chrome, no overlaps, no overflow, on every viewport.
import { test, expect } from '@playwright/test';
import { open3d, openRender, boxes, overlapPairs } from './helpers.js';

const CHROME_3D = ['.brand', '#back-list', '#block-btn', '#places-btn', '.header-right', '#intro', '.layers', '.tools', '.map-meta .north', 'footer', '#hint'];

test('3D: chrome elements never overlap and stay inside the viewport', async ({ page }) => {
  await open3d(page);
  const list = await boxes(page, CHROME_3D);
  expect(overlapPairs(list)).toEqual([]);
  const vp = page.viewportSize();
  for (const b of list) {
    expect(b.x, `${b.s} left`).toBeGreaterThanOrEqual(0);
    expect(b.y, `${b.s} top`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${b.s} right`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.h, `${b.s} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
  }
});

test('3D floor view: explorer, crumbs and map controls do not overlap', async ({ page }) => {
  await open3d(page, 'view=floor&tower=III&floor=20');
  const list = await boxes(page, ['.header-right', '#block-btn', '#places-btn', '#crumbs', '#explorer', '.layers', '.tools', 'footer', '#hint']);
  expect(overlapPairs(list)).toEqual([]);
});

test('no horizontal scrolling', async ({ page }) => {
  await open3d(page);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
});

test('blocks and places live in the app bar row on wide screens', async ({ page }, info) => {
  test.skip(['mobile'].includes(info.project.name), 'phones use a second header row');
  await open3d(page);
  const tops = await page.evaluate(() => Object.fromEntries(['#filter-open', '#block-btn', '#places-btn', '#back-list']
    .map((s) => [s, Math.round(document.querySelector(s).getBoundingClientRect().top)])));
  expect(Math.abs(tops['#block-btn'] - tops['#filter-open'])).toBeLessThanOrEqual(2);
  expect(Math.abs(tops['#places-btn'] - tops['#filter-open'])).toBeLessThanOrEqual(2);
  expect(Math.abs(tops['#back-list'] - tops['#filter-open'])).toBeLessThanOrEqual(2);
});

test('phones: second header row holds back-link, blocks and places on one line', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone only');
  await open3d(page);
  const tops = await page.evaluate(() => ['#back-list', '#block-btn', '#places-btn'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test('map layers sit behind a toggle; the light switch stays visible', async ({ page }) => {
  await open3d(page);
  await expect(page.locator('#layers-toggle')).toBeVisible();
  await expect(page.locator('#layer-options input').first()).toBeHidden();
  await expect(page.locator('.light button[data-light="night"]')).toBeVisible();
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#layers-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#layer-options input').first()).toBeVisible();
});

test('render: day/night is a horizontal switch in the bottom bar and nothing overlaps', async ({ page }) => {
  await openRender(page);
  const vp = page.viewportSize();
  const dn = (await boxes(page, ['#day-night']))[0];
  expect(dn.w).toBeGreaterThan(dn.h);
  expect(dn.y + dn.h).toBeGreaterThan(vp.height - 120);
  const list = await boxes(page, ['.brand', '#back-list', '#block-btn', '#places-btn', '.header-right', '#day-night', '.render-spin', '.tools', '.render-panel']);
  expect(overlapPairs(list)).toEqual([]);
});

test('closing the first-visit hint does not move the primary action', async ({ page }) => {
  await open3d(page);
  await expect(page.locator('#hint')).toBeVisible();
  const before = await page.locator('#start').boundingBox();
  await page.locator('#hint-ok').click();
  await expect(page.locator('#hint')).toBeHidden();
  const after = await page.locator('#start').boundingBox();
  expect(after).toEqual(before);
});

test('English: chrome elements never overlap', async ({ page }) => {
  await open3d(page, 'view=3d&lang=en');
  expect(overlapPairs(await boxes(page, CHROME_3D))).toEqual([]);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
});
