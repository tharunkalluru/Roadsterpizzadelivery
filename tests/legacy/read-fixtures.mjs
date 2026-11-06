import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export const fixtureRoot = fileURLToPath(new URL('./fixtures/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8'));
export function readEvidenceJson(name) {
  const entry = manifest.files[name]; if (!entry) throw new Error('Unrecorded evidence fixture: ' + name);
  const bytes = gunzipSync(readFileSync(join(fixtureRoot, name + '.gz')));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Evidence fixture hash changed: ' + name);
  return JSON.parse(bytes.toString('utf8'));
}
for (const [name, entry] of Object.entries(manifest.files)) if (name.endsWith('.py')) {
  const bytes = readFileSync(join(fixtureRoot, name));
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Source classifier fixture hash changed: ' + name);
}
const retired = JSON.parse(readFileSync(join(fixtureRoot, 'retired-v2-groups.json'), 'utf8'));
const archived = gunzipSync(readFileSync(join(fixtureRoot, retired.archivedSource)));
if (createHash('sha256').update(archived).digest('hex') !== retired.sourceSha256) throw new Error('Archived removed-feature test evidence changed');
