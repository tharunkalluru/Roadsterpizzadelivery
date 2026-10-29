import type { MapPack } from './map-data';
export const mapAbort = () => new DOMException('Map loading cancelled', 'AbortError');

// Kept map-local: core/game download behavior and V21 scheduling are untouched.
export async function readMapPack(url: string, signal?: AbortSignal): Promise<MapPack> {
  if (signal?.aborted) throw mapAbort();
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('The map download timed out. Close and reopen to retry.')); }, 15000); });
  const download = async () => {
    try {
      const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error('HTTP');
      const buffer = await response.arrayBuffer(); if (signal?.aborted || controller.signal.aborted) throw mapAbort();
      const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
      const text = head[0] === 0x1f && head[1] === 0x8b
        ? await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(buffer);
      if (signal?.aborted || controller.signal.aborted) throw mapAbort();
      return JSON.parse(text) as MapPack;
    } catch (error) { if (signal?.aborted) throw mapAbort(); throw new Error('The city map could not load. Close and reopen to retry.'); }
  };
  try { return await Promise.race([download(), timeout]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
