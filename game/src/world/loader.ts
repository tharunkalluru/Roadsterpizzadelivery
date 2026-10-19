import type { WorldCore, WorldChunk, WorldManifest } from './schema';
import { SourceAccuracyLayer, type SourceAccuracyData, type SourcePlaceListingIndex } from './sourceAccuracy';

export const WORLD_BASE = './world/hyd-uppal-tarnaka/v1/';
export const WORLD_BASE_V2 = './world/hyd-metro/v2/';

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null; // insecure context (e.g. LAN http): integrity check unavailable
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class LoadError extends Error {
  constructor(msg: string, public readonly detail: string, public readonly retryable = true) { super(msg); }
}

/**
 * Loads the versioned world package (manifest → core → chunks). Every fetch can be cancelled
 * through the run's AbortSignal so a restarted/switched mission never receives stale content (U12).
 * Hashes are verified against the manifest where the browser exposes SubtleCrypto.
 */
export class WorldLoader {
  manifest: WorldManifest | null = null;
  integrityChecked = false;
  accuracy: SourceAccuracyLayer | null = null;
  listingIndex: SourcePlaceListingIndex | null = null;
  failChunkIds = new Set<string>(); // debug: simulate failures
  delayMs = 0; // debug: simulate slow network

  constructor(public base = WORLD_BASE) {}

  private async fetchBuf(path: string, signal: AbortSignal): Promise<ArrayBuffer> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    let res: Response;
    try { res = await fetch(this.base + path, { signal, cache: 'no-cache' }); }
    catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new LoadError('Could not download road data', `${path}: ${(e as Error).message}`);
    }
    if (!res.ok) throw new LoadError('Road data is missing on the server', `${path}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  async loadManifest(signal: AbortSignal): Promise<WorldManifest> {
    const buf = await this.fetchBuf('manifest.json', signal);
    try { this.manifest = JSON.parse(new TextDecoder().decode(buf)) as WorldManifest; }
    catch { throw new LoadError('Road data is damaged', 'manifest.json is not valid JSON', false); }
    return this.manifest;
  }

  private async verified(path: string, expected: string | undefined, signal: AbortSignal): Promise<string> {
    const buf = await this.fetchBuf(path, signal);
    if (expected) {
      const h = await sha256Hex(buf);
      if (h !== null) {
        this.integrityChecked = true;
        if (h !== expected) throw new LoadError('Road data failed its integrity check', `${path}: sha256 ${h} != manifest ${expected}`, false);
      }
    }
    return new TextDecoder().decode(buf);
  }

  async loadCore(signal: AbortSignal): Promise<WorldCore> {
    const m = this.manifest!;
    const text = await this.verified(m.core.file, m.core.sha256, signal);
    const core = JSON.parse(text) as WorldCore;
    if (!m.sourceAccuracy) return core;
    const data = JSON.parse(await this.verified(m.sourceAccuracy.file, m.sourceAccuracy.sha256, signal)) as SourceAccuracyData;
    if (data.worldId !== m.worldId || data.worldVersion !== m.version || data.coreSha256 !== m.core.sha256) throw new LoadError('Source accuracy data does not match this map', 'source-accuracy.json package mismatch', false);
    const digestInput = m.chunks.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(c=>`${c.id}:${c.sha256}`).join('\n');
    const chunkDigest = await sha256Hex(new TextEncoder().encode(digestInput).buffer as ArrayBuffer);
    if (chunkDigest !== null && chunkDigest !== data.chunkDigest) throw new LoadError('Source accuracy data does not match these buildings', 'source-accuracy.json chunk digest mismatch', false);
    this.accuracy = new SourceAccuracyLayer(data);
    return this.accuracy.applyCore(core);
  }

  async loadChunk(id: string, signal: AbortSignal): Promise<WorldChunk> {
    const ref = this.manifest!.chunks.find((c) => c.id === id);
    if (!ref) throw new LoadError('Unknown area', id, false);
    if (this.failChunkIds.has(id)) throw new LoadError('Could not download road data', `${id}: simulated failure`);
    const text = await this.verified(ref.file, ref.sha256, signal);
    const chunk = JSON.parse(text) as WorldChunk;
    return this.accuracy ? this.accuracy.applyChunk(chunk) : chunk;
  }

  /** Full-area source listing points, fetched independently of visible3D chunks. */
  async loadPlaceListings(signal: AbortSignal): Promise<SourcePlaceListingIndex | null> {
    if (this.listingIndex) return this.listingIndex;
    const m=this.manifest!,ref=m.listingIndex;
    if (!ref) return null;
    const data=JSON.parse(await this.verified(ref.file,ref.sha256,signal)) as SourcePlaceListingIndex;
    if(data.version!==1 || data.worldId!==m.worldId || data.worldVersion!==m.version || data.count!==data.places?.length)throw new LoadError('Place listing data does not match this map','listings.json package mismatch',false);
    this.listingIndex=data;return data;
  }
}
