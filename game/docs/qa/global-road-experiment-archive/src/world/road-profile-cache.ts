import type { RoadEdge } from './types';
import { installPreparedRoadCache, type PreparedRoadCachePayload } from './road-grades';
import generated from './road-profile-cache-manifest.json';

export interface RoadProfileCacheManifest {
  version: 1; enabled: boolean; asset?: string; sourceRoadCount?: number;
  sourceRoadsSha256?: string; sourceCorePackSha256?: string; generatorInputsSha256?: string;
  sourceRoadGeometryGeneration?: string;
  payloadSha256?: string; payloadBytes?: number; gzipSha256?: string; gzipBytes?: number;
}
interface CacheOptions {
  sourceRoadGeometryGeneration?: string;
  manifest?: RoadProfileCacheManifest;
  fetcher?: typeof fetch;
  install?: (roads: RoadEdge[], payload: PreparedRoadCachePayload) => boolean;
  timeoutMs?: number;
}
export interface RoadProfileCacheResult { used: boolean; reason: 'disabled' | 'binding-mismatch' | 'unavailable' | 'invalid' | 'installed' }
const SHA = /^[a-f0-9]{64}$/;
const MAX_BYTES = 32 * 1024 * 1024;
const sourceJSON = (roads: RoadEdge[]) => JSON.stringify(roads, (_key, value) => {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '$roadProfileNegativeZero')) throw new Error('Reserved road profile encoding in source data.');
  return typeof value === 'number' && Object.is(value, -0) ? { $roadProfileNegativeZero: true } : value;
});
const validSourceGeometry = (roads: RoadEdge[]) => roads.every(e => e && typeof e.id === 'string' && e.id.length > 0 && Number.isFinite(e.w) && e.w > 0 && Number.isInteger(e.lanes) && e.lanes > 0 && Array.isArray(e.pts) && e.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v))) && (e.elev === null || Array.isArray(e.elev) && e.elev.length === e.pts.length && e.elev.every(v => typeof v === 'number' && Number.isFinite(v))));
const digest = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(b => b.toString(16).padStart(2, '0')).join('');
async function boundedBytes(stream: ReadableStream<Uint8Array>, maximum: number) {
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Error('Road profile data exceeded its verified size.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let at = 0;
  for (const part of chunks) { result.set(part, at); at += part.byteLength; }
  return result;
}

/** Optional startup acceleration only. Unknown/stale worlds retain the generic
 * preparation path. No physics, camera, quality, or per-frame work changes. */
export async function warmPreparedRoadProfiles(base: string, roads: RoadEdge[], options: CacheOptions = {}): Promise<RoadProfileCacheResult> {
  const m = options.manifest ?? generated as RoadProfileCacheManifest;
  if (!m.enabled) return { used: false, reason: 'disabled' };
  if (m.sourceRoadGeometryGeneration !== options.sourceRoadGeometryGeneration) return { used: false, reason: 'binding-mismatch' };
  if (m.version !== 1 || !/^road-profiles-v1\.pack\.wasm$/.test(m.asset ?? '') ||
      m.sourceRoadGeometryGeneration !== undefined && !SHA.test(m.sourceRoadGeometryGeneration) ||
      ![m.sourceRoadsSha256, m.sourceCorePackSha256, m.generatorInputsSha256, m.payloadSha256, m.gzipSha256].every(s => SHA.test(s ?? '')) ||
      !Number.isSafeInteger(m.sourceRoadCount) || m.sourceRoadCount! < 1 || m.sourceRoadCount! > 100000 ||
      !Number.isSafeInteger(m.payloadBytes) || m.payloadBytes! < 2 || m.payloadBytes! > MAX_BYTES ||
      !Number.isSafeInteger(m.gzipBytes) || m.gzipBytes! < 2 || m.gzipBytes! > MAX_BYTES) return { used: false, reason: 'invalid' };
  if (roads.length !== m.sourceRoadCount || !globalThis.crypto?.subtle || !validSourceGeometry(roads)) return { used: false, reason: 'binding-mismatch' };
  try {
    if (await digest(new TextEncoder().encode(sourceJSON(roads))) !== m.sourceRoadsSha256) return { used: false, reason: 'binding-mismatch' };
  } catch { return { used: false, reason: 'binding-mismatch' }; }
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Road profile download timed out.')); }, options.timeoutMs ?? 12000); });
  try {
    const download = async () => {
      const url = new URL(m.asset!, base); url.searchParams.set('v', m.payloadSha256!);
      const response = await (options.fetcher ?? fetch)(url.href, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Road profile data is unavailable.');
      let bytes = await boundedBytes(response.body, Math.max(m.gzipBytes!, m.payloadBytes!));
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (bytes.length !== m.gzipBytes || await digest(bytes) !== m.gzipSha256) throw new Error('Road profile transport mismatch.');
        bytes = await boundedBytes(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')), m.payloadBytes!);
      }
      if (bytes.length !== m.payloadBytes || await digest(bytes) !== m.payloadSha256) throw new Error('Road profile payload mismatch.');
      return JSON.parse(new TextDecoder().decode(bytes), (_key, value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.$roadProfileNegativeZero === true ? -0 : value) as PreparedRoadCachePayload;
    };
    const payload = await Promise.race([download(), timeout]);
    if (payload?.version !== 1 || payload.sourceRoadCount !== roads.length || !(options.install ?? installPreparedRoadCache)(roads, payload)) return { used: false, reason: 'invalid' };
    return { used: true, reason: 'installed' };
  } catch { return { used: false, reason: 'unavailable' }; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
