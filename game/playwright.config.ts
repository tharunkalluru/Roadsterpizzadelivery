import { defineConfig } from '@playwright/test';

// Uses the preinstalled Chromium (software WebGL via SwiftShader in CI containers).
// The production bundle is served by `vite preview` — the smoke tests exercise dist/, not a dev server.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'qa/artifacts/e2e/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
