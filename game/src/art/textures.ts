/**
 * Texture sources: bundled Poly Haven (CC0) PBR maps, and procedural canvases
 * (facade atlases, ground, roof, glow sprites). Everything is cached so chunks
 * share a handful of textures.
 */
import * as THREE from 'three';
import type { Quality } from './api';
import { rng } from './geo';

const pending: Promise<unknown>[] = [];
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

export function assetUrl(path: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  return `${base}${path}`;
}

export function loadMapTexture(path: string, srgb: boolean, aniso: number): THREE.Texture {
  const key = `${path}|${srgb}|${aniso}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const p = new Promise<void>((resolve) => {
    const t = loader.load(
      assetUrl(path),
      () => resolve(),
      undefined,
      () => resolve(), // a missing texture must never block the game; material falls back to its colour
    );
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    texCache.set(key, t);
  });
  pending.push(p);
  return texCache.get(key)!;
}

/** Resolves when every bundled image requested so far has loaded (or failed). */
export function texturesReady(): Promise<void> {
  const snapshot = pending.slice();
  return Promise.all(snapshot).then(() => undefined);
}

export function anisoFor(q: Quality): number {
  return q === 'high' ? 8 : q === 'standard' ? 4 : 2;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finishCanvasTexture(c: HTMLCanvasElement, srgb = true, aniso = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------ facades */

export const FACADE_VARIANTS = 8;
export const SHOP_VARIANTS = 8;
/** metres of wall covered by one facade cell (width) and floor height */
export const BAY_W = 3.0;
export const FLOOR_H = 3.2;
export const SHOP_H = 3.8;

function speckle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number, n: number, a = 0.05): void {
  for (let i = 0; i < n; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${a * r()})`;
    ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 2, 1 + r() * 3);
  }
}

function drawFacadeCell(ctx: CanvasRenderingContext2D, x0: number, variant: number, seed: number): void {
  const r = rng(seed * 977 + variant * 131);
  ctx.save();
  ctx.translate(x0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, 128, 128);
  ctx.clip();
  // plaster
  ctx.fillStyle = '#f2f1ec';
  ctx.fillRect(0, 0, 128, 128);
  // weathering streaks
  for (let i = 0; i < 7; i++) {
    const sx = 6 + r() * 116;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(90,80,60,0)');
    g.addColorStop(1, `rgba(90,80,60,${0.05 + r() * 0.07})`);
    ctx.fillStyle = g;
    ctx.fillRect(sx, 0, 2 + r() * 5, 128);
  }
  speckle(ctx, 0, 0, 128, 128, r, 220, 0.18);

  const glass = (x: number, y: number, w: number, h: number): void => {
    const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    g.addColorStop(0, '#5f7f96');
    g.addColorStop(0.45, '#2c4256');
    g.addColorStop(1, '#1b2a38');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  const frame = (x: number, y: number, w: number, h: number, col = '#d9d6cc'): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  };
  const recess = (x: number, y: number, w: number, h: number): void => {
    // inner shadow along top and left for depth
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillRect(x, y, 4, h);
  };
  const chajja = (x: number, y: number, w: number): void => {
    ctx.fillStyle = '#d7d3c7';
    ctx.fillRect(x - 6, y - 7, w + 12, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x - 4, y - 2, w + 8, 7);
  };

  switch (variant) {
    case 0: {
      glass(34, 34, 60, 62); frame(34, 34, 60, 62); recess(34, 34, 60, 62);
      ctx.fillStyle = '#d9d6cc'; ctx.fillRect(63, 34, 3, 62); ctx.fillRect(34, 62, 60, 3);
      chajja(34, 34, 60);
      break;
    }
    case 1: { // balcony
      ctx.fillStyle = '#17202a'; ctx.fillRect(18, 22, 92, 82);
      glass(26, 30, 36, 66); glass(66, 30, 36, 66);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(18, 22, 92, 6);
      // slab
      ctx.fillStyle = '#d3d0c4'; ctx.fillRect(10, 100, 108, 9);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(10, 109, 108, 4);
      // railing
      ctx.strokeStyle = '#8c9aa3'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, 72); ctx.lineTo(118, 72); ctx.stroke();
      for (let x = 12; x < 118; x += 7) { ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x, 100); ctx.stroke(); }
      // hanging laundry on some
      if (r() > 0.55) {
        const cols = ['#d94f4f', '#3a7ec4', '#e8c14b', '#ffffff'];
        for (let i = 0; i < 3; i++) { ctx.fillStyle = cols[(i + Math.floor(r() * 4)) % 4]; ctx.fillRect(24 + i * 22, 74, 12, 16); }
      }
      break;
    }
    case 2: { // twin windows with grille
      for (const x of [20, 70]) {
        glass(x, 36, 38, 54); frame(x, 36, 38, 54, '#cfcbbf'); recess(x, 36, 38, 54);
        ctx.strokeStyle = '#262a2e'; ctx.lineWidth = 1.6;
        for (let gx = x + 6; gx < x + 38; gx += 7) { ctx.beginPath(); ctx.moveTo(gx, 36); ctx.lineTo(gx, 90); ctx.stroke(); }
        for (let gy = 48; gy < 90; gy += 14) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + 38, gy); ctx.stroke(); }
      }
      ctx.fillStyle = '#cfcbbf'; ctx.fillRect(10, 98, 108, 4);
      break;
    }
    case 3: { // commercial ribbon glass
      ctx.fillStyle = '#9ea5aa'; ctx.fillRect(6, 24, 116, 82);
      const g = ctx.createLinearGradient(0, 28, 120, 100);
      g.addColorStop(0, '#6f94ad'); g.addColorStop(0.5, '#3a566b'); g.addColorStop(1, '#233546');
      ctx.fillStyle = g; ctx.fillRect(9, 28, 110, 74);
      ctx.fillStyle = '#8b9398';
      for (let x = 9 + 27; x < 119; x += 27) ctx.fillRect(x - 1.5, 28, 3, 74);
      ctx.fillRect(9, 63, 110, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(14, 100); ctx.lineTo(60, 30); ctx.lineTo(74, 30); ctx.lineTo(28, 100); ctx.fill();
      break;
    }
    case 4: { // blank wall with split AC unit and small vent
      glass(78, 52, 26, 30); frame(78, 52, 26, 30);
      ctx.fillStyle = '#e7e7e2'; ctx.fillRect(20, 48, 42, 18);
      ctx.strokeStyle = '#a9adaf'; ctx.lineWidth = 1; ctx.strokeRect(20, 48, 42, 18);
      ctx.fillStyle = '#bfc3c5'; for (let y = 54; y < 64; y += 3) ctx.fillRect(24, y, 34, 1.4);
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(62, 62); ctx.lineTo(70, 62); ctx.lineTo(70, 120); ctx.stroke();
      ctx.fillStyle = 'rgba(40,30,20,0.22)'; ctx.fillRect(66, 66, 8, 62);
      break;
    }
    case 5: { // arched pair
      for (const x of [22, 72]) {
        ctx.beginPath(); ctx.moveTo(x, 94); ctx.lineTo(x, 52); ctx.arc(x + 17, 52, 17, Math.PI, 0); ctx.lineTo(x + 34, 94); ctx.closePath();
        ctx.fillStyle = '#d3d0c4'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 3, 94); ctx.lineTo(x + 3, 52); ctx.arc(x + 17, 52, 14, Math.PI, 0); ctx.lineTo(x + 31, 94); ctx.closePath();
        const g = ctx.createLinearGradient(x, 36, x + 34, 94);
        g.addColorStop(0, '#5a7a90'); g.addColorStop(1, '#1e2c3a');
        ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = '#d3d0c4'; ctx.fillRect(x + 15.5, 38, 3, 56);
      }
      ctx.fillStyle = '#cfcbbf'; ctx.fillRect(14, 96, 100, 5);
      break;
    }
    case 6: { // louvre shutters (open)
      glass(40, 34, 48, 62); frame(40, 34, 48, 62);
      ctx.fillStyle = '#4a6b4d';
      for (const sx of [22, 88]) {
        ctx.fillRect(sx, 34, 18, 62);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let y = 38; y < 94; y += 5) ctx.fillRect(sx, y, 18, 2);
        ctx.fillStyle = '#4a6b4d';
      }
      break;
    }
    default: { // 7 window + hanging AC + drain
      glass(36, 30, 56, 66); frame(36, 30, 56, 66); recess(36, 30, 56, 66);
      ctx.fillStyle = '#d9d6cc'; ctx.fillRect(63, 30, 3, 66);
      ctx.fillStyle = '#ebebe6'; ctx.fillRect(74, 98, 30, 20);
      ctx.strokeStyle = '#9b9f9f'; ctx.strokeRect(74, 98, 30, 20);
      ctx.fillStyle = '#a9adaf'; for (let y = 103; y < 116; y += 3) ctx.fillRect(78, y, 22, 1.2);
      chajja(36, 30, 56);
      break;
    }
  }
  // floor slab band at the bottom (reads as storey lines)
  ctx.fillStyle = 'rgba(0,0,0,0.17)';
  ctx.fillRect(0, 122, 128, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 119, 128, 3);
  ctx.restore();
}

function drawShopCell(ctx: CanvasRenderingContext2D, x0: number, variant: number, seed: number): void {
  const r = rng(seed * 313 + variant * 71);
  ctx.save();
  ctx.translate(x0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, 128, 160);
  ctx.clip();
  ctx.fillStyle = '#ece9e2';
  ctx.fillRect(0, 0, 128, 160);
  speckle(ctx, 0, 0, 128, 160, r, 250, 0.2);
  const bands = ['#d9d2c0', '#2f5d8a', '#b23a35', '#e9c46a', '#f4f1e8', '#3f7d5b', '#6d4c8f', '#e07a3d'];
  const band = (col: string): void => {
    ctx.fillStyle = col; ctx.fillRect(6, 8, 116, 26);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(6, 34, 116, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(6, 8, 116, 2);
  };
  const awning = (c1: string, c2: string, y = 38, h = 18): void => {
    const n = 8;
    for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? c1 : c2; ctx.fillRect(6 + i * (116 / n), y, 116 / n + 0.6, h); }
    ctx.fillStyle = 'rgba(0,0,0,0.33)'; ctx.fillRect(6, y + h, 116, 6);
    ctx.beginPath(); ctx.moveTo(6, y + h); for (let i = 0; i <= n; i++) { ctx.lineTo(6 + i * (116 / n), y + h + (i % 2 ? 4 : 0)); } ctx.lineTo(122, y + h); ctx.fillStyle = 'rgba(0,0,0,0.0)'; ctx.fill();
  };
  const interior = (x: number, y: number, w: number, h: number): void => {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#2b2420'); g.addColorStop(1, '#4a3a2c');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // shelves with goods
    for (let sy = y + 6; sy < y + h - 14; sy += 18) {
      ctx.fillStyle = '#6b5a47'; ctx.fillRect(x + 2, sy + 12, w - 4, 2);
      for (let gx = x + 4; gx < x + w - 6; gx += 8) {
        const cols = ['#d94f4f', '#e8c14b', '#3a9d5d', '#3a7ec4', '#f2f2f2', '#e07a3d'];
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        ctx.fillRect(gx, sy + 2 + r() * 3, 5, 10 - r() * 3);
      }
    }
  };
  switch (variant) {
    case 0: { // closed rolling shutter
      band(bands[Math.floor(r() * bands.length)]);
      ctx.fillStyle = '#7e8a94'; ctx.fillRect(8, 40, 112, 112);
      for (let y = 42; y < 150; y += 4) { ctx.fillStyle = y % 8 ? '#8d99a2' : '#6f7b85'; ctx.fillRect(8, y, 112, 3); }
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(8, 40, 112, 5);
      break;
    }
    case 1: { // open shop with striped awning
      band(bands[Math.floor(r() * bands.length)]);
      interior(10, 40, 108, 100);
      awning(r() > 0.5 ? '#d94f4f' : '#2f6fb0', '#f3efe4', 36, 18);
      ctx.fillStyle = '#8b7b66'; ctx.fillRect(10, 128, 108, 14);
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
    case 2: { // glass shopfront + door
      band(bands[Math.floor(r() * bands.length)]);
      const g = ctx.createLinearGradient(10, 40, 118, 140);
      g.addColorStop(0, '#6d93ad'); g.addColorStop(0.6, '#2f4a60'); g.addColorStop(1, '#1e2d3b');
      ctx.fillStyle = g; ctx.fillRect(10, 42, 108, 100);
      ctx.fillStyle = '#a9b0b5'; ctx.fillRect(58, 42, 4, 100); ctx.fillRect(10, 42, 108, 3); ctx.fillRect(10, 138, 108, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(16, 138); ctx.lineTo(48, 46); ctx.lineTo(60, 46); ctx.lineTo(28, 138); ctx.fill();
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
    case 3: { // residential arch door with gate
      ctx.fillStyle = '#d6d0c2'; ctx.fillRect(30, 30, 68, 124);
      ctx.beginPath(); ctx.moveTo(36, 150); ctx.lineTo(36, 70); ctx.arc(64, 70, 28, Math.PI, 0); ctx.lineTo(92, 150); ctx.closePath();
      ctx.fillStyle = '#1b1612'; ctx.fill();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3;
      for (let x = 40; x <= 88; x += 8) { ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x, 60 + Math.abs(x - 64) * 0.6); ctx.stroke(); }
      ctx.fillStyle = '#7d5b34'; ctx.fillRect(36, 112, 56, 3);
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 152, 112, 6);
      break;
    }
    case 4: { // roadside stall: green awning, goods
      band(bands[Math.floor(r() * bands.length)]);
      interior(14, 42, 100, 96);
      awning('#2f7d4f', '#f3efe4', 36, 20);
      // crates
      for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#c9552b', '#e6b422', '#7bb241', '#d9d2c0'][i]; ctx.fillRect(14 + i * 26, 124, 22, 16); ctx.strokeStyle = '#5a4630'; ctx.strokeRect(14 + i * 26, 124, 22, 16); }
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
    case 5: { // shutter half open
      band(bands[Math.floor(r() * bands.length)]);
      interior(10, 40, 108, 108);
      ctx.fillStyle = '#7e8a94'; ctx.fillRect(8, 40, 112, 44);
      for (let y = 42; y < 84; y += 4) { ctx.fillStyle = y % 8 ? '#8d99a2' : '#6f7b85'; ctx.fillRect(8, y, 112, 3); }
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 84, 112, 5);
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
    case 6: { // showroom
      band(bands[Math.floor(r() * bands.length)]);
      const g = ctx.createLinearGradient(0, 40, 128, 150);
      g.addColorStop(0, '#9fb7c6'); g.addColorStop(0.5, '#587891'); g.addColorStop(1, '#30475a');
      ctx.fillStyle = g; ctx.fillRect(8, 40, 112, 106);
      ctx.fillStyle = '#c3c8cb'; ctx.fillRect(8, 40, 112, 4); ctx.fillRect(8, 142, 112, 6);
      for (let x = 8 + 37; x < 120; x += 37) ctx.fillRect(x, 40, 3, 106);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(14, 60, 20, 60);
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
    default: { // 7 compact shop with side shutter and glass
      band(bands[Math.floor(r() * bands.length)]);
      ctx.fillStyle = '#7e8a94'; ctx.fillRect(8, 40, 38, 108);
      for (let y = 42; y < 146; y += 4) { ctx.fillStyle = y % 8 ? '#8d99a2' : '#6f7b85'; ctx.fillRect(8, y, 38, 3); }
      interior(50, 44, 70, 94);
      awning('#e9c46a', '#ffffff', 36, 14);
      ctx.fillStyle = '#3a3f44'; ctx.fillRect(8, 148, 112, 6);
      break;
    }
  }
  ctx.restore();
}

const atlasCache = new Map<string, THREE.CanvasTexture>();

/** Original quiet asphalt grain; one tiny shared map replaces three PBR maps on everyday presets. */
export function getRoadSurface(): THREE.CanvasTexture {
  const key = 'roadster-asphalt';
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(128, 128), random = rng(133);
  ctx.fillStyle = '#d6d6d5'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = random() > .5 ? '#cfcfce' : '#dbdbda';
    ctx.fillRect(Math.floor(random() * 128), Math.floor(random() * 128), 1, 1);
  }
  const t = finishCanvasTexture(c, true, 2);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  atlasCache.set(key, t); return t;
}

export function getFacadeAtlas(q: Quality): THREE.CanvasTexture {
  const key = `facade${q}`;
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const k = q === 'low' ? 0.5 : q === 'high' ? 1.5 : 1;
  const [c, ctx] = canvas(FACADE_VARIANTS * 128 * k, 128 * k);
  ctx.scale(k, k);
  for (let v = 0; v < FACADE_VARIANTS; v++) drawFacadeCell(ctx, v * 128, v, 11);
  const t = finishCanvasTexture(c, true, anisoFor(q));
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  atlasCache.set(key, t);
  return t;
}

export function getShopAtlas(q: Quality): THREE.CanvasTexture {
  const key = `shop${q}`;
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const k = q === 'low' ? 0.5 : q === 'high' ? 1.5 : 1;
  const [c, ctx] = canvas(SHOP_VARIANTS * 128 * k, 160 * k);
  ctx.scale(k, k);
  for (let v = 0; v < SHOP_VARIANTS; v++) drawShopCell(ctx, v * 128, v, 5);
  const t = finishCanvasTexture(c, true, anisoFor(q));
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  atlasCache.set(key, t);
  return t;
}

/* ---------------------------------------------------- noise textures */

export function getNoiseTexture(kind: 'ground' | 'roof' | 'plaster', q: Quality): THREE.CanvasTexture {
  const key = `noise${kind}${q}`;
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const size = kind === 'ground' ? (q === 'low' ? 256 : 512) : q === 'low' ? 128 : 256;
  const [c, ctx] = canvas(size, size);
  const r = rng(kind === 'ground' ? 7 : kind === 'roof' ? 19 : 31);
  const base = kind === 'ground' ? [184, 178, 166] : kind === 'roof' ? [168, 166, 160] : [236, 234, 226];
  ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  ctx.fillRect(0, 0, size, size);
  // low-frequency blotches (wrapped) then grain
  for (let i = 0; i < 90; i++) {
    const x = r() * size, y = r() * size, rad = 8 + r() * 40;
    const d = (r() - 0.5) * (kind === 'ground' ? 20 : 34);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      const v = d > 0 ? 255 : 0;
      g.addColorStop(0, `rgba(${v},${v},${v},${Math.abs(d) / 255})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  for (let i = 0; i < size * size * 0.06; i++) {
    const v = r() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.04 + r() * 0.07})`;
    ctx.fillRect(r() * size, r() * size, 1, 1);
  }
  if (kind === 'ground') {
    // urban dust: pale concrete slab patches with hairline cracks, dark oil/damp stains, pebbles
    const wrap = (fn: (ox: number, oy: number) => void): void => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy); };
    for (let i = 0; i < 16; i++) {
      const x = r() * size, y = r() * size, w = size * (0.12 + r() * 0.2), h = size * (0.1 + r() * 0.16);
      const lum = r() > 0.5 ? 255 : 120;
      wrap((ox, oy) => {
        ctx.fillStyle = `rgba(${lum},${lum},${lum - 8},${0.07 + r() * 0.06})`;
        ctx.fillRect(x + ox, y + oy, w, h);
        ctx.strokeStyle = 'rgba(60,55,48,0.09)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + ox, y + oy, w, h);
      });
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * size, y = r() * size, rx = size * (0.03 + r() * 0.07), ry = rx * (0.5 + r() * 0.8);
      wrap((ox, oy) => {
        ctx.fillStyle = `rgba(52,46,38,${0.03 + r() * 0.04})`;
        ctx.beginPath(); ctx.ellipse(x + ox, y + oy, rx, ry, r() * 3, 0, Math.PI * 2); ctx.fill();
      });
    }
    for (let i = 0; i < size * 2; i++) {
      { const v = r() > 0.5 ? 232 : 72; ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.16 + r() * 0.16})`; }
      ctx.fillRect(r() * size, r() * size, 1 + r(), 1 + r());
    }
  }
  if (kind === 'roof') {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, (i + 0.5) * size / 4); ctx.lineTo(size, (i + 0.5) * size / 4); ctx.stroke(); }
  }
  const t = finishCanvasTexture(c, true, 4);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  atlasCache.set(key, t);
  return t;
}

/** Soft round sprite (white centre fading out) used for vapour, glows and blob shadows. */
export function getSoftSprite(kind: 'vapour' | 'glow' | 'blob'): THREE.CanvasTexture {
  const key = `sprite${kind}`;
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const s = 128;
  const [c, ctx] = canvas(s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (kind === 'blob') {
    g.addColorStop(0, 'rgba(0,0,0,0.72)');
    g.addColorStop(0.32, 'rgba(0,0,0,0.58)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
  } else if (kind === 'glow') {
    g.addColorStop(0, 'rgba(190,230,255,1)');
    g.addColorStop(0.3, 'rgba(120,190,255,0.55)');
    g.addColorStop(1, 'rgba(80,150,255,0)');
  } else {
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(235,245,255,0.35)');
    g.addColorStop(1, 'rgba(235,245,255,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = finishCanvasTexture(c, true, 1);
  atlasCache.set(key, t);
  return t;
}

/** Simple sync label for the car decal etc. (Latin only - Telugu goes through createSignTexture). */
export function latinLabelTexture(lines: string[], fg: string, bg: string | null, w = 512, h = 128, font = '700 44px "Helvetica Neue", Arial, sans-serif'): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  const lh = h / lines.length;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, lh * (i + 0.5)));
  return finishCanvasTexture(c, true, 4);
}
