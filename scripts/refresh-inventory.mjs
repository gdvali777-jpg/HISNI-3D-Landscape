#!/usr/bin/env node
/*
 * Refresh apartment status and price in public/data/apartments.json from the Bitrix24 catalog.
 *
 * Only `status`, `price_usd` and `price_per_m2_usd` (plus snapshot dates) change.
 * Geometry, plans, types and positions are never touched.
 *
 * Sources:
 *   --from-bitrix          read the HISNI catalog section over Bitrix REST (env BITRIX_WEBHOOK_URL, read calls only)
 *   --from-file <rows.json> rows exported by hand: [{ block: "HISNI1", floor, number, status, price }]
 * Options:
 *   --dry-run              print the changes, write nothing
 *   --date YYYY-MM-DD      snapshot date (default: today in Asia/Tbilisi)
 *   --max-change <0..1>    abort when more than this share of statuses changes at once (default 0.25)
 *
 * Safety: the file is written only when every site apartment in Blocks I–III is matched exactly once,
 * every status is known, and every available apartment has a positive price. Otherwise nothing is written.
 * Never call Bitrix from the browser and never commit the webhook URL.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DATA_FILE = new URL('../public/data/apartments.json', import.meta.url);
export const SECTION_ID = 68; // Bitrix catalog section "HISNI"
export const BLOCKS = { HISNI1: 'I', HISNI2: 'II', HISNI3: 'III' };
const BLOCK_PREFIX = { I: 'B1', II: 'B2', III: 'B3' };
export const STATUS = {
  'თავისუფალი': 'available', 'დაჯავშნილი': 'reserved', 'გაყიდული': 'sold', 'ჯავშნის რიგი': 'queue', NFS: 'nfs',
  free: 'available', reserved: 'reserved', sold: 'sold', queue: 'queue', nfs: 'nfs',
};
// Bitrix property names (as shown in the catalog) → row field.
export const PROPS = { status: 'სტატუსი', floor: 'სართული', number: 'ბინის ნომერი', block: 'ბლოკი' };

export const aptId = (block, floor, number) => `${BLOCK_PREFIX[block]}-${String(floor).padStart(2, '0')}-${String(number).padStart(3, '0')}`;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(new Date());

/** Apply catalog rows to the data document. Returns { doc, changes, errors } and never mutates the input. */
export function applyInventory(input, rows, { date, maxChange = 0.25 } = {}) {
  const doc = structuredClone(input);
  const errors = [];
  const site = new Map(doc.apartments.filter((a) => a.block in BLOCK_PREFIX).map((a) => [a.id, a]));
  const seen = new Set();
  const updates = [];
  for (const r of rows) {
    const block = BLOCKS[String(r.block).trim()];
    if (!block) { errors.push(`unknown block "${r.block}"`); continue; }
    const floor = Number(r.floor), number = Number(r.number);
    if (!Number.isInteger(floor) || !Number.isInteger(number)) { errors.push(`bad floor/number ${r.block} ${r.floor}/${r.number}`); continue; }
    const id = aptId(block, floor, number);
    if (!site.has(id)) { errors.push(`not on the site: ${id}`); continue; }
    if (seen.has(id)) { errors.push(`duplicate: ${id}`); continue; }
    seen.add(id);
    const status = STATUS[String(r.status).trim()];
    if (!status) { errors.push(`unknown status "${r.status}" for ${id}`); continue; }
    const raw = r.price === '' || r.price == null ? null : Number(r.price);
    if (status === 'available' && !(raw > 0)) { errors.push(`available without price: ${id}`); continue; }
    updates.push({ id, status, price: raw == null ? null : Math.round(raw), raw });
  }
  for (const id of site.keys()) if (!seen.has(id)) errors.push(`missing in Bitrix: ${id}`);
  if (errors.length) return { doc: input, changes: [], errors };

  const changes = [];
  let statusChanges = 0;
  for (const u of updates) {
    const a = doc.apartments.find((x) => x.id === u.id);
    const before = { status: a.status, price: a.price_usd ?? null };
    // Prices are published for available apartments only (sold, reserved, NFS and queue are omitted).
    let price = u.status === 'available' ? u.price : null;
    // Sub-dollar differences are rounding (e.g. 210432.50), not a price change.
    if (price != null && before.price != null && Math.abs(before.price - u.raw) <= 0.5) price = before.price;
    if (before.status === u.status && before.price === price) continue; // untouched, byte for byte
    a.status = u.status;
    if (price == null) { delete a.price_usd; delete a.price_per_m2_usd; }
    else { a.price_usd = price; a.price_per_m2_usd = Math.round((price / a.area_m2) * 100) / 100; }
    if (before.status !== a.status) statusChanges++;
    if (before.status !== a.status || before.price !== price) changes.push({ id: u.id, from: before, to: { status: a.status, price } });
  }
  if (statusChanges > site.size * maxChange) {
    return { doc: input, changes, errors: [`${statusChanges} of ${site.size} statuses changed at once (limit ${Math.round(maxChange * 100)}%); refusing. Re-run with --max-change if this is expected.`] };
  }
  if (changes.length) {
    const d = date || today();
    for (const b of doc.blocks) if (b.id in BLOCK_PREFIX) b.snapshot = d;
    if (doc.meta.site_snapshot) doc.meta.site_snapshot.date = d;
    if (doc.meta.bitrix_snapshot) doc.meta.bitrix_snapshot.date = d;
  }
  return { doc, changes, errors: [] };
}

// ---------- Bitrix REST (read-only) ----------
const propValue = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return propValue(v[0]);
  if (typeof v === 'object') return v.value ?? v.VALUE ?? '';
  return v;
};

async function call(base, method, params, fetchImpl) {
  const url = base.replace(/\/?$/, '/') + method + '.json';
  const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {}) });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error} ${json.error_description || ''}`.trim());
  return json;
}

/** Read the HISNI catalog section and return rows for applyInventory(). Only list/get methods are called. */
export async function fetchBitrixRows(webhook, { fetchImpl = fetch, sectionId = SECTION_ID } = {}) {
  if (!/^https:\/\/crm\.biograpi\.ge\/rest\//.test(webhook || '')) throw new Error('BITRIX_WEBHOOK_URL must be a https://crm.biograpi.ge/rest/... inbound webhook');
  const props = (await call(webhook, 'crm.product.property.list', { order: { SORT: 'ASC' } }, fetchImpl)).result;
  const byName = {};
  for (const [field, name] of Object.entries(PROPS)) {
    const p = props.find((x) => String(x.NAME).trim() === name);
    if (!p) throw new Error(`Bitrix property "${name}" not found`);
    let values = p.VALUES;
    if (p.PROPERTY_TYPE === 'L' && !values) values = (await call(webhook, 'crm.product.property.get', { id: p.ID }, fetchImpl)).result.VALUES;
    byName[field] = { key: `PROPERTY_${p.ID}`, values };
  }
  const select = ['ID', 'PRICE', 'SECTION_ID', ...Object.values(byName).map((p) => p.key)];
  const rows = [];
  let start = 0;
  for (let guard = 0; guard < 200; guard++) {
    const page = await call(webhook, 'crm.product.list', { order: { ID: 'ASC' }, filter: { SECTION_ID: sectionId }, select, start }, fetchImpl);
    for (const item of page.result) {
      const row = { bitrix_id: item.ID, price: item.PRICE };
      for (const [field, p] of Object.entries(byName)) {
        let v = propValue(item[p.key]);
        if (p.values && v !== '' && p.values[v]) v = p.values[v].VALUE ?? p.values[v];
        row[field] = v;
      }
      rows.push(row);
    }
    if (page.next == null) return rows;
    start = page.next;
  }
  throw new Error('crm.product.list: too many pages');
}

// ---------- CLI ----------
async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const dry = argv.includes('--dry-run');
  let rows;
  if (argv.includes('--from-bitrix')) {
    const hook = process.env.BITRIX_WEBHOOK_URL;
    if (!hook) { console.log('BITRIX_WEBHOOK_URL is not set; nothing to do.'); return 0; }
    rows = await fetchBitrixRows(hook);
  } else if (arg('--from-file')) {
    rows = JSON.parse(await readFile(arg('--from-file'), 'utf8'));
  } else {
    console.error('Use --from-bitrix or --from-file <rows.json>'); return 2;
  }
  const doc = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  const { doc: next, changes, errors } = applyInventory(doc, rows, { date: arg('--date'), maxChange: arg('--max-change') ? Number(arg('--max-change')) : undefined });
  if (errors.length) { console.error(`Not updated (${errors.length} problems):\n- ` + errors.slice(0, 30).join('\n- ')); return 1; }
  const count = (d, s) => d.apartments.filter((a) => a.status === s).length;
  console.log(`Rows: ${rows.length}. Changes: ${changes.length}. Available: ${count(doc, 'available')} → ${count(next, 'available')}.`);
  for (const c of changes.slice(0, 60)) console.log(`  ${c.id}: ${c.from.status}${c.from.price ? ' $' + c.from.price : ''} → ${c.to.status}${c.to.price ? ' $' + c.to.price : ''}`);
  if (changes.length > 60) console.log(`  … and ${changes.length - 60} more`);
  if (!changes.length || dry) return 0;
  await writeFile(DATA_FILE, JSON.stringify(next, null, 0));
  console.log('Updated public/data/apartments.json');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
}
