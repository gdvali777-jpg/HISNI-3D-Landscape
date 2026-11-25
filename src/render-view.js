// Frame-sequence spinner. Frames and polygons come from public/data/render-frames.json.
// Floor bands are clipped out of each block silhouette so a later mask pass can replace them.

const BASE = import.meta.env.BASE_URL;
const GREEN = '#8A9B48';
const CLAY = '#E78E75';

function pts(poly) { return poly.map((p) => p.join(',')).join(' '); }

function clipHalf(poly, keep, cut) {
  if (!poly.length) return [];
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = keep(a);
    const bin = keep(b);
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(cut(a, b));
    else if (!ain && bin) { out.push(cut(a, b)); out.push(b); }
  }
  return out;
}

function bandPoly(poly, y0, y1) {
  const at = (y) => (a, b) => {
    const dy = b[1] - a[1] || 1e-6;
    const t = (y - a[1]) / dy;
    return [a[0] + (b[0] - a[0]) * t, y];
  };
  let p = clipHalf(poly, (q) => q[1] >= y0 - 0.01, at(y0));
  p = clipHalf(p, (q) => q[1] <= y1 + 0.01, at(y1));
  return p.length >= 3 ? p : null;
}

function floorEdges(poly, floorMin, floorMax, k = 0.32) {
  const ys = poly.map((p) => p[1]);
  const yT = Math.min(...ys);
  const yB = Math.max(...ys);
  const n = floorMax - floorMin + 1;
  // k > 0: seen from the ground, upper floors look thinner. k < 0: aerial shot, upper floors look taller.
  const yAt = (i) => {
    const u = i / n;
    const s = Math.abs(k) < 1e-3 ? u : (Math.exp(k * u) - 1) / (Math.exp(k) - 1);
    return yT + (yB - yT) * s;
  };
  const bands = [];
  for (let f = floorMax; f >= floorMin; f--) {
    const i = floorMax - f;
    const slice = bandPoly(poly, yAt(i), yAt(i + 1));
    if (slice) bands.push({ floor: f, poly: slice });
  }
  return bands;
}

function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

export async function createRenderView(opts) {
  const root = document.querySelector('#render-view');
  const stage = document.querySelector('#render-stage');
  const img = document.querySelector('#render-img');
  const blur = document.querySelector('#render-blur');
  const svg = document.querySelector('#render-svg');
  const tip = document.querySelector('#render-tip');
  if (!root || !stage || !img || !svg) return null;

  const cfg = await (await fetch(`${BASE}data/render-frames.json`)).json();
  const allFrames = cfg.frames;
  let mode = 'day';
  // Same breakpoint as the landing still: phones in portrait, and short landscape phones wider than 819px.
  const narrowScreen = () => matchMedia('(max-width: 819px), (max-height: 520px) and (max-width: 1024px)').matches;
  // Every screen drops the courtyard (ეზო / view-04) and the old phone-only still.
  const pickFrames = () => {
    const list = allFrames.filter((f) => {
      if ((f.mode || 'day') !== mode) return false;
      if (f.only === 'narrow') return false;
      if (f.id === 'view-04') return false;
      return true;
    });
    return list.length ? list : allFrames.filter((f) => (f.mode || 'day') === mode && f.id !== 'view-04' && f.only !== 'narrow');
  };
  let frames = pickFrames();
  const QUICK_KEY = 'hisni-quick-filter';
  let quickOpen = true;
  try { quickOpen = sessionStorage.getItem(QUICK_KEY) !== 'closed'; } catch { quickOpen = true; }
  const fade = document.querySelector('#render-fade');
  let index = 0;
  let selected = null;
  let zoom = null;
  let viewZoom = 1;
  let panX = 0;
  let panY = 0;
  let animLayout = false;
  let readySrc = '';
  const cache = new Map();

  function hiRes(frame) {
    return `${BASE}${frame.src}`;
  }
  function preload(url) {
    if (cache.has(url)) return cache.get(url);
    const p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(url);
      im.onerror = () => resolve(url);
      im.src = url;
    });
    cache.set(url, p);
    return p;
  }
  function warm(i) {
    const f = frames[(i + frames.length) % frames.length];
    preload(`${BASE}${f.thumb}`);
    preload(hiRes(f));
    const n = frames[(i + 1) % frames.length];
    preload(`${BASE}${n.thumb}`);
    preload(hiRes(n));
  }

  const fileOf = (s) => (s || '').split('?')[0].split('/').pop();
  function setImage(src) {
    // The boot image and the module URL are the same file with different prefixes.
    // Crossfading that pair painted a second copy late and became the LCP element.
    if (fileOf(img.getAttribute('src')) === fileOf(src)) return;
    const prev = img.getAttribute('src');
    if (fade && prev) {
      fade.src = prev;
      fade.style.transition = 'none';
      fade.style.opacity = '1';
      void fade.offsetWidth;
      fade.style.transition = '';
      fade.style.opacity = '0';
    }
    img.src = src;
    if (blur) blur.src = src;
  }
  function towerFocus(frame) {
    const polys = Object.values(frame.blocks || {}).filter((p) => p && p.length);
    if (!polys.length) return frame.focal || [0.5, 0.45];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polys) for (const [x, y] of poly) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [(x0 + x1) / 2 / frame.w, (y0 + y1) / 2 / frame.h];
  }
  function frameBase(frame, box) {
    const contain = Math.min(box.width / frame.w, box.height / frame.h);
    if (!narrowScreen()) return contain;
    const cover = Math.max(box.width / frame.w, box.height / frame.h);
    const polys = Object.values(frame.blocks || {}).filter((p) => p && p.length);
    let span = frame.w;
    if (polys.length) {
      let x0 = Infinity, x1 = -Infinity;
      for (const poly of polys) for (const [x] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      span = Math.max(1, (x1 - x0) * 1.04);
    }
    // Full-height cover would hide the outer towers. Stop at the scale that still shows all four, and never smaller than the screen width.
    return Math.min(cover, Math.max(box.width / span, box.width / frame.w));
  }
  function layout() {
    const frame = frames[index];
    const box = root.getBoundingClientRect();
    if (!box.width || !box.height) return;
    stage.classList.toggle('is-anim', animLayout);
    const phone = narrowScreen();
    const base = frameBase(frame, box);
    const fit = base * viewZoom * (zoom?.scale || 1);
    const w = frame.w * fit;
    const h = frame.h * fit;
    const aim = zoom ? [zoom.x / frame.w, zoom.y / frame.h] : (phone ? towerFocus(frame) : (frame.focal || [0.5, 0.42]));
    const [fx, fy] = aim;
    const anchorY = phone ? 0.5 : (zoom ? 0.46 : 0.42);
    let left = box.width * 0.5 - fx * w + panX;
    let top = box.height * anchorY - fy * h + panY;
    if (w >= box.width) left = Math.min(0, Math.max(box.width - w, left));
    else left = (box.width - w) / 2;
    if (h >= box.height) top = Math.min(0, Math.max(box.height - h, top));
    else top = (box.height - h) / 2;
    if (phone) {
      panX = left - (box.width * 0.5 - fx * w);
      panY = top - (box.height * anchorY - fy * h);
    }
    stage.classList.add('fitted');
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.transform = `translate(${left}px, ${top}px)`;
  }
  function setZoom(next) {
    viewZoom = Math.min(3, Math.max(1, next));
    if (viewZoom <= 1.001) { viewZoom = 1; panX = 0; panY = 0; }
    layout();
  }

  function bandFill(block, floor) {
    const rows = opts.apartments().filter((a) => a.block === block && a.floor === floor);
    const pool = opts.filtersActive() ? rows.filter((a) => opts.matches(a)) : rows;
    if (!pool.length) return 'rgba(28,19,34,0.18)';
    if (pool.some((a) => a.status === 'available')) return 'rgba(138,155,72,0.55)';
    if (pool.some((a) => a.status === 'reserved')) return 'rgba(226,165,75,0.5)';
    if (pool.some((a) => a.status === 'queue')) return 'rgba(79,111,168,0.5)';
    if (pool.some((a) => a.status === 'sold')) return 'rgba(181,82,74,0.38)';
    return 'rgba(154,154,154,0.4)';
  }

  function chipText(id, compact) {
    const b = opts.block(id);
    if (!b?.has_data) return compact ? id : `${id} ${opts.t('soon')}`;
    const n = opts.freeCount(id);
    return compact ? `${id} ${n}` : `${id} ${n} ${opts.t('avail')}`;
  }

  function paintModes() {
    const day = document.querySelector('#day-mode');
    const night = document.querySelector('#night-mode');
    if (day) { day.textContent = opts.t('day'); day.setAttribute('aria-pressed', String(mode === 'day')); day.setAttribute('aria-label', opts.t('day')); }
    if (night) { night.textContent = opts.t('night'); night.setAttribute('aria-pressed', String(mode === 'night')); night.setAttribute('aria-label', opts.t('night')); }
  }
  function paintChrome() {
    const dots = document.querySelector('#render-dots');
    const label = document.querySelector('#render-frame-label');
    const ph = document.querySelector('#render-ph');
    const frame = frames[index];
    paintModes();
    const spin = document.querySelector('.render-spin');
    const single = frames.length < 2;
    spin?.classList.toggle('is-single', single);
    spin?.querySelectorAll('[data-spin]').forEach((b) => { b.hidden = single; });
    if (dots) {
      dots.hidden = single;
      if (!single) dots.innerHTML = frames.map((f, i) => `<button type="button" data-frame="${i}" class="${i === index ? 'is-on' : ''} ${f.stop ? 'is-stop' : ''}" aria-label="${f.label?.[opts.lang()] || f.id}" aria-current="${i === index ? 'true' : 'false'}"></button>`).join('');
    }
    if (label) label.textContent = frame.label?.[opts.lang()] || '';
    if (ph) { ph.hidden = !frame.placeholder; ph.textContent = opts.t('placeholderFrame'); }
    paintQuick();
    const form = document.querySelector('#render-filters');
    if (form && document.activeElement && form.contains(document.activeElement)) { paintCount(); return; }
    paintFilterForm();
  }

  // Result count for the quick filter, the same numbers the full filter sheet shows.
  function paintCount() {
    const form = document.querySelector('#render-filters');
    if (!form) return;
    const c = opts.counts();
    const n = form.querySelector('[data-rf-n]');
    const list = form.querySelector('[data-rf-list]');
    if (n) n.textContent = String(c.total);
    if (list) { list.textContent = `${opts.t('showList')} (${c.view})`; list.disabled = !c.total; }
  }
  function paintQuick() {
    const form = document.querySelector('#render-filters');
    const open = document.querySelector('#render-filters-open');
    if (form) form.hidden = !quickOpen;
    if (open) { open.hidden = quickOpen; open.textContent = opts.t('quickFilter'); }
  }
  function setQuick(on) {
    quickOpen = !!on;
    try { sessionStorage.setItem(QUICK_KEY, quickOpen ? 'open' : 'closed'); } catch { /* private mode */ }
    paintQuick();
    if (quickOpen) { paintFilterForm(); document.querySelector('#render-filters input')?.focus({ preventScroll: true }); }
    else document.querySelector('#render-filters-open')?.focus({ preventScroll: true });
  }

  function paintFilterForm() {
    const form = document.querySelector('#render-filters');
    if (!form) return;
    const f = opts.filters();
    const kinds = ['studio', '1br', '2br'];
    const sts = ['available', 'reserved', 'queue', 'sold', 'nfs'];
    form.innerHTML = `
      <div class="rf-head"><strong>${opts.t('quickFilter')}</strong><button type="button" class="x" data-rf-close aria-label="${opts.t('close')}" title="${opts.t('close')}">×</button></div>
      <fieldset><legend>${opts.t('rooms')}</legend><div class="seg">${kinds.map((k) => `<label><input type="checkbox" name="kind" value="${k}" ${f.kinds.has(k) ? 'checked' : ''}/><span>${opts.t(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${opts.t('status')}</legend><div class="seg">${sts.map((k) => `<label><input type="checkbox" name="status" value="${k}" ${f.statuses.has(k) ? 'checked' : ''}/><span>${opts.statusLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${opts.t('floorRange')}</legend><div class="range"><input name="floorMin" inputmode="numeric" placeholder="6" value="${f.floorMin}" aria-label="${opts.t('floorRange')} min"/><input name="floorMax" inputmode="numeric" placeholder="36" value="${f.floorMax}" aria-label="${opts.t('floorRange')} max"/></div></fieldset>
      <fieldset><legend>${opts.t('areaRange')}</legend><div class="range"><input name="areaMin" inputmode="decimal" placeholder="${opts.t('min')}" value="${f.areaMin}" aria-label="${opts.t('areaRange')} min"/><input name="areaMax" inputmode="decimal" placeholder="${opts.t('max')}" value="${f.areaMax}" aria-label="${opts.t('areaRange')} max"/></div></fieldset>
      <p class="rf-count" role="status"><b data-rf-n></b> ${opts.t('results')}</p>
      <button type="button" class="primary" data-rf-list></button>
      <button type="button" class="btn-ghost" data-reset>${opts.t('reset')}</button>
      <a class="call-btn" ${opts.callAttrs()} data-call="render">${opts.t('call')}</a>`;
    paintCount();
  }

  function draw() {
    const frame = frames[index];
    svg.setAttribute('viewBox', `0 0 ${frame.w} ${frame.h}`);
    const parts = [];
    const order = Object.keys(frame.blocks || {});
    for (const id of order) {
      const poly = frame.blocks[id];
      if (!poly) continue;
      const active = selected === id;
      if (active && opts.block(id)?.has_data) {
        for (const band of floorEdges(poly, cfg.floorMin, cfg.floorMax, frame.floorK ?? 0.32)) {
          parts.push(`<polygon class="floor-band" data-block="${id}" data-floor="${band.floor}" points="${pts(band.poly)}" fill="${bandFill(id, band.floor)}" tabindex="0" role="button" aria-label="${opts.towerName(id)} ${opts.t('floor')} ${band.floor}"/>`);
        }
      } else {
        parts.push(`<polygon class="block-hit ${active ? 'is-on' : ''}" data-block="${id}" points="${pts(poly)}" tabindex="0" role="button" aria-label="${chipText(id)}"/>`);
      }
    }
    svg.innerHTML = parts.join('');
    paintChrome();
    layout();
  }

  async function showFrame(i, { immediate = false } = {}) {
    index = (i + frames.length) % frames.length;
    const frame = frames[index];
    const thumb = `${BASE}${frame.thumb}`;
    const full = hiRes(frame);
    const showing = img.currentSrc || img.src || '';
    const already = showing.includes(frame.src) || (frame.small && showing.includes(frame.small));
    if (!already && readySrc !== full) setImage(thumb);
    draw();
    warm(index);
    await preload(full);
    if (frames[index] !== frame) return;
    setImage(full);
    readySrc = full;
    img.alt = frame.label?.[opts.lang()] || 'Hisni';
  }

  function selectBlock(id, { toggle = true, notify = false, soon = true } = {}) {
    if (id && !frames[index]?.blocks?.[id]) return;
    if (!id) selected = null;
    else if (toggle && selected === id) selected = null;
    else selected = id;
    if (selected) zoom = zoomFor(frames[index].blocks[selected]);
    else zoom = null;
    animLayout = true;
    draw();
    animLayout = false;
    if (notify) opts.onBlock?.(selected);
    // Filter and header picks apply the block even when it has no inventory. The polygon tap still explains that.
    if (soon && selected && !opts.block(selected)?.has_data) opts.onSoon(selected);
  }

  // Zoom on a block so its whole facade stays inside the screen. A fixed 1.75 cropped tall towers on wide stills.
  function zoomFor(poly) {
    const frame = frames[index];
    const b = bbox(poly);
    const box = root.getBoundingClientRect();
    let scale = 1.75;
    if (box.width && box.height && b.w && b.h) {
      const base = frameBase(frame, box);
      scale = Math.max(1, Math.min(1.75, (box.height * 0.78) / (b.h * base), (box.width * 0.5) / (b.w * base)));
    }
    return { x: b.cx, y: b.cy, scale };
  }

  function hoverTip(el, ev) {
    if (!el) { tip.hidden = true; return; }
    const id = el.dataset.block;
    const floor = el.dataset.floor;
    tip.hidden = false;
    if (floor) {
      const n = opts.floorCount(id, +floor);
      tip.textContent = `${opts.t('floor')} ${floor} · ${opts.floorCountLabel(n)}`;
    } else tip.textContent = chipText(id);
    const box = root.getBoundingClientRect();
    const x = Math.min(box.width - 160, Math.max(8, (ev?.clientX || 0) - box.left + 12));
    const y = Math.min(box.height - 48, Math.max(8, (ev?.clientY || 0) - box.top + 12));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  svg.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-block]');
    hoverTip(el, e);
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const floor = e.target.closest?.('[data-floor]');
    if (floor) { opts.onFloor(floor.dataset.block, +floor.dataset.floor); return; }
    const block = e.target.closest?.('[data-block]');
    if (block) selectBlock(block.dataset.block, { toggle: true, notify: true });
  });
  svg.addEventListener('keydown', (e) => {
    const el = e.target.closest?.('[data-block]');
    if (!el || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (el.dataset.floor) opts.onFloor(el.dataset.block, +el.dataset.floor);
    else selectBlock(el.dataset.block, { toggle: true, notify: true });
  });

  const pointers = new Map();
  let dragX = 0; let dragY = 0; let dragAt = 0; let dragged = false; let pinchDist = 0; let suppressClick = false;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.render-panel, .render-spin, .render-places, .tools, a, input, button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // No pointer capture on press: Chromium sends the click to the capturing element,
    // so a captured press never reached the tower and floor polygons. Capture once a drag starts.
    dragX = e.clientX;
    dragY = e.clientY;
    dragAt = index;
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setZoom(viewZoom * (dist / (pinchDist || dist)));
      pinchDist = dist;
      dragged = true;
      return;
    }
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    if (!dragged && Math.hypot(dx, dy) > 12) { dragged = true; try { stage.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ } }
    if (!dragged) return;
    // A sideways drag on a phone moves the covered picture. A tap still reaches the tower polygons.
    if (viewZoom > 1 || narrowScreen()) {
      panX += e.clientX - prev.x;
      if (viewZoom > 1) panY += e.clientY - prev.y;
      layout();
      return;
    }
    if (frames.length < 2) return;
    const step = Math.round(-dx / 90);
    const next = dragAt + step;
    if (next !== index) showFrame(next, { immediate: true });
  });
  function endDrag(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    pinchDist = 0;
    if (dragged) suppressClick = true;
    dragged = false;
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  // An uncaptured press can be released outside the stage; forget it there too.
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  root.addEventListener('click', (e) => {
    const prev = e.target.closest('[data-spin="-1"]');
    const next = e.target.closest('[data-spin="1"]');
    if (prev || next) { if (frames.length > 1) showFrame(index + (prev ? -1 : 1)); return; }
    const dot = e.target.closest('[data-frame]');
    if (dot) { selected = null; zoom = null; opts.onBlock?.(null); showFrame(+dot.dataset.frame); return; }
    if (e.target.closest('[data-reset]')) { opts.resetFilters(); paintFilterForm(); draw(); return; }
    if (e.target.closest('[data-rf-close]')) { setQuick(false); return; }
    if (e.target.closest('#render-filters-open')) { setQuick(true); return; }
    if (e.target.closest('[data-rf-list]')) opts.showList();
  });
  root.addEventListener('input', (e) => {
    if (!e.target.closest('#render-filters')) return;
    const fd = new FormData(document.querySelector('#render-filters'));
    opts.readFilters(fd);
    draw();
  });

  document.querySelector('#day-night')?.addEventListener('click', (e) => {
    const day = e.target.closest('#day-mode');
    const night = e.target.closest('#night-mode');
    if (!day && !night) return;
    const next = day ? 'day' : 'night';
    if (next === mode) return;
    mode = next;
    frames = pickFrames();
    index = 0;
    selected = null;
    zoom = null;
    viewZoom = 1;
    panX = 0;
    panY = 0;
    opts.onBlock?.(null);
    const nightFrame = allFrames.find((f) => f.mode === 'night');
    if (nightFrame) preload(`${BASE}${nightFrame.thumb}`);
    showFrame(0, { immediate: true });
  });
  window.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.target.matches('input, textarea')) return;
    if (e.target.closest('#block-menu, #places-panel, #block-picker')) return;
    if (frames.length > 1 && e.key === 'ArrowLeft') { e.preventDefault(); showFrame(index - 1); }
    if (frames.length > 1 && e.key === 'ArrowRight') { e.preventDefault(); showFrame(index + 1); }
    if (e.key === 'Escape' && selected) { selected = null; zoom = null; opts.onBlock?.(null); draw(); }
  });
  const applyScreenFrames = () => {
    if (root.hidden) return;
    const id = frames[index]?.id;
    const nextList = pickFrames();
    const same = nextList.length === frames.length && nextList.every((f, i) => f.id === frames[i]?.id);
    if (same) { layout(); return; }
    frames = nextList;
    const next = frames.findIndex((f) => f.id === id);
    showFrame(next >= 0 ? next : 0, { immediate: true });
  };
  new ResizeObserver(() => { if (!root.hidden) applyScreenFrames(); }).observe(root);
  matchMedia('(max-width: 819px), (max-height: 520px) and (max-width: 1024px)').addEventListener?.('change', applyScreenFrames);

  return {
    frames: frames.length,
    async show() {
      root.hidden = false;
      document.documentElement.classList.add('boot-render');
      await showFrame(index, { immediate: true });
      const dropBoot = () => { root.style.backgroundImage = 'none'; };
      if (img.decode) img.decode().then(() => requestAnimationFrame(dropBoot)).catch(dropBoot);
      else dropBoot();
      const nightFrame = allFrames.find((f) => f.mode === 'night');
      const preloadNight = () => { if (nightFrame) preload(`${BASE}${nightFrame.thumb}`); };
      if (window.requestIdleCallback) requestIdleCallback(preloadNight, { timeout: 1500 });
      else setTimeout(preloadNight, 600);
    },
    hide() {
      root.hidden = true;
      tip.hidden = true;
      // boot-render hides #labels (tower badges and place pills) for the first paint.
      // Leaving the render must drop it or those overlays stay display:none.
      document.documentElement.classList.remove('boot-render');
    },
    refresh() { if (!root.hidden) { paintFilterForm(); draw(); } },
    zoomBy(f) { setZoom(viewZoom * f); },
    block() { return selected; },
    setBlock(id) { selectBlock(id || null, { toggle: false, notify: false, soon: false }); },
    mode() { return mode; },
    home() {
      viewZoom = 1; panX = 0; panY = 0; selected = null; zoom = null;
      opts.onBlock?.(null);
      animLayout = true;
      showFrame(0, { immediate: true }).then(() => { animLayout = false; });
    },
  };
}
