import * as THREE from 'three';
import { canvas, hash } from '../core/util';

// Shop-board colour schemes: [background, text]
const SCHEMES: Record<string, [string, string][]> = {
  food: [['#C62828', '#FFF4D6'], ['#FFB627', '#3A1206'], ['#2E7D32', '#FFFFFF'], ['#E65100', '#FFFFFF'], ['#4E342E', '#FFE0B2']],
  cinema: [['#141414', '#FFD54F'], ['#B71C1C', '#FFFFFF']],
  pharmacy: [['#FFFFFF', '#00695C'], ['#1B5E20', '#FFFFFF']],
  health: [['#FFFFFF', '#1565C0'], ['#E3F2FD', '#0D47A1'], ['#FFFFFF', '#C62828']],
  fashion: [['#AD1457', '#FFFFFF'], ['#6A1B9A', '#FFFFFF'], ['#3E2723', '#F7D774'], ['#8B0000', '#F7D774'], ['#FFFFFF', '#880E4F']],
  shop: [['#1F5FCC', '#FFFFFF'], ['#FDD835', '#1A237E'], ['#E8413A', '#FFFFFF'], ['#FF6F00', '#141414'], ['#455A64', '#FFFFFF'], ['#FFFFFF', '#D50000']],
  finance: [['#0D47A1', '#FFFFFF'], ['#FFFFFF', '#0D47A1'], ['#004D40', '#FFFFFF']],
  education: [['#283593', '#FFFFFF'], ['#FFFFFF', '#283593'], ['#BF360C', '#FFFFFF']],
  lodging: [['#3E2723', '#FFCC80'], ['#1A1830', '#FFFFFF']],
  auto: [['#263238', '#FFC107'], ['#B71C1C', '#FFFFFF']],
  service: [['#7B1FA2', '#FFFFFF'], ['#00838F', '#FFFFFF'], ['#F06292', '#FFFFFF']],
  worship: [['#FF8F00', '#4E2600']],
  office: [['#ECEFF1', '#263238'], ['#37474F', '#FFFFFF']],
  default: [['#F6EEDC', '#17132B'], ['#1F5FCC', '#FFFFFF'], ['#157A4C', '#FFF4D6']],
};
export function boardScheme(id: string, group: string): [string, string] {
  const s = SCHEMES[group] || SCHEMES.default;
  return s[hash(id) % s.length];
}

export interface SignInst { id: string; text: string; bg: string; fg: string; c: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; w: number; h: number; slot: number; page: number; lastUse: number }

const PAGE = 2048, SW = 256, SH = 64, COLS = PAGE / SW, ROWS = PAGE / SH, PER = COLS * ROWS;

function drawBoard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, bg: string, fg: string) {
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 4, w, 4);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 3);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const isTe = /[ఀ-౿]/.test(text);
  const t = text.length <= 16 && !isTe ? text.toUpperCase() : text;
  const face = (s: number) => isTe ? `700 ${s}px "Noto Sans Telugu", sans-serif` : t.length <= 16 ? `${s}px "Bungee", "Arial Black", sans-serif` : `800 ${s}px "Baloo 2", "Arial Narrow", sans-serif`;
  let size = Math.floor(h * 0.62);
  g.font = face(size);
  while (g.measureText(t).width > w - 14 && size > 10) { size -= 1; g.font = face(size); }
  if (g.measureText(t).width > w - 14 && t.includes(' ')) {
    // two lines
    const words = t.split(' '); const half = Math.ceil(words.length / 2);
    const l1 = words.slice(0, half).join(' '), l2 = words.slice(half).join(' ');
    size = Math.floor(h * 0.4); g.font = face(size);
    while (Math.max(g.measureText(l1).width, g.measureText(l2).width) > w - 12 && size > 8) { size -= 1; g.font = face(size); }
    g.fillText(l1, x + w / 2, y + h * 0.32); g.fillText(l2, x + w / 2, y + h * 0.7);
  } else g.fillText(t, x + w / 2, y + h * 0.54);
}

interface SignPage {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture;
  mesh: THREE.Mesh; free: number[]; owner: (string | null)[];
  capacity: number; signature: string;
}

export class SignSystem {
  signs: SignInst[] = [];
  pages: SignPage[] = [];
  group = new THREE.Group();
  material: THREE.MeshStandardMaterial[] = [];
  grid = new Map<string, SignInst[]>();
  frame = 0;
  readonly stats = { selections: 0, geometryUpdates: 0, geometryAllocations: 0, texturePaints: 0 };
  private revision = 0;
  private selectedRevision = -1;
  private lastSelectionMs = -Infinity;
  private lastX = NaN;
  private lastZ = NaN;
  private nextIdentity = 1;
  private identities = new WeakMap<SignInst, number>();
  private active = new Set<SignInst>();
  private fontSet: FontFaceSet | null = null;
  private fontRevision = 0;
  private readonly onFontsLoaded = () => { this.fontRevision++; this.revision++; };
  constructor(public pageCount = 3, public radius = 230) {}
  add(s: Omit<SignInst, 'slot' | 'page' | 'lastUse'>) {
    const inst: SignInst = { ...s, slot: -1, page: -1, lastUse: 0 };
    this.identities.set(inst, this.nextIdentity++);
    this.signs.push(inst);
    const k = `${Math.floor(inst.c.x / 100)},${Math.floor(inst.c.z / 100)}`;
    (this.grid.get(k) || this.grid.set(k, []).get(k)!).push(inst);
    this.revision++;
    return inst;
  }
  // Call after changing text, style or transform of an existing immutable source board.
  invalidate() { this.revision++; }
  remove(list: SignInst[]) {
    const gone = new Set(list);
    const cells = new Set<string>();
    for (const inst of list) {
      inst.page = -1; inst.slot = -1;
      cells.add(`${Math.floor(inst.c.x / 100)},${Math.floor(inst.c.z / 100)}`);
      this.active.delete(inst);
    }
    for (const k of cells) {
      const l = this.grid.get(k); if (!l) continue;
      const remain = l.filter(s => !gone.has(s));
      if (remain.length) this.grid.set(k, remain); else this.grid.delete(k);
    }
    this.signs = this.signs.filter(s => !gone.has(s));
    this.revision++;
  }
  init(emissive: number) {
    // Font loading may finish after the initial loader's timeout. Retained
    // atlas slots need fresh pixels then, not new source boards or geometry.
    const fonts = typeof document === 'undefined' ? null : document.fonts;
    if (!this.fontSet && fonts && typeof fonts.addEventListener === 'function' && typeof fonts.removeEventListener === 'function') {
      this.fontSet = fonts; fonts.addEventListener('loadingdone', this.onFontsLoaded);
    }
    if (this.pages.length) { this.setEmissive(emissive); return; }
    for (let p = 0; p < this.pageCount; p++) {
      const c = canvas(PAGE, PAGE), g = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: emissive, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
      this.material.push(mat);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false;
      mesh.geometry.setDrawRange(0, 0);
      this.group.add(mesh);
      this.pages.push({ c, g, tex, mesh, free: Array.from({ length: PER }, (_, i) => PER - 1 - i), owner: new Array(PER).fill(null), capacity: 0, signature: '' });
    }
    this.revision++;
  }
  setEmissive(v: number) { for (const m of this.material) if (m.emissiveIntensity !== v) m.emissiveIntensity = v; }
  slotOf = new Map<string, { page: number; slot: number; paintedFontRevision: number }>();
  private allocateGeometry(pg: SignPage, vertices: number) {
    if (pg.capacity >= vertices) return;
    let capacity = Math.max(192, pg.capacity);
    while (capacity < vertices) capacity *= 2;
    const geo = new THREE.BufferGeometry();
    for (const [name, width] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
      geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(capacity * width), width).setUsage(THREE.DynamicDrawUsage));
    }
    pg.mesh.geometry.dispose(); pg.mesh.geometry = geo; pg.capacity = capacity;
    this.stats.geometryAllocations++;
  }
  update(px: number, pz: number, force = false, nowMs = performance.now()) {
    this.frame++;
    if (!this.pages.length || !Number.isFinite(px) || !Number.isFinite(pz)) return;
    const changed = this.selectedRevision !== this.revision;
    const moved2 = (px - this.lastX) ** 2 + (pz - this.lastZ) ** 2;
    // Time-based cap does not double the selection cost on a 120 Hz screen.
    // A stationary, unchanged scene never rebuilds geometry or repaints an atlas.
    if (!force && !changed && (moved2 < 4 || nowMs - this.lastSelectionMs < 250)) return;
    this.lastSelectionMs = nowMs; this.lastX = px; this.lastZ = pz;
    this.selectedRevision = this.revision; this.stats.selections++;
    const R = this.radius, near: [SignInst, number][] = [];
    const cx = Math.floor(px / 100), cz = Math.floor(pz / 100), rc = Math.ceil(R / 100);
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const l = this.grid.get(`${cx + i},${cz + j}`); if (!l) continue;
      for (const s of l) { const d2 = (s.c.x - px) ** 2 + (s.c.z - pz) ** 2; if (d2 < R * R) near.push([s, d2]); }
    }
    near.sort((a, b) => a[1] - b[1]);
    const cap = this.pageCount * PER, want = new Map<string, SignInst[]>();
    for (const [s] of near) {
      const key = JSON.stringify([s.text, s.bg, s.fg]);
      let list = want.get(key);
      if (!list) { if (want.size >= cap) continue; list = []; want.set(key, list); }
      list.push(s);
    }
    for (const [key, slot] of this.slotOf) if (!want.has(key)) {
      const pg = this.pages[slot.page]; pg.owner[slot.slot] = null; pg.free.push(slot.slot); this.slotOf.delete(key);
    }
    const dirtyTextures = new Set<number>();
    for (const [key, list] of want) {
      let at = this.slotOf.get(key);
      if (!at) {
        const page = this.pages.findIndex(p => p.free.length > 0); if (page < 0) break;
        const pg = this.pages[page], slot = pg.free.pop()!;
        pg.owner[slot] = key; at = { page, slot, paintedFontRevision: -1 }; this.slotOf.set(key, at);
      }
      if (at.paintedFontRevision === this.fontRevision) continue;
      const pg = this.pages[at.page], slot = at.slot, s = list[0];
      drawBoard(pg.g, slot % COLS * SW, Math.floor(slot / COLS) * SH, SW, SH, s.text, s.bg, s.fg);
      at.paintedFontRevision = this.fontRevision;
      dirtyTextures.add(at.page); this.stats.texturePaints++;
    }
    for (const s of this.active) { s.page = -1; s.slot = -1; }
    this.active.clear();
    const members: SignInst[][] = this.pages.map(() => []);
    for (const [key, list] of want) {
      const at = this.slotOf.get(key); if (!at) continue;
      for (const s of list) { s.page = at.page; s.slot = at.slot; this.active.add(s); members[at.page].push(s); }
    }
    const n = new THREE.Vector3();
    for (let page = 0; page < this.pages.length; page++) {
      const pg = this.pages[page], list = members[page];
      if (dirtyTextures.has(page)) pg.tex.needsUpdate = true;
      // Stable source order means camera motion does not reshuffle unchanged quads.
      list.sort((a, b) => this.identities.get(a)! - this.identities.get(b)!);
      const signature = list.map(s => `${this.identities.get(s)}:${s.slot}:${s.c.x},${s.c.y},${s.c.z},${s.right.x},${s.right.y},${s.right.z},${s.up.x},${s.up.y},${s.up.z},${s.w},${s.h}`).join(';');
      if (signature === pg.signature) continue;
      pg.signature = signature;
      const vertices = list.length * 6;
      this.allocateGeometry(pg, vertices);
      const geo = pg.mesh.geometry;
      geo.setDrawRange(0, vertices);
      if (!vertices) { this.stats.geometryUpdates++; continue; }
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      let vertex = 0;
      for (const s of list) {
        const i = s.slot, u0 = i % COLS / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS, u1 = u0 + 1 / COLS, v0 = v1 - 1 / ROWS;
        const hw = s.w / 2, hh = s.h / 2;
        n.crossVectors(s.right, s.up).normalize();
        for (const [a, b, uu, vv] of [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, -hh, u0, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]]) {
          pos.setXYZ(vertex, s.c.x + s.right.x * a + s.up.x * b, s.c.y + s.right.y * a + s.up.y * b, s.c.z + s.right.z * a + s.up.z * b);
          nor.setXYZ(vertex, n.x, n.y, n.z); uv.setXY(vertex++, uu, vv);
        }
      }
      for (const attr of [pos, nor, uv]) { attr.clearUpdateRanges(); attr.addUpdateRange(0, vertices * attr.itemSize); attr.needsUpdate = true; }
      // Frustum culling stays disabled as before; retained unused buffer capacity
      // must not influence bounds, visibility or source facade placement.
      this.stats.geometryUpdates++;
    }
  }
  dispose() {
    this.fontSet?.removeEventListener('loadingdone', this.onFontsLoaded); this.fontSet = null;
    for (const pg of this.pages) { pg.mesh.geometry.dispose(); pg.tex.dispose(); }
    for (const mat of this.material) mat.dispose();
    this.group.clear(); this.pages.length = 0; this.material.length = 0;
    this.signs.length = 0; this.grid.clear(); this.slotOf.clear(); this.active.clear();
    this.revision++; this.selectedRevision = -1;
  }
}

// One-off large label texture (theatre marquees, station names, hoardings)
export function labelTexture(lines: { text: string; font: string; color: string; size: number }[], w: number, h: number, bg: string, border?: string) {
  const c = canvas(w, h), g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const total = lines.reduce((a, l) => a + l.size * 1.15, 0);
  let y = h / 2 - total / 2;
  for (const l of lines) {
    let s = l.size; g.font = l.font.replace('{s}', String(s));
    while (g.measureText(l.text).width > w * 0.92 && s > 8) { s -= 2; g.font = l.font.replace('{s}', String(s)); }
    g.fillStyle = l.color; g.fillText(l.text, w / 2, y + l.size * 0.6); y += l.size * 1.15;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
