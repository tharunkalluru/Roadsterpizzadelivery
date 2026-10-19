/**
 * Storefront builder (v2): one believable shop frontage per Storefront record, with the
 * REAL listing name on a signboard. Per chunk: one sign-texture ATLAS (shaped canvas text,
 * Noto Sans Telugu for Telugu), merged into 4 meshes (lit boards, body, textured fronts,
 * signs). Text fades to the plain coloured board beyond ~120 m (80 m on low) in the shader.
 * No brand logos: generic category fixtures and the listing text only.
 */
import * as THREE from 'three';
import type { Building, RoadEdge, Storefront, StoreGroup, WorldChunkV2, WorldCore, WorldCoreV2 } from '../world/schema';
import type { Quality } from './api';
import { GeoBuilder, addBox, boxMatrix, hashString, hex, rng } from './geo';
import { FC, frontCellUV, getFrontAtlas } from './frontAtlas';
import { ensureTeluguFont, TELUGU_FAMILY } from './sign';
import { anisoFor } from './textures';
import { registerCull } from './cull';
import { layoutSignAtlasPages,signTextArea,signCellPadding, type SignAtlasCell } from './signAtlas';
import type { SurveyAppearance } from '../world/streetSurveyTypes';
import { researchedFacesOf } from './researchedBuildings';
import { accessRoadIndex,buildingAccessPlan,accessRecessForFacade,type BuildingAccessPlan } from '../world/buildingAccess';
import { appendObservedStock,type ObservedStock } from './observedDisplays';
import { layoutExplicitLines } from './signTextLayout';

/* ------------------------------------------------------------------ palettes */

type StyledStorefront = Storefront & { appearance?: SurveyAppearance };

interface Pal { bg: string; fg: string; awn: [number, number]; icon?: 'greencross' | 'bluecross'; shutterTint?: number }

function palette(group: StoreGroup, h: number): Pal {
  const v = h % 3;
  switch (group) {
    case 'grocery': return [{ bg: '#1f7a3a', fg: '#ffe14d', awn: [0x2f9a4a, 0xf2f0e0] }, { bg: '#f1c40f', fg: '#14532d', awn: [0xf1c40f, 0x2f7a3a] }, { bg: '#2e8b57', fg: '#fff7c2', awn: [0x2e8b57, 0xffe14d] }][v] as Pal;
    case 'restaurant': return [{ bg: '#b3261e', fg: '#fff1c9', awn: [0xc0392b, 0xf4ead2] }, { bg: '#d9531e', fg: '#fff6e0', awn: [0xd9531e, 0xf6e7c8] }, { bg: '#7b1e1e', fg: '#ffd966', awn: [0x8a2323, 0xe8d9b5] }][v] as Pal;
    case 'cafe_bakery': return [{ bg: '#6d3b1e', fg: '#ffe0b2', awn: [0x7b4a2a, 0xf4e4c6] }, { bg: '#c2185b', fg: '#fff3e0', awn: [0xc2185b, 0xfbe4ec] }, { bg: '#3e2723', fg: '#f9d77e', awn: [0x4e342e, 0xe6d3b0] }][v] as Pal;
    case 'pharmacy': return { bg: '#0f8a4f', fg: '#ffffff', awn: [0x0f8a4f, 0xffffff], icon: 'greencross' };
    case 'hospital_clinic': return { bg: '#f2f7fb', fg: '#0b4f8a', awn: [0x2d6aa8, 0xffffff], icon: 'bluecross' };
    case 'bank_atm': return [{ bg: '#0b4a8f', fg: '#ffffff', awn: [0x0b4a8f, 0xdfe8f2] }, { bg: '#144e3a', fg: '#fff3c4', awn: [0x144e3a, 0xdfe8e2] }, { bg: '#3a2a7a', fg: '#ffffff', awn: [0x3a2a7a, 0xe6e2f2] }][v] as Pal;
    case 'apparel': return [{ bg: '#7b1f5e', fg: '#ffffff', awn: [0x7b1f5e, 0xf0dce8] }, { bg: '#1f1f26', fg: '#ffd166', awn: [0x1f2a44, 0xe8e8ee] }, { bg: '#0e6e7a', fg: '#ffffff', awn: [0x0e6e7a, 0xe0f2f2] }][v] as Pal;
    case 'electronics_mobile': return [{ bg: '#ffc400', fg: '#12131a', awn: [0xffc400, 0x23252b] }, { bg: '#e53935', fg: '#ffffff', awn: [0xe53935, 0xf2f2f2] }, { bg: '#0d8ae0', fg: '#ffffff', awn: [0x0d8ae0, 0xf2f6fa] }][v] as Pal;
    case 'jewellery': return [{ bg: '#c99a1e', fg: '#4a0f14', awn: [0x7a1428, 0xe8c25a] }, { bg: '#6a0f1e', fg: '#ffe08a', awn: [0x6a0f1e, 0xe8c25a] }, { bg: '#d8aa38', fg: '#2b0b0e', awn: [0x8a6a14, 0xf2dc9a] }][v] as Pal;
    case 'hotel_lodging': return [{ bg: '#14305e', fg: '#ffd978', awn: [0x14305e, 0xd9c48a] }, { bg: '#4a2a6a', fg: '#fff0c4', awn: [0x4a2a6a, 0xe8dcc0] }, { bg: '#2b2b2b', fg: '#f4d27a', awn: [0x333333, 0xd8c8a0] }][v] as Pal;
    case 'auto_service': return [{ bg: '#f57c00', fg: '#141414', awn: [0xf57c00, 0x2a2a2a] }, { bg: '#c62828', fg: '#ffffff', awn: [0xc62828, 0x2a2a2a] }, { bg: '#263238', fg: '#ffca28', awn: [0x263238, 0xffca28] }][v] as Pal;
    case 'hardware': return [{ bg: '#455a64', fg: '#ffeb3b', awn: [0x455a64, 0xeceff1] }, { bg: '#1565c0', fg: '#ffffff', awn: [0x1565c0, 0xe3eaf2] }, { bg: '#8d6e3f', fg: '#fff8dc', awn: [0x8d6e3f, 0xefe5cc] }][v] as Pal;
    case 'education': return [{ bg: '#0d47a1', fg: '#ffffff', awn: [0x0d47a1, 0xe3ecf7] }, { bg: '#00695c', fg: '#ffffff', awn: [0x00695c, 0xe0f0ee] }, { bg: '#5d4037', fg: '#fff3e0', awn: [0x5d4037, 0xefe6dc] }][v] as Pal;
    case 'worship': return [{ bg: '#f6e7c1', fg: '#7a1a14', awn: [0xe65100, 0xfff3d0] }, { bg: '#ff9933', fg: '#4a1a00', awn: [0xff9933, 0xfff3d0] }, { bg: '#e8f0e4', fg: '#1b5e20', awn: [0x1b5e20, 0xf0f4ec] }][v] as Pal;
    case 'office_service': return [{ bg: '#37474f', fg: '#ffffff', awn: [0x37474f, 0xdfe5e8] }, { bg: '#283593', fg: '#ffffff', awn: [0x283593, 0xe2e4f2] }, { bg: '#006064', fg: '#ffffff', awn: [0x006064, 0xdff0f0] }][v] as Pal;
    default: return [{ bg: '#546e7a', fg: '#ffffff', awn: [0x546e7a, 0xe6ecef] }, { bg: '#ad1457', fg: '#ffffff', awn: [0xad1457, 0xf4dce6] }, { bg: '#2e7d32', fg: '#ffffff', awn: [0x2e7d32, 0xe4efe4] }, { bg: '#ef6c00', fg: '#111111', awn: [0xef6c00, 0x2b2b2b] }][h % 4] as Pal;
  }
}

/** front-texture cell variants per group (first = primary, others alternate on wide frontages) */
const FRONT_CELLS: Record<StoreGroup, number[]> = {
  grocery: [FC.grocery, FC.kirana, FC.shutterHalf],
  restaurant: [FC.restaurant, FC.restaurant, FC.shutterHalf],
  cafe_bakery: [FC.bakery, FC.restaurant],
  pharmacy: [FC.pharmacy],
  hospital_clinic: [FC.clinic],
  bank_atm: [FC.bank],
  apparel: [FC.apparel, FC.apparel, FC.shutter],
  electronics_mobile: [FC.electronics, FC.electronics, FC.shutter],
  jewellery: [FC.jewellery],
  hotel_lodging: [FC.hotel],
  auto_service: [FC.autoBay, FC.shutterHalf],
  hardware: [FC.hardware, FC.shutterHalf],
  education: [FC.office],
  worship: [FC.office],
  office_service: [FC.office, FC.bank],
  other: [FC.shutter, FC.shutterHalf, FC.office, FC.grocery],
};

/* ---------------------------------------------------------------- text atlas */

const LATIN = '"Noto Sans","Liberation Sans","DejaVu Sans","Helvetica Neue",Arial,sans-serif';
const TELUGU = `"${TELUGU_FAMILY}","Noto Sans","Liberation Sans","DejaVu Sans",sans-serif`;
const isTelugu = (s: string): boolean => /[ఀ-౿]/.test(s);

interface CellSpec { lines: string[]; pal: Pal; vertical: boolean; icon?: Pal['icon']; preserveText?:boolean }
interface Cell extends SignAtlasCell { spec: CellSpec }

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null = (() => {
  try {
    const S = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    return S ? new S('te', { granularity: 'grapheme' }) : null;
  } catch { return null; }
})();

function graphemes(s: string): string[] {
  return segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
}

function setFont(ctx: CanvasRenderingContext2D, text: string, size: number): void {
  ctx.font = `700 ${size}px ${isTelugu(text) ? TELUGU : LATIN}`;
}

/** shrink to fit width, then ellipsise */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, capH: number, minRatio = 0.42): { text: string; size: number } {
  let size = capH;
  setFont(ctx, text, size);
  const m = ctx.measureText(text).width;
  if (m <= maxW) return { text, size };
  size = capH * (maxW / m);
  const minSize = capH * minRatio;
  if (size >= minSize) return { text, size };
  size = minSize;
  setFont(ctx, text, size);
  const g = graphemes(text);
  let n = g.length;
  while (n > 1 && ctx.measureText(g.slice(0, n).join('').trimEnd() + '…').width > maxW) n--;
  return { text: g.slice(0, n).join('').trimEnd() + '…', size };
}

function explicitLines(ctx:CanvasRenderingContext2D,text:string,maxW:number,maxH:number){
  return layoutExplicitLines(text,maxW,maxH,(line,size)=>{setFont(ctx,line,size);return ctx.measureText(line).width;});
}

function layoutLatin(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, preserveText=false): { lines: string[]; size: number } {
  if(preserveText){const authored=explicitLines(ctx,text,maxW,maxH);if(authored)return authored;}
  const capH = maxH * 0.8;
  const one = fit(ctx, text, maxW, capH,preserveText?0:.42);
  const words = text.split(/\s+/);
  if (words.length < 2 || one.size >= capH * 0.7) return { lines: [one.text], size: one.size };
  // best balanced split
  let best: { lines: string[]; size: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const fa = fit(ctx, a, maxW, maxH * 0.5 * 0.86, preserveText?0:.5), fb = fit(ctx, b, maxW, maxH * 0.5 * 0.86, preserveText?0:.5);
    const size = Math.min(fa.size, fb.size);
    if (!best || size > best.size) best = { lines: [fa.text, fb.text], size };
  }
  if (best && best.size > one.size * 1.12) return best;
  return { lines: [one.text], size: one.size };
}

/** metres of width the laid-out text needs (at its natural size inside a board of the given inner size) */
function measureSpec(ctx: CanvasRenderingContext2D, spec: CellSpec, innerW: number, innerH: number): number {
  const REF = 100;
  const H = innerH * REF, m = 0.12 * REF;
  const iconW = spec.icon && !spec.vertical ? H * 0.66 + m : 0;
  const maxW = innerW * REF - 2 * m - iconW;
  let w = 0;
  const lineW = (t: string, size: number): number => { setFont(ctx, t, size); return ctx.measureText(t).width; };
  const hasTe = spec.lines.length > 1 && isTelugu(spec.lines[1]);
  if (spec.lines.length > 1) {
    const hA = H * (hasTe ? 0.52 : 0.5);
    const A = layoutLatin(ctx, spec.lines[0], maxW, hA * 0.95,spec.preserveText);
    for (const ln of A.lines) w = Math.max(w, lineW(ln, A.size));
    const B=spec.preserveText?explicitLines(ctx,spec.lines[1],maxW,(H-hA)*.975):null;
    if(B)for(const line of B.lines)w=Math.max(w,lineW(line,B.size));
    else{const f=fit(ctx,spec.lines[1],maxW,(H-hA)*.78,spec.preserveText?0:.5);w=Math.max(w,lineW(f.text,f.size));}
  } else {
    const A = layoutLatin(ctx, spec.lines[0], maxW, H * 0.86,spec.preserveText);
    for (const ln of A.lines) w = Math.max(w, lineW(ln, A.size));
  }
  return (w + iconW + 2 * m) / REF;
}

function drawCell(ctx: CanvasRenderingContext2D, c: Cell): void {
  const { px, py, pw, ph, spec } = c;
  ctx.save();
  // bleed 3px into the gutter so mip levels do not pick up neighbouring boards
  ctx.fillStyle = spec.pal.bg;
  ctx.fillRect(px - 3, py - 3, pw + 6, ph + 6);
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  let W = pw, H = ph;
  ctx.translate(px, py);
  if (spec.vertical) {
    ctx.translate(pw / 2, ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-ph / 2, -pw / 2);
    W = ph; H = pw;
  }
  const b = signCellPadding(c);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = spec.pal.fg;
  (ctx as unknown as { textRendering?: string }).textRendering = 'optimizeLegibility';
  let x0 = b, textW = W - b * 2;
  // icon square (pharmacy / clinic) on the left
  if (spec.icon && !spec.vertical) {
    const s = H * 0.66;
    const ix = b, iy = (H - s) / 2;
    ctx.fillStyle = spec.icon === 'greencross' ? '#ffffff' : '#0b4f8a';
    ctx.fillRect(ix, iy, s, s);
    ctx.fillStyle = spec.icon === 'greencross' ? '#0f8a4f' : '#ffffff';
    ctx.fillRect(ix + s * 0.38, iy + s * 0.14, s * 0.24, s * 0.72);
    ctx.fillRect(ix + s * 0.14, iy + s * 0.38, s * 0.72, s * 0.24);
    x0 = ix + s + b;
    textW = W - x0 - b;
    ctx.fillStyle = spec.pal.fg;
  }
  const cx = x0 + textW / 2;
  const hasTe = spec.lines.length > 1 && isTelugu(spec.lines[1]);
  if (spec.lines.length > 1) {
    const hA = H * (hasTe ? 0.52 : 0.5), hB = H - hA;
    const A = layoutLatin(ctx, spec.lines[0], textW, hA * 0.95,spec.preserveText);
    const lh = (hA * 0.95) / A.lines.length;
    A.lines.forEach((ln, i) => { setFont(ctx, ln, A.size); ctx.fillText(ln, cx, H * 0.04 + lh * (i + 0.5)); });
    const B=spec.preserveText?explicitLines(ctx,spec.lines[1],textW,hB*.975):null;
    if(B)B.lines.forEach((line,i)=>{setFont(ctx,line,B.size);ctx.fillText(line,cx,hA+hB*(i+.5)/B.lines.length);});
    else{const f=fit(ctx,spec.lines[1],textW,hB*.78,spec.preserveText?0:.5);setFont(ctx,f.text,f.size);ctx.fillText(f.text,cx,hA+hB*.5);}
  } else {
    const A = layoutLatin(ctx, spec.lines[0], textW, H * 0.86,spec.preserveText);
    const lh = (H * 0.86) / A.lines.length;
    A.lines.forEach((ln, i) => { setFont(ctx, ln, A.size); ctx.fillText(ln, cx, H * 0.07 + lh * (i + 0.5)); });
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ materials */

const matCache = new Map<Quality, { lit: THREE.MeshBasicMaterial; body: THREE.MeshStandardMaterial; front: THREE.MeshStandardMaterial }>();

function sharedMats(q: Quality): { lit: THREE.MeshBasicMaterial; body: THREE.MeshStandardMaterial; front: THREE.MeshStandardMaterial } {
  let m = matCache.get(q);
  if (m) return m;
  const atlas = getFrontAtlas(q);
  m = {
    lit: new THREE.MeshBasicMaterial({ name: 'store-lit', vertexColors: true }),
    body: new THREE.MeshStandardMaterial({ name: 'store-body', vertexColors: true, roughness: 0.82, metalness: 0.05 }),
    front: new THREE.MeshStandardMaterial({
      name: 'store-front', map: atlas, vertexColors: true, roughness: 0.75, metalness: 0,
      emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.28,
    }),
  };
  matCache.set(q, m);
  return m;
}

function makeSignMaterial(map: THREE.Texture, far: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ name: 'store-sign', map, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const f = far.toFixed(1);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSignDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSignDist = length(mvPosition.xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSignDist;')
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', `vec4 stx = texture2D( map, vMapUv ); float fk = smoothstep( ${f} * 0.8, ${f}, vSignDist ); diffuseColor.rgb = mix( stx.rgb, vColor.rgb, fk );`);
  };
  m.customProgramCacheKey = () => `storesign${f}`;
  return m;
}

/* ------------------------------------------------------------------- geometry */

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
const unitCylLow = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);

interface Frame { cx: number; cz: number; nx: number; nz: number; tx: number; tz: number; th: number }

class Loc {
  constructor(public f: Frame) {}
  at(u: number, n: number): [number, number] {
    return [this.f.cx + this.f.tx * u + this.f.nx * n, this.f.cz + this.f.tz * u + this.f.nz * n];
  }
  box(b: GeoBuilder, u0: number, u1: number, y0: number, y1: number, n0: number, n1: number, col: ArrayLike<number>, bottom = false): void {
    const [x, z] = this.at((u0 + u1) / 2, (n0 + n1) / 2);
    addBox(b, Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(n1 - n0), boxMatrix(x, (y0 + y1) / 2, z, this.f.th), 1, col, { bottom });
  }
  /** vertical panel facing outward (normal = frame normal) */
  quad(b: GeoBuilder, u0: number, u1: number, y0: number, y1: number, n: number, col: ArrayLike<number> | undefined, uv: number[]): void {
    const a = this.at(u0, n), c = this.at(u1, n);
    b.quad([a[0], y0, a[1], c[0], y0, c[1], c[0], y1, c[1], a[0], y1, a[1]], uv, [this.f.nx, 0, this.f.nz], col);
  }
  /** sloped quad between two (u,y,n) edges, upper-facing */
  slope(b: GeoBuilder, u0: number, u1: number, yA: number, nA: number, yB: number, nB: number, col: ArrayLike<number>, normal: [number, number, number]): void {
    const a0 = this.at(u0, nA), a1 = this.at(u1, nA), b1 = this.at(u1, nB), b0 = this.at(u0, nB);
    b.quad([a0[0], yA, a0[1], a1[0], yA, a1[1], b1[0], yB, b1[1], b0[0], yB, b0[1]], [0, 0, 1, 0, 1, 1, 0, 1], normal, col);
  }
  cyl(b: GeoBuilder, geo: THREE.BufferGeometry, u: number, n: number, y0: number, y1: number, r: number, col: ArrayLike<number>): void {
    const [x, z] = this.at(u, n);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, (y0 + y1) / 2, z), new THREE.Quaternion(), new THREE.Vector3(r, y1 - y0, r));
    b.appendGeometry(geo, m, col);
  }
  /** world-space normal for a face looking along local direction (du, dn) */
  nrm(du: number, dn: number, dy = 0): [number, number, number] {
    return [this.f.tx * du + this.f.nx * dn, dy, this.f.tz * du + this.f.nz * dn];
  }
}

const dark = (c: number[], k: number): number[] => [c[0] * k, c[1] * k, c[2] * k];

/* ------------------------------------------------------------------ plans */

interface Plan {
  sf: Storefront;
  fr: Frame;
  W: number;
  H: number; // building height
  h: number; // hash
  pal: Pal;
  underDeck: boolean;
  boardCell: Cell;
  boardW: number; boardH: number; boardY: number;
  bladeCell?: Cell; bladeY0?: number; bladeH?: number;
}

function frameOf(sf: Storefront): Frame | null {
  if (!sf.facade) return null;
  const [A, B] = sf.facade;
  const dx = B[0] - A[0], dz = B[1] - A[1];
  const len = Math.hypot(dx, dz);
  if (len < (sf.placeId.startsWith('survey:building-panel-')?.08:.8)) return null;
  let nx = dz / len, nz = -dx / len;
  const hx = -Math.sin(sf.facingHeading), hz = -Math.cos(sf.facingHeading);
  if (nx * hx + nz * hz < 0) { nx = -nx; nz = -nz; }
  return { cx: (A[0] + B[0]) / 2, cz: (A[1] + B[1]) / 2, nx, nz, tx: nz, tz: -nx, th: Math.atan2(nx, nz) };
}

function nearElevated(core: WorldCore, minX: number, maxX: number, minZ: number, maxZ: number): { pts: [number, number][]; elev: number[]; hw: number }[] {
  const out: { pts: [number, number][]; elev: number[]; hw: number }[] = [];
  const consider = (pts: [number, number][], elev: number[], hw: number): void => {
    if (!elev.some((e) => e > 2)) return;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
    if (b < minX - 30 || a > maxX + 30 || d < minZ - 30 || c > maxZ + 30) return;
    out.push({ pts, elev, hw });
  };
  for (const e of core.roads as RoadEdge[]) consider(e.points as [number, number][], e.pointElevM, e.widthM / 2 + 0.6);
  const st = (core as WorldCoreV2).structures;
  if (st) for (const s of st) consider(s.path as [number, number][], s.elevM, s.widthM / 2 + 1.2);
  return out;
}

function underDeckAt(x: number, z: number, list: { pts: [number, number][]; elev: number[]; hw: number }[]): boolean {
  for (const r of list) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p = r.pts[i], q = r.pts[i + 1];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
      const d = Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t));
      if (d < r.hw + 1.5) {
        const e = r.elev[i] + (r.elev[i + 1] - r.elev[i]) * t;
        if (e > 2) return true;
      }
    }
  }
  return false;
}

/* ---------------------------------------------------------------- main entry */

export interface StorefrontStats {
  storefronts: number;
  drawCalls: number;
  triangles: number;
  atlasPx: number;
  atlasPages: number;
  pxPerMetre: number;
  upperBoards: number;
  buildMs: number;
}

export function buildStorefronts(chunk: WorldChunkV2, core: WorldCore, quality: Quality): THREE.Group {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = `stores_${chunk.id}`;
  const byBuilding = new Map(chunk.buildings.map(b=>[b.id,b]));
  const list = (chunk.storefronts ?? []).filter(s=>{
    if(!s?.name||!s.facade)return false;
    if(s.placeId.startsWith('survey:'))return true;
    const b=s.buildingId?byBuilding.get(s.buildingId):undefined;
    // Researched architecture shows researched fronts. Raw listings remain in the map inventory.
    return !b?.researchedProfile&&!b?.surveyStyle&&s.placement?.display!=='listing_only';
  });
  const accessPlans=new Map<string,BuildingAccessPlan>();
  for(const b of chunk.buildings)if(b.researchedProfile?.fronts.some(f=>f.access)||['madhapur_commercial','madhapur_brown_commercial','habsiguda_gatsi_block'].includes(b.surveyStyle??''))accessPlans.set(b.id,buildingAccessPlan(b,chunk.storefronts.filter(s=>s.buildingId===b.id),accessRoadIndex(core)));
  // Source-backed building names and advertisement boards share the sign atlas without creating tenancy data.
  for(const building of chunk.buildings){
    const profile=building.researchedProfile;if(!profile)continue;
    const panels=[...(profile.nameBand&&building.name?[{...profile.nameBand,text:building.name,kind:'building_name'}]:[]),...(profile.signPanels??[]).map(p=>({...p,kind:'observed_advertisement'}))];
    for(const [index,band]of panels.entries()){
      const rule=profile.fronts[band.frontIndex??0];if(!rule)continue;
      const face=researchedFacesOf(building,rule,list.filter(s=>s.buildingId===building.id))[0];if(!face)continue;
      const [a,b]=face.facade,W=Math.hypot(b[0]-a[0],b[1]-a[1]);let x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,facade=face.facade;
      if(band.at!==undefined){
        let nx=(b[1]-a[1])/W,nz=-(b[0]-a[0])/W;if(nx*-Math.sin(face.heading)+nz*-Math.cos(face.heading)<0){nx=-nx;nz=-nz;}
        const offset=(band.at-.5)*W,half=W*(band.widthRatio??.65)/2;x+=nz*offset;z-=nx*offset;
        facade=[[x-nz*half,z+nx*half],[x+nz*half,z-nx*half]];
      }
      list.push({id:`building-panel-${building.id}-${index}`,placeId:`survey:building-panel-${building.id}-${index}`,name:band.text,nameTe:null,category:band.kind,group:'office_service',confidence:1,sources:profile.sourceIds,license:'Factual survey; reference imagery not redistributed',x,z,buildingId:building.id,roadId:building.frontRoadId??'',side:building.frontSide??'left',facade,facingHeading:face.heading,floor:1,status:'provisional',appearance:{signColor:band.color,signTextColor:band.textColor,signBaseM:band.baseM,signHeightM:band.heightM,signWidthM:W*(band.widthRatio??.65),signOutsetM:band.outsetM??.65,awning:false,categoryProps:false}});
    }
  }
  const stats: StorefrontStats = { storefronts: 0, drawCalls: 0, triangles: 0, atlasPx: 0, atlasPages: 0, pxPerMetre: 0, upperBoards: 0, buildMs: 0 };
  group.userData.stats = stats;
  group.userData.pending = Promise.resolve();
  if (!list.length) return group;

  const mats = sharedMats(quality);

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of list) { const f = s.facade!; for (const p of f) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); } }
  const elevated = nearElevated(core, minX, maxX, minZ, maxZ);

  // ------------------------------------------------------- pass 1: plans + sign cells
  const plans: Plan[] = [];
  const cells: Cell[] = [];
  const mctx = document.createElement('canvas').getContext('2d')!;
  (mctx as unknown as { textRendering?: string }).textRendering = 'optimizeLegibility';
  let hasTelugu = false;
  for (const sf of list) {
    const fr = frameOf(sf);
    if (!fr) continue;
    const len = Math.hypot(sf.facade![1][0] - sf.facade![0][0], sf.facade![1][1] - sf.facade![0][1]);
    const h = hashString(sf.id);
    const bld = sf.buildingId ? byBuilding.get(sf.buildingId) : undefined;
    const appearance = (sf as StyledStorefront).appearance;
    const H = appearance?.heightM ?? (bld ? bld.heightM : 9);
    const basePalette = palette(sf.group, h >>> 4);
    const pal: Pal = { ...basePalette, awn: [...basePalette.awn] };
    if(appearance?.signColor)pal.bg=appearance.signColor;
    if(appearance?.signTextColor)pal.fg=appearance.signTextColor;
    if(appearance?.shutterColor)pal.shutterTint=new THREE.Color(appearance.shutterColor).getHex();
    if(appearance?.awningColor)pal.awn=[new THREE.Color(appearance.awningColor).getHex(),new THREE.Color(appearance.awningColor).getHex()];
    if(appearance?.categoryProps===false)pal.icon=undefined;
    const researchSign=sf.placeId.startsWith('survey:') || sf.status==='verified';
    const te = sf.nameTe && sf.nameTe.trim() ? researchSign&&/[\r\n]/.test(sf.nameTe)?sf.nameTe:sf.nameTe.trim() : null;
    if (te) hasTelugu = true;
    if (isTelugu(sf.name)) hasTelugu = true;
    const W = sf.status === 'verified' || appearance ? len : Math.min(18, Math.max(2.6, len));
    const upper = sf.floor > 0;
    const neutralListing=sf.placement?.floorBasis==='unknown'&&!sf.placeId.startsWith('survey:');
    if(neutralListing){pal.bg='#435256';pal.fg='#e5ebe8';pal.icon=undefined;}
    const displayName=appearance?.displayName ?? sf.name;
    const label=researchSign&&/[\r\n]/.test(displayName)?displayName:displayName.trim();
    const lines = te && !isTelugu(displayName) ? [label, te] : [label];
    const long = sf.name.length > 26;
    let boardH: number, boardW: number, boardY: number;
    if (upper) {
      boardH = te ? 1.2 : 0.95;
      boardW = Math.min(8.5, Math.max(2.2, W * 0.86));
      boardY = Math.max(3.0, Math.min(4.3 + (h % 5) * 0.5, H - boardH - 0.35));
    } else {
      boardH = te ? 1.45 : long ? 1.25 : 1.1;
      boardW = Math.min(11, Math.max(2.4, W - 0.3));
      boardY = H >= 3.7 + boardH * 0.2 ? 2.55 : Math.max(1.8, H - boardH - 0.1);
    }
    if(appearance?.signWidthM!==undefined)boardW=Math.max(sf.placeId.startsWith('survey:building-panel-')?.08:.7,Math.min(W,appearance.signWidthM));
    if(neutralListing){
      const base=bld?.baseHeightM??0,bodyH=Math.max(.9,(bld?.heightM??H)-base);
      boardW=Math.max(.7,Math.min(W-.2,5));boardH=.7;boardY=base+Math.max(.1,Math.min(2.55,bodyH-boardH-.15));
    }
    if(appearance?.signHeightM!==undefined)boardH=Math.max(.3,appearance.signHeightM);
    if(appearance?.signBaseM!==undefined)boardY=Math.max(.1,appearance.signBaseM);
    const spec0: CellSpec = { lines, pal, vertical: false, icon: upper ? undefined : pal.icon,preserveText:researchSign };
    const textArea=signTextArea(boardW,boardH),innerW=textArea.widthM,innerH=textArea.heightM;
    const tw = measureSpec(mctx, spec0, innerW, innerH);
    const cell: Cell = { priority:researchSign,minimumDensity:quality==='low'?64:quality==='high'?130:96,wm: Math.max(0.08, Math.min(innerW, tw + 0.02)), hm: innerH, spec: spec0, px: 0, py: 0, pw: 0, ph: 0 };
    cells.push(cell);
    const plan: Plan = { sf, fr, W, H, h, pal, underDeck: underDeckAt(fr.cx, fr.cz, elevated), boardCell: cell, boardW, boardH, boardY };
    // A photographed horizontal hotel board does not establish an additional vertical sign.
    if (!researchSign && !upper && sf.group === 'hotel_lodging' && H >= 7.5 && quality !== 'low') {
      const bh = Math.min(3.2, H - boardY - boardH - 0.5);
      if (bh >= 1.8) {
        const bc: Cell = { priority:researchSign,minimumDensity:quality==='high'?130:96,wm: 0.85, hm: bh, spec: { lines: [sf.name.trim()], pal, vertical: true }, px: 0, py: 0, pw: 0, ph: 0 };
        cells.push(bc);
        plan.bladeCell = bc; plan.bladeH = bh; plan.bladeY0 = boardY + boardH + 0.25;
      }
    }
    plans.push(plan);
  }
  if (!plans.length) return group;

  // ------------------------------------------------------- atlas pack + paint
  const dMax = quality === 'high' ? 130 : quality === 'standard' ? 100 : 60;
  const layout=layoutSignAtlasPages(cells,dMax,quality==='high'?2048:quality==='standard'?1024:512,quality==='high'?4096:2048);
  const S=layout.size,d=dMax;
  const pages=Array.from({length:layout.pages},()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=S;
    const ctx=canvas.getContext('2d')!,tex=new THREE.CanvasTexture(canvas);
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=anisoFor(quality);tex.generateMipmaps=true;
    tex.minFilter=THREE.LinearMipmapLinearFilter;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;
    return {ctx,tex};
  });
  const paint = (): void => {
    for(const {ctx}of pages){ctx.fillStyle='#444';ctx.fillRect(0,0,S,S);}
    for(const c of cells)drawCell(pages[c.page!].ctx,c);
    for(const {tex}of pages)tex.needsUpdate=true;
  };
  paint();
  if (hasTelugu) {
    group.userData.pending = ensureTeluguFont().then(() => { paint(); });
  }

  const cellUV = (c: Cell): number[] => {
    const u0 = (c.px + 1) / S, u1 = (c.px + c.pw - 1) / S;
    const vT = 1 - (c.py + 1) / S, vB = 1 - (c.py + c.ph - 1) / S;
    return [u0, vB, u1, vB, u1, vT, u0, vT];
  };
  // ------------------------------------------------------- pass 2: geometry
  const lit = new GeoBuilder(true);
  const body = new GeoBuilder(true);
  const front = new GeoBuilder(true);
  const signs = pages.map(()=>new GeoBuilder(true));
  const cylGeo = quality === 'low' ? unitCylLow : unitCyl;
  const full = quality !== 'low';

  for (const pl of plans) {
    const { sf, fr, W, H, h, pal } = pl;
    const appearance = (sf as StyledStorefront).appearance;
    const L = new Loc(fr);
    const r = rng(h ^ 0x9e3779b9);
    const upper = sf.floor > 0;
    stats.storefronts++;
    const bgc = hex(new THREE.Color(pal.bg).getHex());
    const fgc = hex(new THREE.Color(pal.fg).getHex());
    const edgeC = dark(bgc, 0.55);

    // ---- sign board (3D box in the lit mesh + text quad in the sign mesh)
    const bw = pl.boardW, bh = pl.boardH, by = pl.boardY;
    const observedBuilding=sf.buildingId?byBuilding.get(sf.buildingId):undefined;
    // The observed Suprabhat header sits on the projecting balcony face, not behind its skin.
    const depth = upper ? 0.1 : 0.26, mount=appearance?.signOutsetM??(upper&&observedBuilding?.surveyStyle==='hotel_suprabhat'?.68:0);
    L.box(lit, -bw / 2, bw / 2, by, by + bh, mount+0.02, mount+depth, edgeC, true);
    L.quad(lit, -bw / 2, bw / 2, by, by + bh, mount+depth + 0.001, bgc, [0, 0, 1, 0, 1, 1, 0, 1]);
    const nSign = mount+depth + 0.004;
    const cw = pl.boardCell.wm, chh = pl.boardCell.hm;
    L.quad(signs[pl.boardCell.page!], -cw / 2, cw / 2, by + (bh - chh) / 2, by + (bh + chh) / 2, nSign, bgc, cellUV(pl.boardCell));
    {
      // thin trim line round the board face (keeps the 'manufactured sign' look without spending atlas pixels)
      const ft = 0.035, fi = 0.06, fc = hex(new THREE.Color(pal.fg).getHex());
      const fcol = [fc[0] * 0.92, fc[1] * 0.92, fc[2] * 0.92];
      const nF = mount+depth + 0.002;
      const uvz = [0, 0, 1, 0, 1, 1, 0, 1];
      L.quad(lit, -bw / 2 + fi, bw / 2 - fi, by + fi, by + fi + ft, nF, fcol, uvz);
      L.quad(lit, -bw / 2 + fi, bw / 2 - fi, by + bh - fi - ft, by + bh - fi, nF, fcol, uvz);
      L.quad(lit, -bw / 2 + fi, -bw / 2 + fi + ft, by + fi, by + bh - fi, nF, fcol, uvz);
      L.quad(lit, bw / 2 - fi - ft, bw / 2 - fi, by + fi, by + bh - fi, nF, fcol, uvz);
    }
    const neutralListing=sf.placement?.floorBasis==='unknown'&&!sf.placeId.startsWith('survey:');
    // Some observed records establish only a board (not a door or occupied shop bay).
    const observedBoardOnly=sf.placeId.startsWith('survey:')&&sf.category.endsWith('_signage');
    if (upper||neutralListing||observedBoardOnly) {
      if(upper)stats.upperBoards++;
      // two small brackets so the board visibly hangs on the wall
      L.box(body, -bw / 2 + 0.2, -bw / 2 + 0.26, by - 0.18, by, 0.02, mount+0.06, [0.3, 0.3, 0.3]);
      L.box(body, bw / 2 - 0.26, bw / 2 - 0.2, by - 0.18, by, 0.02, mount+0.06, [0.3, 0.3, 0.3]);
      continue;
    }

    const access=sf.buildingId?accessPlans.get(sf.buildingId):undefined;
    const recess=access&&sf.facade?accessRecessForFacade(access,sf.facade,sf.facingHeading):undefined;
    const baseY=appearance?.frontBaseM??0,inset=(appearance?.frontInsetM??0)-(recess?.depthM??0);
    if(appearance?.facadeColor) {
      L.box(body,-W/2,W/2,baseY,Math.max(by+bh+.2,Math.min(H,7)), inset-.08,inset, hex(new THREE.Color(appearance.facadeColor).getHex()));
    }
    // ---- ground-floor front: pilasters + textured panel(s)
    const fh = by; // front height (up to the underside of the board)
    const pil = hex(appearance?.facadeColor ? new THREE.Color(appearance.facadeColor).getHex() : h % 2 ? 0xd8d2c0 : 0xb8b2a2);
    L.box(body, -W / 2, -W / 2 + 0.14, baseY, fh, inset, inset+0.16, pil);
    L.box(body, W / 2 - 0.14, W / 2, baseY, fh, inset, inset+0.16, pil);
    const iw = W - 0.28;
    const nb = Math.max(1, Math.round(iw / 3.0));
    const cellsFor = FRONT_CELLS[sf.group] ?? FRONT_CELLS.other;
    const tint = pal.shutterTint !== undefined ? hex(pal.shutterTint) : hex([0x6f8aa6, 0x9a4a3a, 0x4e7a56, 0xb8b1a0, 0x7c7f86][h % 5]);
    for (let k = 0; k < nb; k++) {
      const ci = appearance?.frontStyle==='shutter'?FC.shutter:cellsFor[k === 0 ? 0 : (1 + (h + k)) % cellsFor.length] ?? cellsFor[0];
      const uvr = frontCellUV(ci, quality);
      const u0 = -iw / 2 + (iw * k) / nb, u1 = -iw / 2 + (iw * (k + 1)) / nb;
      const shutter = ci === FC.shutter || ci === FC.shutterHalf;
      const col = shutter ? tint : [1, 1, 1];
      // a hair of vertical variation of the frame colour avoids a tiled look
      if(appearance?.frontStyle==='open_bay'){
        // A shallow dark stock bay has no invented glass door, shutter or handles.
        L.quad(lit,u0,u1,baseY,fh,inset+.018,hex(0x292e28),[0,0,1,0,1,1,0,1]);
      }else if(appearance?.frontStyle==='glazed'){
        L.quad(lit,u0,u1,baseY,fh,inset+.05,hex(0x263b3d),[0,0,1,0,1,1,0,1]);
        L.box(body,u0,u0+.045,baseY,fh,inset+.05,inset+.09,hex(0x84938e));
        L.box(body,u1-.045,u1,baseY,fh,inset+.05,inset+.09,hex(0x84938e));
        L.box(body,(u0+u1)/2-.025,(u0+u1)/2+.025,baseY+.7,Math.min(fh,baseY+1.35),inset+.08,inset+.13,hex(0xc2c6ba));
      }else if(appearance?.frontStyle==='shutter'&&appearance.frontOpening){
        const opening=appearance.frontOpening,centre=(opening.at-.5)*W,a=centre-opening.widthM/2,b=centre+opening.widthM/2;
        for(const [left,right]of [[u0,Math.min(u1,a)],[Math.max(u0,b),u1]])if(right-left>.02)L.quad(front,left,right,baseY,fh,inset+.05,col,[uvr.u0,uvr.v0,uvr.u1,uvr.v0,uvr.u1,uvr.v1,uvr.u0,uvr.v1]);
        const left=Math.max(u0,a),right=Math.min(u1,b);
        if(right>left){
          L.quad(lit,left,right,baseY,fh,inset+.051,hex(0x142025),[0,0,1,0,1,1,0,1]);
          L.box(body,left,left+.05,baseY,fh,inset+.06,inset+.1,hex(0x999b8f));
          L.box(body,right-.05,right,baseY,fh,inset+.06,inset+.1,hex(0x999b8f));
        }
      }else L.quad(front, u0, u1, baseY, fh, inset+0.05, col, [uvr.u0, uvr.v0, uvr.u1, uvr.v0, uvr.u1, uvr.v1, uvr.u0, uvr.v1]);
    }
    // Stock visible in the source photograph is an explicit authored choice.
    // These shallow display pieces stay inside the facade's visual bay.
    if(appearance?.observedDisplay){
      if(['medicines','cement_bags','appliances','framed_art','hardware_goods','luggage_goods'].includes(appearance.observedDisplay)){
        const stock=appendObservedStock(appearance.observedDisplay as ObservedStock,appearance.displaySide,{widthM:iw,baseY,topY:fh,insetM:inset,yaw:fr.th,at:(u,n)=>L.at(u,n)},quality,body,lit);
        (group.userData.observedDisplays??=[]).push({storefrontId:sf.id,...stock,placementStatus:'provisional'});
      }else{
        L.quad(lit,-iw/2,iw/2,baseY,fh,inset+.10,hex(0x302f24),[0,0,1,0,1,1,0,1]);
        const cols=Math.max(3,Math.round(iw/.65));
        for(let col=0;col<cols;col++)for(let row=0;row<2+col%2;row++){
          const x=-iw/2+.12+(iw-.24)*(col+.5)/cols,w=(iw-.32)/cols*.85,y=baseY+row*.48;
          L.box(body,x-w/2,x+w/2,y,y+.44,inset+.13,inset+.52,hex(col%3===0?0xad9068:0xdad9c7));
          L.box(body,x-w/2,x+w/2,y+.06,y+.17,inset+.52,inset+.535,hex(0x276c93));
        }
        const coil=new THREE.TorusGeometry(.2,.025,quality==='low'?4:6,quality==='low'?10:18);
        for(let col=0;col<Math.max(2,Math.round(iw/1.1));col++){
          const x=-iw/2+.4+col*1.1,[wx,wz]=L.at(x,inset+.32);
          body.appendGeometry(coil,boxMatrix(wx,fh-.35,wz,fr.th),hex(0xaeb5ae));
        }
        coil.dispose();
      }
    }
    // doorstep
    if(baseY===0 && appearance?.frontStyle!=='glazed'&&appearance?.frontStyle!=='open_bay')L.box(body, -0.5 + ((h >> 3) % 7) * 0.12, 0.7 + ((h >> 3) % 7) * 0.12, 0, 0.12, 0.05, 0.38, hex(0x9a968c));

    // ---- awning / sun-shade (projecting)
    const wantAwn = appearance?.awning ?? (!pl.underDeck && sf.group !== 'worship' && (full || sf.group === 'restaurant') && ((h >> 5) % 5 !== 0 || sf.group === 'restaurant' || sf.group === 'cafe_bakery' || sf.group === 'grocery'));
    if (wantAwn) {
      const aw = W - 0.3;
      const ns = Math.max(2, Math.round(aw / 0.42));
      const yTop = by - 0.04, yBot = by - 0.42, nOut = 0.95;
      for (let i = 0; i < ns; i++) {
        const a0 = -aw / 2 + (aw * i) / ns, a1 = -aw / 2 + (aw * (i + 1)) / ns;
        const c = hex(pal.awn[i % 2]);
        L.slope(body, a0, a1, yTop, 0.16, yBot, nOut, c, L.nrm(0, 0.4, 0.9));
        L.quad(body, a0, a1, yBot - 0.2, yBot, nOut, c, [0, 0, 1, 0, 1, 1, 0, 1]);
      }
      // dark underside
      L.slope(body, -aw / 2, aw / 2, yTop - 0.02, 0.16, yBot - 0.02, nOut - 0.02, [0.12, 0.1, 0.09], L.nrm(0, -0.3, -0.9));
    }

    // ---- category props
    if (appearance?.categoryProps!==false && !pl.underDeck && quality !== 'low') {
      const nProps = quality === 'high' ? 1.4 : 1;
      const slotU = (k: number, n: number): number => {
        const span = Math.max(0.1, W - 1.4);
        return -span / 2 + (span * (k + 0.5 + (r() - 0.5) * 0.5)) / n;
      };
      switch (sf.group) {
        case 'grocery': {
          const n = Math.max(1, Math.min(4, Math.round((W / 3) * nProps)));
          for (let k = 0; k < n; k++) {
            const u = slotU(k, n);
            if (k % 2 === 0) {
              // crate stack with fruit/veg on top
              for (let l = 0; l < 2; l++) L.box(body, u - 0.3, u + 0.3, l * 0.3, l * 0.3 + 0.28, 0.12, 0.62, hex(l ? 0x9a7142 : 0x8a6238));
              const fruit = [0xd9382b, 0xf2b632, 0x4a9a3b, 0xe56b2e][Math.floor(r() * 4)];
              L.box(body, u - 0.26, u + 0.26, 0.6, 0.7, 0.16, 0.58, hex(fruit));
            } else {
              // sacks
              for (let l = 0; l < 2; l++) L.box(body, u - 0.28 + l * 0.05, u + 0.28 + l * 0.05, l * 0.26, l * 0.26 + 0.26, 0.12, 0.54, hex(l ? 0xcdb98c : 0xb9a475));
            }
          }
          break;
        }
        case 'restaurant':
        case 'cafe_bakery': {
          const u = slotU(0, 1);
          // A-frame menu board
          const mu = (h & 1 ? 1 : -1) * Math.max(0.5, W / 2 - 0.9);
          void u;
          L.slope(body, mu - 0.28, mu + 0.28, 0.9, 0.75, 0.0, 1.0, hex(0x24352a), L.nrm(0, 0.9, 0.5));
          L.slope(body, mu - 0.28, mu + 0.28, 0.9, 0.75, 0.0, 0.5, hex(0x1c2a21), L.nrm(0, -0.9, 0.5));
          for (let k = 0; k < 4; k++) {
            const yA = 0.72 - k * 0.15, yB = yA - 0.04;
            const nAt = (y: number): number => 0.75 + ((0.9 - y) / 0.9) * 0.25 + 0.01;
            L.slope(lit, mu - 0.2, mu + 0.2 - (k % 2) * 0.1, yA, nAt(yA), yB, nAt(yB), hex(0xf2efe4), L.nrm(0, 0.9, 0.5));
          }
          if (sf.group === 'cafe_bakery' && W > 3.5) {
            const tu = -mu * 0.8;
            L.cyl(body, cylGeo, tu, 0.8, 0.0, 0.72, 0.03, hex(0x333333));
            L.cyl(body, cylGeo, tu, 0.8, 0.72, 0.76, 0.32, hex(0xe8dfcc));
            for (const s of [-1, 1]) { L.cyl(body, cylGeo, tu + s * 0.55, 0.8, 0.0, 0.42, 0.04, hex(0x333333)); L.cyl(body, cylGeo, tu + s * 0.55, 0.8, 0.42, 0.46, 0.17, hex(pal.awn[0])); }
          }
          break;
        }
        case 'pharmacy': {
          // projecting lit green cross above the board end
          if (H >= 5.4) {
            const cu = -bw / 2 + 0.5, cy = by + bh + 0.7;
            L.box(lit, cu - 0.12, cu + 0.12, cy - 0.45, cy + 0.45, 0.3, 0.45, hex(0x18a35e));
            L.box(lit, cu - 0.45, cu + 0.45, cy - 0.12, cy + 0.12, 0.3, 0.45, hex(0x18a35e));
            L.box(body, cu - 0.03, cu + 0.03, by + bh, cy - 0.4, 0.12, 0.16, hex(0x444444));
          }
          break;
        }
        case 'hospital_clinic': {
          if (H >= 5.4) {
            const cu = bw / 2 - 0.5, cy = by + bh + 0.7;
            L.box(lit, cu - 0.12, cu + 0.12, cy - 0.45, cy + 0.45, 0.3, 0.45, hex(0x1d5fb8));
            L.box(lit, cu - 0.45, cu + 0.45, cy - 0.12, cy + 0.12, 0.3, 0.45, hex(0x1d5fb8));
          }
          // blue entrance canopy strip
          L.box(body, -0.9, 0.9, by - 0.18, by - 0.02, 0.05, 1.2, hex(0x2d6aa8));
          break;
        }
        case 'bank_atm': {
          const au = W / 2 - 0.75;
          L.box(body, au - 0.45, au + 0.45, 0, 1.95, 0.06, 0.52, hex(0x3d4a5a));
          L.box(lit, au - 0.36, au + 0.36, 1.45, 1.8, 0.525, 0.53, hex(0x1d6fd0));
          L.box(lit, au - 0.34, au + 0.34, 1.0, 1.35, 0.525, 0.53, hex(0x7ad0ff));
          L.box(body, au - 0.3, au + 0.3, 0.8, 0.95, 0.525, 0.56, hex(0xb8bcc2));
          L.box(lit, au - 0.4, au + 0.4, 1.98, 2.35, 0.06, 0.5, hex(0x0b4a8f));
          break;
        }
        case 'apparel': {
          const n = Math.max(1, Math.min(3, Math.round(W / 3.4)));
          for (let k = 0; k < n; k++) {
            const u = slotU(k, n);
            const cols = [[0xb0213a, 0x1c1c1c], [0xe4b52b, 0x2f4b8a], [0x2f7a5c, 0xd8d8d8], [0x7a3b8a, 0x222222]][(h + k) % 4];
            L.box(body, u - 0.22, u + 0.22, 0.0, 0.04, 0.2, 0.62, hex(0x2a2a2a)); // base plate
            L.box(body, u - 0.02, u + 0.02, 0.04, 0.5, 0.4, 0.44, hex(0x333333)); // pole
            L.box(body, u - 0.17, u + 0.17, 0.45, 1.0, 0.33, 0.51, hex(cols[1])); // trousers/skirt
            L.box(body, u - 0.19, u + 0.19, 1.0, 1.55, 0.32, 0.52, hex(cols[0])); // top
            L.box(body, u - 0.07, u + 0.07, 1.55, 1.82, 0.38, 0.46, hex(0xd9c7b4)); // head
          }
          break;
        }
        case 'electronics_mobile': {
          for (const s of [-1, 1]) {
            const u = s * Math.max(0.6, W / 2 - 0.8);
            L.box(body, u - 0.3, u + 0.3, 0, 0.04, 0.3, 0.7, hex(0x2a2a2a));
            L.box(lit, u - 0.28, u + 0.28, 0.04, 1.75, 0.49, 0.51, hex(s > 0 ? 0xe53935 : 0xffc400));
            L.box(lit, u - 0.2, u + 0.2, 0.9, 1.5, 0.512, 0.52, hex(0x101820));
          }
          break;
        }
        case 'jewellery': {
          for (const s of [-1, 1]) L.box(lit, s * (W / 2 - 0.2) - 0.03, s * (W / 2 - 0.2) + 0.03, 0.2, fh - 0.2, 0.17, 0.19, hex(0xf0c75e));
          break;
        }
        case 'auto_service': {
          const u = slotU(0, 2);
          for (let l = 0; l < 4; l++) L.cyl(body, cylGeo, u, 0.65, l * 0.22, (l + 1) * 0.22, 0.34 - (l % 2) * 0.01, hex(0x151515));
          for (let l = 0; l < 3; l++) L.cyl(body, cylGeo, u + 0.75, 0.6, l * 0.22, (l + 1) * 0.22, 0.34, hex(0x1b1b1b));
          L.cyl(body, cylGeo, -u * 0.9, 0.5, 0, 0.85, 0.27, hex(0x2f6fb5));
          break;
        }
        case 'hardware': {
          const u = slotU(0, 2);
          for (let k = 0; k < 7; k++) L.cyl(body, cylGeo, u - 0.3 + (k % 4) * 0.13, 0.3 + Math.floor(k / 4) * 0.12, 0, 1.9 - (k % 3) * 0.1, 0.055, hex(k % 3 ? 0xcfd3d6 : 0x3d6fb4));
          const u2 = -u * 0.9;
          for (let k = 0; k < 4; k++) L.cyl(body, cylGeo, u2 + (k % 2) * 0.4, 0.5 + (k >> 1) * 0.0, (k >> 1) * 0.3, (k >> 1) * 0.3 + 0.3, 0.17, hex([0xd9382b, 0xf2b632, 0x2f7fc1, 0xe8e2d2][k]));
          L.box(body, u2 - 0.45, u2 + 0.45, 0, 0.5, 0.15, 0.55, hex(0xa8864f));
          break;
        }
        default:
          break;
      }
    }

    // ---- vertical blade board for hotels (flush on the wall above the front)
    if (pl.bladeCell && pl.bladeH && pl.bladeY0 !== undefined && !pl.underDeck) {
      const bu = W / 2 - 0.65;
      L.box(lit, bu - 0.45, bu + 0.45, pl.bladeY0, pl.bladeY0 + pl.bladeH, 0.02, 0.1, edgeC, true);
      L.quad(signs[pl.bladeCell.page!], bu - 0.425, bu + 0.425, pl.bladeY0 + 0.02, pl.bladeY0 + pl.bladeH - 0.02, 0.104, bgc, cellUV(pl.bladeCell));
    }
    void fgc;
  }

  // ------------------------------------------------------- emit
  stats.triangles = 0;
  const emit = (b: GeoBuilder, mat: THREE.Material, name: string, cast: boolean): void => {
    if (b.vcount === 0) return;
    const geo = b.build();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = false;
    group.add(m);
    stats.drawCalls++;
    stats.triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
  };
  emit(front, mats.front, 'store-fronts', false);
  emit(body, mats.body, 'store-body', true);
  emit(lit, mats.lit, 'store-boards', false);
  const signMaterials=pages.map(({tex},i)=>{const mat=makeSignMaterial(tex,quality==='low'?80:120);emit(signs[i],mat,i?'store-signs-'+i:'store-signs',false);return mat;});
  stats.buildMs = Math.round((performance.now() - t0) * 10) / 10;
  stats.atlasPx = S;
  stats.atlasPages = pages.length;
  stats.pxPerMetre = Math.round(d);
  group.userData.signTextures = pages.map(p=>p.tex);
  group.userData.signMaterials = signMaterials;
  registerCull(group);
  return group;
}

/** Free the per-chunk sign atlas and geometry (shared materials and the front atlas stay cached). */
export function disposeStorefronts(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  for(const tex of (g.userData.signTextures??[]) as THREE.Texture[])tex.dispose();
  for(const mat of (g.userData.signMaterials??[]) as THREE.Material[])mat.dispose();
}
