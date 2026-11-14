/*
 * Inventory data layer.
 *
 * Static apartment geometry/plan data lives in /data/apartments.json (generated from the
 * project's floor-plan PDFs) plus snapshots: Blocks I/II from biograpi.ge, Block III from a read-only
 * Bitrix24 catalog export (14.11.2026; list prices, NFS prices withheld, no CRM deal ids shipped).
 *
 * Later, live status/price will come READ-ONLY from Bitrix24 CRM (crm.biograpi.ge).
 * Do NOT call Bitrix from the browser and never ship a webhook/token to the client.
 * Recommended: a small server route on biograpi.ge (e.g. Nuxt server/api/hisni/inventory.get.ts)
 * that reads Bitrix with a server-side secret, caches 30–60 s and returns:
 *   [{ "id": "B3-12-05", "status": "available" | "reserved" | "queue" | "sold" | "nfs", "price_usd": 123000 }]
 * Then set INVENTORY.mode = 'api' and INVENTORY.url to that route (or pass ?inventory=<url>).
 */
export const INVENTORY = {
  mode: 'static',                    // 'static' (sample data) | 'api' (live, read-only)
  url: '/api/hisni/inventory',       // placeholder — nothing is deployed here yet
  refreshMs: 60000,
};

// Placeholder mapping from Bitrix24 fields → demo schema. Field names MUST be confirmed
// against the real Bitrix setup (smart-process / catalog / deal fields).
const BITRIX_STATUS = { AVAILABLE: 'available', FREE: 'available', 'თავისუფალი': 'available', RESERVED: 'reserved', 'დაჯავშნილი': 'reserved', SOLD: 'sold', 'გაყიდული': 'sold', NFS: 'nfs', QUEUE: 'queue' };
export function mapBitrixItem(item) {
  return {
    id: item.UF_APARTMENT_CODE ?? item.id,                       // e.g. "B3-12-05" (to confirm)
    status: BITRIX_STATUS[String(item.UF_STATUS ?? item.status ?? '').toUpperCase()] ?? 'unknown',
    price_usd: item.UF_PRICE_USD != null ? Number(item.UF_PRICE_USD) : (item.price_usd ?? null),
  };
}

export async function loadApartments(base = import.meta.env.BASE_URL) {
  const res = await fetch(`${base}data/apartments.json`);
  const doc = await res.json();
  const types = new Map(doc.types.map((t) => [t.key, t]));
  doc.apartments.forEach((a) => { a.type = types.get(a.type_key); a.area = a.area_m2 ?? a.type.area_m2; a.facing = 'orientation' in a ? a.orientation : a.type.orientation; a.slotR = a.slot ?? a.type.slot; });
  const override = new URLSearchParams(location.search).get('inventory');
  if (INVENTORY.mode === 'api' || override) {
    try { await applyLive(doc, override || INVENTORY.url); } catch (e) { console.warn('[hisni] live inventory unavailable, using sample data', e); }
  }
  return doc;
}

export async function applyLive(doc, url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
  if (!res.ok) throw new Error(`inventory ${res.status}`);
  const rows = (await res.json()).map(mapBitrixItem);
  const byId = new Map(doc.apartments.map((a) => [a.id, a]));
  for (const r of rows) {
    const a = byId.get(r.id); if (!a) continue;
    a.status = r.status; a.price_usd = r.price_usd; a.sample = false; a.source = 'live';
  }
  doc.meta.live = true;
}

// CTA stub. Intentionally does NOT send anything anywhere.
export async function submitLead(payload) {
  console.info('[hisni] lead form submit (stub, not sent):', payload);
  return { ok: false, stub: true };
}
