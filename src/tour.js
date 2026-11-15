// Official Hisni drone tour: https://hisni.biograpi.ge
// Three multires cube panoramas (v1, v2, v3). Tiles allow cross-origin use
// (Access-Control-Allow-Origin: *). The page ships exactly these three views.
const ORIGIN = 'https://hisni.biograpi.ge';
export const TOUR_VIEWS = [1, 2, 3];
export const tourThumb = (n) => `${ORIGIN}/v${n}/1/f0_0.jpg`;

const CSS = [
  'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css',
  `${ORIGIN}/pannellum.css`,
];
const JS = [
  'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js',
  `${ORIGIN}/pannellum.js`,
];

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
      let last;
      for (let i = 0; i < JS.length; i++) {
        try {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = CSS[i];
          document.head.appendChild(link);
          await loadScript(JS[i]);
          if (window.pannellum) return;
        } catch (e) { last = e; }
      }
      throw last || new Error('pannellum');
    })();
  }
  return lib;
}

function scene(n) {
  return {
    type: 'multires',
    multiRes: {
      basePath: `${ORIGIN}/v${n}`,
      path: '/%l/%s%y_%x',
      fallbackPath: '/fallback/%s',
      extension: 'jpg',
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
