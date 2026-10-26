import type { DestinationIdentity } from './destination-identity';

// Small spatial index: campuses are named near their retained source facade,
// not treated as a surveyed campus boundary or an invented delivery address.
export class CampusProximity {
  private cells = new Map<string, { id: string; name: string; x: number; z: number }[]>();
  private candidate = ''; private since = 0; private shown = '';
  constructor(records: readonly DestinationIdentity[]) {
    for (const record of records) {
      if (record.kind !== 'university' && record.kind !== 'college') continue;
      const x = (record.a[0] + record.b[0]) / 2, z = (record.a[1] + record.b[1]) / 2, key = `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
      (this.cells.get(key) || this.cells.set(key, []).get(key)!).push({ id: record.id, name: record.name, x, z });
    }
  }
  update(x: number, z: number, y: number, seconds: number): string | null {
    if (y > 20) { this.candidate = ''; return null; }
    let nearest: { id: string; name: string; distance: number } | null = null;
    const cx = Math.floor(x / 100), cz = Math.floor(z / 100);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const campus of this.cells.get(`${cx + i},${cz + j}`) || []) {
      const distance = Math.hypot(campus.x - x, campus.z - z);
      if (distance < 65 && (!nearest || distance < nearest.distance)) nearest = { ...campus, distance };
    }
    if (!nearest) { this.candidate = ''; this.shown = ''; return null; }
    if (nearest.id !== this.candidate) { this.candidate = nearest.id; this.since = seconds; return null; }
    if (seconds - this.since < 2 || this.shown === nearest.id) return null;
    this.shown = nearest.id; return nearest.name;
  }
}
