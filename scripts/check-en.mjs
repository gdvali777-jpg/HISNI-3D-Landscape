// Fails if English mode still renders Georgian (U+10A0–U+10FF) in the DOM.
// Usage: node scripts/check-en.mjs http://127.0.0.1:4173/
const pw = (await import('playwright').catch(() => null)) || await import('playwright-core');

const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const ge = /[\u10A0-\u10FF]/;
const { webkit } = pw;
const browser = await webkit.launch();
const hits = [];

async function scan(page, where) {
  const found = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc, 'u');
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('script, style')) continue;
      const text = n.textContent.replace(/\s+/g, ' ').trim();
      if (text && re.test(text)) out.push(text.slice(0, 140));
    }
    document.querySelectorAll('[aria-label],[title],[alt]').forEach((el) => {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const v = el.getAttribute(attr);
        if (v && re.test(v)) out.push(`${attr}: ${v.slice(0, 140)}`);
      }
    });
    return out;
  }, ge.source);
  if (found.length) hits.push({ where, found: [...new Set(found)] });
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto(base + '?view=3d&lang=en', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await scan(page, 'overview');
const block = page.locator('#block-btn');
if (await block.count()) {
  await block.click();
  await page.locator('#block-menu [data-block="III"]').click();
  await page.waitForTimeout(800);
  await scan(page, 'block');
  const floor = page.locator('#explorer [data-floor="20"]');
  if (await floor.count()) {
    await floor.click();
    await page.waitForTimeout(600);
    await scan(page, 'floor');
    const apt = page.locator('#explorer [data-apt]').first();
    if (await apt.count()) {
      await apt.click();
      await page.waitForTimeout(500);
      await scan(page, 'apartment');
    }
  }
}
await page.goto(base + '?view=render&lang=en', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelector('#block-btn')?.textContent?.includes('Block'), null, { timeout: 20000 });
await page.click('#places-btn');
await page.waitForTimeout(300);
await scan(page, 'render-day-places');
await page.click('#night-mode');
await page.waitForTimeout(800);
await page.click('#block-btn');
await page.locator('#block-menu [data-block="I"]').click();
await page.waitForTimeout(400);
await scan(page, 'render-night');
await browser.close();
if (hits.length) {
  console.error(JSON.stringify(hits, null, 2));
  process.exit(1);
}
console.log('EN DOM has no Georgian text');
