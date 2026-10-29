import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
export function gameBuildFingerprint(root: string) {
  const hash = createHash('sha256');
  const collect = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? collect(join(dir, e.name)) : [join(dir, e.name)]);
  const files = [...collect(join(root, 'src')), ...collect(join(root, 'worker')), ...collect(join(root, 'public', 'city')), join(root, 'package-lock.json')];
  for (const file of files.sort()) {
    const bytes = readFileSync(file);
    hash.update(relative(root, file).split('\\').join('/')).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return hash.digest('hex');
}
export default defineConfig(() => ({ base: './', define: { __ROADSTER_BUILD__: JSON.stringify(gameBuildFingerprint(process.cwd())) }, build: { target: 'es2022', chunkSizeWarningLimit: 1500 } }));
