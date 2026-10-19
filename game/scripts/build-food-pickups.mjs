/** Rebuild the food-category index from bundled source listings; does not verify storefronts. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = resolve('public/world/hyd-metro/v2');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await read(resolve(base, 'manifest.json'));
const core = await read(resolve(base, manifest.core.file));
const requested = new Set(core.deliveries.map((d) => d.poiId));
const found = {};
for (const chunk of manifest.chunks) {
  for (const p of (await read(resolve(base, chunk.file))).storefronts ?? []) {
    if (requested.has(p.id) && ['restaurant', 'cafe_bakery'].includes(p.group)) {
      found[p.id] = { name: p.name, category: p.category, group: p.group, source: 'Overture Places listing; frontage is provisional' };
    }
  }
}
const sorted = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
await writeFile('config/food-pickups.json', JSON.stringify(sorted, null, 2) + '\n');
process.stdout.write(`Indexed ${Object.keys(sorted).length} food-business pickup categories.\n`);
