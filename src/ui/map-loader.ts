import { prepareMapData, type PreparedMapData } from './map-data';
import { readMapPack, mapAbort } from './map-download';
export { mapAbort } from './map-download';
export interface MapWorkerLike { postMessage(message: any): void; terminate(): void; onmessage: (event: any) => void; onerror: (event: any) => void; onmessageerror: (event: any) => void }
export async function loadMapData(url: string, signal?: AbortSignal, createWorker: () => MapWorkerLike = () => new Worker(new URL('./map-worker.ts', import.meta.url), { type: 'module' })) {
  if (signal?.aborted) throw mapAbort();
  const fallback = async () => ({ data: prepareMapData(await readMapPack(url, signal)), source: 'main-thread-compatibility' as const });
  let worker: MapWorkerLike;
  try { worker = createWorker(); } catch { return fallback(); }
  // A bootstrap/CSP failure may use the original-compatible path. A genuine
  // download/decode failure is reported and retried on the next explicit open.
  const result = await new Promise<{ data: PreparedMapData; source: 'worker' } | null>((resolve, reject) => {
    let done = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); worker.onmessage = worker.onerror = worker.onmessageerror = null; };
    const finish = (value: { data: PreparedMapData; source: 'worker' } | null, error?: Error) => { if (done) return; done = true; cleanup(); error ? reject(error) : resolve(value); };
    const abort = () => finish(null, mapAbort());
    const timer = setTimeout(() => finish(null, new Error('Map preparation timed out. Close and reopen to retry.')), 30000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => {
      if (event.data?.type === 'map') finish({ data: event.data.data, source: 'worker' });
      else finish(null, new Error('The city map could not load. Close and reopen to retry.'));
    };
    worker.onerror = event => { event.preventDefault?.(); finish(null); };
    worker.onmessageerror = () => finish(null, new Error('The city map could not load. Close and reopen to retry.'));
    try { worker.postMessage({ type: 'load', url }); } catch { finish(null); }
    if (signal?.aborted) abort();
  });
  if (signal?.aborted) throw mapAbort();
  return result || fallback();
}
