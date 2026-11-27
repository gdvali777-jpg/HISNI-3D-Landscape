/*
 * Inventory data layer.
 *
 * Static apartment geometry/plan data lives in /data/apartments.json (generated from the
 * project's floor-plan PDFs). Status and price for Blocks I, II and III are refreshed hourly from the
 * Bitrix catalog by scripts/refresh-inventory.mjs (GitHub Action; available list prices only; sold,
 * reserved, NFS and queue prices omitted; no CRM deal ids shipped). Block IV has not been uploaded.
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

// Public sales line. The number is the one published as a tel: link on biograpi.ge.
// On desktop (mouse + hover) the call buttons open a WhatsApp chat instead of a tel: link.
export const CONTACT = {
  phone: '0322 500 505',
  tel: 'tel:+995322500505',
  whatsappPhone: '577 35 35 81',
  whatsapp: 'https://wa.me/995577353581',
};

// Lead delivery. Empty on purpose: the form never posts anywhere until a URL is set.
// Do not put a webhook, token, or Bitrix endpoint here.
export const LEAD = {
  url: '',
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
  // no-cache: revalidate with the server each load (a cheap 304 when unchanged), so Bitrix refreshes show at once.
  const res = await fetch(`${base}data/apartments.json`, { cache: "no-cache" });
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
    a.status = r.status; a.sample = false; a.source = 'live';
    if (r.status === 'available' || r.status === 'queue') a.price_usd = r.price_usd;
    else { delete a.price_usd; delete a.price_per_m2_usd; }
  }
  doc.meta.live = true;
}

// Lead stub. Never sends a deal id, and does not call any endpoint while LEAD.url is empty.
// Sold, reserved, not-for-sale and queue prices are not shown and are omitted from the client file.
export async function submitLead(payload) {
  const body = {
    apartment_id: payload.apartment_id || '',
    name: payload.name || '',
    phone: payload.phone || '',
  };
  if (!LEAD.url) {
    console.info('[hisni] lead form not sent (LEAD.url empty)', { apartment_id: body.apartment_id });
    return { ok: false, stub: true, reason: 'unconfigured' };
  }
  try {
    const res = await fetch(LEAD.url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    });
    if (!res.ok) return { ok: false, stub: false, reason: 'http' };
    return { ok: true, stub: false };
  } catch {
    return { ok: false, stub: false, reason: 'network' };
  }
}
