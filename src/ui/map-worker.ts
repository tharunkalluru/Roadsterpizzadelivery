import { prepareMapData, mapDataTransfers } from './map-data';
import { readMapPack } from './map-download';

// One short-lived worker per cold/retry load. Network,gzip,JSON parsing and
// indexing run here; only compact transferable numeric buffers cross back.
self.onmessage = async (event: MessageEvent) => {
  if (event.data?.type !== 'load') return;
  try {
    const data = prepareMapData(await readMapPack(event.data.url));
    self.postMessage({ type: 'map', data }, { transfer: mapDataTransfers(data) });
  } catch { self.postMessage({ type: 'error' }); }
};
