import type { CoreData } from './types';
import dataJSON from './road-source-geodesic-data.json';
import manifestJSON from './road-source-stage-manifest.json';
import { applyVerifiedSourceRoadZone, type VerifiedSourceRoadGeometry } from './road-source-geodesic';

export interface SourceRoadStageManifest {
  version: 1; enabled: boolean; generationID: string;
  sourceCorePackSHA256: string; dataSHA256: string;
}
export const SOURCE_ROAD_STAGE_MANIFEST = manifestJSON as SourceRoadStageManifest;
export const SOURCE_ROAD_STAGE_DATA = dataJSON as unknown as VerifiedSourceRoadGeometry;

/** The sole core startup entry point. Exact source binding and a complete core
 * repair inventory are required before a worker generation can be declared.
 * Pack/data SHA checks also run offline; this synchronous stage never warps
 * geographic businesses, stops, actors, railway or metro coordinates. */
export function applySourceRoadStage<T extends Pick<CoreData, 'roads' | 'nodes' | 'sourceRoadGeometryGeneration'>>(
  core: T, manifest = SOURCE_ROAD_STAGE_MANIFEST, data = SOURCE_ROAD_STAGE_DATA,
): T {
  if (!manifest.enabled) {
    if (core.sourceRoadGeometryGeneration) throw Error('Source road stage is disabled for an already normalized core.');
    return core;
  }
  if (manifest.version !== 1 || manifest.generationID !== data.generationID ||
      manifest.sourceCorePackSHA256 !== data.sourceCorePackSHA256 ||
      !/^[a-f0-9]{64}$/.test(manifest.dataSHA256) ||
      core.sourceRoadGeometryGeneration && core.sourceRoadGeometryGeneration !== data.generationID) {
    throw Error('Source road stage generation mismatch.');
  }
  const expected = new Set(data.roads.filter(p => p.copies.some(c => c.kind === 'core')).map(p => p.id));
  const present = new Set(core.roads.map(p => p.id));
  if (!expected.size || core.roads.length !== present.size || [...expected].some(id => !present.has(id))) {
    throw Error('Source road stage requires the complete bound core repair inventory.');
  }
  const requiredNodes = new Set(data.roads.filter(p => expected.has(p.id)).flatMap(p =>
    [p.expected.from, p.expected.to].filter((id): id is string => !!id && !!data.nodes[id])));
  if ([...requiredNodes].some(id => !core.nodes[id])) throw Error('Source road stage requires every repaired core junction.');
  const result = applyVerifiedSourceRoadZone(core, data);
  const applied = [...result.report.applied, ...result.report.alreadyApplied];
  if (result.report.mismatched.length || applied.length !== expected.size || applied.some(id => !expected.has(id))) {
    throw Error(`Source road geometry binding mismatch: ${result.report.mismatched.join(', ') || 'core inventory'}`);
  }
  return result.value.sourceRoadGeometryGeneration === data.generationID ? result.value :
    { ...result.value, sourceRoadGeometryGeneration: data.generationID };
}
