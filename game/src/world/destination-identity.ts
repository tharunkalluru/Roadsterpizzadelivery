import type { XZ } from './types';
import type { LandmarkPlace } from './landmark_catalog';
export type DestinationKind = 'university' | 'college' | 'mall' | 'cinema' | 'office';
// These retain shipped name/footprint associations. Their existing facade was
// inferred by the source pipeline; it is not a verified entrance or floor.
export interface DestinationIdentity {
  id: string; name: string; kind: DestinationKind; tile: [number, number];
  buildingId: string; boardId: string; a: XZ; b: XZ; confidence: number;
}
export function destinationIndex(records: readonly DestinationIdentity[]) {
  const index = new Map<string, DestinationIdentity[]>();
  for (const record of records) (index.get(record.buildingId) || index.set(record.buildingId, []).get(record.buildingId)!).push(record);
  return index;
}
export function destinationPlaceCatalogue(records: readonly DestinationIdentity[], origin: { lat: number; lon: number }): LandmarkPlace[] {
  const kx = Math.cos(origin.lat * Math.PI / 180) * 6380050.094 * Math.PI / 180, kz = 6341141.9 * Math.PI / 180;
  return records.map(record => {
    const x = (record.a[0] + record.b[0]) / 2, z = (record.a[1] + record.b[1]) / 2;
    return { id: record.id, name: record.name, lat: origin.lat - z / kz, lon: origin.lon + x / kx, x, z,
      category: record.kind === 'cinema' ? 'Culture' : record.kind === 'college' || record.kind === 'university' ? 'Education' : 'City life', icon: record.kind === 'office' ? 'tower' : 'building', priority: 0 };
  });
}
