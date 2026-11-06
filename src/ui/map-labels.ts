import type { CoreData, RoadEdge } from '../world/types';

export const MAP_DETAIL = Object.freeze({ districtRoads: .06, localRoads: .18, buildings: .45 });
export const mapRoadMinScale = (kind: string) => kind === 'minor' ? MAP_DETAIL.localRoads : kind === 'ter' ? MAP_DETAIL.districtRoads : 0;
export interface LabelRect { x: number; y: number; w: number; h: number }
export interface MapLabel extends LabelRect { text: string; angle: number; font: string; kind: 'area' | 'road' | 'place'; major: boolean }
export interface MapLabelView { cx: number; cz: number; scale: number; width: number; height: number }
type Area = { text: string; x: number; z: number; tier: number };
type Road = { id: number; text: string; ax: number; az: number; bx: number; bz: number; tier: number };
const CELL = 1000, areaScales = [0, .16, .8], roadScales = [.09, .18, .45];
export const areaLabelFont = (major: boolean) => `${major ? 800 : 700} ${major ? 14 : 12}px "Baloo 2", sans-serif`;
export const roadLabelFont = (major: boolean) => `${major ? 700 : 600} ${major ? 11 : 10}px "Baloo 2", sans-serif`;

/** Conservative screen-space boxes, shared by road, area and landmark labels. */
export class ScreenLabelGrid {
  private cells = new Map<string, LabelRect[]>();
  constructor(reserved: readonly LabelRect[] = []) { for (const box of reserved) this.reserve(box); }
  private *keys(box: LabelRect) {
    for (let x = Math.floor((box.x - box.w / 2) / 64); x <= Math.floor((box.x + box.w / 2) / 64); x++)
      for (let y = Math.floor((box.y - box.h / 2) / 64); y <= Math.floor((box.y + box.h / 2) / 64); y++) yield `${x},${y}`;
  }
  reserve(box: LabelRect) { for (const key of this.keys(box)) (this.cells.get(key) || this.cells.set(key, []).get(key)!).push(box); }
  place(box: LabelRect) {
    for (const key of this.keys(box)) for (const old of this.cells.get(key) || [])
      if (Math.abs(box.x - old.x) < (box.w + old.w) / 2 && Math.abs(box.y - old.y) < (box.h + old.h) / 2) return false;
    this.reserve(box); return true;
  }
}

function clip(ax: number, ay: number, bx: number, by: number, width: number, height: number) {
  const dx = bx - ax, dy = by - ay; let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, ax - 12], [dx, width - 12 - ax], [-dy, ay - 12], [dy, height - 12 - ay]]) {
    if (!p) { if (q < 0) return null; continue; }
    const u = q / p; if (p < 0) lo = Math.max(lo, u); else hi = Math.min(hi, u);
    if (lo > hi) return null;
  }
  return { ax: ax + dx * lo, ay: ay + dy * lo, bx: ax + dx * hi, by: ay + dy * hi };
}

/** References only existing city names/geometry; prepares incrementally while the map is open. */
export class MapLabelIndex {
  revision = 0; ready = false;
  readonly stats = { roadSpans: 0, areas: 0, layoutRuns: 0, examined: 0 };
  private areas: Area[][] = [[], [], []];
  private areaCells = [new Map<string, Area[]>(), new Map<string, Area[]>(), new Map<string, Area[]>()];
  private roadCells = [new Map<string, Road[]>(), new Map<string, Road[]>(), new Map<string, Road[]>()];
  private lastKey = ''; private cached: readonly MapLabel[] = [];
  constructor(private source: Pick<CoreData, 'roads' | 'places'>) {}

  *prepare(): Generator<void> {
    let work = 0;
    for (const p of this.source.places || []) {
      if (p.name && !/^Ward \d+/i.test(p.name) && p.p.every(Number.isFinite)) {
        const tier = p.kind === 'locality' || p.kind === 'macrohood' ? 0 : p.kind === 'microhood' ? 2 : 1;
        const area: Area = { text: p.name, x: p.p[0], z: p.p[1], tier };
        this.areas[tier].push(area); const key = `${Math.floor(area.x / CELL)},${Math.floor(area.z / CELL)}`;
        (this.areaCells[tier].get(key) || this.areaCells[tier].set(key, []).get(key)!).push(area); this.stats.areas++;
      }
      if (++work >= 256) { work = 0; this.revision++; yield; }
    }
    for (const road of this.source.roads) {
      if (!road.name?.trim() || road.pts.length < 2) { if (++work >= 256) { work = 0; this.revision++; yield; } continue; }
      const tier = /motorway|trunk|primary/.test(road.cls) ? 0 : /secondary/.test(road.cls) ? 1 : 2;
      let start = road.pts[0], end = start, hx = 0, hz = 0, length = 0;
      for (let i = 1; i < road.pts.length; i++) {
        const next = road.pts[i], dx = next[0] - end[0], dz = next[1] - end[1], distance = Math.hypot(dx, dz);
        if (!Number.isFinite(distance) || distance < .01) continue;
        if (length > 0 && (hx * dx / distance + hz * dz / distance < .97 || length + distance > 400)) {
          this.addRoad(road, tier, start, end); start = end; length = 0;
        }
        // Long straight spans are split into finite anchors, so a close view
        // can label its visible portion without scanning a city-wide road.
        const parts = Math.max(1, Math.ceil(distance / 400)), from = end;
        for (let j = 1; j <= parts; j++) {
          end = [from[0] + dx * j / parts, from[1] + dz * j / parts]; length += distance / parts;
          hx = dx / distance; hz = dz / distance;
          if (j < parts) { this.addRoad(road, tier, start, end); start = end; length = 0; }
          if (++work >= 256) { work = 0; this.revision++; yield; }
        }
      }
      this.addRoad(road, tier, start, end);
    }
    this.ready = true; this.revision++;
  }
  private addRoad(road: RoadEdge, tier: number, a: readonly number[], b: readonly number[]) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 8) return;
    const span: Road = { id: this.stats.roadSpans++, text: road.name!, ax: a[0], az: a[1], bx: b[0], bz: b[1], tier };
    for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++) {
        const key = `${x},${z}`; (this.roadCells[tier].get(key) || this.roadCells[tier].set(key, []).get(key)!).push(span);
      }
  }
  layout(view: MapLabelView, measure: (text: string, font: string) => number, reserved: readonly LabelRect[] = [], fontEpoch = ''): readonly MapLabel[] {
    const { cx, cz, scale: s, width: W, height: H } = view;
    if (![cx, cz, s, W, H].every(Number.isFinite) || s < .012 || W <= 0 || H <= 0) return [];
    const key = `${cx}|${cz}|${s}|${W}|${H}|${this.revision}|${fontEpoch}|${reserved.map(b => `${b.x},${b.y},${b.w},${b.h}`).join(';')}`;
    if (key === this.lastKey) return this.cached;
    this.lastKey = key; this.stats.layoutRuns++; this.stats.examined = 0;
    const labels: MapLabel[] = [], grid = new ScreenLabelGrid(reserved), names = new Set<string>();
    const screen = (x: number, z: number) => ({ x: W / 2 + (x - cx) * s, y: H / 2 + (z - cz) * s });
    const keys: { key: string; d: number }[] = [];
    if (s >= .08) for (let x = Math.floor((cx - W / 2 / s) / CELL); x <= Math.floor((cx + W / 2 / s) / CELL); x++)
      for (let z = Math.floor((cz - H / 2 / s) / CELL); z <= Math.floor((cz + H / 2 / s) / CELL); z++)
        keys.push({ key: `${x},${z}`, d: (x * CELL + CELL / 2 - cx) ** 2 + (z * CELL + CELL / 2 - cz) ** 2 });
    keys.sort((a, b) => a.d - b.d);
    const inside = (b: LabelRect) => b.x - b.w / 2 > 8 && b.y - b.h / 2 > 8 && b.x + b.w / 2 < W - 8 && b.y + b.h / 2 < H - 8;
    const areaLimit = Math.max(8, Math.min(40, Math.floor(W * H / 22000)));
    for (let tier = 0; tier < 3 && labels.length < areaLimit; tier++) {
      if (s < areaScales[tier]) continue;
      const candidates: Area[] = [];
      if (s < .08) candidates.push(...this.areas[tier].slice(0, 600));
      else for (const key of keys) {
        for (const area of this.areaCells[tier].get(key.key) || []) { candidates.push(area); if (candidates.length >= 600) break; }
        if (candidates.length >= 600) break;
      }
      const sorted = candidates.map(p => ({ p, ...screen(p.x, p.z) })).filter(p => p.x >= 8 && p.y >= 8 && p.x <= W - 8 && p.y <= H - 8)
        .sort((a, b) => (a.x - W / 2) ** 2 + (a.y - H / 2) ** 2 - (b.x - W / 2) ** 2 - (b.y - H / 2) ** 2 || a.p.text.localeCompare(b.p.text));
      for (const p of sorted) {
        this.stats.examined++; if (labels.length >= areaLimit) break;
        const major = tier === 0, font = areaLabelFont(major), box = { x: p.x, y: p.y, w: measure(p.p.text, font) + 22, h: major ? 30 : 25 };
        const name = p.p.text.toLocaleLowerCase();
        if (!names.has(name) && inside(box) && grid.place(box)) { names.add(name); labels.push({ ...box, text: p.p.text, angle: 0, font, kind: 'area', major }); }
      }
    }
    const roadLimit = Math.min(90, Math.max(12, Math.floor(W * H / 9000))), roads: Road[] = [], seen = new Set<number>();
    for (let tier = 0; tier < 3; tier++) {
      if (s < roadScales[tier]) continue;
      let inspected = 0;
      for (const key of keys) {
        for (const road of this.roadCells[tier].get(key.key) || []) {
          if (++inspected > 800) break;
          if (!seen.has(road.id)) { seen.add(road.id); roads.push(road); }
        }
        if (inspected > 800) break;
      }
    }
    let roadCount = 0;
    for (const road of roads) {
      if (roadCount >= roadLimit) break; this.stats.examined++;
      const name = road.text.toLocaleLowerCase(); if (names.has(name)) continue;
      const a = screen(road.ax, road.az), b = screen(road.bx, road.bz), line = clip(a.x, a.y, b.x, b.y, W, H);
      if (!line) continue;
      const major = road.tier === 0, font = roadLabelFont(major), width = measure(road.text, font) + 16;
      const length = Math.hypot(line.bx - line.ax, line.by - line.ay);
      if (length < Math.max(68, width + 12)) continue;
      let angle = Math.atan2(line.by - line.ay, line.bx - line.ax);
      if (angle > Math.PI / 2) angle -= Math.PI; else if (angle < -Math.PI / 2) angle += Math.PI;
      const box = { x: (line.ax + line.bx) / 2, y: (line.ay + line.by) / 2,
        w: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * 20,
        h: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * 20 };
      if (inside(box) && grid.place(box)) { names.add(name); roadCount++; labels.push({ ...box, text: road.text, font, angle, kind: 'road', major }); }
    }
    this.cached = labels; return labels;
  }
}
