// Data refresh: node --test tests/data
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyInventory, fetchBitrixRows, aptId } from '../../scripts/refresh-inventory.mjs';

const doc = JSON.parse(readFileSync(new URL('../../public/data/apartments.json', import.meta.url), 'utf8'));
const LABEL = { available: 'თავისუფალი', reserved: 'დაჯავშნილი', sold: 'გაყიდული', queue: 'ჯავშნის რიგი', nfs: 'NFS' };
const BLOCK = { I: 'HISNI1', II: 'HISNI2', III: 'HISNI3' };
// Rows that describe the file exactly as it is now.
const asIs = () => doc.apartments.filter((a) => a.block in BLOCK).map((a) => ({ block: BLOCK[a.block], floor: a.floor, number: a.number, status: LABEL[a.status], price: a.price_usd ?? 150000 }));

test('ids follow the site convention', () => {
  assert.equal(aptId('III', 6, 2), 'B3-06-002');
});

test('unchanged catalog: no changes, file bytes identical', () => {
  const { doc: next, changes, errors } = applyInventory(doc, asIs(), { date: '2030-01-01' });
  assert.deepEqual(errors, []);
  assert.equal(changes.length, 0);
  assert.equal(JSON.stringify(next), JSON.stringify(doc));
});

test('status and price change; price only kept for available', () => {
  const rows = asIs();
  const sold = rows.find((r) => r.status === LABEL.available);
  sold.status = LABEL.sold;
  const freed = rows.find((r) => r.status === LABEL.sold);
  freed.status = LABEL.available; freed.price = 123456.4;
  const { doc: next, changes, errors } = applyInventory(doc, rows, { date: '2030-01-01' });
  assert.deepEqual(errors, []);
  assert.equal(changes.length, 2);
  const a = next.apartments.find((x) => x.id === aptId('I', freed.floor, freed.number) || x.id === aptId('II', freed.floor, freed.number) || x.id === aptId('III', freed.floor, freed.number));
  assert.equal(a.status, 'available');
  assert.equal(a.price_usd, 123456);
  assert.equal(a.price_per_m2_usd, Math.round((123456 / a.area_m2) * 100) / 100);
  const s = next.apartments.find((x) => x.status === 'sold' && x.price_usd != null);
  assert.equal(s, undefined, 'sold apartments carry no price');
  assert.equal(next.meta.site_snapshot.date, '2030-01-01');
  assert.equal(next.blocks.find((b) => b.id === 'III').snapshot, '2030-01-01');
  assert.equal(next.blocks.find((b) => b.id === 'IV').snapshot, doc.blocks.find((b) => b.id === 'IV').snapshot);
  // Geometry untouched
  assert.deepEqual(next.apartments.map((x) => [x.id, x.area_m2, x.slot, x.type_key]), doc.apartments.map((x) => [x.id, x.area_m2, x.slot, x.type_key]));
});

test('refuses: missing apartment', () => {
  const r = applyInventory(doc, asIs().slice(1));
  assert.match(r.errors.join(), /missing in Bitrix/);
  assert.equal(r.doc, doc);
});

test('refuses: unknown status, duplicate, unknown block, available without price', () => {
  const rows = asIs();
  rows[0].status = 'რაღაც';
  rows.push({ ...rows[1] });
  rows.push({ block: 'HISNI9', floor: 6, number: 1, status: 'NFS' });
  const av = rows.find((r) => r.status === LABEL.available); av.price = '';
  const r = applyInventory(doc, rows);
  const e = r.errors.join('\n');
  assert.match(e, /unknown status/); assert.match(e, /duplicate/); assert.match(e, /unknown block/); assert.match(e, /available without price/);
});

test('refuses a mass status change above the limit', () => {
  const rows = asIs().map((r) => ({ ...r, status: LABEL.sold }));
  const r = applyInventory(doc, rows);
  assert.match(r.errors.join(), /refusing/);
  assert.equal(r.doc, doc);
});

test('Bitrix REST: maps list properties, follows pages, read-only methods only', async () => {
  const calls = [];
  const props = [
    { ID: 76, NAME: 'სტატუსი', PROPERTY_TYPE: 'L' },
    { ID: 79, NAME: 'სართული', PROPERTY_TYPE: 'N' },
    { ID: 82, NAME: 'ბინის ნომერი', PROPERTY_TYPE: 'S' },
    { ID: 98, NAME: 'ბლოკი', PROPERTY_TYPE: 'L', VALUES: { 501: { ID: 501, VALUE: 'HISNI3' } } },
  ];
  const pages = [
    { result: [{ ID: 1, PRICE: '130620.00', PROPERTY_76: { valueId: 9, value: '301' }, PROPERTY_79: { value: '6' }, PROPERTY_82: { value: '2' }, PROPERTY_98: { value: '501' } }], next: 50 },
    { result: [{ ID: 2, PRICE: '0', PROPERTY_76: { value: '302' }, PROPERTY_79: { value: '6' }, PROPERTY_82: { value: '1' }, PROPERTY_98: { value: '501' } }] },
  ];
  const fetchImpl = async (url, init) => {
    const method = url.split('/').pop().replace('.json', '');
    calls.push(method);
    const body = JSON.parse(init.body);
    let result;
    if (method === 'crm.product.property.list') result = { result: props };
    else if (method === 'crm.product.property.get') result = { result: { VALUES: { 301: { VALUE: 'თავისუფალი' }, 302: { VALUE: 'გაყიდული' } } } };
    else if (method === 'crm.product.list') { assert.equal(body.filter.SECTION_ID, 68); result = pages[body.start ? 1 : 0]; }
    return { ok: true, json: async () => result };
  };
  const rows = await fetchBitrixRows('https://crm.biograpi.ge/rest/1/secret/', { fetchImpl });
  assert.deepEqual(rows.map(({ block, floor, number, status, price }) => ({ block, floor, number, status, price })), [
    { block: 'HISNI3', floor: '6', number: '2', status: 'თავისუფალი', price: '130620.00' },
    { block: 'HISNI3', floor: '6', number: '1', status: 'გაყიდული', price: '0' },
  ]);
  assert.ok(calls.every((m) => /\.(list|get)$/.test(m)), `only read calls: ${calls}`);
});

test('Bitrix REST: rejects a webhook outside crm.biograpi.ge', async () => {
  await assert.rejects(fetchBitrixRows('https://example.com/rest/1/x/'), /crm\.biograpi\.ge/);
});

test('half-dollar rounding is not a price change', () => {
  const rows = asIs();
  const av = rows.find((r) => r.status === LABEL.available);
  av.price = av.price + 0.5;
  const { changes, errors } = applyInventory(doc, rows);
  assert.deepEqual(errors, []);
  assert.equal(changes.length, 0);
});
