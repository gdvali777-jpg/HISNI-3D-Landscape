import './style.css';
import { t, getLang, setLang, STRINGS } from './i18n.js';
import { loadApartments, CONTACT } from './data/adapter.js';
import { track } from './analytics.js';
import { mountBlockMenu } from './block-menu.js';

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
const POI_ICON = {
  metro: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#8A9B48"/><path fill="#fff" d="M8 20V8h2.4l3.6 6.2L17.6 8H20v12h-2.1v-7.2L14.6 20h-1.2l-3.3-7.2V20H8z"/></svg>',
  school: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#8A9B48"/><path fill="#fff" d="M14 7 6 11l8 4 8-4-8-4zm-6 6.2V18c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.8l-6 3-6-3z"/></svg>',
  kinder: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#E78E75"/><circle cx="14" cy="11" r="3" fill="#fff"/><path fill="#fff" d="M8.5 20c.6-2.6 2.8-4 5.5-4s4.9 1.4 5.5 4H8.5z"/></svg>',
  health: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#E78E75"/><path fill="#fff" d="M12 8h4v4h4v4h-4v4h-4v-4H8v-4h4V8z"/></svg>',
  bus: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#8A9B48"/><path fill="#fff" d="M9 9h10a2 2 0 0 1 2 2v7h-1.2a1.8 1.8 0 0 1-3.6 0h-4.4a1.8 1.8 0 0 1-3.6 0H7v-7a2 2 0 0 1 2-2zm1.2 2.2V14h7.6v-2.8H10.2zm8.8 0V14H19v-2.8h-.0z"/></svg>',
  shop: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#E78E75"/><path fill="#fff" d="M9 11h10l-1 8H10l-1-8zm2.2-2.2a2.8 2.8 0 0 1 5.6 0V11h-2V8.8a.8.8 0 0 0-1.6 0V11h-2V8.8z"/></svg>',
  bank: '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#8A9B48"/><path fill="#fff" d="M14 7 7 11v1.4h14V11L14 7zm-5.2 4.2V18H11v-6.8H8.8zm4.1 0V18h2.2v-6.8h-2.2zm4.2 0V18H19v-6.8h-2zm-9 7.2h12.2V20H8.1v-1.6z"/></svg>',
};
const POIS = [
  { id: 'metro', cat: 'metro', icon: 'M', x: 151, z: -82, ka: 'მეტროსადგური „ისანი“', en: 'Isani metro station', short: { ka: 'მეტრო ისანი', en: 'Isani metro' }, ska: 'მეტრო', sen: 'Metro', min: 2, src: 'client' },
  { id: 'school', cat: 'school', icon: '87', x: -120, z: -140, ka: 'ვაჟა-ფშაველას სახ. №87 საჯარო სკოლა', en: 'Public School No. 87 (Vazha-Pshavela)', short: { ka: 'სკოლა №87', en: 'School No. 87' }, ska: 'სკოლა', sen: 'School', min: 2, src: 'client' },
  { id: 'bus', cat: 'bus', icon: 'B', x: 154, z: -66, ka: 'ავტობუსის გაჩერება „მ/ს ისანი“', en: 'Bus stop “M/S Isani”', short: { ka: 'გაჩერება ისანი', en: 'Isani bus stop' }, ska: 'ავტობუსი', sen: 'Bus stop', m: 167 },
  { id: 'evex', cat: 'health', icon: '+', x: -172, z: -13, ka: 'პოლიკლინიკა „ევექსი“', en: 'Evex Polyclinic', short: { ka: 'ევექსი', en: 'Evex' }, m: 173 },
  { id: 'aversi', cat: 'health', icon: '+', x: 164, z: 134, ka: 'ავერსის კლინიკა', en: 'Aversi Clinic', short: { ka: 'ავერსი', en: 'Aversi' }, m: 212 },
  { id: 'bog', cat: 'bank', icon: '₾', x: 245, z: -76, ka: 'საქართველოს ბანკი', en: 'Bank of Georgia', short: { ka: 'საქ. ბანკი', en: 'Bank of Georgia' }, m: 256 },
  { id: 'carrefour', cat: 'shop', icon: 'S', x: 249, z: 330, ka: 'კარფური მარკეტი', en: 'Carrefour Market', short: { ka: 'კარფური', en: 'Carrefour' }, m: 413 },
  { id: 'kinder', cat: 'kinder', icon: 'K', x: 323, z: 618, ka: 'ბაგა-ბაღი №30', en: 'Kindergarten No. 30', short: { ka: 'ბაღი №30', en: 'Kinder. No. 30' }, m: 698 },
];
POIS.forEach((p) => { if (p.min == null) p.min = Math.max(1, Math.round((p.m * 1.3) / 80)); });

const state = { view: 'intro', tower: null, floor: null, apt: null, light: 'day', filters: null, scene: null, doc: null, planTab: '2d', place: null };
let renderMode = false;
let renderApi = null;
let renderLoader = null;
function loadRenderView() {
  renderLoader = renderLoader || import('./render-view.js');
  return renderLoader;
}
function closeRenderSheet() {
  if (!renderMode) return;
  $('#explorer').hidden = true;
  $('#intro').hidden = true;
  $('#apt-card').hidden = true;
  $('#filters').hidden = true;
  $('#place-card').hidden = true;
  app.classList.remove('side-sheet');
}
function clearRenderSelection() {
  state.view = 'intro';
  state.tower = null;
  state.floor = null;
  state.apt = null;
  state.place = null;
  document.documentElement.dataset.view = 'intro';
  closeRenderSheet();
  renderCrumbs();
  syncHistory();
}
let ctxPromise = null;
let histRender = false;
let returnHomeToRender = false;
// Render is the landing. 3D opens only for ?view=3d or a link that names a 3D-only target.
// ?view=render and ?mode=render stay on the render, even when a block or floor is carried along.
function wants3D(p) {
  if (p.get('view') === 'render' || p.get('mode') === 'render') return false;
  if (p.get('view') === '3d') return true;
  if (p.get('apt') || p.get('tower') || p.get('floor')) return true;
  const v = p.get('view');
  if (v === 'block' || v === 'floor' || v === 'towers' || v === 'neighborhood') return true;
  if (p.get('bg') === 'real' || p.get('webgl') === '0' || p.get('filters') === '1') return true;
  if (p.get('quality') || p.get('light')) return true;
  return false;
}
const defaultFilters = () => ({ block: null, kinds: new Set(), statuses: new Set(), areaMin: '', areaMax: '', floorMin: '', floorMax: '', priceMin: '', priceMax: '' });
state.filters = defaultFilters();

// ---------- i18n ----------
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', `${el.textContent.trim()} ${t(el.dataset.i18nAria)}`); el.title = t(el.dataset.i18nAria); });
  $('#lang').textContent = t('lang');
  $('#lang').setAttribute('aria-label', getLang() === 'ka' ? t('langToEn') : t('langToKa'));
  $('#about-open')?.setAttribute('aria-label', t('about'));
  $('#hint-ok')?.setAttribute('aria-label', t('close'));
  $('#viewport')?.setAttribute('aria-label', t('viewportAria'));
  $('#bg-switch')?.setAttribute('aria-label', t('bgReal'));
  $('#day-night')?.setAttribute('aria-label', `${t('day')} / ${t('night')}`);
  document.title = t('docTitle');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('docDesc'));
  const hintP = $('#hint p');
  if (hintP) hintP.textContent = t(matchMedia('(hover: hover) and (pointer: fine)').matches ? 'hintMouse' : 'hint');
  document.querySelectorAll('[data-call]').forEach(wireCall);
  $('#layers-toggle')?.setAttribute('aria-label', t('layers'));
  refreshIntroToggle();
  const srcLink = document.querySelector('#stat-src');
  if (srcLink) srcLink.href = t('statSrcUrl');
  const collapsed = $('#explorer').classList.contains('is-collapsed');
  $('#explorer-close').setAttribute('aria-label', t('close'));
  $('#explorer-close').title = t('close');
  $('#explorer-handle').setAttribute('aria-label', t(collapsed ? 'sheetExpand' : 'sheetCollapse'));
  document.documentElement.lang = getLang();
  document.querySelectorAll('[data-call]').forEach((a) => { a.textContent = callLabel(a.dataset.call === 'form'); });
  paintIntro();
  renderLabels(); renderExplorer(); renderCard(); state.scene?.request(); if (!$('#filters').hidden) renderFilters();
  renderApi?.refresh();
  blockMenu?.refresh();
  paintPlaces();
  syncPoi();
  if (state.place && !$('#place-card').hidden) showPlace(state.place);
  if ($('#about').open) openAbout();
  paintTourChrome();
  paintViewToggle();
  paintBackList();
  paintLeadSending();
}
function paintBackList() {
  const a = $('#back-list');
  if (!a) return;
  const lang = getLang() === 'en' ? 'en' : getLang() === 'ru' ? 'ru' : 'ka';
  a.textContent = t('backList');
  a.href = t('backListHref');
  a.dataset.lang = lang;
}
$('#back-list')?.addEventListener('click', () => {
  const lang = $('#back-list').dataset.lang || (getLang() === 'en' ? 'en' : getLang() === 'ru' ? 'ru' : 'ka');
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'back_to_list', lang });
});
function paintViewToggle() {
  const toggle = $('#view-toggle');
  if (!toggle) return;
  toggle.hidden = false;
  const to3d = !!renderMode;
  toggle.classList.toggle('to-3d', to3d);
  const label = toggle.querySelector('.view-label');
  const text = to3d ? t('view3d') : t('renderView');
  if (label) label.textContent = text;
  else toggle.textContent = text;
  toggle.setAttribute('aria-label', text);
  toggle.setAttribute('aria-pressed', String(to3d));
}
$('#lang').addEventListener('click', () => { setLang(getLang() === 'ka' ? 'en' : 'ka'); applyI18n(); syncHistory(); track('language', { lang: getLang() }); });
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
const statusColorHex = { available: 0x8a9b48, reserved: 0xe2a54b, queue: 0x4f6fa8, sold: 0xb5524a, nfs: 0x9a9a9a };
// A dollar amount is shown only for available apartments and for waitlist rows that have a price.
// Sold, reserved, and not-for-sale never show a price.
const showsPrice = (a) => (a.status === 'available' || a.status === 'queue') && a.price_usd != null && a.price_usd !== '';
const priceOf = (a) => (showsPrice(a) ? fmtUsd(a.price_usd) : '');
const aptById = (id) => state.doc.apartments.find((a) => a.id === id);
function matches(a, f = state.filters) {
  if (f.block && a.block !== f.block) return false;
  if (f.kinds.size && !f.kinds.has(a.type.kind)) return false;
  if (f.statuses.size && !f.statuses.has(a.status)) return false;
  const ar = a.area;
  if (f.areaMin !== '' && ar < +f.areaMin) return false; if (f.areaMax !== '' && ar > +f.areaMax) return false;
  if (f.floorMin !== '' && a.floor < +f.floorMin) return false; if (f.floorMax !== '' && a.floor > +f.floorMax) return false;
  if (f.priceMin !== '' || f.priceMax !== '') {
    if (!showsPrice(a)) return false;
    if (f.priceMin !== '' && a.price_usd < +f.priceMin) return false;
    if (f.priceMax !== '' && a.price_usd > +f.priceMax) return false;
  }
  return true;
}
const filtersActive = () => { const f = state.filters; return !!f.block || f.kinds.size || f.statuses.size || ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax'].some((k) => f[k] !== ''); };
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
  state.scene?.request();
}
let fromPop = false, seeded = false, pushed = 0, histDepth = 0, seedDepth = 0, histBlock = '';
let skipFiltersParam = false;
let blockSwallow = false;
let bootQuery = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
let mapMode = null;
function depthNow() { if (state.apt) return 4; return { intro: 0, towers: 1, block: 2, floor: 3 }[state.view] ?? 0; }
function urlForState() {
  const p = new URLSearchParams();
  if (!renderMode && mapMode === 'neighborhood' && state.view === 'intro' && !state.apt) p.set('view', 'neighborhood');
  else if (!renderMode && (!state.view || state.view === 'intro')) p.set('view', '3d');
  else if (state.view && state.view !== 'intro') p.set('view', state.view);
  if (state.tower && (state.view === 'block' || state.view === 'floor' || state.apt)) p.set('tower', state.tower);
  if (state.view === 'floor' && state.floor != null) p.set('floor', String(state.floor));
  if (state.apt) p.set('apt', state.apt);
  if (state.filters?.block) p.set('block', state.filters.block);
  if (getLang() === 'en' || getLang() === 'ru') p.set('lang', getLang());
  if (bootQuery.get('webgl') === '0') p.set('webgl', '0');
  if (bootQuery.get('bg') === 'real') p.set('bg', 'real');
  const quality = bootQuery.get('quality'); if (quality) p.set('quality', quality);
  const light = bootQuery.get('light'); if (light) p.set('light', light);
  if (!$('#filters').hidden && !skipFiltersParam) p.set('filters', '1');
  // A bare render landing needs no mode flag. Add it only when another param would open 3D on reload.
  const view = p.get('view');
  const forces3d = view === '3d' || view === 'block' || view === 'floor' || view === 'towers' || view === 'neighborhood'
    || p.get('apt') || p.get('tower') || p.get('floor') || p.get('filters') === '1'
    || p.get('bg') === 'real' || p.get('webgl') === '0' || p.get('quality') || p.get('light');
  if (renderMode && forces3d) p.set('mode', 'render');
  // Marketing params must stay on the URL. Bitrix reads utm_*, gclid and fbclid from location.
  for (const [key, value] of bootQuery.entries()) {
    if (key.startsWith('utm_') || key === 'gclid' || key === 'fbclid') p.set(key, value);
  }
  const q = p.toString();
  return location.pathname + (q ? `?${q}` : '');
}
function syncHistory() {
  if (fromPop || !state.doc) return;
  const url = urlForState();
  const d = depthNow();
  const here = location.pathname + location.search;
  const blockNow = state.filters?.block || '';
  if (!seeded) { history.replaceState({ hisni: d, render: renderMode, block: blockNow }, '', url); seeded = true; histDepth = d; seedDepth = d; pushed = 0; histRender = renderMode; histBlock = blockNow; return; }
  if (here === url) { histDepth = d; histRender = renderMode; histBlock = blockNow; return; }
  const crossing = histRender !== renderMode;
  const blockChanged = blockNow !== histBlock;
  if (crossing || d > histDepth || blockChanged) { history.pushState({ hisni: d, render: renderMode, block: blockNow }, '', url); pushed += 1; }
  else history.replaceState({ hisni: d, render: renderMode, block: blockNow }, '', url);
  histDepth = d;
  histRender = renderMode;
  histBlock = blockNow;
}
function applyDeepLink(params) {
  mapMode = params.get('view') === 'neighborhood' ? 'neighborhood' : null;
  const aptId = params.get('apt');
  if (aptId && aptById(aptId)) {
    const a = aptById(aptId);
    Object.assign(state, { view: 'floor', tower: a.block, floor: a.floor, apt: a.id });
    state.filters.block = a.block;
    return;
  }
  const v = params.get('view');
  if (v === 'floor') Object.assign(state, { view: 'floor', tower: params.get('tower') || 'III', floor: +(params.get('floor') || 20), apt: null });
  else if (v === 'block') Object.assign(state, { view: 'block', tower: params.get('tower') || 'III', floor: null, apt: null });
  else if (v === 'towers') Object.assign(state, { view: 'towers', tower: null, floor: null, apt: null });
  else Object.assign(state, { view: 'intro', tower: null, floor: null, apt: null });
  const block = params.get('block');
  const known = block && state.doc?.blocks?.some((b) => b.id === block);
  if (known && state.tower !== block) {
    state.view = 'block';
    state.tower = block;
    state.floor = null;
    state.apt = null;
  }
  state.filters.block = (state.view === 'block' || state.view === 'floor') ? (state.tower || null) : (known ? block : null);
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
  seeded = true; seedDepth = 0; histDepth = d; pushed = d; histRender = renderMode; histBlock = state.filters?.block || '';
}
function renderShell() {
  paintIntro();
  if (state.apt && aptById(state.apt)) { renderCrumbs(); renderExplorer(); renderCard(); }
  else { showOnly(state.view === 'intro' ? 'intro' : 'explorer'); renderCrumbs(); renderExplorer(); }
}
function applyHistoryUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get('lang');
  if (lang === 'en' || lang === 'ka' || lang === 'ru') setLang(lang);
  const toRender = !wants3D(p);
  if (toRender) {
    applyDeepLink(p);
    if (!renderMode) openRender();
    else {
      const block = state.filters.block;
      if (block) renderApi?.setBlock(block);
      else renderApi?.setBlock(null);
      blockMenu?.refresh();
      document.documentElement.dataset.view = state.view;
      renderCrumbs();
      if (state.view === 'intro') { $('#explorer').hidden = true; $('#apt-card').hidden = true; }
      if (p.get('filters') === '1') { showOnly('filters'); renderFilters(); }
      else if (!$('#filters').hidden) renderFilters();
    }
    paintViewToggle();
    return;
  }
  if (renderMode) {
    renderMode = false;
    app.classList.remove('is-render');
    document.documentElement.classList.remove('boot-render');
    renderApi?.hide();
  }
  applyDeepLink(p);
  paintViewToggle();
  const show3D = () => {
    if (state.apt && aptById(state.apt)) { setView('floor', { tower: state.tower, floor: state.floor, apt: state.apt }); renderCard(); }
    else if (state.view === 'floor') setView('floor', { tower: state.tower, floor: state.floor });
    else if (state.view === 'block') setView('block', { tower: state.tower });
    else if (state.view === 'towers') setView('towers', { tower: null });
    else setView('intro', { tower: null, floor: null });
    if (p.get('filters') === '1') { showOnly('filters'); renderFilters(); }
    else if (!$('#filters').hidden) renderFilters();
    blockMenu?.refresh();
  };
  const paintRestored = () => {
    document.documentElement.dataset.view = state.view;
    blockMenu?.refresh();
    if (p.get('filters') === '1') { showOnly('filters'); renderFilters(); }
    else if (!$('#filters').hidden) renderFilters();
  };
  if (!state.scene && !app.classList.contains('fallback')) {
    paintRestored();
    const webgl = hasWebGL() && p.get('webgl') !== '0';
    if (!webgl) { startFallback(); return; }
    start3D(p, ctxPromise);
    return;
  }
  show3D();
  paintRestored();
}
window.addEventListener('popstate', () => {
  if (tourOpen || tourClosing) {
    tourOpen = false;
    tourPushed = false;
    tourClosing = false;
    hideTour();
    return;
  }
  fromPop = true;
  applyHistoryUrl();
  histDepth = typeof history.state?.hisni === 'number' ? history.state.hisni : depthNow();
  histBlock = state.filters?.block || '';
  histRender = renderMode;
  pushed = Math.max(0, histDepth - seedDepth);
  fromPop = false;
});
let tourOpen = false;
let tourPushed = false;
let tourClosing = false;
let tourView = 1;
let tourMod = null;
let tourReady = false;
let tourChain = Promise.resolve();
function paintTourChrome() {
  const dlg = $('#tour');
  if (!dlg) return;
  dlg.setAttribute('aria-label', t('tour'));
  const close = $('#tour-close');
  if (close) close.textContent = t('close');
  const sw = dlg.querySelector('.tour-switch');
  if (sw) sw.innerHTML = [1, 2, 3].map((n) => `<button type="button" data-tour-switch="${n}" aria-pressed="${n === tourView}">${t('tourScene')} ${n}</button>`).join('');
  const status = dlg.querySelector('.tour-status');
  if (status && !status.hidden && !tourMod) status.textContent = t('tourFail');
}
function hideTour() {
  tourReady = false;
  const dlg = $('#tour');
  if (dlg?.open) dlg.close();
  tourMod?.destroy();
}
function requestCloseTour() {
  if (!tourOpen || tourClosing) return;
  if (tourPushed) { tourClosing = true; history.back(); }
  else { tourOpen = false; hideTour(); }
}
function openTour(n) {
  const view = [1, 2, 3].includes(+n) ? +n : 1;
  tourView = view;
  const dlg = $('#tour');
  paintTourChrome();
  const status = dlg.querySelector('.tour-status');
  if (!tourReady) { status.hidden = false; status.textContent = t('tourLoading'); }
  if (!dlg.open) dlg.showModal();
  if (!tourOpen) {
    tourOpen = true;
    tourClosing = false;
    history.pushState({ ...(history.state || {}), hisni: typeof histDepth === 'number' ? histDepth : 0, tour: view }, '', location.href);
    tourPushed = true;
  }
  const job = tourChain.then(async () => {
    tourMod = tourMod || await import('./tour.js');
    if (!tourOpen) return;
    await tourMod.mount($('#tour-stage'), tourView);
    if (!tourOpen) { tourMod.destroy(); return; }
    tourReady = true;
    status.hidden = true;
  }).catch((e) => {
    console.warn('[hisni] 360 tour', e);
    if (!tourOpen) return;
    status.hidden = false;
    status.textContent = t('tourFail');
  });
  tourChain = job.then(() => {}, () => {});
}
$('#tour')?.addEventListener('cancel', (e) => { e.preventDefault(); requestCloseTour(); });
$('#tour-close')?.addEventListener('click', () => requestCloseTour());
$('#tour')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tour-switch]');
  if (!b) return;
  openTour(b.dataset.tourSwitch);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tour-view]');
  if (!b || b.closest('#tour')) return;
  openTour(b.dataset.tourView);
});
function setView(v, opts = {}) {
  const keepSheet = !!opts.keepSheet;
  const next = { ...opts };
  delete next.keepSheet;
  expandSheet();
  Object.assign(state, { view: v }, next);
  document.documentElement.dataset.view = v;
  const S = state.scene;
  if (S) {
    if (v === 'intro') { S.clearFloor(); S.highlightTower(null); if (mapMode === 'neighborhood') S.views.neighborhood(); else S.views.overview(); }
    if (v === 'towers') { S.clearFloor(); S.highlightTower(null); S.views.towers(); }
    if (v === 'block') { S.clearFloor(); S.highlightTower(state.tower); S.focusTower(state.tower); }
    if (v === 'floor') { S.highlightTower(null); S.buildFloor(state.tower, state.floor, floorApts(), (a) => statusColorHex[a.status] ?? 0x999999); recolor(); S.focusFloor(state.tower, state.floor); }
  }
  if (v !== 'floor') state.apt = null;
  state.filters.block = (v === 'block' || v === 'floor') ? (state.tower || null) : null;
  if (keepSheet && !$('#filters').hidden) {
    renderCrumbs();
    renderExplorer();
    const body = $('#explorer-body'); if (body) body.scrollTop = 0;
    syncHistory();
    blockMenu?.refresh();
    markTowerBadges();
    renderFilters();
    recolor();
    renderApi?.refresh();
    track('view_change', { view: state.view, tower: state.tower || '', floor: state.floor ?? '' });
    return;
  }
  showOnly(v === 'intro' ? 'intro' : 'explorer');
  renderCrumbs(); renderExplorer();
  const body = $('#explorer-body'); if (body) body.scrollTop = 0;
  syncHistory();
  blockMenu?.refresh();
  markTowerBadges();
  track('view_change', { view: state.view, tower: state.tower || '', floor: state.floor ?? '' });
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
function srcLabel(id) { const b = blockOf(id); const d = dmy(b?.snapshot) || snapDate(); return d ? `${t('priceUpdated')} ${d}` : (b?.source ? '' : t('sample')); }
function sourceNote(id) { const b = blockOf(id); if (!b?.source) return t('sampleNote'); return srcLabel(id); }
function freeCount(id) { return state.doc.apartments.filter((a) => a.block === id && a.status === 'available').length; }
function paintIntro() {
  const el = $('#intro-avail'); if (!el || !state.doc) return;
  const free = state.doc.apartments.filter((a) => a.status === 'available');
  const prices = free.filter(showsPrice).map((a) => a.price_usd);
  const min = prices.length ? Math.min(...prices) : null;
  const from = min == null ? '' : (getLang() === 'ka' ? ` · ${fmtUsd(min)}-დან` : ` · from ${fmtUsd(min)}`);
  const d = snapDate();
  const asOf = d ? (getLang() === 'ka' ? ` · ${d}-ის მდგომარეობით` : ` · as of ${d}`) : '';
  el.textContent = `${free.length} ${t('freeApts')}${from}${asOf}`;
}
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
      <div class="tower-list">${state.doc.blocks.map((b) => `<button data-tower="${b.id}" class="${b.has_data ? 'has-data' : 'is-soon'}"><strong>${b.id}</strong><small>${b.has_data ? `${freeCount(b.id)}<br>${t('avail')}` : t('soon')}</small></button>`).join('')}</div>
      <p class="note">${t('labelKey')}</p>`;
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
      <ul class="apt-list">${apts.map((a) => `<li><button data-apt="${a.id}" ${a.id === state.apt ? 'aria-current="true"' : ''} style="${filtersActive() && !matches(a) ? 'opacity:.45' : ''}"><i class="dot ${a.status}"></i><span><b>№ ${a.number}</b> · ${kindLabel(a.type.kind)}<br/><span class="meta">${a.area} ${m2()} · ${statusLabel(a.status)}</span></span>${showsPrice(a) ? `<span class="pr">${priceOf(a)}</span>` : ''}</button></li>`).join('')}</ul>
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
  track('apartment_open', { apartment_id: id });
}

function aptActions(a) {
  if (a.status === 'available') return `<button class="primary accent" data-lead><span class="cta-full">${t('cta')}</span><span class="cta-short">${t('ctaShort')}</span></button>${callLink('card')}`;
  if (a.status === 'reserved' || a.status === 'queue') return `<button class="btn-ghost" data-similar><span class="cta-full">${t('similarFree')}</span><span class="cta-short">${t('similarShort')}</span></button><button class="primary accent" data-notify><span class="cta-full">${t('notifyMe')}</span><span class="cta-short">${t('notifyShort')}</span></button>`;
  return `<button class="primary" data-similar>${t('similarFree')}</button>`;
}
function renderCard() {
  const el = $('#apt-card'); const a = state.apt && aptById(state.apt);
  if (!a) { if (!$('#apt-card').hidden) showOnly(basePanel()); return; }
  showOnly('apt');
  const ty = a.type; const tab = !ty.plan_2d ? '3d' : !ty.plan_3d ? '2d' : state.planTab; const img = tab === '3d' ? ty.plan_3d : ty.plan_2d; const src = /^https?:/.test(img) ? img : BASE + img;
  // The official tour publishes three site-wide drone views and no apartment, floor, or block map. Open view 1.
  el.innerHTML = `<div class="sheet-head"><div><p class="eyebrow">${towerName(a.block)} · ${t('floor')} ${a.floor}</p><h2>${t('apartment')} № ${a.number}</h2><p class="apt-head-meta">${showsPrice(a) ? `<b class="apt-price">${priceOf(a)}</b>` : ''}<span class="status-pill"><i class="dot ${a.status}"></i>${statusLabel(a.status)}</span></p></div><div class="head-actions"><button class="x" data-copy type="button" aria-label="${t('copyLink')}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-2v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h2V7Zm2 2v2H6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-3V9Zm2-2a1 1 0 0 0-1 1v7h3a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2Z"/></svg></button><button class="x" data-close aria-label="${t('close')}">×</button></div></div>
    <div class="apt-body">
    <div class="tabs" role="group">${ty.plan_2d ? `<button data-tab="2d" aria-pressed="${tab === '2d'}">${t('plan2d')}</button>` : ''}${ty.plan_3d ? `<button data-tab="3d" aria-pressed="${tab === '3d'}">${t('plan3d')}</button>` : ''}<button type="button" data-tour-view="1">${t('tourView')}</button></div>
    <div class="plan"><img src="${src}" alt="${kindLabel(ty.kind)}, ${a.area} ${m2()}" loading="lazy" referrerpolicy="no-referrer" /></div>
    <div class="facts">
      <div><small>${t('area')}</small><b>${a.area} ${m2()}</b></div>
      <div><small>${t('rooms')}</small><b>${kindLabel(ty.kind)}</b></div>
      <div><small>${t('orientation')}</small><b>${a.facing ? orientLabel(a.facing) : '—'}</b></div>
      ${showsPrice(a) && a.price_per_m2_usd ? `<div><small>${t('price')}</small><b>${fmtUsd(a.price_per_m2_usd)} / ${m2()}</b></div>` : ''}
    </div>
    <p class="note">* ${t('schematicNote')} ${sourceNote(a.block)}</p>
    </div>
    <div class="cta-row">${aptActions(a)}</div>`;
}
function showSimilar(a) {
  state.filters = defaultFilters();
  state.filters.statuses = new Set(['available']);
  if (a?.type?.kind) state.filters.kinds = new Set([a.type.kind]);
  filterLimit = 40;
  state.apt = null;
  showOnly('filters');
  renderFilters();
  renderExplorer();
  recolor();
  syncHistory();
  announce(t('similarFree'));
}
async function copyLink() {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); }
  catch { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  announce(t('linkCopied'));
  toast(t('linkCopied'));
  track('copy_link', { view: state.view });
}
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); app.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}
$('#apt-card').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeApt(); return; }
  if (e.target.closest('[data-copy]')) { copyLink(); return; }
  if (e.target.closest('[data-similar]')) { const a = aptById(state.apt); showSimilar(a); return; }
  if (e.target.closest('[data-notify]')) { openLead(state.apt, { notify: true }); return; }
  const tab = e.target.closest('[data-tab]'); if (tab) { state.planTab = tab.dataset.tab; renderCard(); return; }
  if (e.target.closest('[data-lead]')) openLead(state.apt);
});
$('#apt-card').addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG' || img.dataset.broken) return;
  img.dataset.broken = '1';
  const box = document.createElement('div');
  box.className = 'plan-fallback';
  box.setAttribute('role', 'status');
  box.textContent = t('planError');
  img.replaceWith(box);
}, true);

// ---------- filters ----------
let blockDropOpen = false;
function chooseBlock(id) {
  const next = id && state.doc.blocks.some((b) => b.id === id) ? id : null;
  const keep = !$('#filters').hidden;
  if (renderMode) {
    // A floor opened earlier belongs to another block now; drop it so the crumbs and list do not go stale.
    if (state.view !== 'intro' && next !== state.tower) {
      state.view = 'intro'; state.tower = null; state.floor = null; state.apt = null;
      document.documentElement.dataset.view = 'intro';
      $('#explorer').hidden = true;
      renderCrumbs();
    }
    state.filters.block = next;
    renderApi?.setBlock(next);
    blockMenu?.refresh();
    if (keep) renderFilters();
    renderExplorer();
    recolor();
    renderApi?.refresh();
    syncHistory();
    return;
  }
  if (!next) setView('intro', { tower: null, floor: null, keepSheet: keep });
  else setView('block', { tower: next, floor: null, keepSheet: keep });
}
function blockFilterField(f) {
  const blocks = state.doc.blocks;
  const current = f.block && blocks.some((b) => b.id === f.block) ? f.block : null;
  const label = current || t('allBlocks');
  const opt = (id, text, on) => `<button type="button" role="option" data-filter-block="${id}" aria-selected="${on}"><span>${text}</span>${on ? '<i class="tick" aria-hidden="true">✓</i>' : ''}</button>`;
  return `<fieldset class="block-filter"><legend>${t('block')}</legend>
    <button type="button" class="block-drop" aria-expanded="${blockDropOpen}" aria-controls="block-filter-menu">${esc(label)} <span aria-hidden="true">▾</span></button>
    ${blockDropOpen ? '<div class="block-drop-backdrop" data-block-backdrop></div>' : ''}
    <div id="block-filter-menu" class="block-drop-menu" role="listbox" aria-label="${esc(t('block'))}" ${blockDropOpen ? '' : 'hidden'}>
      ${opt('', t('allBlocks'), !current)}
      ${blocks.map((b) => opt(b.id, b.id, current === b.id)).join('')}
    </div></fieldset>`;
}
function renderFilters() {
  document.querySelectorAll('body > .block-drop-menu, body > .block-drop-backdrop').forEach((n) => n.remove());
  const el = $('#filters'); const f = state.filters;
  const scroll = el.scrollTop;
  const group = (a) => (a.status === 'available' ? 0 : a.status === 'queue' ? 1 : a.status === 'reserved' ? 2 : a.status === 'sold' ? 3 : 4);
  const priceKey = (a) => (showsPrice(a) ? Number(a.price_usd) : Number.POSITIVE_INFINITY);
  const res = state.doc.apartments.filter((a) => matches(a)).sort((x, y) => group(x) - group(y) || priceKey(x) - priceKey(y) || x.block.localeCompare(y.block) || x.floor - y.floor);
  const rangeOn = ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax'].some((k) => f[k] !== '');
  // A status chip or a range uses the full result list. Otherwise a chosen block counts available homes of that block and type.
  const viewCount = (f.statuses.size || rangeOn)
    ? res.length
    : state.doc.apartments.filter((a) => a.status === 'available' && (!f.block || a.block === f.block) && (!f.kinds.size || f.kinds.has(a.type.kind))).length;
  const kinds = ['studio', '1br', '2br'], sts = STATUSES;
  el.innerHTML = `<div class="sheet-head"><h2>${t('filters')}</h2><button class="x" data-close aria-label="${t('close')}">×</button></div>
    <form id="ff">
      ${blockFilterField(f)}
      <fieldset><legend>${t('rooms')}</legend><div class="seg">${kinds.map((k) => `<label><input type="checkbox" name="kind" value="${k}" ${f.kinds.has(k) ? 'checked' : ''}/><span>${kindLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${t('status')}</legend><div class="seg">${sts.map((k) => `<label><input type="checkbox" name="status" value="${k}" ${f.statuses.has(k) ? 'checked' : ''}/><span><i class="dot ${k}"></i>${statusLabel(k)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>${t('areaRange')}</legend><div class="range"><input name="areaMin" inputmode="decimal" placeholder="${t('min')} ${Math.floor(Math.min(...state.doc.apartments.map((x) => x.area)))}" value="${f.areaMin}" aria-label="${t('areaRange')} min"/><input name="areaMax" inputmode="decimal" placeholder="${t('max')} ${Math.ceil(Math.max(...state.doc.apartments.map((x) => x.area)))}" value="${f.areaMax}" aria-label="${t('areaRange')} max"/></div></fieldset>
      <fieldset><legend>${t('floorRange')}</legend><div class="range"><input name="floorMin" inputmode="numeric" placeholder="6" value="${f.floorMin}" aria-label="${t('floorRange')} min"/><input name="floorMax" inputmode="numeric" placeholder="36" value="${f.floorMax}" aria-label="${t('floorRange')} max"/></div></fieldset>
      <fieldset><legend>${t('priceRange')}</legend><div class="range"><input name="priceMin" inputmode="numeric" placeholder="${t('min')}" value="${f.priceMin}" aria-label="${t('priceRange')} min"/><input name="priceMax" inputmode="numeric" placeholder="${t('max')}" value="${f.priceMax}" aria-label="${t('priceRange')} max"/></div></fieldset>
    </form>
    <p><b>${res.length}</b> ${t('results')}</p>
    <ul class="apt-list results" aria-label="${t('list')}">${res.slice(0, filterLimit).map((a) => `<li><button data-apt="${a.id}"><i class="dot ${a.status}"></i><span><b>№ ${a.number}</b> · ${towerName(a.block)} · ${t('floor')} ${a.floor}<br/><span class="meta">${kindLabel(a.type.kind)} · ${a.area} ${m2()} · ${statusLabel(a.status)}</span></span>${showsPrice(a) ? `<span class="pr">${priceOf(a)}</span>` : ''}</button></li>`).join('') || `<li>${t('noResults')}</li>`}</ul>
    ${res.length > filterLimit ? `<button type="button" class="btn-ghost more" data-more>${t('showMore')} (+${Math.min(40, res.length - filterLimit)})</button>` : ''}
    <p class="note">${t('priceUpdated')} ${snapDate()}</p>
    <div class="filter-foot"><button class="btn-ghost" data-reset>${t('reset')}</button><button class="primary" data-close>${t('showList')} (${f.block ? viewCount : res.length})</button></div>`;
  el.scrollTop = scroll;
  placeBlockMenu();
}
function placeBlockMenu() {
  const btn = document.querySelector('#filters .block-drop');
  const menu = document.getElementById('block-filter-menu');
  const backdrop = document.querySelector('#filters [data-block-backdrop]');
  if (!btn || !menu || menu.hidden) return;
  if (backdrop) document.body.append(backdrop);
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  const gap = 6;
  const height = menu.offsetHeight;
  const below = window.innerHeight - r.bottom;
  const top = below >= height + gap + 8 ? r.bottom + gap : Math.max(8, r.top - height - gap);
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(Math.max(8, r.left))}px`;
  menu.style.width = `${Math.round(Math.min(r.width, window.innerWidth - 16))}px`;
}
function swallowBlockEvent() {
  blockSwallow = performance.now();
}
function closeBlockMenu() {
  blockDropOpen = false;
  document.querySelectorAll('body > .block-drop-menu, body > .block-drop-backdrop').forEach((n) => n.remove());
  const menu = document.getElementById('block-filter-menu');
  if (menu) menu.hidden = true;
  document.querySelector('#filters .block-drop')?.setAttribute('aria-expanded', 'false');
}
function pickFilterBlock(id) {
  const next = !id || id === state.filters.block ? null : id;
  closeBlockMenu();
  swallowBlockEvent();
  chooseBlock(next);
}
function readFilters() {
  const fd = new FormData($('#ff')); const f = state.filters;
  f.kinds = new Set(fd.getAll('kind')); f.statuses = new Set(fd.getAll('status'));
  for (const k of ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax']) f[k] = String(fd.get(k) || '').replace(/[^\d.]/g, '');
  filterLimit = 40;
}
let fT; let filterLimit = 40;
$('#filters').addEventListener('input', () => { clearTimeout(fT); fT = setTimeout(() => { readFilters(); const foc = document.activeElement?.name; renderFilters(); if (foc) $(`#filters [name="${foc}"]`)?.focus(); renderExplorer(); recolor(); renderApi?.refresh(); }, 250); });
document.addEventListener('pointerdown', (e) => {
  const backdrop = e.target.closest('[data-block-backdrop]');
  const blockOpt = e.target.closest('[data-filter-block]');
  if (!backdrop && !blockOpt) return;
  e.preventDefault();
  e.stopPropagation();
  if (backdrop) { closeBlockMenu(); renderFilters(); swallowBlockEvent(); return; }
  pickFilterBlock(blockOpt.dataset.filterBlock);
}, true);
const blockClickStale = () => typeof blockSwallow === 'number' && performance.now() - blockSwallow < 500;
document.addEventListener('click', (e) => {
  if (blockClickStale() && e.target.closest('.block-drop, [data-filter-block], [data-block-backdrop]')) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  const blockOpt = e.target.closest('[data-filter-block]');
  if (!blockOpt) return;
  e.preventDefault();
  e.stopPropagation();
  pickFilterBlock(blockOpt.dataset.filterBlock);
}, true);
$('#filters').addEventListener('click', (e) => {
  if (blockClickStale() && e.target.closest('.block-drop')) { e.preventDefault(); e.stopPropagation(); return; }
  if (e.target.closest('.block-drop')) { e.preventDefault(); e.stopPropagation(); blockDropOpen = !blockDropOpen; renderFilters(); return; }
  if (e.target.closest('[data-filter-block]') || e.target.closest('[data-block-backdrop]')) { e.preventDefault(); e.stopPropagation(); return; }
  if (e.target.closest('[data-reset]')) {
    blockDropOpen = false;
    state.filters = defaultFilters();
    filterLimit = 40;
    const keep = true;
    skipFiltersParam = true;
    if (renderMode) { renderApi?.setBlock(null); blockMenu?.refresh(); renderFilters(); renderExplorer(); recolor(); renderApi?.refresh(); syncHistory(); skipFiltersParam = false; return; }
    if (state.view === 'block' || state.view === 'floor') { setView('intro', { tower: null, floor: null, keepSheet: keep }); skipFiltersParam = false; return; }
    renderFilters(); renderExplorer(); recolor(); renderApi?.refresh(); syncHistory(); skipFiltersParam = false;
    return;
  }
  if (e.target.closest('[data-more]')) { filterLimit += 40; renderFilters(); return; }
  if (e.target.closest('[data-close]')) { showOnly(basePanel()); syncHistory(); return; }
  const ab = e.target.closest('[data-apt]'); if (ab) { showOnly(basePanel()); selectApt(ab.dataset.apt); }
});
// The numbers the filter sheet prints: every match, and what its View button counts.
function filterCounts() {
  const f = state.filters;
  if (!state.doc) return { total: 0, view: 0 };
  const total = state.doc.apartments.filter((a) => matches(a)).length;
  const rangeOn = ['areaMin', 'areaMax', 'floorMin', 'floorMax', 'priceMin', 'priceMax'].some((k) => f[k] !== '');
  if (!f.block || f.statuses.size || rangeOn) return { total, view: total };
  const view = state.doc.apartments.filter((a) => a.status === 'available' && a.block === f.block && (!f.kinds.size || f.kinds.has(a.type.kind))).length;
  return { total, view };
}
function openFilterSheet() {
  filterLimit = 40;
  blockDropOpen = false;
  showOnly('filters');
  const sheet = $('#filters');
  sheet.scrollTop = 0;
  renderFilters();
  sheet.scrollTop = 0;
  $('#filters input')?.focus({ preventScroll: true });
  requestAnimationFrame(() => { sheet.scrollTop = 0; });
}
$('#filter-open').addEventListener('click', () => {
  if ($('#filters').hidden) openFilterSheet();
  else showOnly(basePanel());
});

// ---------- lead form (Bitrix CRM form 6) ----------
let leadApartmentId = '';
let leadComment = '';
let bitrixLeadForm = null;
let leadSending = false;
let leadSubmitSent = false;
// One Bitrix CRM form per site language. A language without its own form uses the Georgian one.
const BITRIX_FORMS = { ka: { id: 6, key: 'k7hgdm' }, en: { id: 7, key: 'u63o72' } };
let bitrixFormAttr = '';
function bitrixFormFor(lang) { return BITRIX_FORMS[lang] || BITRIX_FORMS.ka; }
function apartmentComment(a) {
  return `${towerName(a.block)} · ${t('floor')} ${a.floor} · ${t('apartment')} ${a.number} · 3D Tour`;
}
function applyBitrixComment(form) {
  if (!form || !leadComment || typeof form.setValues !== 'function') return false;
  try {
    form.setValues({ DEAL_COMMENTS: leadComment });
    return true;
  } catch {
    return false;
  }
}
function ownBitrixForm(event) {
  const form = event.detail?.object;
  return !(bitrixLeadForm && form && form !== bitrixLeadForm);
}
function paintLeadSending() {
  const note = document.querySelector('#lead-sending');
  if (!note) return;
  note.textContent = t('formSending');
  note.hidden = !leadSending;
}
function showLeadToast() {
  let el = $('#lead-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lead-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<p></p><button type="button" class="x" aria-label="${t('close')}">×</button>`;
    el.querySelector('button').onclick = () => { el.hidden = true; clearTimeout(showLeadToast._t); };
    app.appendChild(el);
  }
  el.querySelector('p').textContent = t('formSentToast');
  el.querySelector('button').setAttribute('aria-label', t('close'));
  el.hidden = false;
  clearTimeout(showLeadToast._t);
  showLeadToast._t = setTimeout(() => { el.hidden = true; }, 6000);
}
window.addEventListener('b24:form:init', (event) => {
  const form = event.detail?.object;
  if (!form) return;
  bitrixLeadForm = form;
  applyBitrixComment(form);
});
window.addEventListener('b24:form:submit', (event) => {
  if (!ownBitrixForm(event)) return;
  leadSubmitSent = false;
  leadSending = true;
  paintLeadSending();
});
window.addEventListener('b24:form:send:success', (event) => {
  if (!ownBitrixForm(event)) return;
  leadSending = false;
  paintLeadSending();
  if (!leadSubmitSent) {
    leadSubmitSent = true;
    track('lead_submit', { result: 'ok', apartment_id: leadApartmentId, form: 'bitrix' + bitrixFormFor(getLang()).id });
  }
  const d = $('#lead');
  if (d && !d.open) showLeadToast();
});
window.addEventListener('b24:form:send:error', (event) => {
  if (!ownBitrixForm(event)) return;
  leadSending = false;
  paintLeadSending();
});
function mountBitrixForm(slot) {
  const f = bitrixFormFor(getLang());
  const attr = `inline/${f.id}/${f.key}`;
  if (bitrixFormAttr === attr && slot.querySelector('script[data-b24-form]')) return;
  // The language changed since the form was mounted: swap in that language's form.
  // Never while a send is running, so a submit in progress can finish.
  if (leadSending) return;
  [...slot.children].forEach((el) => { if (el.id !== 'lead-sending') el.remove(); });
  bitrixLeadForm = null;
  bitrixFormAttr = attr;
  const s = document.createElement('script');
  s.async = true;
  s.setAttribute('data-b24-form', attr);
  s.setAttribute('data-skip-moving', 'true');
  s.src = `https://crm.biograpi.ge/upload/crm/form/loader_${f.id}_${f.key}.js?${Date.now() / 180000 | 0}`;
  slot.appendChild(s);
}
// The agreement window is appended to body. A modal <dialog> paints in the top layer,
// above any z-index, so the window has to live inside #lead while that dialog is open.
function liftBitrixWindow() {
  const lead = document.querySelector('#lead');
  if (!lead?.open) return;
  const mount = document.querySelector('body > .b24-window-mounts');
  if (mount) lead.appendChild(mount);
}
new MutationObserver(liftBitrixWindow).observe(document.body, { childList: true });
// Desktop has nothing to place a tel: call with, so the call buttons open a WhatsApp chat there.
// Phones and tablets keep the tel: link.
const callViaWhatsApp = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const callHref = () => (callViaWhatsApp() ? CONTACT.whatsapp : CONTACT.tel);
const callAttrs = () => (callViaWhatsApp() ? `href="${CONTACT.whatsapp}" target="_blank" rel="noopener"` : `href="${CONTACT.tel}"`);
function wireCall(a) {
  a.href = callHref();
  if (callViaWhatsApp()) { a.target = '_blank'; a.rel = 'noopener'; }
  else { a.removeAttribute('target'); a.removeAttribute('rel'); }
}
const callLabel = (withNumber) => (withNumber ? `${t('call')} · ${callViaWhatsApp() ? CONTACT.whatsappPhone : CONTACT.phone}` : t('call'));
function callLink(place, withNumber = false) {
  return `<a class="call-btn" ${callAttrs()} data-call="${place}">${esc(callLabel(withNumber))}</a>`;
}
function openLead(id, { notify = false } = {}) {
  const a = aptById(id); const d = $('#lead');
  track(notify ? 'notify_open' : 'lead_open', { apartment_id: a.id });
  leadApartmentId = a.id;
  leadComment = apartmentComment(a);
  let slot = d.querySelector('#b24-form-slot');
  if (!slot) {
    d.innerHTML = `<div class="dlg lead"><div class="dlg-head"><h2>${notify ? t('notifyMe') : t('formTitle')}</h2><button class="x" data-close aria-label="${t('close')}">×</button></div>
      <div id="b24-form-slot" class="b24-slot"><p id="lead-sending" class="lead-sending" hidden></p></div>
      <div class="lead-fallback">${callLink('form', true)}</div></div>`;
    slot = d.querySelector('#b24-form-slot');
    mountBitrixForm(slot);
  } else {
    const title = d.querySelector('h2');
    if (title) title.textContent = notify ? t('notifyMe') : t('formTitle');
    mountBitrixForm(slot);
    applyBitrixComment(bitrixLeadForm);
  }
  paintLeadSending();
  d.showModal();
  // Closing only hides the dialog. The Bitrix form stays mounted so a send can finish.
  d.querySelector('[data-close]').onclick = () => d.close();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-call]');
  if (a) track('call_click', { place: a.dataset.call, via: callViaWhatsApp() ? 'whatsapp' : 'tel' });
});

// ---------- about ----------
function tourCards() {
  return `<h3>${t('tour')}</h3><div class="tour-cards">${[1, 2, 3].map((n) => `<button type="button" class="tour-card" data-tour-view="${n}"><img src="${BASE}tour/thumbs/v${n}.webp" alt="" /><span class="tour-badge">360°</span><span class="tour-card-name">${t('tourScene')} ${n}</span></button>`).join('')}</div>`;
}
function openAbout() {
  const d = $('#about'); const L = STRINGS[getLang()];
  const renders = ['aerial-day', 'aerial-night', 'exterior-01', 'exterior-02', 'view-04', 'view-07'];
  d.innerHTML = `<div class="dlg"><div class="dlg-head"><div><p class="eyebrow">${t('brandGroup')}</p><h2>${t('aboutTitle')}</h2></div><button class="x" data-close aria-label="${t('close')}">×</button></div>
    ${tourCards()}
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
document.querySelectorAll('dialog').forEach((d) => {
  if (d.id === 'tour') return;
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
});

// ---------- labels ----------
const labelEls = [];
function renderLabels() {
  const L = getLang();
  labelEls.forEach(({ el, poi, tower }) => {
    if (poi) {
      const shown = poi.short?.[L] || poi[L];
      el.dataset.len = String(shown.length);
      el.querySelector('.poi-name').textContent = shown;
      el.querySelector('.poi-min').textContent = `${poi.min} ${t('walk')}`;
      el.querySelector('button').setAttribute('aria-label', `${poi[L]}, ${poi.min} ${t('walk')}`);
    }
    if (el.dataset.tour) {
      const name = `${t('tourView')} ${el.dataset.tour}`;
      el.querySelector('.tour-name').textContent = name;
      el.querySelector('button').setAttribute('aria-label', name);
    }
    if (tower) { el.querySelector('span').textContent = tower; el.querySelector('button').setAttribute('aria-label', towerName(tower)); }
    if (el.classList.contains('project')) el.querySelector('span').textContent = t('projectName');
  });
}
function makeLabels(S) {
  const root = $('#labels');
  for (const p of POIS) {
    const el = document.createElement('div'); el.className = `label poi ${p.cat}`; el.dataset.len = '12';
    el.innerHTML = `<button type="button"><i class="poi-ico">${POI_ICON[p.cat] || ''}</i><span class="poi-name"></span><span class="poi-min"></span></button>`;
    el.querySelector('button').addEventListener('click', () => focusPoi(p)); root.appendChild(el); labelEls.push({ el, poi: p });
    S.addLabel(el, { x: p.x, y: 6, z: p.z }, 4, false);
  }
  for (const spot of S.tourAnchors || []) {
    const el = document.createElement('div');
    el.className = 'label tour-pin';
    el.dataset.tour = String(spot.id);
    el.dataset.view = String(spot.id);
    el.style.opacity = '0';
    el.innerHTML = `<button type="button" data-tour-view="${spot.id}"><i class="tour-dot" aria-hidden="true"></i><span class="tour-name"></span><span class="tour-short">360°</span></button>`;
    root.appendChild(el);
    labelEls.push({ el });
    S.addLabel(el, { x: spot.x, y: spot.y, z: spot.z }, 30, false);
  }
  for (const b of state.doc.blocks) {
    const el = document.createElement('div'); el.className = `label tower num ${b.has_data ? 'data' : ''}`; el.innerHTML = '<button><span></span></button>';
    el.querySelector('button').addEventListener('click', () => setView('block', { tower: b.id })); root.appendChild(el); labelEls.push({ el, tower: b.id });
    S.addLabel(el, S.towerLabelPos(b.id), 1, true);
  }
  renderLabels();
  syncPoi();
  markTowerBadges();
}
function focusPoi(p) {
  state.hotPoi = p.id;
  labelEls.forEach(({ el, poi }) => { if (poi) el.classList.toggle('is-hot', poi.id === p.id); });
  if (renderMode) return;
  state.scene?.focusPoint(p.x, p.z);
  state.scene?.request();
}
function showPlace(p) {
  state.place = p;
  const el = $('#place-card'); const L = getLang();
  el.innerHTML = `<div class="sheet-head"><div><p class="eyebrow">${t('poiCat')[p.cat]}</p><h3>${esc(p[L])}</h3><p>${p.min} ${t('walk')}${p.src === 'client' ? '' : ' (' + t('approx') + ')'}</p></div><button class="x" aria-label="${t('close')}">×</button></div>`;
  showOnly('place');
  el.querySelector('.x').onclick = () => { state.place = null; showOnly(basePanel()); };
}

// ---------- controls ----------
$('#start').addEventListener('click', () => setView('towers'));
$('#layers-toggle').addEventListener('click', (e) => { const o = $('#layer-options'); o.hidden = !o.hidden; e.currentTarget.setAttribute('aria-expanded', String(!o.hidden)); });
document.querySelectorAll('[data-layer]').forEach((i) => i.addEventListener('change', () => {
  if (i.dataset.layer === 'labels') {
    app.classList.toggle('hide-labels', !i.checked);
    if (!i.checked) enabledCats.clear();
    else placeCats().forEach((c) => { if (['metro', 'school', 'bus'].includes(c)) enabledCats.add(c); });
    paintPlaces();
    syncPoi();
  } else state.scene?.setLayer(i.dataset.layer, i.checked);
}));
document.querySelectorAll('[data-light]').forEach((b) => b.addEventListener('click', () => setLight(b.dataset.light)));
function setLight(m) { state.light = m; document.querySelectorAll('[data-light]').forEach((x) => { x.classList.toggle('active', x.dataset.light === m); x.setAttribute('aria-pressed', String(x.dataset.light === m)); }); app.classList.toggle('night', m === 'night'); state.scene?.setLight(m); }
function zoomIn() { if (renderMode) renderApi?.zoomBy(1.25); else state.scene?.zoom(0.8); }
function zoomOut() { if (renderMode) renderApi?.zoomBy(0.8); else state.scene?.zoom(1.25); }
$('#zoom-in').addEventListener('click', zoomIn);
$('#zoom-out').addEventListener('click', zoomOut);
$('#rotate').addEventListener('click', (e) => { const on = state.scene?.toggleRotate(); e.currentTarget.setAttribute('aria-pressed', String(!!on)); });
function goHome() {
  if (renderMode) { renderApi?.home(); return; }
  if (returnHomeToRender) {
    openRender().then(() => { renderApi?.home(); syncHistory(); });
    return;
  }
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
  if (e.key === 'Escape' && tourOpen) { e.preventDefault(); requestCloseTour(); return; }
  if (e.target.closest('input, dialog, #render-block-menu')) return;
  if (e.key === 'Escape') { if (!$('#apt-card').hidden) closeApt(); else if (!$('#filters').hidden || !$('#place-card').hidden) { showOnly(basePanel()); syncHistory(); } else if (renderMode) { /* render view clears its own selection */ } else if (state.view === 'floor') setView('block'); else if (state.view === 'block') setView('towers', { tower: null }); else if (state.view === 'towers') setView('intro'); }
  if (renderMode) {
    if (e.key === 'Home') { e.preventDefault(); $('#reset').click(); }
    if (e.key === '+' || e.key === '=') zoomIn();
    if (e.key === '-' || e.key === '_') zoomOut();
    return;
  }
  if (e.key === 'Home') $('#reset').click();
  if (e.key === '+' || e.key === '=') zoomIn();
  if (e.key === '-') zoomOut();
  if (e.key === 'ArrowLeft') { e.preventDefault(); state.scene?.nudge(0.18, 0); }
  if (e.key === 'ArrowRight') { e.preventDefault(); state.scene?.nudge(-0.18, 0); }
  if (e.key === 'ArrowUp') { e.preventDefault(); state.scene?.nudge(0, -0.08); }
  if (e.key === 'ArrowDown') { e.preventDefault(); state.scene?.nudge(0, 0.08); }
});

function showHint() {
  if (localStorage.getItem('hisni-hint')) return;
  const h = $('#hint'); h.hidden = false;
  state.scene?.request();
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    h.hidden = true;
    localStorage.setItem('hisni-hint', '1');
    state.scene?.request();
    document.removeEventListener('pointerdown', onDoc, true);
  };
  // Swallow the whole gesture on the strip so it cannot fall through to a tower label.
  ['pointerdown', 'pointerup', 'click', 'touchend'].forEach((type) => {
    h.addEventListener(type, (e) => {
      e.stopPropagation();
      if (type !== 'pointerdown') requestAnimationFrame(done);
    }, true);
  });
  const onDoc = (e) => { if (!h.contains(e.target)) done(); };
  document.addEventListener('pointerdown', onDoc, true);
}

// cheap capability check; real context creation failure is handled in boot()
function hasWebGL() { return !!(window.WebGL2RenderingContext || window.WebGLRenderingContext); }

const PLACE_ORDER = ['metro', 'school', 'kinder', 'health', 'bus', 'shop', 'bank'];
const enabledCats = new Set(['metro', 'school', 'bus']);
let placesOpen = false;
let placesListOpen = false;
// Render view has no map to pin places on, so the chosen categories show as cards over the still.
let placeCardsOn = false;
let introHold = null;
const placesPhone = () => matchMedia('(max-width: 500px), (max-height: 500px) and (max-width: 960px)').matches;
function placeCats() {
  const present = new Set(POIS.map((p) => p.cat));
  return PLACE_ORDER.filter((c) => present.has(c));
}
function paintPlaces() {
  const btn = $('#places-btn');
  const panel = $('#places-panel');
  const cats = $('#places-cats');
  const list = $('#places-list');
  if (!btn || !panel || !cats || !list) return;
  const allOn = placeCats().every((c) => enabledCats.has(c));
  btn.textContent = t('places');
  btn.setAttribute('aria-expanded', String(placesOpen));
  btn.setAttribute('aria-label', t('places'));
  panel.hidden = !placesOpen;
  $('#places-panel')?.setAttribute('aria-label', t('places'));
  const buttons = [`<button type="button" data-cat="all" aria-pressed="${allOn}">${t('placesAll')}</button>`];
  const catIds = placeCats();
  const lead = ['metro', 'school', 'bus'].filter((c) => catIds.includes(c));
  for (const c of [...lead, ...catIds.filter((c) => !lead.includes(c))]) {
    buttons.push(`<button type="button" data-cat="${c}" aria-pressed="${enabledCats.has(c)}">${t('poiCat')[c]}</button>`);
  }
  cats.innerHTML = buttons.join('');
  const listBtn = $('#places-list-toggle');
  if (listBtn) {
    listBtn.textContent = placesListOpen ? t('placesHide') : t('placesList');
    listBtn.setAttribute('aria-expanded', String(placesListOpen));
  }
  list.hidden = !placesListOpen;
  const L = getLang();
  const rows = POIS.filter((p) => enabledCats.has(p.cat));
  list.innerHTML = rows.map((p) => `<li><button type="button" data-poi="${p.id}"><i class="poi-ico">${POI_ICON[p.cat] || ''}</i><span>${esc(p[L])}</span><small>${p.min} ${esc(t('walk'))}</small></button></li>`).join('');
  paintPlaceCards();
}
function paintPlaceCards() {
  const box = $('#render-places');
  if (!box) return;
  const rows = POIS.filter((p) => enabledCats.has(p.cat));
  const show = renderMode && placeCardsOn && rows.length > 0;
  box.hidden = !show;
  if (!show) { box.innerHTML = ''; return; }
  const L = getLang();
  box.setAttribute('aria-label', t('places'));
  box.innerHTML = rows.map((p) => `<div class="place-chip ${p.cat}" role="listitem" title="${esc(p[L])}"><i class="poi-ico">${POI_ICON[p.cat] || ''}</i><span class="pc-name">${esc(p.short?.[L] || p[L])}</span><small>${p.min} ${esc(t('walk'))}</small></div>`).join('')
    + `<button type="button" class="place-chip-x" data-places-hide aria-label="${esc(t('placesCardsHide'))}" title="${esc(t('placesCardsHide'))}">×</button>`;
}
$('#render-places')?.addEventListener('click', (e) => {
  if (!e.target.closest('[data-places-hide]')) return;
  placeCardsOn = false;
  paintPlaceCards();
});
function syncPoi() {
  const hideAll = app.classList.contains('hide-labels');
  labelEls.forEach(({ el, poi }) => {
    if (!poi) return;
    const on = enabledCats.has(poi.cat) && !hideAll;
    el.hidden = !on;
    el.classList.toggle('poi-on', on);
  });
  const box = document.querySelector('[data-layer="labels"]');
  if (box) box.checked = enabledCats.size > 0 && !hideAll;
  state.scene?.request();
}
function markTowerBadges() {
  labelEls.forEach(({ el, tower }) => {
    if (!tower) return;
    el.classList.toggle('is-on', !!tower && tower === state.tower && (state.view === 'block' || state.view === 'floor'));
  });
}
function pickedBlock() {
  if (renderMode) return renderApi?.block() || null;
  if (state.view === 'block' || state.view === 'floor') return state.tower || null;
  return null;
}
const blockMenu = mountBlockMenu($('#block-menu-root'), {
  t,
  blocks: () => state.doc?.blocks || [],
  freeCount,
  optionLabel: (id) => {
    const b = blockOf(id);
    if (!b?.has_data) return `${id} ${t('soon')}`;
    return `${id} ${freeCount(id)} ${t('avail')}`;
  },
  selected: pickedBlock,
  onSelect(id) {
    state.filters.block = id || null;
    if (renderMode) {
      renderApi?.setBlock(id);
      if (!id) clearRenderSelection();
      else if (blockOf(id)?.has_data) closeRenderSheet();
      blockMenu?.refresh();
      if (!$('#filters').hidden) renderFilters();
      renderApi?.refresh();
      syncHistory();
      return;
    }
    if (!id) setView('intro', { tower: null, floor: null });
    else setView('block', { tower: id });
  },
});
function restoreIntroAfterPlaces() {
  if (introHold == null) return;
  applyIntroCollapsed(introHold, false);
  introHold = null;
}
function closePlaces() {
  if (!placesOpen) return;
  placesOpen = false;
  placesListOpen = false;
  restoreIntroAfterPlaces();
  paintPlaces();
  state.scene?.request();
}
$('#places-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (placesOpen) { closePlaces(); return; }
  placesOpen = true;
  placeCardsOn = true;
  if (placesPhone()) {
    if (introHold == null) introHold = $('#intro').classList.contains('is-collapsed');
    placesListOpen = false;
    applyIntroCollapsed(true, false);
  }
  blockMenu?.close();
  paintPlaces();
  state.scene?.request();
});
$('#places-list-toggle')?.addEventListener('click', () => {
  placesListOpen = !placesListOpen;
  paintPlaces();
  state.scene?.request();
});
$('#places-list')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-poi]');
  if (!b) return;
  const p = POIS.find((x) => x.id === b.dataset.poi);
  if (!p) return;
  if (placesPhone()) {
    placesListOpen = false;
    paintPlaces();
  }
  focusPoi(p);
});
$('#places-cats')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const cat = b.dataset.cat;
  if (cat === 'all') {
    const cats = placeCats();
    const allOn = cats.every((c) => enabledCats.has(c));
    enabledCats.clear();
    if (!allOn) cats.forEach((c) => enabledCats.add(c));
  } else if (enabledCats.has(cat)) enabledCats.delete(cat);
  else enabledCats.add(cat);
  if (enabledCats.size) app.classList.remove('hide-labels');
  else app.classList.add('hide-labels');
  placeCardsOn = true;
  paintPlaces();
  syncPoi();
});
document.addEventListener('pointerdown', (e) => {
  if (!placesOpen || e.target.closest('.places-wrap')) return;
  closePlaces();
});
function renderHooks() {
  return {
    t, lang: getLang, callAttrs, towerName, statusLabel,
    counts: filterCounts,
    showList: openFilterSheet,
    apartments: () => state.doc.apartments,
    blockIds: () => state.doc.blocks.map((b) => b.id),
    block: blockOf,
    freeCount, floorCount, floorCountLabel, matches, filtersActive,
    filters: () => state.filters,
    readFilters(fd) {
      const f = state.filters;
      f.kinds = new Set(fd.getAll('kind'));
      f.statuses = new Set(fd.getAll('status'));
      for (const k of ['areaMin', 'areaMax', 'floorMin', 'floorMax']) f[k] = String(fd.get(k) || '').replace(/[^\d.]/g, '');
      renderExplorer(); recolor();
      if (!$('#filters').hidden) renderFilters();
    },
    resetFilters() { state.filters = defaultFilters(); renderExplorer(); recolor(); if (!$('#filters').hidden) renderFilters(); },
    onFloor(id, floor) { setView('floor', { tower: id, floor }); },
    onSoon(id) { setView('block', { tower: id }); },
    onBlock(id) {
      state.filters.block = id || null;
      if (renderMode && !id) clearRenderSelection();
      else if (renderMode && blockOf(id)?.has_data) closeRenderSheet();
      blockMenu?.refresh();
      if (!$('#filters').hidden) renderFilters();
    },
  };
}
async function openRender() {
  renderMode = true;
  app.classList.add('is-render', 'render-armed');
  paintViewToggle();
  closeRenderSheet();
  if (!renderApi) {
    const { createRenderView } = await loadRenderView();
    renderApi = await createRenderView(renderHooks());
  }
  const carry = (state.view === 'block' || state.view === 'floor') ? state.tower : null;
  await renderApi?.show();
  if (carry) renderApi?.setBlock(carry);
  blockMenu?.refresh();
  paintPlaceCards();
  $('#loading').classList.add('done');
}
async function leaveRender() {
  returnHomeToRender = true;
  renderMode = false;
  app.classList.remove('is-render');
  app.classList.add('render-armed');
  document.documentElement.classList.remove('boot-render');
  renderApi?.hide();
  paintViewToggle();
  paintPlaceCards();
  const carried = renderApi?.block() || null;
  if (carried) { state.view = 'block'; state.tower = carried; state.floor = null; state.apt = null; }
  else { state.view = 'intro'; state.tower = null; state.floor = null; state.apt = null; }
  document.documentElement.dataset.view = state.view;
  const hadScene = !!state.scene;
  if (!state.scene) {
    const webgl = hasWebGL() && bootQuery.get('webgl') !== '0';
    if (!webgl) startFallback();
    else {
      try { await start3D(bootQuery, ctxPromise); } catch (e) { console.warn('[hisni] 3D unavailable, falling back', e); $('#viewport').innerHTML = ''; startFallback(); }
    }
  }
  showOnly(state.view === 'intro' ? 'intro' : 'explorer');
  if (hadScene && state.view === 'block') setView('block', { tower: state.tower });
  else if (hadScene && state.view === 'intro') setView('intro', { tower: null, floor: null });
  blockMenu?.refresh();
  syncHistory();
}
$('#view-toggle')?.addEventListener('click', () => { if (renderMode) leaveRender(); else openRender().then(() => syncHistory()); });

// ---------- boot ----------
async function boot() {
  const params = new URLSearchParams(location.search);
  bootQuery = params;
  const lang = params.get('lang');
  if (lang === 'en' || lang === 'ka' || lang === 'ru') setLang(lang);
  renderMode = !wants3D(params);
  app.classList.add('render-armed');
  if (renderMode) app.classList.add('is-render');
  applyI18n();
  ctxPromise = fetch(`${BASE}data/context.json`).then((r) => r.json());
  state.doc = await loadApartments(BASE);
  blockMenu?.refresh();
  paintPlaces();
  syncPoi();
  // Parse the landing URL before any history write. syncHistory used to replaceState
  // the overview while the query string was still unread, which wiped every deep link.
  applyDeepLink(params);
  seedHistory();
  document.documentElement.dataset.view = state.view;
  renderShell();
  if (params.get('filters') === '1') {
    showOnly('filters'); renderFilters();
    history.replaceState({ hisni: histDepth }, '', urlForState());
  }
  window.__hisni = window.__hisni || { state };
  track('page_view', { view: renderMode ? 'render' : state.view, lang: getLang() });
  if (renderMode) { await openRender(); return; }
  const webgl = hasWebGL() && params.get('webgl') !== '0';
  if (!webgl) return startFallback();
  // let the UI paint first, then build the 3D scene
  await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 600 }) : setTimeout(r, 200)));
  try { await start3D(params, ctxPromise); } catch (e) { console.warn('[hisni] 3D unavailable, falling back', e); $('#viewport').innerHTML = ''; startFallback(); }
}
function startFallback() {
    app.classList.add('fallback'); app.classList.remove('scene-loading'); $('#loading').classList.add('done');
    state.view = 'block'; state.tower = 'III'; showOnly('explorer'); renderCrumbs(); renderExplorer();
    $('#explorer-body').insertAdjacentHTML('afterbegin', `<p class="placeholder">${t('webglOff')}</p><img class="fallback-plan" src="${BASE}plans/block3-typical-floor.webp" alt="${t('typeL')}" width="600" height="760"/>`);
}
async function start3D(params, ctxP) {
  const weak = params.get('quality') === 'low' || (params.get('quality') !== 'high' && (matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4));
  $('#loading').classList.add('mini');
  // The aerial render fills the screen while the model builds. The 3D home view opens on the same angle.
  const poster = $('#poster-3d');
  if (poster) { poster.style.backgroundImage = `url("${BASE}renders/aerial-day.webp")`; app.classList.add('scene-loading'); }
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
      if (hit.kind === 'apt') { const a = aptById(hit.id); tip.textContent = `№ ${a.number} · ${kindLabel(a.type.kind)} · ${a.area} ${m2()}${showsPrice(a) ? ` · ${priceOf(a)}` : ''} · ${statusLabel(a.status)}`; }
      else { tip.textContent = towerName(hit.id); if (state.view === 'towers' || state.view === 'intro') S.highlightTower(hit.id); }
    },
  });
  state.scene = S; window.__hisni = { S, state };
  makeLabels(S);
  const needle = $('#needle');
  S.controls.addEventListener('change', () => { needle.style.transform = `rotate(${(S.controls.getAzimuthalAngle() * 180) / Math.PI}deg)`; });
  setLight(params.get('light') || 'day');
  requestAnimationFrame(() => {
    $('#loading').classList.add('done'); app.classList.remove('scene-loading'); showHint();
    if (params.get('bg') === 'real') {
      const bar = $('#bg-switch');
      if (bar) bar.hidden = false;
      selectPano('1');
    }
  });
  // Camera follows the state parsed in boot(). fromPop keeps this from pushing another entry.
  const prevPop = fromPop; fromPop = true;
  if (state.apt) { setView('floor', { tower: state.tower, floor: state.floor, apt: state.apt }); renderCard(); }
  else if (state.view !== 'intro') setView(state.view, { tower: state.tower, floor: state.floor });
  else if (mapMode === 'neighborhood') S.views.neighborhood();
  if (params.get('filters') === '1') { showOnly('filters'); renderFilters(); }
  fromPop = prevPop;
}
let panoId = null;
function selectPano(id) {
  const prev = panoId;
  panoId = id;
  state.scene?.setRealView(id);
  document.querySelectorAll('#bg-switch [data-pano]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pano === id)));
  if (state.view === 'intro' && !state.apt && (id === 'standard' || prev === 'standard' || prev == null)) state.scene?.views.overview();
}
$('#bg-switch')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pano]');
  if (!b) return;
  selectPano(b.dataset.pano);
});
boot();
