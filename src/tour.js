// Tiles copied from gdvali777-jpg/HISNI-360 (v1, v2, v3) and saved as WebP.
// Three multires cube panoramas. Nothing is loaded from hisni.biograpi.ge.
const BASE = import.meta.env.BASE_URL;
export const TOUR_VIEWS = [1, 2, 3];
export const tourThumb = (n) => `${BASE}tour/thumbs/v${n}.webp`;

let viewer = null;
let lib = null;
let pending = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(src)); };
    document.head.appendChild(s);
  });
}

function ensureLib() {
  if (window.pannellum) return Promise.resolve();
  if (!lib) {
    lib = (async () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${BASE}tour/pannellum.css`;
      document.head.appendChild(link);
      await loadScript(`${BASE}tour/pannellum.js`);
      if (!window.pannellum) throw new Error('pannellum');
    })();
  }
  return lib;
}

function scene(n) {
  return {
    type: 'multires',
    multiRes: {
      basePath: `${BASE}tour/v${n}`,
      path: '/%l/%s%y_%x',
      fallbackPath: '/fallback/%s',
      extension: 'webp',
      tileResolution: 512,
      maxLevel: 4,
      cubeResolution: 3072,
    },
    hfov: 100,
  };
}

async function mountNow(container, view) {
  await ensureLib();
  const id = TOUR_VIEWS.includes(view) ? view : 1;
  if (viewer) {
    viewer.loadScene('view' + id);
    return;
  }
  const scenes = {};
  TOUR_VIEWS.forEach((n) => { scenes['view' + n] = scene(n); });
  viewer = window.pannellum.viewer(container, {
    default: {
      firstScene: 'view' + id,
      autoLoad: true,
      sceneFadeDuration: 400,
      showControls: false,
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      compass: false,
      crossOrigin: 'anonymous',
      backgroundColor: [0.549, 0.6, 0.325],
      minHfov: 50,
      maxHfov: 120,
    },
    scenes,
  });
}
export function mount(container, view) {
  const run = (pending || Promise.resolve()).then(() => mountNow(container, view));
  pending = run.then(() => {}, () => {});
  return run;
}

export function load(view) {
  const id = TOUR_VIEWS.includes(view) ? view : 1;
  if (viewer) viewer.loadScene('view' + id);
}

export function destroy() {
  if (!viewer) return;
  viewer.destroy();
  viewer = null;
}
