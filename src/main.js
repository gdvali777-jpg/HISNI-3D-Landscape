import './style.css';
import { t, getLang, setLang, STRINGS } from './i18n.js';
import { loadApartments, submitLead } from './data/adapter.js';

const BASE = import.meta.env.BASE_URL;
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const fmtNum = (n) => n.toLocaleString('en-US');
const m2 = () => (getLang() === 'en' ? 'm²' : 'მ²');
const typeCode = (ty) => ty.code;
const srcBadge = (a) => (a.sample ? `<span class="sample-badge">${t('sample')}</span>` : '');
const snapDate = () => { const d = state.doc?.meta.site_snapshot?.date; return d ? d.split('-').reverse().join('.') : ''; };
const orientLabel = (o) => (STRINGS[getLang()].dirs || {})[o] || o;
const fmtUsd = (n) => (n == null ? '—' : '$' + fmtNum(n));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Points of interest. Coordinates: local metres (x east, z south) from the OSM snapshot.
// Walking times for metro/school are the client's figures; others = straight-line × 1.3 at 80 m/min (approx.).
const POIS = [
  { id: 'metro', cat: 'metro', icon: 'M', x: 151, z: -82, ka: 'მეტროსადგური „ისანი“', en: 'Isani metro station', ska: 'მეტრო „ისანი“', sen: 'Isani metro', min: 2, src: 'client' },
  { id: 'school', cat: 'school', icon: '87', x: -120, z: -140, ka: 'ვაჟა-ფშაველას სახ. №87 საჯარო სკოლა', en: 'Public School No. 87 (Vazha-Pshavela)', ska: '№87 სკოლა', sen: 'School No. 87', min: 2, src: 'client' },
  { id: 'bus', cat: 'bus', icon: 'B', x: 154, z: -66, ka: 'ავტობუსის გაჩერება „მ/ს ისანი“', en: 'Bus stop “M/S Isani”', ska: 'ავტობუსი', sen: 'Bus stop', m: 167 },
  { id: 'evex', cat: 'health', icon: '+', x: -172, z: -13, ka: 'პოლიკლინიკა „ევექსი“', en: 'Evex Polyclinic', m: 173 },
  { id: 'aversi', cat: 'health', icon: '+', x: 164, z: 134, ka: 'ავერსის კლინიკა', en: 'Aversi Clinic', m: 212 },
  { id: 'bog', cat: 'bank', icon: '₾', x: 245, z: -76, ka: 'საქართველოს ბანკი', en: 'Bank of Georgia', m: 256 },
  { id: 'carrefour', cat: 'shop', icon: 'S', x: 249, z: 330, ka: 'კარფური მარკეტი', en: 'Carrefour Market', m: 413 },
  { id: 'kinder', cat: 'kinder', icon: 'K', x: 323, z: 618, ka: 'ბაგა-ბაღი №30', en: 'Kindergarten No. 30', m: 698 },
];
POIS.forEach((p) => { if (p.min == null) p.min = Math.max(1, Math.round((p.m * 1.3) / 80)); });

const state = { view: 'intro', tower: null, floor: null, apt: null, light: 'day', filters: null, scene: null, doc: null, planTab: '2d' };
const defaultFilters = () => ({ kinds: new Set(), statuses: new Set(), areaMin: '', areaMax: '', floorMin: '', floorMax: '', priceMin: '', priceMax: '' });
state.filters = defaultFilters();

// ---------- i18n ----------
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', `${el.textContent.trim()} ${t(el.dataset.i18nAria)}`); el.title = t(el.dataset.i18nAria); });
  $('#lang').textContent = t('lang');
  $('#lang').setAttribute('aria-label', getLang() === 'ka' ? 'EN, English' : 'ქა, ქართული');
  $('#layers-toggle')?.setAttribute('aria-label', t('layers'));
  refreshIntroToggle();
  const srcLink = document.querySelector('#stat-src');
  if (srcLink) srcLink.href = t('statSrcUrl');
  const collapsed = $('#explorer').classList.contains('is-collapsed');
  $('#explorer-close').setAttribute('aria-label', t('close'));
  $('#explorer-close').title = t('close');
  $('#explorer-handle').setAttribute('aria-label', t(collapsed ? 'sheetExpand' : 'sheetCollapse'));
  document.documentElement.lang = getLang();
  renderLabels(); renderExplorer(); renderCard(); state.scene?.request(); if (!$('#filters').hidden) renderFilters();
}
$('#lang').addEventListener('click', () => { setLang(getLang() === 'ka' ? 'en' : 'ka'); applyI18n(); });
const INTRO_KEY = 'hisni-intro';
function introCollapsedDefault() {
  const saved = sessionStorage.getItem(INTRO_KEY);
  if (saved === 'collapsed' || saved === 'open') return saved === 'collapsed';
  return matchMedia('(max-height: 520px)').matches;
}
function applyIntroCollapsed(collapsed, persist) {
  $('#intro').classList.toggle('is-collapsed', collapsed);
  refreshIntroToggle();
  if (persist) sessionStorage.setItem(INTRO_KEY, collapsed ? 'collapsed' : 'open');
  state.scene?.request();
}
function refreshIntroToggle() {
  const btn = $('#intro-toggle'); if (!btn) return;
  const collapsed = $('#intro').classList.contains('is-collapsed');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', t(collapsed ? 'introExpand' : 'introCollapse'));
}
applyIntroCollapsed(introCollapsedDefault(), false);
{
  const handle = $('#intro-toggle');
  let py = null, moved = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    py = e.clientY; moved = false;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => { if (py != null && Math.abs(e.clientY - py) > 8) moved = true; });
  handle.addEventListener('pointerup', (e) => {
    if (py == null) return;
    const dy = e.clientY - py; py = null;
    if (dy > 36) { moved = true; applyIntroCollapsed(true, true); }
    else if (dy < -36) { moved = true; applyIntroCollapsed(false, true); }
  });
  handle.addEventListener('pointercancel', () => { py = null; });
  handle.addEventListener('click', () => {
    if (moved) { moved = false; return; }
    applyIntroCollapsed(!$('#intro').classList.contains('is-collapsed'), true);
  });
}

// ---------- helpers ----------
const kindLabel = (k) => t(k);
const STATUSES = ['available', 'reserved', 'queue', 'sold', 'nfs'];
const statusLabel = (s) => ({ available: t('avail'), reserved: t('reserved'), sold: t('sold'), nfs: t('nfs'), queue: t('queue') }[s] || s);
const statusColorHex = { available: 0x8a9b48, reserved: 0xe2a54b, queue: 0xb7791f, sold: 0xb5524a, nfs: 0x9a9a9a };
// NFS apartments: price is not shipped and never shown
const priceOf = (a) => (a.status === 'nfs' ? '—' : fmtUsd(a.price_usd));
const aptById = (id) => state.doc.apartments.find((a) => a.id === id);
function matches(a, f = state.filters) {
  if (f.kinds.size && !f.kinds.has(a.type.kind)) return false;
  if (f.statuses.size && !f.statuses.has(a.status)) return false;
  const ar = a.area;
  if (f.areaMin !== '' && ar < +f.areaMin) return false; if (f.areaMax !== '' && ar > +f.areaMax) return false;
  if (f.floorMin !== '' && a.floor < +f.floorMin) return false; if (f.floorMax !== '' && a.floor > +f.floorMax) return false;
  if (f.priceMin !== '' && (a.price_usd ?? 0) < +f.priceMin) return false; if (f.priceMax !== '' && (a.price_usd ?? Infinity) > +f.priceMax) return false;
  return true;
}
const filtersActive = () => { const f = state.filters; return f.kinds.size || f.statuses.size || ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax'].some((k) => f[k] !== ''); };
const statusFilterOn = () => state.filters.statuses.size > 0;
// Floor tiles count available apartments until a status chip is on; then they count the selected statuses.
// Other Filters-panel constraints (type, area, price, floor) always apply, via the same `matches()`.
function floorCount(blockId, floor) {
  return state.doc.apartments.filter((a) => a.block === blockId && a.floor === floor && matches(a) && (statusFilterOn() || a.status === 'available')).length;
}
function filteredCount(apts) {
  return statusFilterOn() ? apts.filter((a) => matches(a)).length : apts.length;
}
function floorCountLabel(n) {
  if (!statusFilterOn()) return `${n} ${t('avail')}`;
  const sts = [...state.filters.statuses];
  return sts.length === 1 ? `${n} ${statusLabel(sts[0])}` : `${n} ${t('apartments')}`;
}
function announce(msg) { $('#announce').textContent = msg; }
const towerName = (id) => `${t('block')} ${id}`;

// ---------- explorer ----------
function basePanel() { return state.view === 'intro' ? 'intro' : 'explorer'; }
function showOnly(panel) {
  $('#intro').hidden = panel !== 'intro';
  $('#explorer').hidden = panel !== 'explorer';
  $('#filters').hidden = panel !== 'filters';
  $('#apt-card').hidden = panel !== 'apt';
  $('#place-card').hidden = panel !== 'place';
  if (panel !== 'explorer') $('#explorer').classList.remove('is-collapsed');
  app.classList.toggle('side-sheet', panel === 'apt' || panel === 'filters');
}
let fromPop = false, seeded = false, pushed = 0, histDepth = 0, seedDepth = 0;
let bootQuery = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
let mapMode = null;
function depthNow() { if (state.apt) return 4; return { intro: 0, towers: 1, block: 2, floor: 3 }[state.view] ?? 0; }
function urlForState() {
  const p = new URLSearchParams();
  if (mapMode === 'neighborhood' && state.view === 'intro' && !state.apt) p.set('view', 'neighborhood');
  else if (state.view && state.view !== 'intro') p.set('view', state.view);
  if (state.tower && (state.view === 'block' || state.view === 'floor' || state.apt)) p.set('tower', state.tower);
  if (state.view === 'floor' && state.floor != null) p.set('floor', String(state.floor));
  if (state.apt) p.set('apt', state.apt);
  if (getLang() === 'en') p.set('lang', 'en');
  if (bootQuery.get('webgl') === '0') p.set('webgl', '0');
  const quality = bootQuery.get('quality'); if (quality) p.set('quality', quality);
  const light = bootQuery.get('light'); if (light) p.set('light', light);
  if (!$('#filters').hidden) p.set('filters', '1');
  const q = p.toString();
  return location.pathname + (q ? `?${q}` : '');
}
function syncHistory() {
  if (fromPop || !state.doc) return;
  const url = urlForState();
  const d = depthNow();
  const here = location.pathname + location.search;
  if (!seeded) { history.replaceState({ hisni: d }, '', url); seeded = true; histDepth = d; seedDepth = d; pushed = 0; return; }
  if (d > histDepth && here !== url) { history.pushState({ hisni: d }, '', url); pushed += 1; }
  else if (here !== url) history.replaceState({ hisni: d }, '', url);
  histDepth = d;
}
function applyDeepLink(params) {
  mapMode = params.get('view') === 'neighborhood' ? 'neighborhood' : null;
  const aptId = params.get('apt');
  if (aptId && aptById(aptId)) {
    const a = aptById(aptId);
    Object.assign(state, { view: 'floor', tower: a.block, floor: a.floor, apt: a.id });
    return;
  }
  const v = params.get('view');
  if (v === 'floor') Object.assign(state, { view: 'floor', tower: params.get('tower') || 'III', floor: +(params.get('floor') || 20), apt: null });
  else if (v === 'block') Object.assign(state, { view: 'block', tower: params.get('tower') || 'III', floor: null, apt: null });
  else if (v === 'towers') Object.assign(state, { view: 'towers', tower: null, floor: null, apt: null });
  else Object.assign(state, { view: 'intro', tower: null, floor: null, apt: null });
}
// The landing entry becomes the overview. Each deeper level is pushed on top, so Back
// from a deep link steps up one level instead of leaving the page.
function seedHistory() {
  const target = { view: state.view, tower: state.tower, floor: state.floor, apt: state.apt };
  const d = depthNow();
  const steps = [];
  if (d >= 1) steps.push({ view: 'towers', tower: null, floor: null, apt: null });
  if (d >= 2) steps.push({ view: 'block', tower: target.tower, floor: null, apt: null });
  if (d >= 3) steps.push({ view: 'floor', tower: target.tower, floor: target.floor, apt: null });
  if (d >= 4) steps.push({ view: 'floor', tower: target.tower, floor: target.floor, apt: target.apt });
  state.view = 'intro'; state.tower = null; state.floor = null; state.apt = null;
  history.replaceState({ hisni: 0 }, '', urlForState());
  for (const step of steps) {
    Object.assign(state, step);
    history.pushState({ hisni: depthNow() }, '', urlForState());
  }
  Object.assign(state, target);
  seeded = true; seedDepth = 0; histDepth = d; pushed = d;
}
function renderShell() {
  if (state.apt && aptById(state.apt)) { renderCrumbs(); renderExplorer(); renderCard(); }
  else { showOnly(state.view === 'intro' ? 'intro' : 'explorer'); renderCrumbs(); renderExplorer(); }
}
function applyHistoryUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get('lang');
  if (lang === 'en' || lang === 'ka') { setLang(lang); applyI18n(); }
  mapMode = p.get('view') === 'neighborhood' ? 'neighborhood' : null;
  state.apt = null;
  const view = p.get('view') || 'intro';
  if (p.get('apt')) selectApt(p.get('apt'));
  else if (view === 'floor') setView('floor', { tower: p.get('tower'), floor: +(p.get('floor') || 6) });
  else if (view === 'block') setView('block', { tower: p.get('tower') });
  else if (view === 'towers') setView('towers', { tower: null });
  else setView('intro', { tower: null, floor: null });
  if (p.get('filters') === '1') { showOnly('filters'); renderFilters(); }
}
window.addEventListener('popstate', () => {
  fromPop = true;
  applyHistoryUrl();
  histDepth = typeof history.state?.hisni === 'number' ? history.state.hisni : depthNow();
  pushed = Math.max(0, histDepth - seedDepth);
  fromPop = false;
});
function setView(v, opts = {}) {
  expandSheet();
  Object.assign(state, { view: v }, opts);
  const S = state.scene;
  if (S) {
    if (v === 'intro') { S.clearFloor(); S.highlightTower(null); if (mapMode === 'neighborhood') S.views.neighborhood(); else S.views.overview(); }
    if (v === 'towers') { S.clearFloor(); S.highlightTower(null); S.views.towers(); }
    if (v === 'block') { S.clearFloor(); S.highlightTower(state.tower); S.focusTower(state.tower); }
    if (v === 'floor') { S.highlightTower(null); S.buildFloor(state.tower, state.floor, floorApts(), (a) => statusColorHex[a.status] ?? 0x999999); recolor(); S.focusFloor(state.tower, state.floor); }
  }
  if (v !== 'floor') state.apt = null;
  showOnly(v === 'intro' ? 'intro' : 'explorer');
  renderCrumbs(); renderExplorer();
  const body = $('#explorer-body'); if (body) body.scrollTop = 0;
  syncHistory();
}
const floorApts = () => state.doc.apartments.filter((a) => a.block === state.tower && a.floor === state.floor);
function recolor() {
  if (!state.scene || state.view !== 'floor') return;
  const dim = new Set(floorApts().filter((a) => filtersActive() && !matches(a)).map((a) => a.id));
  state.scene.recolorApts((id) => statusColorHex[aptById(id).status] ?? 0x999999, state.apt, dim);
}

function renderCrumbs() {
  const c = $('#crumbs'); c.hidden = state.view === 'intro'; if (c.hidden) return;
  const items = [['intro', t('neighborhood')], ['towers', t('towers')]];
  if (state.tower) items.push(['block', towerName(state.tower)]);
  if (state.view === 'floor') items.push(['floor', `${t('floor')} ${state.floor}`]);
  const cut = items.findIndex(([k]) => k === state.view);
  c.innerHTML = items.slice(0, cut + 1).map(([k, l], i, arr) => `<button data-go="${k}" ${i === arr.length - 1 ? 'aria-current="step"' : ''}>${esc(l)}</button>`).join('');
}
$('#crumbs').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (!b) return; const k = b.dataset.go; if (k === 'intro') setView('intro', { tower: null }); else if (k === 'towers') setView('towers', { tower: null }); else if (k === 'block') setView('block'); });

function blockOf(id) { return state.doc.blocks.find((x) => x.id === id); }
function blockSource(id) { return blockOf(id)?.source; }
const dmy = (d) => (d ? d.split('-').reverse().join('.') : '');
function srcLabel(id) { const b = blockOf(id); const d = dmy(b?.snapshot) || snapDate(); return d ? `${t('updated')} ${d}` : (b?.source ? '' : t('sample')); }
function sourceNote(id) { const b = blockOf(id); if (!b?.source) return t('sampleNote'); const note = srcLabel(id); return note ? `${note}. ${t('listPrice')}` : t('listPrice'); }
function legend(id) {
  const present = new Set(state.doc.apartments.filter((a) => a.block === id).map((a) => a.status));
  const src = blockSource(id);
  const chips = STATUSES.filter((s) => present.has(s) || state.filters.statuses.has(s)).map((s) => {
    const on = state.filters.statuses.has(s);
    return `<button type="button" class="legend-chip ${s}" data-status="${s}" aria-pressed="${on}"><i class="dot ${s}" aria-hidden="true"></i>${statusLabel(s)}</button>`;
  }).join('');
  const badge = ''; void src;
  return `<div class="legend" role="group" aria-label="${esc(t('status'))}">${chips}${badge}</div>`;
}
function toggleStatus(s) {
  const set = state.filters.statuses;
  if (set.has(s)) set.delete(s); else set.add(s);
  renderExplorer();
  recolor();
  if (!$('#filters').hidden) renderFilters();
  $(`#explorer [data-status="${s}"]`)?.focus();
}

function renderExplorer() {
  const el = $('#explorer-body'); if (!state.doc || !el) return;
  if (state.view === 'intro') { el.innerHTML = ''; return; }
  if (state.view === 'towers') {
    el.innerHTML = `<p class="eyebrow">${t('towers')}</p><h2>${t('chooseTower')}</h2><p>${t('chooseTowerHint')}</p>
      <div class="tower-list">${state.doc.blocks.map((b) => `<button data-tower="${b.id}" class="${b.has_data ? 'has-data' : ''}"><strong>${b.id}</strong><small>${b.floors} ${t('floorsN')}</small></button>`).join('')}</div>
      <p class="note">${t('noDataHint')}</p>`;
  } else if (state.view === 'block') {
    const b = state.doc.blocks.find((x) => x.id === state.tower);
    if (!b.has_data) { el.innerHTML = `<p class="eyebrow">${towerName(b.id)}</p><h2>${towerName(b.id)} · ${b.floors} ${t('floorsN')}</h2><p>${t('noData')}</p><button class="primary small" data-tower="III">${towerName('III')} →</button>`; return; }
    const [f0, f1] = state.doc.meta.residential_floors; const floors = []; for (let f = f1; f >= f0; f--) floors.push(f);
    const blockApts = state.doc.apartments.filter((a) => a.block === b.id);
    const sts = [...state.filters.statuses];
    const countClass = !statusFilterOn() ? '' : sts.length === 1 ? `count-${sts[0]}` : 'count-mixed';
    el.innerHTML = `<p class="eyebrow">${towerName(b.id)}</p><h2>${t('chooseFloor')}</h2><p>${t('residentialFloors')} · ${filteredCount(blockApts)} ${t('apartments')}</p>${legend(b.id)}
      <div class="floor-grid ${countClass}" role="group" aria-label="${t('chooseFloor')}">${floors.map((f) => { const n = floorCount(b.id, f); return `<button data-floor="${f}" class="${n ? '' : 'none'}" aria-label="${esc(t('floor'))} ${f}, ${esc(floorCountLabel(n))}"><b>${f}</b><small>${n}</small></button>`; }).join('')}</div>
      <p class="note">${b.typical_floor_plan ? `<a href="${BASE}${b.typical_floor_plan}" target="_blank" rel="noopener">${t('typeL')} ↗</a> · ` : ''}${sourceNote(b.id)}</p>`;
  } else if (state.view === 'floor') {
    const apts = floorApts();
    el.innerHTML = `<p class="eyebrow">${towerName(state.tower)} · ${t('floor')} ${state.floor}</p><h2>${t('onFloor')}: ${filteredCount(apts)} ${t('apartments')}</h2><p>${t('selectApt')}</p>${legend(state.tower)}
      <ul class="apt-list">${apts.map((a) => `<li><button data-apt="${a.id}" ${a.id === state.apt ? 'aria-current="true"' : ''} style="${filtersActive() && !matches(a) ? 'opacity:.45' : ''}"><i class="dot ${a.status}"></i><span><b>№ ${a.number}</b> · ${kindLabel(a.type.kind)}<br/><span class="meta">${a.area} ${m2()} · ${statusLabel(a.status)}</span></span><span class="pr">${priceOf(a)}</span></button></li>`).join('')}</ul>
      <div class="floor-grid" style="margin-top:10px;grid-template-columns:repeat(2,1fr)">${state.floor < 36 ? `<button data-floor="${state.floor + 1}">↑ ${state.floor + 1}</button>` : '<span></span>'}${state.floor > 6 ? `<button data-floor="${state.floor - 1}">↓ ${state.floor - 1}</button>` : ''}</div>
      <p class="note">${t('schematicNote')} ${sourceNote(state.tower)}</p>`;
  }
}
$('#explorer').addEventListener('click', (e) => {
  if (e.target.closest('#explorer-bar, #explorer-handle, #explorer-close')) return;
  const sb = e.target.closest('[data-status]'); if (sb) { toggleStatus(sb.dataset.status); return; }
  const tb = e.target.closest('[data-tower]'); if (tb) return setView('block', { tower: tb.dataset.tower });
  const fb = e.target.closest('[data-floor]'); if (fb) { setView('floor', { floor: +fb.dataset.floor }); announce(`${t('floor')} ${fb.dataset.floor}`); return; }
  const ab = e.target.closest('[data-apt]'); if (ab) selectApt(ab.dataset.apt);
});

function expandSheet() {
  const el = $('#explorer');
  el.classList.remove('is-collapsed');
  $('#explorer-handle')?.setAttribute('aria-expanded', 'true');
  $('#explorer-handle')?.setAttribute('aria-label', t('sheetCollapse'));
}
function collapseSheet() {
  const el = $('#explorer');
  if (el.hidden) return;
  el.classList.add('is-collapsed');
  $('#explorer-handle')?.setAttribute('aria-expanded', 'false');
  $('#explorer-handle')?.setAttribute('aria-label', t('sheetExpand'));
}
function closeApt() {
  if (!state.apt && $('#apt-card').hidden) return;
  if (state.apt && pushed > 0) { history.back(); return; }
  state.apt = null; renderCard(); renderExplorer(); recolor(); syncHistory();
}
function stepBack() {
  if (!$('#apt-card').hidden) { closeApt(); return; }
  if (!$('#filters').hidden || !$('#place-card').hidden) { showOnly(basePanel()); syncHistory(); return; }
  if (pushed > 0) { history.back(); return; }
  if (state.view === 'floor') setView('block');
  else if (state.view === 'block') setView('towers', { tower: null });
  else if (state.view === 'towers') setView('intro', { tower: null });
  else showOnly('intro');
}
$('#explorer-close').addEventListener('click', (e) => { e.stopPropagation(); stepBack(); });
// Swipe the grip to collapse; a tap (no travel) toggles. pointer events fire on iOS touch.
{
  const handle = $('#explorer-handle');
  let py = null, moved = false;
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    py = e.clientY; moved = false;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (py == null) return;
    if (Math.abs(e.clientY - py) > 8) moved = true;
  });
  handle.addEventListener('pointerup', (e) => {
    if (py == null) return;
    const dy = e.clientY - py;
    py = null;
    if (dy > 40) { moved = true; collapseSheet(); return; }
    if (dy < -40) { moved = true; expandSheet(); return; }
  });
  handle.addEventListener('pointercancel', () => { py = null; });
  handle.addEventListener('click', () => { if (moved) { moved = false; return; } $('#explorer').classList.contains('is-collapsed') ? expandSheet() : collapseSheet(); });
}

function selectApt(id, { fromList } = {}) {
  const a = aptById(id); if (!a) return;
  if (state.view !== 'floor' || state.floor !== a.floor || state.tower !== a.block) { state.apt = null; state.tower = a.block; setView('floor', { floor: a.floor }); }
  state.apt = id; renderCard(); renderExplorer(); recolor(); syncHistory(); announce(`№ ${a.number}`);
}

function renderCard() {
  const el = $('#apt-card'); const a = state.apt && aptById(state.apt);
  if (!a) { if (!$('#apt-card').hidden) showOnly(basePanel()); return; }
  showOnly('apt');
  const ty = a.type; const tab = !ty.plan_2d ? '3d' : !ty.plan_3d ? '2d' : state.planTab; const img = tab === '3d' ? ty.plan_3d : ty.plan_2d; const src = /^https?:/.test(img) ? img : BASE + img;
  el.innerHTML = `<div class="sheet-head"><div><p class="eyebrow">${towerName(a.block)} · ${t('floor')} ${a.floor}</p><h2>${t('apartment')} № ${a.number}</h2></div><button class="x" data-close aria-label="${t('close')}">×</button></div>
    <div class="tabs" role="group">${ty.plan_2d ? `<button data-tab="2d" aria-pressed="${tab === '2d'}">${t('plan2d')}</button>` : ''}${ty.plan_3d ? `<button data-tab="3d" aria-pressed="${tab === '3d'}">${t('plan3d')}</button>` : ''}</div>
    <div class="plan"><img src="${src}" alt="${t('typeL')} ${typeCode(ty)}, ${kindLabel(ty.kind)}, ${a.area} ${m2()}" loading="lazy" referrerpolicy="no-referrer" /></div>
    <div class="facts">
      <div><small>${t('area')}</small><b>${a.area} ${m2()}</b></div>
      <div><small>${t('rooms')}</small><b>${kindLabel(ty.kind)}</b></div>
      <div><small>${t('orientation')}</small><b>${a.facing ? orientLabel(a.facing) : '—'}</b></div>
      <div><small>${t('status')}${srcBadge(a)}</small><b class="status-pill"><i class="dot ${a.status}"></i>${statusLabel(a.status)}</b></div>
      <div><small>${t('price')}${srcBadge(a)}</small><b>${priceOf(a)}</b>${a.status !== 'nfs' && a.price_per_m2_usd ? `<small>${fmtUsd(a.price_per_m2_usd)} / ${m2()}</small>` : ''}</div>
    </div>
    <p class="note">* ${t('schematicNote')} ${sourceNote(a.block)}</p>
    <div class="cta-row"><button class="primary accent" data-lead>${t('cta')}</button></div>`;
}
$('#apt-card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeApt(); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { state.planTab = tab.dataset.tab; renderCard(); return; }
  if (e.target.closest('[data-lead]')) openLead(state.apt);
});

// ---------- filters ----------
function renderFilters() {
  const el = $('#filters'); const f = state.filters;
  const res = state.doc.apartments.filter((a) => matches(a)).sort((x, y) => x.block.localeCompare(y.block) || x.floor - y.floor || x.number - y.number);
  const kinds = ['studio', '1br', '2br'], sts = STATUSES;
  el.innerHTML = `<div class="sheet-head"><h2>${t('filters')}</h2><button class="x" data-close aria-label="${t('close')}">×</button></div>
    <form id="ff">
      <fieldset><legend>${t('rooms')}</legend><div class="seg">${kinds.map((k) => `<label><input type="checkbox" name="kind" value="${k}" ${f.kinds.has(k) ? 'checked' : ''}/><span>${kindLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${t('status')}</legend><div class="seg">${sts.map((k) => `<label><input type="checkbox" name="status" value="${k}" ${f.statuses.has(k) ? 'checked' : ''}/><span><i class="dot ${k}"></i>${statusLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${t('areaRange')}</legend><div class="range"><input name="areaMin" inputmode="decimal" placeholder="${t('min')} ${Math.floor(Math.min(...state.doc.apartments.map((x) => x.area)))}" value="${f.areaMin}" aria-label="${t('areaRange')} min"/><input name="areaMax" inputmode="decimal" placeholder="${t('max')} ${Math.ceil(Math.max(...state.doc.apartments.map((x) => x.area)))}" value="${f.areaMax}" aria-label="${t('areaRange')} max"/></div></fieldset>
      <fieldset><legend>${t('floorRange')}</legend><div class="range"><input name="floorMin" inputmode="numeric" placeholder="6" value="${f.floorMin}" aria-label="${t('floorRange')} min"/><input name="floorMax" inputmode="numeric" placeholder="36" value="${f.floorMax}" aria-label="${t('floorRange')} max"/></div></fieldset>
      <fieldset><legend>${t('priceRange')}</legend><div class="range"><input name="priceMin" inputmode="numeric" placeholder="${t('min')}" value="${f.priceMin}" aria-label="${t('priceRange')} min"/><input name="priceMax" inputmode="numeric" placeholder="${t('max')}" value="${f.priceMax}" aria-label="${t('priceRange')} max"/></div></fieldset>
    </form>
    <p><b>${res.length}</b> ${t('results')}</p>
    <ul class="apt-list results" aria-label="${t('list')}">${res.slice(0, 40).map((a) => `<li><button data-apt="${a.id}"><i class="dot ${a.status}"></i><span><b>№ ${a.number}</b> · ${towerName(a.block)} · ${t('floor')} ${a.floor}<br/><span class="meta">${kindLabel(a.type.kind)} · ${a.area} ${m2()}</span></span><span class="pr">${priceOf(a)}</span></button></li>`).join('') || `<li>${t('noResults')}</li>`}</ul>
    ${res.length > 40 ? `<p class="note">+${res.length - 40}…</p>` : ''}
    <p class="note">${t('updated')} ${snapDate()}. ${t('listPrice')}</p>
    <div class="filter-foot"><button class="btn-ghost" data-reset>${t('reset')}</button><button class="primary" data-close>${t('showList')} (${res.length})</button></div>`;
}
function readFilters() {
  const fd = new FormData($('#ff')); const f = state.filters;
  f.kinds = new Set(fd.getAll('kind')); f.statuses = new Set(fd.getAll('status'));
  for (const k of ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax']) f[k] = String(fd.get(k) || '').replace(/[^\d.]/g, '');
}
let fT;
$('#filters').addEventListener('input', () => { clearTimeout(fT); fT = setTimeout(() => { readFilters(); const foc = document.activeElement?.name; renderFilters(); if (foc) $(`#filters [name="${foc}"]`)?.focus(); renderExplorer(); recolor(); }, 250); });
$('#filters').addEventListener('click', (e) => {
  if (e.target.closest('[data-reset]')) { state.filters = defaultFilters(); renderFilters(); renderExplorer(); recolor(); return; }
  if (e.target.closest('[data-close]')) { showOnly(basePanel()); syncHistory(); return; }
  const ab = e.target.closest('[data-apt]'); if (ab) { showOnly(basePanel()); selectApt(ab.dataset.apt); }
});
$('#filter-open').addEventListener('click', () => {
  if ($('#filters').hidden) { showOnly('filters'); renderFilters(); $('#filters input')?.focus(); }
  else showOnly(basePanel());
});

// ---------- lead form (stub) ----------
function openLead(id) {
  const a = aptById(id); const d = $('#lead');
  d.innerHTML = `<div class="dlg lead"><div class="dlg-head"><h2>${t('formTitle')}</h2><button class="x" data-close aria-label="${t('close')}">×</button></div>
    <form method="dialog" id="lead-form">
      <label>${t('formApt')}<input name="apartment" value="${towerName(a.block)} · ${t('floor')} ${a.floor} · № ${a.number}" readonly /></label>
      <label>${t('formName')}<input name="name" autocomplete="name" required /></label>
      <label>${t('formPhone')}<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required /></label>
      <p class="stub">${t('formStub')}</p>
      <button class="primary accent" type="submit">${t('formSubmit')}</button>
    </form></div>`;
  d.showModal();
  d.querySelector('[data-close]').onclick = () => d.close();
  d.querySelector('#lead-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const digits = String(fd.phone || '').replace(/\D/g, '');
    if (digits.length < 9) { e.target.querySelector('.stub').textContent = t('formPhoneInvalid'); return; }
    await submitLead({ ...fd, apartment_id: a.id });
    e.target.outerHTML = `<p class="stub">${t('formThanks')}</p>`;
  };
}

// ---------- about ----------
function openAbout() {
  const d = $('#about'); const L = STRINGS[getLang()];
  const renders = ['aerial-day', 'aerial-night', 'exterior-01', 'exterior-02', 'view-04', 'view-07'];
  d.innerHTML = `<div class="dlg"><div class="dlg-head"><div><p class="eyebrow">${t('brandGroup')}</p><h2>${t('aboutTitle')}</h2></div><button class="x" data-close aria-label="${t('close')}">×</button></div>
    ${L.aboutBody.slice(0, 3).map((p) => `<p>${esc(p)}</p>`).join('')}
    <p>${esc(L.aboutOffer)}</p>
    <p class="note"><a href="${t('statSrcUrl')}" target="_blank" rel="noopener">* ${esc(t('statSrc'))}</a></p>
    <p>${esc(L.aboutBody[3])}</p>
    <p>${esc(L.aboutSchedule)}</p>
    <p class="note"><a href="${t('investSrcUrl')}" target="_blank" rel="noopener">* ${esc(t('investSrc'))}</a></p>
    <h3>${t('gallery')}</h3><div class="gallery">${renders.map((r) => `<a href="${BASE}renders/${r}.webp" target="_blank" rel="noopener"><img src="${BASE}renders/${r}-thumb.webp" alt="Hisni render ${r}" loading="lazy"/></a>`).join('')}</div>
    <h3>${t('method')}</h3><p style="font-size:13px;color:var(--muted)">${t('methodBody')}</p>
    <p style="font-size:13px;color:var(--muted)">${t('address')}</p></div>`;
  d.showModal(); d.querySelector('[data-close]').onclick = () => d.close();
}
$('#about-open').addEventListener('click', openAbout);
$('#intro-about')?.addEventListener('click', openAbout);
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// ---------- labels ----------
const labelEls = [];
function renderLabels() {
  const L = getLang();
  labelEls.forEach(({ el, poi, tower }) => {
    if (poi) { el.querySelector('.full').textContent = `${poi[L]} · ${poi.min} ${t('walk')}`; el.querySelector('.short').textContent = `${poi['s' + L] || poi[L]} · ${poi.min} ${L === 'ka' ? 'წთ' : 'min'}`; }
    if (tower) el.querySelector('span').textContent = towerName(tower);
    if (el.classList.contains('project')) el.querySelector('span').textContent = L === 'ka' ? 'ჰისნი' : 'Hisni';
  });
}
function makeLabels(S) {
  const root = $('#labels');
  for (const p of POIS) {
    const el = document.createElement('div'); el.className = `label ${p.cat}`; el.innerHTML = `<button><i>${p.icon}</i><span class="full"></span><span class="short"></span></button>`;
    el.querySelector('button').addEventListener('click', () => showPlace(p)); root.appendChild(el); labelEls.push({ el, poi: p });
    if (!['metro', 'school', 'bus'].includes(p.cat)) el.dataset.pri = 'low';
    S.addLabel(el, { x: p.x, y: 6, z: p.z }, 10 + POIS.indexOf(p), false);
  }
  for (const b of state.doc.blocks) {
    const el = document.createElement('div'); el.className = `label tower ${b.has_data ? 'data' : ''}`; el.innerHTML = '<button><span></span></button>';
    el.querySelector('button').addEventListener('click', () => setView('block', { tower: b.id })); root.appendChild(el); labelEls.push({ el, tower: b.id });
    S.addLabel(el, S.towerLabelPos(b.id), 0, true);
  }
  renderLabels();
}
function showPlace(p) {
  const el = $('#place-card'); const L = getLang();
  el.innerHTML = `<div class="sheet-head"><div><p class="eyebrow">${t('poiCat')[p.cat]}</p><h3>${esc(p[L])}</h3><p>${p.min} ${t('walk')}${p.src === 'client' ? '' : ' (' + t('approx') + ')'}</p></div><button class="x" aria-label="${t('close')}">×</button></div>`;
  showOnly('place');
  el.querySelector('.x').onclick = () => showOnly(basePanel());
}

// ---------- controls ----------
$('#start').addEventListener('click', () => setView('towers'));
$('#layers-toggle').addEventListener('click', (e) => { const o = $('#layer-options'); o.hidden = !o.hidden; e.currentTarget.setAttribute('aria-expanded', String(!o.hidden)); e.currentTarget.querySelector('.chev').textContent = o.hidden ? '+' : '−'; });
document.querySelectorAll('[data-layer]').forEach((i) => i.addEventListener('change', () => { if (i.dataset.layer === 'labels') app.classList.toggle('hide-labels', !i.checked); else state.scene?.setLayer(i.dataset.layer, i.checked); }));
document.querySelectorAll('[data-light]').forEach((b) => b.addEventListener('click', () => setLight(b.dataset.light)));
function setLight(m) { state.light = m; document.querySelectorAll('[data-light]').forEach((x) => { x.classList.toggle('active', x.dataset.light === m); x.setAttribute('aria-pressed', String(x.dataset.light === m)); }); app.classList.toggle('night', m === 'night'); state.scene?.setLight(m); }
$('#zoom-in').addEventListener('click', () => state.scene?.zoom(0.8));
$('#zoom-out').addEventListener('click', () => state.scene?.zoom(1.25));
$('#rotate').addEventListener('click', (e) => { const on = state.scene?.toggleRotate(); e.currentTarget.setAttribute('aria-pressed', String(!!on)); });
function goHome() {
  state.apt = null;
  if (pushed > 0) history.go(-pushed);
  else setView('intro', { tower: null, floor: null });
}
let homeAt = 0;
function onHome(e) {
  e?.preventDefault?.();
  const now = performance.now();
  if (now - homeAt < 400) return;
  homeAt = now;
  goHome();
}
$('#reset').addEventListener('click', onHome);
$('#reset').addEventListener('touchend', onHome, { passive: false });
$('#reset').addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') return; onHome(e); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, dialog')) return;
  if (e.key === 'Escape') { if (!$('#apt-card').hidden) closeApt(); else if (!$('#filters').hidden || !$('#place-card').hidden) { showOnly(basePanel()); syncHistory(); } else if (state.view === 'floor') setView('block'); else if (state.view === 'block') setView('towers', { tower: null }); else if (state.view === 'towers') setView('intro'); }
  if (e.key === 'Home') $('#reset').click();
  if (e.key === '+' || e.key === '=') state.scene?.zoom(0.8);
  if (e.key === '-') state.scene?.zoom(1.25);
});

function showHint() {
  if (localStorage.getItem('hisni-hint')) return;
  const h = $('#hint'); h.hidden = false; const done = () => { h.hidden = true; localStorage.setItem('hisni-hint', '1'); };
  $('#hint-ok').onclick = done; setTimeout(done, 9000);
}

// cheap capability check; real context creation failure is handled in boot()
function hasWebGL() { return !!(window.WebGL2RenderingContext || window.WebGLRenderingContext); }

// ---------- boot ----------
async function boot() {
  const params = new URLSearchParams(location.search);
  bootQuery = params;
  const lang = params.get('lang');
  if (lang === 'en' || lang === 'ka') setLang(lang);
  applyI18n();
  const ctxP = fetch(`${BASE}data/context.json`).then((r) => r.json());
  state.doc = await loadApartments(BASE);
  // Parse the landing URL before any history write. syncHistory used to replaceState
  // the overview while the query string was still unread, which wiped every deep link.
  applyDeepLink(params);
  seedHistory();
  renderShell();
  if (params.get('filters') === '1') {
    showOnly('filters'); renderFilters();
    history.replaceState({ hisni: histDepth }, '', urlForState());
  }
  window.__hisni = window.__hisni || { state };
  const webgl = hasWebGL() && params.get('webgl') !== '0';
  if (!webgl) return startFallback();
  // let the UI paint first, then build the 3D scene
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 600 }) : setTimeout(r, 200)));
  try { await start3D(params, ctxP); } catch (e) { console.warn('[hisni] 3D unavailable, falling back', e); $('#viewport').innerHTML = ''; startFallback(); }
}
function startFallback() {
    app.classList.add('fallback'); $('#loading').classList.add('done');
    state.view = 'block'; state.tower = 'III'; showOnly('explorer'); renderCrumbs(); renderExplorer();
    $('#explorer-body').insertAdjacentHTML('afterbegin', `<p class="placeholder">${t('webglOff')}</p><img class="fallback-plan" src="${BASE}plans/block3-typical-floor.webp" alt="${t('typeL')}" width="600" height="760"/>`);
}
async function start3D(params, ctxP) {
  const weak = params.get('quality') === 'low' || (params.get('quality') !== 'high' && (matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4));
  $('#loading').classList.add('mini');
  const [{ createScene }, ctx] = await Promise.all([import('./scene.js'), ctxP]);
  let tip = null;
  const S = await createScene($('#viewport'), ctx, {
    onProgress: (p) => { $('#loading i').style.width = Math.round(p * 100) + '%'; },
    weak,
    onPick: (hit) => {
      if (state.apt) {
        if (hit && hit.kind === 'apt') return selectApt(hit.id);
        closeApt();
        return;
      }
      if (!hit) return;
      if (hit.kind === 'apt') return selectApt(hit.id);
      if (hit.kind === 'tower') { if (state.view === 'floor' && hit.id === state.tower) return; setView('block', { tower: hit.id }); }
    },
    onHover: (hit, e) => {
      if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; app.appendChild(tip); }
      if (!hit) { tip.hidden = true; if (state.view === 'towers') S.highlightTower(null); return; }
      tip.hidden = false; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
      if (hit.kind === 'apt') { const a = aptById(hit.id); tip.textContent = `№ ${a.number} · ${kindLabel(a.type.kind)} · ${a.area} ${m2()} · ${statusLabel(a.status)}`; }
      else { tip.textContent = towerName(hit.id); if (state.view === 'towers' || state.view === 'intro') S.highlightTower(hit.id); }
    },
  });
  state.scene = S; window.__hisni = { S, state };
  makeLabels(S);
  const needle = $('#needle');
  S.controls.addEventListener('change', () => { needle.style.transform = `rotate(${(S.controls.getAzimuthalAngle() * 180) / Math.PI}deg)`; });
  setLight(params.get('light') || 'day');
  requestAnimationFrame(() => { $('#loading').classList.add('done'); showHint(); });
  // Camera follows the state parsed in boot(). fromPop keeps this from pushing another entry.
  const prevPop = fromPop; fromPop = true;
  if (state.apt) { setView('floor', { tower: state.tower, floor: state.floor, apt: state.apt }); renderCard(); }
  else if (state.view !== 'intro') setView(state.view, { tower: state.tower, floor: state.floor });
  else if (mapMode === 'neighborhood') S.views.neighborhood();
  if (params.get('filters') === '1') { showOnly('filters'); renderFilters(); }
  fromPop = prevPop;
}
boot();
