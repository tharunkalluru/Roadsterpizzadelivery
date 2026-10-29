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

export class SignSystem {
  signs: SignInst[] = [];
  pages: { c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh; free: number[]; owner: (string | null)[] }[] = [];
  group = new THREE.Group();
  material: THREE.MeshStandardMaterial[] = [];
  grid = new Map<string, SignInst[]>();
  frame = 0;
  constructor(public pageCount = 3, public radius = 230) {}
  add(s: Omit<SignInst, 'slot' | 'page' | 'lastUse'>) {
    const inst: SignInst = { ...s, slot: -1, page: -1, lastUse: 0 };
    this.signs.push(inst);
    const k = `${Math.floor(inst.c.x / 100)},${Math.floor(inst.c.z / 100)}`;
    (this.grid.get(k) || this.grid.set(k, []).get(k)!).push(inst);
    return inst;
  }
  // forget boards of an unloaded tile (their shared atlas slots are released by the next update)
  remove(list: SignInst[]) {
    const gone = new Set(list);
    for (const inst of list) {
      inst.page = -1; inst.slot = -1;
      const k = `${Math.floor(inst.c.x / 100)},${Math.floor(inst.c.z / 100)}`;
      const l = this.grid.get(k); if (l) { const f = l.filter((s) => !gone.has(s)); if (f.length) this.grid.set(k, f); else this.grid.delete(k); }
    }
    this.signs = this.signs.filter((s) => !gone.has(s));
  }
  init(emissive: number) {
    for (let p = 0; p < this.pageCount; p++) {
      const c = canvas(PAGE, PAGE), g = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: emissive, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
      this.material.push(mat);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pages.push({ c, g, tex, mesh, free: Array.from({ length: PER }, (_, i) => PER - 1 - i), owner: new Array(PER).fill(null) });
    }
  }
  setEmissive(v: number) { this.material.forEach((m) => (m.emissiveIntensity = v)); }
  // stream: give the nearest boards a slot, rebuild page meshes. Boards with the same text and colours share one slot,
  // so streets full of generic signs don't crowd the named shops out of the atlas.
  slotOf = new Map<string, { page: number; slot: number }>();
  update(px: number, pz: number, force = false) {
    this.frame++;
    if (!force && this.frame % 45) return;
    const R = this.radius, near: [SignInst, number][] = [];
    const cx = Math.floor(px / 100), cz = Math.floor(pz / 100), rc = Math.ceil(R / 100);
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) {
      const l = this.grid.get(`${cx + i},${cz + j}`); if (!l) continue;
      for (const s of l) { const d = Math.hypot(s.c.x - px, s.c.z - pz); if (d < R) near.push([s, d]); }
    }
    near.sort((a, b) => a[1] - b[1]);
    const cap = this.pageCount * PER;
    const want = new Map<string, SignInst[]>();
    for (const [s] of near) {
      const k = `${s.text}|${s.bg}|${s.fg}`;
      let l = want.get(k);
      if (!l) { if (want.size >= cap) continue; l = []; want.set(k, l); }
      l.push(s);
    }
    // free slots of texts no longer wanted
    for (const [k, sl] of this.slotOf) if (!want.has(k)) { const pg = this.pages[sl.page]; pg.owner[sl.slot] = null; pg.free.push(sl.slot); this.slotOf.delete(k); }
    const dirty = new Set<number>();
    for (const [k, l] of want) {
      if (this.slotOf.has(k)) continue;
      const pi = this.pages.findIndex((p) => p.free.length > 0); if (pi < 0) break;
      const pg = this.pages[pi]; const slot = pg.free.pop()!, s = l[0];
      pg.owner[slot] = k; this.slotOf.set(k, { page: pi, slot });
      drawBoard(pg.g, (slot % COLS) * SW, Math.floor(slot / COLS) * SH, SW, SH, s.text, s.bg, s.fg);
      dirty.add(pi);
    }
    const out = this.pages.map(() => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] }));
    for (const s of this.signs) { s.page = -1; s.slot = -1; }
    for (const [k, l] of want) {
      const sl = this.slotOf.get(k); if (!sl) continue;
      const i = sl.slot, o = out[sl.page];
      const u0 = (i % COLS) / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS, u1 = u0 + 1 / COLS, v0 = v1 - 1 / ROWS;
      for (const s of l) {
        s.page = sl.page; s.slot = i;
        const hw = s.w / 2, hh = s.h / 2;
        const corners = [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, -hh, u0, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]];
        const n = new THREE.Vector3().crossVectors(s.right, s.up).normalize();
        for (const [a, b, uu, vv] of corners) {
          o.pos.push(s.c.x + s.right.x * a + s.up.x * b, s.c.y + s.right.y * a + s.up.y * b, s.c.z + s.right.z * a + s.up.z * b);
          o.nor.push(n.x, n.y, n.z); o.uv.push(uu, vv);
        }
      }
    }
    this.pages.forEach((pg, pi) => {
      if (dirty.has(pi)) pg.tex.needsUpdate = true;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(out[pi].pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(out[pi].nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(out[pi].uv, 2));
      pg.mesh.geometry.dispose(); pg.mesh.geometry = geo;
    });
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
