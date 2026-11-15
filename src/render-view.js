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

function floorEdges(poly, floorMin, floorMax) {
  const ys = poly.map((p) => p[1]);
  const yT = Math.min(...ys);
  const yB = Math.max(...ys);
  const n = floorMax - floorMin + 1;
  const k = 0.32;
  const yAt = (i) => {
    const u = i / n;
    const s = (Math.exp(k * u) - 1) / (Math.exp(k) - 1);
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

function centroid(poly) {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
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
  let frames = allFrames.filter((f) => (f.mode || 'day') === mode);
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
    const narrow = matchMedia('(max-width: 819px)').matches;
    return `${BASE}${narrow && frame.small ? frame.small : frame.src}`;
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
  function layout() {
    const frame = frames[index];
    const box = root.getBoundingClientRect();
    if (!box.width || !box.height) return;
    stage.classList.toggle('is-anim', animLayout);
    // Contain-fit at zoom 1 so every tower is inside the screen. +/− and a selected block scale up from there.
    const fit = Math.min(box.width / frame.w, box.height / frame.h) * viewZoom * (zoom?.scale || 1);
    const w = frame.w * fit;
    const h = frame.h * fit;
    const [fx, fy] = zoom ? [zoom.x / frame.w, zoom.y / frame.h] : (frame.focal || [0.5, 0.42]);
    let left = box.width * 0.5 - fx * w + panX;
    let top = box.height * (zoom ? 0.46 : 0.42) - fy * h + panY;
    if (w >= box.width) left = Math.min(0, Math.max(box.width - w, left));
    else left = (box.width - w) / 2;
    if (h >= box.height) top = Math.min(0, Math.max(box.height - h, top));
    else top = (box.height - h) / 2;
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
    if (dots) {
      dots.innerHTML = frames.map((f, i) => `<button type="button" data-frame="${i}" class="${i === index ? 'is-on' : ''} ${f.stop ? 'is-stop' : ''}" aria-label="${f.label?.[opts.lang()] || f.id}" aria-current="${i === index ? 'true' : 'false'}"></button>`).join('');
    }
    if (label) label.textContent = frame.label?.[opts.lang()] || '';
    if (ph) { ph.hidden = !frame.placeholder; ph.textContent = opts.t('placeholderFrame'); }
    const form = document.querySelector('#render-filters');
    if (form && document.activeElement && form.contains(document.activeElement)) return;
    paintFilterForm();
  }

  function paintFilterForm() {
    const form = document.querySelector('#render-filters');
    if (!form) return;
    const f = opts.filters();
    const kinds = ['studio', '1br', '2br'];
    const sts = ['available', 'reserved', 'queue', 'sold', 'nfs'];
    form.innerHTML = `
      <fieldset><legend>${opts.t('rooms')}</legend><div class="seg">${kinds.map((k) => `<label><input type="checkbox" name="kind" value="${k}" ${f.kinds.has(k) ? 'checked' : ''}/><span>${opts.t(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${opts.t('status')}</legend><div class="seg">${sts.map((k) => `<label><input type="checkbox" name="status" value="${k}" ${f.statuses.has(k) ? 'checked' : ''}/><span>${opts.statusLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${opts.t('floorRange')}</legend><div class="range"><input name="floorMin" inputmode="numeric" placeholder="6" value="${f.floorMin}" aria-label="${opts.t('floorRange')} min"/><input name="floorMax" inputmode="numeric" placeholder="36" value="${f.floorMax}" aria-label="${opts.t('floorRange')} max"/></div></fieldset>
      <fieldset><legend>${opts.t('areaRange')}</legend><div class="range"><input name="areaMin" inputmode="decimal" placeholder="${opts.t('min')}" value="${f.areaMin}" aria-label="${opts.t('areaRange')} min"/><input name="areaMax" inputmode="decimal" placeholder="${opts.t('max')}" value="${f.areaMax}" aria-label="${opts.t('areaRange')} max"/></div></fieldset>
      <button type="button" class="btn-ghost" data-reset>${opts.t('reset')}</button>
      <a class="call-btn" href="${opts.tel()}" data-call="render">${opts.t('call')}</a>`;
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
        for (const band of floorEdges(poly, cfg.floorMin, cfg.floorMax)) {
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

  function selectBlock(id, { toggle = true, notify = false } = {}) {
    if (id && !frames[index]?.blocks?.[id]) return;
    if (!id) selected = null;
    else if (toggle && selected === id) selected = null;
    else selected = id;
    if (selected) {
      const c = centroid(frames[index].blocks[selected]);
      zoom = { x: c[0], y: c[1], scale: 1.75 };
    } else zoom = null;
    animLayout = true;
    draw();
    animLayout = false;
    if (notify) opts.onBlock?.(selected);
    if (selected && !opts.block(selected)?.has_data) opts.onSoon(selected);
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
    if (e.target.closest('.render-panel, .render-spin, .tools, a, input, button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture?.(e.pointerId);
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
    if (Math.hypot(dx, dy) > 12) dragged = true;
    if (viewZoom > 1) {
      panX += e.clientX - prev.x;
      panY += e.clientY - prev.y;
      layout();
      return;
    }
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

  root.addEventListener('click', (e) => {
    const prev = e.target.closest('[data-spin="-1"]');
    const next = e.target.closest('[data-spin="1"]');
    if (prev || next) { showFrame(index + (prev ? -1 : 1)); return; }
    const dot = e.target.closest('[data-frame]');
    if (dot) { selected = null; zoom = null; opts.onBlock?.(null); showFrame(+dot.dataset.frame); return; }
    if (e.target.closest('[data-reset]')) { opts.resetFilters(); paintFilterForm(); draw(); }
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
    frames = allFrames.filter((f) => (f.mode || 'day') === mode);
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
    if (e.key === 'ArrowLeft') { e.preventDefault(); showFrame(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showFrame(index + 1); }
    if (e.key === 'Escape' && selected) { selected = null; zoom = null; opts.onBlock?.(null); draw(); }
  });
  new ResizeObserver(() => { if (!root.hidden) layout(); }).observe(root);

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
    setBlock(id) { selectBlock(id || null, { toggle: false, notify: false }); },
    mode() { return mode; },
    home() {
      viewZoom = 1; panX = 0; panY = 0; selected = null; zoom = null;
      opts.onBlock?.(null);
      animLayout = true;
      showFrame(0, { immediate: true }).then(() => { animLayout = false; });
    },
  };
}
