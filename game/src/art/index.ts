/** Art module entry: implements ArtApi (see api.ts). */
import type { ArtApi } from './api';
import { buildChunk } from './buildings';
import { buildEnvironment } from './environment';
import { createHeroCar } from './hero';
import { createDeliveryMarker, createLandingMarker } from './markers';
import { buildMetro } from './metro';
import { buildRoads } from './roads';
import { createSignTexture } from './sign';
import { createPedestrianTemplate, createTrafficTemplates } from './traffic';

export const art: ArtApi = {
  createHeroCar,
  createTrafficTemplates,
  createPedestrianTemplate,
  buildRoads,
  buildMetro,
  buildChunk,
  buildEnvironment,
  createDeliveryMarker,
  createLandingMarker,
  createSignTexture,
};

/** Extras (not part of ArtApi): await before the first rendered frame / screenshot to avoid untextured pop-in. */
export { texturesReady } from './textures';
export { ensureTeluguFont } from './sign';
export { SUN_DIR } from './environment';
export { stationObstacles } from './metro';
export type { StationObstacle } from './metro';
