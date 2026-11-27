import { defineConfig } from '@playwright/test';

// UI tests run against the Vite dev server. WebGL uses SwiftShader so the 3D view renders headless.
const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: Object.entries(viewports).map(([name, viewport]) => ({
    name,
    use: { viewport, hasTouch: viewport.width < 900 || viewport.height < 500, isMobile: viewport.width < 500 || viewport.height < 500 },
  })),
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/',
    reuseExistingServer: true,
  },
});
