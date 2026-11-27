// Shared helpers for the UI tests.
export const NAVY = 'rgb(28, 19, 34)';

/** Open the 3D view with third-party scripts blocked and wait for the scene to finish loading. */
export async function open3d(page, query = 'view=3d') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/googletagmanager|bitrix24|b24-/, (r) => r.abort());
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 45_000 });
  await page.waitForTimeout(400);
  return errors;
}

export async function openRender(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/googletagmanager|bitrix24|b24-/, (r) => r.abort());
  await page.goto(`/${query ? '?' + query : ''}`);
  await page.waitForSelector('#render-view:not([hidden])');
  await page.waitForTimeout(800);
  return errors;
}

/** Bounding boxes of the visible elements matched by each selector (selectors that match nothing visible are skipped). */
export async function boxes(page, selectors) {
  return page.evaluate((sels) => sels.map((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (el.closest('[hidden]') || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { s, x: r.left, y: r.top, w: r.width, h: r.height };
  }).filter(Boolean), selectors);
}

export function overlaps(a, b, tol = 1) {
  return a.x + a.w - tol > b.x && b.x + b.w - tol > a.x && a.y + a.h - tol > b.y && b.y + b.h - tol > a.y;
}

export function overlapPairs(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (overlaps(list[i], list[j])) out.push(`${list[i].s} ⟷ ${list[j].s}`);
  }
  return out;
}
