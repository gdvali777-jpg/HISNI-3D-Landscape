// Accessibility: WCAG 2.2 AA checks that can be automated.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open3d, openRender } from './helpers.js';

const RULES = ['color-contrast', 'button-name', 'link-name', 'label', 'aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr-value', 'nested-interactive', 'duplicate-id-aria', 'target-size'];

async function axe(page) {
  const r = await new AxeBuilder({ page }).withRules(RULES).exclude('#viewport').exclude('#labels').analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 6).join(', ')}`);
}

test('3D intro has no axe violations', async ({ page }) => {
  await open3d(page);
  expect(await axe(page)).toEqual([]);
});

test('3D floor view has no axe violations', async ({ page }) => {
  await open3d(page, 'view=floor&tower=III&floor=20');
  expect(await axe(page)).toEqual([]);
});

test('render view has no axe violations', async ({ page }) => {
  await openRender(page);
  expect(await axe(page)).toEqual([]);
});

test('keyboard reaches the main controls and shows a visible focus ring', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard flow checked on keyboard devices');
  await open3d(page);
  await page.locator('body').focus();
  const seen = new Map();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el);
      return { id: el.id, ow: parseFloat(cs.outlineWidth), os: cs.outlineStyle, bs: cs.boxShadow }; });
    if (f.id) seen.set(f.id, f);
  }
  for (const id of ['block-btn', 'places-btn', 'filter-open', 'lang', 'start', 'intro-tour', 'intro-call', 'zoom-in']) {
    expect(seen.has(id), `${id} reachable by Tab`).toBe(true);
    const f = seen.get(id);
    expect(f.os !== 'none' && f.ow >= 2, `${id} focus ring`).toBe(true);
  }
});
