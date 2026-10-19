#!/usr/bin/env node
/** Lossless, checksum-bound checkout setup. No network or third-party packages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'config/runtime-data-archives.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pack = process.argv.includes('--pack');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const entry of manifest.files) {
  const archive = path.join(root, entry.archive), output = path.join(root, entry.output);
  if (pack) {
    const raw = fs.readFileSync(output), compressed = gzipSync(raw, { level: 9 });
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.writeFileSync(archive, compressed);
    Object.assign(entry, { bytes: raw.length, sha256: sha(raw), archiveBytes: compressed.length, archiveSha256: sha(compressed) });
    continue;
  }
  const compressed = fs.readFileSync(archive);
  if (compressed.length !== entry.archiveBytes || sha(compressed) !== entry.archiveSha256) throw new Error(`Archive checksum mismatch: ${entry.archive}`);
  if (fs.existsSync(output)) {
    const existing = fs.readFileSync(output);
    if (existing.length === entry.bytes && sha(existing) === entry.sha256) continue;
    throw new Error(`Runtime data differs: ${entry.output}. Preserve your changes; only the integrator may repack updated source data with npm run archive:data.`);
  }
  const raw = gunzipSync(compressed);
  if (raw.length !== entry.bytes || sha(raw) !== entry.sha256) throw new Error(`Restored data checksum mismatch: ${entry.output}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.restore-${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, raw, { flag: 'wx' }); fs.renameSync(temporary, output); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  console.log(`Restored ${entry.output} (${raw.length} bytes, SHA-256 ${entry.sha256})`);
}
if (pack) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
