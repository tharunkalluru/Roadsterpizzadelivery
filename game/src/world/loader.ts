import type { WorldCore, WorldChunk, WorldManifest } from './schema';

export const WORLD_BASE = './world/hyd-uppal-tarnaka/v1/';

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
    return JSON.parse(text) as WorldCore;
  }

  async loadChunk(id: string, signal: AbortSignal): Promise<WorldChunk> {
    const ref = this.manifest!.chunks.find((c) => c.id === id);
    if (!ref) throw new LoadError('Unknown area', id, false);
    if (this.failChunkIds.has(id)) throw new LoadError('Could not download road data', `${id}: simulated failure`);
    const text = await this.verified(ref.file, ref.sha256, signal);
    return JSON.parse(text) as WorldChunk;
  }
}
