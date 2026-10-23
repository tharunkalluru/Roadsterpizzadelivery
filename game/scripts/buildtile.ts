// Dev check: build the tiles of one pack in node and time them. npx esbuild scripts/buildtile.ts --bundle --platform=node --format=esm --outfile=<out>.mjs, then node <out>.mjs <pack> [tileKey]
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initTemplates } from '../src/core/util';
import { buildTile } from '../src/world/city';
import fs from 'fs'; import zlib from 'zlib';
initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new THREE.RingGeometry(1.0, 1.35, 40) });
const [pack, key] = process.argv.slice(2);
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(pack)).toString());
const metro = JSON.parse(zlib.gunzipSync(fs.readFileSync('/home/claude/p2ph/game/public/city/core.pack.wasm')).toString()).metro;
for (const k of key ? [key] : Object.keys(d.tiles)) {
  const t0 = Date.now();
  const b = buildTile(d.tiles[k], { lowQ: false, metro });
  console.log(k, Date.now() - t0, 'ms', b.counts);
}
