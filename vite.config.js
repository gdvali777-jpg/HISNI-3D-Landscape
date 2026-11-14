import { defineConfig } from 'vite';
import { STRINGS } from './src/i18n.js';

// Pre-render the Georgian UI strings into index.html so text paints before JS runs.
const prefillI18n = () => ({
  name: 'prefill-i18n',
  transformIndexHtml(html) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return html.replace(/data-i18n="([\w]+)"([^>]*)><\/(\w+)>/g, (m, k, rest, tag) => `data-i18n="${k}"${rest}>${esc(STRINGS.ka[k] ?? '')}</${tag}>`);
  },
});

// Inline the (small) stylesheet into index.html to remove a render-blocking request.
const inlineCss = () => ({
  name: 'inline-css',
  enforce: 'post',
  generateBundle(_, bundle) {
    const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
    if (!html) return;
    for (const [name, f] of Object.entries(bundle)) {
      if (!name.endsWith('.css')) continue;
      const tag = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${name.split('/').pop()}"[^>]*>`);
      const css = String(f.source).replaceAll('../fonts/', './fonts/');
      html.source = String(html.source).replace(tag, `<style>${css}</style>`);
      delete bundle[name];
    }
  },
});

// GitHub Pages project path. Vite prefixes public URLs (`/fonts/…`) and
// `import.meta.env.BASE_URL` (data, plans, renders) with this. Dev and preview
// serve the same path, so local URLs match production.
const PAGES_BASE = '/HISNI-3D-Landscape/';

export default defineConfig({
  base: PAGES_BASE,
  plugins: [prefillI18n(), inlineCss()],
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
