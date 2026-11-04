import { build } from '/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches/node_modules/esbuild/lib/main.js';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
const repo = '/Users/tharun/Documents/Codex/2026-10-31/fourteen-delivery-private-upload-batches';
await build({ entryPoints: [repo + '/tests/v21-fixes/reported-road-final-independent.test.ts'], outfile: '/tmp/reported-road-final-independent-lp-smooth.test.mjs', bundle: true, platform: 'node', format: 'esm', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error', plugins: [{ name: 'independent-lp-two-array-only', setup(build) { build.onLoad({ filter: /\/road-grades\.ts$/ }, args => {
  let source = readFileSync(args.path, 'utf8');
  const marker = '  for (const e of result) for (let i = 1; i < e.pts.length; i++) {';
  if (source.split(marker).length !== 2) throw new Error('Expected one final result audit loop.');
  source = "import { readFileSync as __reviewReadFile } from 'node:fs';\n" + source.replace(marker, `  if (repairJoins) {
    const __lp = JSON.parse(__reviewReadFile('/tmp/tarnaka-unified-lp-0.075-0.01-smooth0.00625.json', 'utf8'));
    for (const __profile of __lp.roads) {
      const __road = result.find(e => e.id === __profile.id);
      if (!__road || JSON.stringify(__road.pts) !== JSON.stringify(__profile.pts) || __road.pts.length !== __profile.elev.length) throw new Error('LP profile does not match held exact XY: ' + __profile.id);
      __road.elev = [...__profile.elev];
    }
  }
` + marker);
  return { contents: source, loader: 'ts', resolveDir: dirname(args.path) };
}); } }] });
