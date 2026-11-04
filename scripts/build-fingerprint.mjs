import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROAD_PROFILE_INPUTS } from './road-profile-inputs.mjs';

export const BUILD_DECLARED_INPUTS = [...new Set([
  'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'wrangler.jsonc',
  'scripts/build.mjs', 'scripts/build-fingerprint.mjs', 'scripts/asset-transport.mjs', 'scripts/compile-road-profile-cache.mjs',
  ...ROAD_PROFILE_INPUTS,
])];

/** Build-time only. Identify all shipped assets as well as executable inputs;
 * a replacement model or portrait must not inherit an older test identity. */
export function gameBuildFingerprint(root) {
  const collect = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Build input must not be a symlink: ${relative(root, file)}`);
    return entry.isDirectory() ? collect(file) : entry.isFile() ? [file] : [];
  });
  const files = ['src', 'worker', 'public'].flatMap(dir => collect(join(root, dir)));
  files.push(...BUILD_DECLARED_INPUTS.map(file => join(root, file)));
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    const bytes = readFileSync(file);
    hash.update(relative(root, file).split('\\').join('/')).update('\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return hash.digest('hex');
}
