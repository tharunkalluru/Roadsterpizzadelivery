import * as THREE from 'three';
import { canvas } from '../core/util';
import { paintStationBoard, stationBoardKey, stationBoardRegion, type BoardRect, type StationBoardContent } from './station-board';

export interface StationSignQuad {
  id: string; station?: StationBoardContent; w: number; h: number;
  c: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3;
}
interface Entry { cell: number; span: number; board: StationBoardContent; width: number; height: number; paint: BoardRect; sample: BoardRect }

// One shared, lazily created page, never a canvas/material/mesh per board or
// letter. Eight complete distinct station identities fit at once; opposite end
// faces, platform faces and interchange duplicates share identical entries.
export const STATION_ATLAS_COLUMNS = 4, STATION_ATLAS_ROWS = 6, STATION_ATLAS_MAX_QUADS = 64;
export class StationSignAtlas {
  readonly scale: number;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly geometry = new THREE.BufferGeometry();
  readonly mesh: THREE.Mesh;
  readonly entries = new Map<string, Entry>();
  readonly stats = { texturePaints: 0, geometryUpdates: 0 };
  private owners: (string | null)[] = Array(STATION_ATLAS_COLUMNS * STATION_ATLAS_ROWS).fill(null);
  private signature = '';
  private disposed = false;
  private positions = new THREE.Float32BufferAttribute(STATION_ATLAS_MAX_QUADS * 6 * 3, 3).setUsage(THREE.DynamicDrawUsage);
  private normals = new THREE.Float32BufferAttribute(STATION_ATLAS_MAX_QUADS * 6 * 3, 3).setUsage(THREE.DynamicDrawUsage);
  private uvs = new THREE.Float32BufferAttribute(STATION_ATLAS_MAX_QUADS * 6 * 2, 2).setUsage(THREE.DynamicDrawUsage);
  private bounds = new THREE.Box3();
  private sphere = new THREE.Sphere();
  private point = new THREE.Vector3();

  constructor(low: boolean) {
    this.scale = low ? .5 : 1;
    this.canvas = canvas(2048 * this.scale, 1024 * this.scale); this.context = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8; this.texture.generateMipmaps = true;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.geometry.setAttribute('position', this.positions); this.geometry.setAttribute('normal', this.normals); this.geometry.setAttribute('uv', this.uvs); this.geometry.setDrawRange(0, 0);
    this.geometry.boundingBox = this.bounds; this.geometry.boundingSphere = this.sphere;
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.name = 'metro-station-nameboards'; this.mesh.visible = false;
  }
  private allocate(key: string, board: StationBoardContent, width: number, height: number): Entry | null {
    const span = board.kind === 'exterior' ? 2 : 1;
    for (let cell = 0; cell < this.owners.length; cell++) {
      if (cell % STATION_ATLAS_COLUMNS + span > STATION_ATLAS_COLUMNS || Array.from({ length: span }, (_, i) => this.owners[cell + i]).some(Boolean)) continue;
      for (let i = 0; i < span; i++) this.owners[cell + i] = key;
      const slot = { x: cell % STATION_ATLAS_COLUMNS * 512 * this.scale, y: Math.floor(cell / STATION_ATLAS_COLUMNS) * 160 * this.scale, w: span * 512 * this.scale, h: 160 * this.scale };
      const entry = { cell, span, board, width, height, ...stationBoardRegion(slot, width, height, this.scale) };
      this.entries.set(key, entry); return entry;
    }
    return null;
  }
  /** Input is nearest-first. Placement and UV buffers change only when their
   * actual membership/transforms change; font completion repaints pixels only. */
  sync(near: readonly StationSignQuad[], repaint = false) {
    if (this.disposed) return;
    const selected = near.filter(s => s.station && s.w > 0 && s.h > 0).slice(0, STATION_ATLAS_MAX_QUADS);
    const wanted = new Map<string, StationSignQuad>(); let cells = 0;
    for (const sign of selected) {
      const key = stationBoardKey(sign.station!, sign.w, sign.h);
      if (wanted.has(key)) continue;
      const span = sign.station!.kind === 'exterior' ? 2 : 1;
      if (cells + span > this.owners.length) continue;
      wanted.set(key, sign); cells += span;
    }
    for (const [key, entry] of this.entries) if (!wanted.has(key)) {
      for (let i = 0; i < entry.span; i++) this.owners[entry.cell + i] = null;
      this.entries.delete(key);
    }
    const paint = new Set<string>();
    for (const [key, sign] of wanted) if (!this.entries.has(key)) {
      if (!this.allocate(key, sign.station!, sign.w, sign.h)) {
        // Retained one-cell cards can fragment a row. Repack at this rare
        // membership boundary, rather than omit a nearer station despite room.
        this.entries.clear(); this.owners.fill(null); paint.clear();
        for (const [id, s] of [...wanted].sort((a, b) => Number(b[1].station!.kind === 'exterior') - Number(a[1].station!.kind === 'exterior') || a[0].localeCompare(b[0]))) {
          if (this.allocate(id, s.station!, s.w, s.h)) paint.add(id);
        }
        break;
      }
      paint.add(key);
    }
    if (repaint) for (const key of this.entries.keys()) paint.add(key);
    for (const key of paint) { const entry = this.entries.get(key)!; paintStationBoard(this.context, entry.board, entry.paint); this.stats.texturePaints++; }
    if (paint.size) this.texture.needsUpdate = true;
    const visible = selected.filter(s => this.entries.has(stationBoardKey(s.station!, s.w, s.h))).sort((a, b) => a.id.localeCompare(b.id));
    const signature = visible.map(s => `${s.id}|${s.c.x},${s.c.y},${s.c.z}|${s.right.x},${s.right.y},${s.right.z}|${s.up.x},${s.up.y},${s.up.z}|${s.w},${s.h}|${this.entries.get(stationBoardKey(s.station!, s.w, s.h))!.cell}`).join(';');
    if (signature === this.signature) return;
    this.signature = signature; this.bounds.makeEmpty(); let index = 0;
    for (const s of visible) {
      const r = this.entries.get(stationBoardKey(s.station!, s.w, s.h))!.sample, u0 = r.x / this.canvas.width, u1 = (r.x + r.w) / this.canvas.width;
      const v1 = 1 - r.y / this.canvas.height, v0 = 1 - (r.y + r.h) / this.canvas.height;
      const nx = s.right.y * s.up.z - s.right.z * s.up.y, ny = s.right.z * s.up.x - s.right.x * s.up.z, nz = s.right.x * s.up.y - s.right.y * s.up.x;
      for (const [a, b, u, v] of [[-.5, -.5, u0, v0], [.5, -.5, u1, v0], [.5, .5, u1, v1], [-.5, -.5, u0, v0], [.5, .5, u1, v1], [-.5, .5, u0, v1]]) {
        const x = s.c.x + s.right.x * s.w * a + s.up.x * s.h * b, y = s.c.y + s.right.y * s.w * a + s.up.y * s.h * b, z = s.c.z + s.right.z * s.w * a + s.up.z * s.h * b;
        this.positions.setXYZ(index, x, y, z); this.normals.setXYZ(index, nx, ny, nz); this.uvs.setXY(index, u, v);
        this.bounds.expandByPoint(this.point.set(x, y, z)); index++;
      }
    }
    this.geometry.setDrawRange(0, index); this.mesh.visible = index > 0;
    if (index) {
      this.bounds.getBoundingSphere(this.sphere);
      for (const attribute of [this.positions, this.normals, this.uvs]) { attribute.clearUpdateRanges(); attribute.addUpdateRange(0, index * attribute.itemSize); attribute.needsUpdate = true; }
    } else this.sphere.set(this.point.set(0, 0, 0), 0);
    this.stats.geometryUpdates++;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.entries.clear(); this.owners.fill(null); this.mesh.removeFromParent();
    this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
  }
}
