import { defineConfig } from 'vite';
import { gameBuildFingerprint } from './scripts/build-fingerprint.mjs';
export { gameBuildFingerprint } from './scripts/build-fingerprint.mjs';
export default defineConfig(() => ({ base: './', define: { __ROADSTER_BUILD__: JSON.stringify(gameBuildFingerprint(process.cwd())) }, build: { target: 'es2022', chunkSizeWarningLimit: 1500 } }));
