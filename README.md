# Hisni by Biograpi — interactive 3D landscape

Static Vite + Three.js site: an interactive 3D view of the Hisni residential complex and its Isani neighbourhood in Tbilisi. Shareable demo for the Hisni by Biograpi project.

Published site: [https://hisni.biograpi.ge/](https://hisni.biograpi.ge/)

## What is in it

- Isani neighbourhood from an OpenStreetMap snapshot (`public/data/context.json`, ~80 KB gzip): 2,048 buildings, roads, green areas, rail, plus generated trees.
- The 4 towers are simplified massing. No 3D model was available (only .pla/.rvt), so the massing comes from the info card (36 floors, 127.3 m) and the master plan (positions, orientation and 61×31 m ellipses for Blocks II–IV; Block I as a 35×46 m rounded rectangle). Façade is terracotta fins with light fibre-cement slab edges. The podium is 4 floors and holds the terrace and the yard pitch/padel courts.
- Explorer: towers > floor (6–36) > apartment. It has a filter (type, status, area, floor, price), a text list of apartments, an apartment card (2D/3D plan, area, type, facing, status, price) and a stubbed lead form.
- Day, golden hour and night lighting. KA (default) and EN.
- Deep links: `?view=towers|block|floor&tower=III&floor=20`, `?apt=B3-20-05`, `?lang=en`, `?light=night`, `?quality=low|high`, `?webgl=0` (2D fallback).

## Run locally

```bash
npm ci
npm run dev
```

Vite uses `base: '/'`, because the site is served from the domain root. Open the URL the dev server prints: [http://localhost:5173/](http://localhost:5173/).

To check the production build:

```bash
npm run build
npm run preview
```

Preview serves `dist/` at [http://localhost:4173/](http://localhost:4173/).

## Deploy

Pushes to `main`, and manual runs from the Actions tab, run `npm ci` and `npm run build`, then upload `dist/` to GitHub Pages (`.github/workflows/pages.yml`, `actions/upload-pages-artifact` and `actions/deploy-pages`).

One-time setup on the repository:

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. Do not point Pages at a branch folder (`/docs` or `gh-pages`). The workflow is the source.

After a successful run the site is at [https://hisni.biograpi.ge/](https://hisni.biograpi.ge/). `public/CNAME` names that domain. GitHub Pages also keeps the project URL, which redirects to the custom domain once the domain is attached.

## Data

`public/data/apartments.json` (schema_version 2) is a static snapshot, not a live feed. It is built by three scripts, run in this order:

1. `scripts/prep_apartments.py`: the 19 Block III apartment types and 2D/3D plan images from `Floor and Apartment Plans 2D/*.pdf`.
2. `scripts/prep_site.py`: **Blocks I and II** geometry (527 + 589 apartments) from the earlier biograpi.ge page snapshot. Plan images for these blocks stay on `backend.biograpi.ge`.
3. `scripts/prep_bitrix.py`: the earlier **Block III** pass. It is not re-run for a refresh, because a later catalog re-coded every Block III `layout_type_code`.
4. The current status and price for **Blocks I, II and III** (1,705 apartments) come from the read-only **Bitrix catalog export 25.11.2026**.
   - Statuses: free → available, reserved, queue (reservation queue), sold, NFS → nfs.
   - A price is stored only for available apartments. Sold, reserved, NFS and queue prices are omitted.
   - Area, floor and rooms matched the apartments already in the file, so plans, positions, types and orientations were left as they were. Block I `rooms=N` is total rooms, not bedrooms.
   - CRM deal ids and catalog product ids are not shipped.
- **Block IV has not been uploaded yet.**
- The **position of an apartment on the floor plan is schematic** and needs confirming by the architects.

`src/data/adapter.js` is the read-only live data hook:

- Set `INVENTORY.mode = 'api'` and point `INVENTORY.url` at a server route that returns `[{id,status,price_usd}]`.
- Map the Bitrix24 fields in `mapBitrixItem()`. The field names there are placeholders.
- Never call Bitrix from the browser, and never ship a webhook to the client.

The CTA form calls `submitLead()`, which is a stub that sends nothing.

Call buttons use `CONTACT` in `src/data/adapter.js`: a `tel:` link on phones and tablets, a WhatsApp chat (`CONTACT.whatsapp`) on desktop.

## Fonts

Corporate fonts **Effra** (English) and **PingL** (Georgian) are subset to WOFF2 in `public/fonts/`. **These require a web-embedding license check before any public production use.** Until that license is confirmed, treat this GitHub Pages site as an internal preview, not a public production launch.

## Embedding in biograpi.ge (Nuxt)

Option A, an iframe. It is the simplest and is isolated from the site's JS and CSS:

```vue
<template>
  <div class="hisni-3d" ref="box">
    <iframe v-if="visible" src="https://hisni.biograpi.ge/?lang=ka" title="Hisni 3D" loading="lazy"
            allow="fullscreen" style="width:100%;height:min(88vh,820px);border:0;border-radius:16px"></iframe>
    <button v-else @click="visible = true">3D ხედის ჩართვა</button>
  </div>
</template>
<script setup>
const visible = ref(false); const box = ref(null);
onMounted(() => { const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { visible.value = true; io.disconnect(); } }, { rootMargin: '200px' }); io.observe(box.value); });
</script>
```

How this loads: the iframe is only created when the block scrolls near the viewport, so it costs nothing on page load. Pass `?lang=en` on the EN site.

Option B: mount it as a client-only component later (`<ClientOnly>`). This needs `main.js` refactored into a `mount(el, options)` function.

Live inventory: add `server/api/hisni/inventory.get.ts` in Nuxt. It reads Bitrix with a server-side secret, caches for 30–60 s and returns the JSON above. Then load the iframe with `?inventory=/api/hisni/inventory`.
