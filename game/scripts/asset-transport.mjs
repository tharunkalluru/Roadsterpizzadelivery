import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

export const LOSSLESS_ASSET_PREFIX = '/_lossless-assets/';

async function hashFile(file, decompress = false) {
  const hash = createHash('sha256'); let bytes = 0;
  const sink = new Writable({ write(chunk, _encoding, done) { bytes += chunk.length; hash.update(chunk); done(); } });
  if (decompress) await pipeline(createReadStream(file), createGunzip(), sink);
  else await pipeline(createReadStream(file), sink);
  return { bytes, sha256: hash.digest('hex') };
}
async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Packaging refuses a linked file: ${file}`);
    if (entry.isDirectory()) out.push(...await filesUnder(file));
    else if (entry.isFile()) out.push(file);
  }
  return out.sort();
}
function assetFile(directory, url) {
  if (!url.startsWith('/') || url.includes('\\') || url.includes('%') || url.includes('?') || url.includes('#') || url.split('/').some(part => part === '.' || part === '..')) throw new Error(`Invalid asset URL: ${url}`);
  const file = resolve(directory, '.' + url), root = resolve(directory) + sep;
  if (!file.startsWith(root)) throw new Error(`Asset escapes packaging directory: ${url}`);
  return file;
}
async function regularAsset(directory, url) {
  const file = assetFile(directory, url); let at = resolve(directory), info;
  for (const part of relative(at, file).split(sep)) {
    at = join(at, part); info = await lstat(at);
    if (info.isSymbolicLink()) throw new Error(`Packaging refuses a linked asset: ${url}`);
  }
  if (!info?.isFile()) throw new Error(`Missing regular production asset: ${url}`);
  return file;
}

/** Production copies only. Source files, approved GLB bytes and public URLs
 * remain unchanged. Every stored gzip is decoded and hashed before removing
 * its redundant raw copy from dist; the Worker receives this exact whitelist. */
export async function packageLosslessAssets(root, clientDirectory = join(root, 'dist/client')) {
  const publicDirectory = join(root, 'public');
  const registry = JSON.parse(await readFile(join(root, 'src/delivery/art/character-assets.json'), 'utf8'));
  if (!Array.isArray(registry.assets) || !registry.assets.length) throw new Error('Approved character registry is empty.');
  const candidates = new Map();
  for (const asset of registry.assets) {
    const url = asset?.glb?.url, sha256 = asset?.glb?.sha256;
    if (typeof url !== 'string' || !url.startsWith('/delivery/characters/') || !url.endsWith('.glb') || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid approved GLB packaging entry.');
    if (candidates.has(url)) throw new Error(`Duplicate approved GLB URL: ${url}`);
    candidates.set(url, { contentType: 'model/gltf-binary', approvedSha256: sha256 });
  }
  const zoneDirectory = join(publicDirectory, 'zones');
  try {
    for (const file of await filesUnder(zoneDirectory)) {
      if (!file.endsWith('.json') || (await lstat(file)).size < 65536) continue;
      candidates.set('/' + relative(publicDirectory, file).split(sep).join('/'), { contentType: 'application/json; charset=utf-8' });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // The solved road data is bundled into both the game and city worker. Store
  // large built scripts losslessly as well: the browser receives the identical
  // decoded module at its original hashed URL, with JavaScript MIME intact.
  try {
    for (const file of await filesUnder(join(clientDirectory, 'assets'))) {
      if (!file.endsWith('.js') || (await lstat(file)).size < 65536) continue;
      candidates.set('/' + relative(clientDirectory, file).split(sep).join('/'), {
        contentType: 'text/javascript; charset=utf-8', sourceDirectory: clientDirectory,
      });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = [], originals = [];
  for (const [url, candidate] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
    const [source, copied] = await Promise.all([regularAsset(candidate.sourceDirectory ?? publicDirectory, url), regularAsset(clientDirectory, url)]);
    const identity = await hashFile(source), copy = await hashFile(copied);
    if (identity.sha256 !== copy.sha256 || identity.bytes !== copy.bytes || candidate.approvedSha256 && identity.sha256 !== candidate.approvedSha256) throw new Error(`Approved/source/copy bytes differ: ${url}`);
    const storagePath = `${LOSSLESS_ASSET_PREFIX}${identity.sha256}.gz`, stored = assetFile(clientDirectory, storagePath), temporary = stored + '.tmp';
    await mkdir(dirname(stored), { recursive: true });
    try {
      await pipeline(createReadStream(copied), createGzip({ level: 9 }), createWriteStream(temporary, { flags: 'wx' }));
      const decoded = await hashFile(temporary, true);
      if (decoded.bytes !== identity.bytes || decoded.sha256 !== identity.sha256) throw new Error(`Lossless gzip verification failed: ${url}`);
      await rename(temporary, stored);
    } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
    const gzip = await hashFile(stored);
    manifest.push({ path: url, storagePath, contentType: candidate.contentType, identityBytes: identity.bytes, gzipBytes: gzip.bytes, sha256: identity.sha256, gzipSha256: gzip.sha256 });
    originals.push(copied);
  }
  // Keep source and every unverified copy intact on any packaging failure.
  for (const file of originals) await unlink(file);
  return manifest;
}

export async function expandedDirectoryBytes(directory) {
  let bytes = 0;
  for (const file of await filesUnder(directory)) bytes += (await lstat(file)).size;
  return bytes;
}
