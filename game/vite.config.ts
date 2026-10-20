import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: { input: process.env.ROADSTER_PROVISIONAL_ONLY === '1' ? { preview: fileURLToPath(new URL('./preview.html', import.meta.url)) } : process.env.ROADSTER_PILOT_ONLY === '1' ? { pilot: fileURLToPath(new URL('./pilot.html', import.meta.url)) } : { main: fileURLToPath(new URL('./index.html', import.meta.url)), pilot: fileURLToPath(new URL('./pilot.html', import.meta.url)) } },
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
