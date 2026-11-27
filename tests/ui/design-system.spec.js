// Design system: tokens, one control size, one button hierarchy.
import { test, expect } from '@playwright/test';
import { open3d, openRender, NAVY } from './helpers.js';

test.describe('design tokens', () => {
  test('root defines spacing, radius, control, elevation and layer tokens', async ({ page }) => {
    await open3d(page);
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return ['--space-1', '--space-2', '--space-3', '--space-4', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill',
        '--control-h', '--font-sm', '--font-md', '--font-lg', '--elev-1', '--elev-2', '--z-scene-ui', '--z-chrome', '--z-sheet', '--z-overlay',
        '--surface', '--surface-strong', '--text', '--text-muted', '--border']
        .map((k) => [k, cs.getPropertyValue(k).trim()]);
    });
    for (const [k, v] of tokens) expect(v, `${k} is defined`).not.toBe('');
    expect(tokens.find(([k]) => k === '--control-h')[1]).toBe('44px');
  });
});

test.describe('header controls', () => {
  test('every header control is the same height', async ({ page }) => {
    await open3d(page);
    const hs = await page.evaluate(() => ['#back-list', '#block-btn', '#places-btn', '#view-toggle', '#filter-open', '#about-open', '#lang']
      .map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return [s, r ? Math.round(r.height) : 0]; })
      .filter(([, h]) => h > 0));
    for (const [s, h] of hs) expect(h, `${s} height`).toBe(44);
  });

  test('header controls use the secondary surface, not the primary fill', async ({ page }) => {
    await open3d(page);
    const fills = await page.evaluate(() => ['#back-list', '#block-btn', '#places-btn', '#view-toggle', '#filter-open', '#about-open']
      .map((s) => [s, getComputedStyle(document.querySelector(s)).backgroundColor]));
    for (const [s, bg] of fills) expect(bg, `${s} background`).not.toMatch(/^rgba?\(28, 19, 34/);
  });
});

test.describe('intro hierarchy', () => {
  test('one primary action; secondary actions share one style', async ({ page }) => {
    await open3d(page);
    const r = await page.evaluate(() => {
      const st = (s) => { const el = document.querySelector(s); const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        return { bg: cs.backgroundColor, border: cs.borderTopColor + ' ' + cs.borderTopWidth, h: Math.round(b.height), w: Math.round(b.width), top: Math.round(b.top) }; };
      const filled = [...document.querySelectorAll('#intro button, #intro a')].filter((el) => el.offsetParent && /^rgb\(28, 19, 34\)$/.test(getComputedStyle(el).backgroundColor)).map((el) => el.id);
      return { start: st('#start'), tour: st('#intro-tour'), call: st('#intro-call'), filled };
    });
    expect(r.filled).toEqual(['start']);
    expect(r.tour.bg).toBe(r.call.bg);
    expect(r.tour.border).toBe(r.call.border);
    expect(r.tour.h).toBe(r.call.h);
    // Secondary actions sit together on one row, below the primary.
    expect(r.tour.top).toBe(r.call.top);
    expect(r.tour.top).toBeGreaterThan(r.start.top);
    // The primary action spans the full card width.
    expect(r.start.w).toBeGreaterThanOrEqual(r.tour.w + r.call.w);
  });
});

test.describe('render quick filter', () => {
  test('fieldsets have no browser-default border', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile' || info.project.name === 'tablet', 'quick filter is a desktop panel');
    await openRender(page);
    const borders = await page.$$eval('#render-filters fieldset', (fs) => fs.map((f) => getComputedStyle(f).borderTopWidth));
    expect(borders.length).toBeGreaterThan(0);
    for (const b of borders) expect(b).toBe('0px');
  });
});
