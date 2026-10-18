/**
 * Shared shop-front texture atlas (4x4 cells of 3.0 m x 2.8 m of ground-floor frontage).
 * Painted procedurally, cached per quality. Generic goods and fixtures only: no brand
 * names, logos or trademarks. Sign text is NOT here (see storefronts.ts: per-chunk sign atlas).
 */
import * as THREE from 'three';
import type { Quality } from './api';
import { rng } from './geo';
import { anisoFor } from './textures';

export const FRONT_COLS = 4;
export const FRONT_CELL_W_M = 3.0;
export const FRONT_CELL_H_M = 2.8;

/** cell indices (see drawCell) */
export const FC = {
  shutter: 0, shutterHalf: 1, grocery: 2, restaurant: 3, apparel: 4, electronics: 5, jewellery: 6, pharmacy: 7,
  clinic: 8, bank: 9, hardware: 10, autoBay: 11, bakery: 12, hotel: 13, office: 14, kirana: 15,
} as const;

type C = CanvasRenderingContext2D;
const GOODS = ['#d9382b', '#f2b632', '#2f7fc1', '#3b9a4f', '#e8e2d2', '#e56b2e', '#7a4aa3', '#f4d8d0', '#1c6a73', '#c9a227'];

function R(c: C, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

function grad(c: C, x: number, y: number, w: number, h: number, a: string, b: string): void {
  const g = c.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
}

function goods(c: C, r: () => number, x: number, y: number, w: number, h: number, rowH: number, pal = GOODS): void {
  for (let yy = y; yy + rowH <= y + h + 0.5; yy += rowH) {
    R(c, x, yy + rowH - 3, w, 3, '#6b5238'); // shelf plank
    let xx = x + 2;
    while (xx < x + w - 6) {
      const bw = 7 + r() * 11;
      const bh = rowH * (0.45 + r() * 0.45);
      c.fillStyle = pal[Math.floor(r() * pal.length)];
      c.fillRect(xx, yy + rowH - 3 - bh, Math.min(bw, x + w - xx - 2), bh);
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.fillRect(xx, yy + rowH - 3 - bh, Math.min(bw, x + w - xx - 2), 2);
      xx += bw + 1 + r() * 2;
    }
  }
}

function frame(c: C, col = '#8e8a80'): void {
  R(c, 0, 0, 7, 256, col);
  R(c, 249, 0, 7, 256, col);
  R(c, 0, 0, 256, 6, col);
  R(c, 0, 250, 256, 6, '#6e6a62'); // plinth
}

function glassSheen(c: C, x: number, y: number, w: number, h: number): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.10)';
  c.beginPath();
  c.moveTo(x + w * 0.15, y + h);
  c.lineTo(x + w * 0.45, y);
  c.lineTo(x + w * 0.6, y);
  c.lineTo(x + w * 0.3, y + h);
  c.fill();
  c.restore();
}

function drawCell(c: C, i: number, r: () => number): void {
  // base wall
  R(c, 0, 0, 256, 256, '#cfcabd');
  switch (i) {
    case FC.shutter: {
      R(c, 0, 0, 256, 256, '#a9b1b6');
      for (let y = 20; y < 244; y += 5) R(c, 8, y, 240, 1.5, 'rgba(40,50,60,0.45)');
      grad(c, 8, 20, 240, 224, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.22)');
      R(c, 8, 4, 240, 18, '#7f878c'); // roller cassette
      R(c, 100, 214, 56, 7, '#444a50'); // handle bar
      R(c, 108, 224, 8, 10, '#d4b04a'); // padlock
      for (let k = 0; k < 14; k++) R(c, 8 + r() * 230, 30 + r() * 200, 3 + r() * 10, 1 + r() * 2, 'rgba(60,40,20,0.25)');
      R(c, 0, 0, 8, 256, '#8e8a80'); R(c, 248, 0, 8, 256, '#8e8a80');
      break;
    }
    case FC.shutterHalf: {
      R(c, 8, 8, 240, 240, '#2a2018');
      goods(c, r, 12, 90, 232, 150, 50);
      R(c, 8, 240, 240, 10, '#5a4630');
      R(c, 8, 8, 240, 78, '#a9b1b6');
      for (let y = 14; y < 84; y += 5) R(c, 8, y, 240, 1.5, 'rgba(40,50,60,0.45)');
      R(c, 8, 84, 240, 6, '#5d656a');
      R(c, 0, 0, 8, 256, '#8e8a80'); R(c, 248, 0, 8, 256, '#8e8a80');
      break;
    }
    case FC.grocery:
    case FC.kirana: {
      R(c, 8, 8, 240, 240, '#2b1f16');
      // hanging packet strings
      for (let x = 12; x < 244; x += 11) {
        const l = 26 + r() * 38;
        R(c, x + 4, 8, 1, 8, '#555');
        for (let k = 0; k < l; k += 7) {
          c.fillStyle = GOODS[Math.floor(r() * GOODS.length)];
          c.fillRect(x, 16 + k, 9, 6);
        }
      }
      goods(c, r, 12, 84, 232, 100, i === FC.kirana ? 34 : 50);
      // counter
      R(c, 8, 192, 240, 54, '#7b5a38');
      R(c, 8, 192, 240, 5, '#a98355');
      // sacks / crates in front
      for (let k = 0; k < 4; k++) {
        R(c, 16 + k * 58, 206 + (k % 2) * 4, 46, 40, k % 2 ? '#c9b48a' : '#a98a58');
        R(c, 16 + k * 58, 206 + (k % 2) * 4, 46, 4, 'rgba(255,255,255,0.3)');
      }
      frame(c, '#8a8c80');
      break;
    }
    case FC.restaurant: {
      // big window (left) + glass door (right)
      grad(c, 10, 14, 150, 206, '#ffd9a0', '#c97a38');
      for (let k = 0; k < 3; k++) { R(c, 24 + k * 46, 134, 30, 5, '#4a2f1a'); R(c, 36 + k * 46, 139, 5, 56, '#4a2f1a'); }
      for (let k = 0; k < 4; k++) { c.fillStyle = '#fff3d1'; c.beginPath(); c.arc(30 + k * 38, 36, 9, 0, 6.3); c.fill(); }
      R(c, 28, 78, 46, 40, '#fff6dd'); // menu poster
      for (let k = 0; k < 5; k++) R(c, 33, 84 + k * 7, 36, 2, '#b3402b');
      glassSheen(c, 10, 14, 150, 206);
      grad(c, 170, 14, 76, 224, '#ffcf8a', '#a8642a');
      R(c, 170, 14, 76, 4, '#333'); R(c, 170, 14, 4, 224, '#333'); R(c, 242, 14, 4, 224, '#333'); R(c, 205, 14, 3, 224, '#333');
      R(c, 196, 120, 4, 30, '#ddd'); R(c, 214, 120, 4, 30, '#ddd');
      glassSheen(c, 170, 14, 76, 224);
      R(c, 10, 220, 150, 20, '#6c3a22'); // stall riser tiles
      frame(c);
      break;
    }
    case FC.apparel: {
      grad(c, 10, 12, 236, 228, '#e9edf0', '#aab3ba');
      // mannequin silhouettes
      const fig = (x: number, col: string, col2: string): void => {
        R(c, x - 5, 70, 10, 10, '#ddd0c2');
        R(c, x - 14, 82, 28, 56, col);
        R(c, x - 12, 138, 24, 70, col2);
        R(c, x - 18, 207, 36, 4, '#555');
      };
      fig(52, '#b0213a', '#222'); fig(112, '#e4b52b', '#2f4b8a'); fig(176, '#2f7a5c', '#d8d8d8'); fig(225, '#7a3b8a', '#222');
      // sale tags
      for (let k = 0; k < 6; k++) { R(c, 24 + k * 38, 22, 20, 12, k % 2 ? '#d62828' : '#f7b500'); }
      // clothes rail
      R(c, 14, 55, 228, 2, '#555');
      for (let k = 0; k < 14; k++) R(c, 18 + k * 16, 58, 8, 26, GOODS[k % GOODS.length]);
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#3a3a3e');
      break;
    }
    case FC.electronics: {
      grad(c, 10, 12, 236, 228, '#1b2330', '#0d1219');
      for (let yy = 0; yy < 3; yy++) {
        for (let xx = 0; xx < 5; xx++) {
          const sx = 18 + xx * 46, sy = 22 + yy * 60;
          R(c, sx, sy, 38, 34, '#10161e');
          grad(c, sx + 2, sy + 2, 34, 30, ['#58d1ff', '#ffe17a', '#ff7d7d', '#8affb2', '#ffffff'][(xx + yy * 2) % 5], '#2a67a8');
          R(c, sx + 14, sy + 34, 10, 6, '#333');
        }
      }
      R(c, 10, 202, 236, 38, '#202a38');
      for (let k = 0; k < 10; k++) R(c, 16 + k * 23, 208, 17, 24, GOODS[(k + 3) % GOODS.length]);
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#3a3d44');
      break;
    }
    case FC.jewellery: {
      grad(c, 10, 12, 236, 228, '#30221a', '#150f0b');
      for (let k = 0; k < 90; k++) { c.fillStyle = `rgba(255,${210 + Math.floor(r() * 45)},${100 + Math.floor(r() * 100)},${0.4 + r() * 0.6})`; c.fillRect(14 + r() * 226, 20 + r() * 196, 2, 2); }
      for (let k = 0; k < 4; k++) {
        const x = 30 + k * 56;
        R(c, x, 128, 40, 74, '#4a3322');
        R(c, x + 4, 132, 32, 4, '#e8c25a');
        c.fillStyle = '#e8c25a'; c.beginPath(); c.arc(x + 20, 112, 13, 0, 6.3); c.fill();
        c.fillStyle = '#150f0b'; c.beginPath(); c.arc(x + 20, 112, 8, 0, 6.3); c.fill();
      }
      for (let k = 0; k < 4; k++) { c.fillStyle = 'rgba(255,230,160,0.20)'; c.beginPath(); c.moveTo(40 + k * 56, 14); c.lineTo(20 + k * 56, 126); c.lineTo(62 + k * 56, 126); c.fill(); }
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#6b5420');
      break;
    }
    case FC.pharmacy: {
      grad(c, 10, 12, 236, 228, '#f3faf6', '#cfe6da');
      goods(c, r, 14, 24, 228, 120, 40, ['#2d8f5c', '#ffffff', '#2f7fc1', '#e8e2d2', '#c9e8d6', '#d9382b']);
      R(c, 10, 160, 236, 6, '#0f8a4f');
      R(c, 70, 168, 116, 62, '#e8efe9'); R(c, 76, 174, 104, 34, '#9ec9b7'); // counter window
      R(c, 70, 208, 116, 8, '#0f8a4f');
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#5f7f70');
      break;
    }
    case FC.clinic: {
      grad(c, 10, 12, 236, 228, '#e3f0f8', '#b9d3e6');
      R(c, 124, 12, 4, 228, '#2d6aa8');
      R(c, 10, 12, 236, 5, '#2d6aa8');
      // frosted band
      R(c, 10, 110, 236, 36, 'rgba(255,255,255,0.7)');
      // door handles
      R(c, 108, 130, 5, 36, '#cfd6dc'); R(c, 139, 130, 5, 36, '#cfd6dc');
      // medical cross
      R(c, 114, 46, 28, 9, '#d92b2b'); R(c, 123.5, 36.5, 9, 28, '#d92b2b');
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#7f98ae');
      break;
    }
    case FC.bank: {
      grad(c, 10, 12, 236, 228, '#b6d7ee', '#6f93b0');
      R(c, 10, 12, 236, 5, '#0b4a8f');
      // sliding door centre
      R(c, 78, 12, 100, 228, '#9bc2dd'); R(c, 126, 12, 4, 228, '#0b4a8f'); R(c, 78, 12, 4, 228, '#0b4a8f'); R(c, 174, 12, 4, 228, '#0b4a8f');
      // desk glimpses
      R(c, 14, 150, 60, 60, '#d8dee3'); R(c, 182, 150, 60, 60, '#d8dee3');
      R(c, 24, 120, 40, 30, '#5a6772'); R(c, 192, 120, 40, 30, '#5a6772');
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#6e7e8e');
      break;
    }
    case FC.hardware: {
      R(c, 8, 8, 240, 240, '#2c2822');
      // pipes
      for (let k = 0; k < 9; k++) R(c, 14 + k * 8, 20, 6, 120, k % 3 ? '#cfd3d6' : '#3d6fb4');
      // tool board
      R(c, 100, 22, 140, 90, '#6e5a3c');
      for (let k = 0; k < 14; k++) R(c, 106 + (k % 7) * 19, 30 + Math.floor(k / 7) * 38, 6, 26 + r() * 6, ['#c0c4c8', '#d9382b', '#f2b632'][k % 3]);
      // paint buckets
      for (let k = 0; k < 7; k++) { const col = GOODS[k]; R(c, 14 + k * 34, 168, 30, 30, col); R(c, 14 + k * 34, 168, 30, 4, '#aaa'); R(c, 14 + k * 34, 204, 30, 30, GOODS[(k + 4) % 10]); R(c, 14 + k * 34, 204, 30, 4, '#aaa'); }
      R(c, 8, 240, 240, 10, '#5a4630');
      frame(c, '#8a8780');
      break;
    }
    case FC.autoBay: {
      R(c, 8, 8, 240, 240, '#1b1c1e');
      grad(c, 14, 14, 228, 200, '#3a3c40', '#17181a');
      // car lift + tyres
      for (let k = 0; k < 4; k++) { c.fillStyle = '#0b0b0c'; c.beginPath(); c.arc(40, 214 - k * 24, 24, 0, 6.3); c.fill(); c.fillStyle = '#4a4a4c'; c.beginPath(); c.arc(40, 214 - k * 24, 11, 0, 6.3); c.fill(); }
      for (let k = 0; k < 3; k++) { c.fillStyle = '#0b0b0c'; c.beginPath(); c.arc(92, 224 - k * 24, 24, 0, 6.3); c.fill(); c.fillStyle = '#4a4a4c'; c.beginPath(); c.arc(92, 224 - k * 24, 11, 0, 6.3); c.fill(); }
      R(c, 140, 30, 96, 70, '#2f2f33'); // tool wall
      for (let k = 0; k < 10; k++) R(c, 146 + (k % 5) * 18, 38 + Math.floor(k / 5) * 30, 7, 22, ['#d9382b', '#f2b632', '#9aa3aa'][k % 3]);
      R(c, 140, 140, 96, 70, '#6d4c28'); // oil drums shelf
      for (let k = 0; k < 4; k++) R(c, 148 + k * 22, 160, 15, 32, ['#2f7fc1', '#d9382b', '#f2b632', '#2f7fc1'][k]);
      R(c, 8, 4, 240, 12, '#7a7e82'); // rolled shutter box
      R(c, 0, 0, 8, 256, '#8e8a80'); R(c, 248, 0, 8, 256, '#8e8a80');
      break;
    }
    case FC.bakery: {
      grad(c, 10, 12, 236, 228, '#fff0dc', '#f0c694');
      // display counter with cakes
      R(c, 10, 140, 236, 100, '#5a3a24');
      grad(c, 16, 146, 224, 60, '#fff9ee', '#e8d2b0');
      for (let k = 0; k < 7; k++) {
        const x = 24 + k * 31;
        R(c, x, 166, 24, 26, ['#f4a3b8', '#6b3a1e', '#f6e7c1', '#c8445b', '#f2b632', '#6b3a1e', '#f4a3b8'][k]);
        R(c, x, 160, 24, 7, '#fff');
      }
      // pendant lamps
      for (let k = 0; k < 4; k++) { R(c, 50 + k * 54, 12, 2, 24, '#444'); c.fillStyle = '#fff1b8'; c.beginPath(); c.arc(51 + k * 54, 40, 10, 0, 6.3); c.fill(); }
      // shelf with bread
      for (let k = 0; k < 8; k++) { c.fillStyle = '#c98a45'; c.beginPath(); c.ellipse(34 + k * 27, 108, 11, 6, 0, 0, 6.3); c.fill(); }
      R(c, 14, 114, 228, 4, '#6c4a2a');
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#8b6a4a');
      break;
    }
    case FC.hotel: {
      grad(c, 10, 12, 236, 228, '#ffe9b5', '#b88a45');
      R(c, 124, 12, 8, 228, '#3b2a14');
      R(c, 10, 12, 236, 5, '#3b2a14');
      // reception desk + chandelier
      R(c, 24, 158, 84, 60, '#5b3a1e'); R(c, 24, 154, 84, 6, '#d6b36a');
      for (let k = 0; k < 5; k++) { c.fillStyle = '#fff3c8'; c.beginPath(); c.arc(150 + k * 18, 40 + (k % 2) * 8, 6, 0, 6.3); c.fill(); }
      R(c, 150, 130, 80, 80, '#6a4a2e'); // sofa
      R(c, 150, 118, 80, 18, '#845a38');
      R(c, 84, 150, 4, 34, '#ddd'); R(c, 168, 150, 4, 34, '#ddd');
      glassSheen(c, 10, 12, 236, 228);
      frame(c, '#4d3b25');
      break;
    }
    case FC.office:
    default: {
      R(c, 0, 0, 256, 256, '#d8d2c2');
      // framed glass door (left) + barred window (right)
      R(c, 18, 36, 82, 210, '#4a4038');
      grad(c, 26, 44, 66, 150, '#7da3bb', '#34506a');
      R(c, 26, 200, 66, 40, '#6b5a48');
      R(c, 82, 120, 4, 24, '#ccc');
      R(c, 124, 76, 108, 96, '#554a40');
      grad(c, 130, 82, 96, 84, '#7da3bb', '#3b556c');
      for (let k = 0; k < 6; k++) R(c, 134 + k * 15, 82, 2.5, 84, '#2a2622'); // window grille
      for (let k = 0; k < 4; k++) R(c, 130, 92 + k * 20, 96, 2.5, '#2a2622');
      R(c, 120, 172, 118, 7, '#a7a193');
      R(c, 0, 0, 8, 256, '#9c9686'); R(c, 248, 0, 8, 256, '#9c9686'); R(c, 0, 250, 256, 6, '#6e6a62');
      break;
    }
  }
  // soot / dirt gradient at the foot, shared by all cells
  grad(c, 0, 190, 256, 66, 'rgba(0,0,0,0)', 'rgba(30,22,12,0.28)');
  for (let k = 0; k < 40; k++) R(c, r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 2, 'rgba(0,0,0,0.10)');
}

const cache = new Map<Quality, THREE.CanvasTexture>();

export function getFrontAtlas(q: Quality): THREE.CanvasTexture {
  const hit = cache.get(q);
  if (hit) return hit;
  const cell = q === 'low' ? 128 : q === 'high' ? 256 : 192;
  const k = cell / 256;
  const c = document.createElement('canvas');
  c.width = c.height = cell * FRONT_COLS;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.translate((i % FRONT_COLS) * cell, Math.floor(i / FRONT_COLS) * cell);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.rect(0, 0, 256, 256);
    ctx.clip();
    drawCell(ctx, i, rng(7919 + i * 31));
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisoFor(q);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  cache.set(q, t);
  return t;
}

/** UV rect {u0,v0,u1,v1} (v0 = bottom) for cell i, inset by a few texels against bleeding. */
export function frontCellUV(i: number, q: Quality): { u0: number; v0: number; u1: number; v1: number } {
  const col = i % FRONT_COLS, row = Math.floor(i / FRONT_COLS);
  const cell = q === 'low' ? 128 : q === 'high' ? 256 : 192;
  const e = 1.5 / (cell * FRONT_COLS);
  return {
    u0: col / FRONT_COLS + e, u1: (col + 1) / FRONT_COLS - e,
    v0: 1 - (row + 1) / FRONT_COLS + e, v1: 1 - row / FRONT_COLS - e,
  };
}
