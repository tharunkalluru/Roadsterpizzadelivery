/**
 * Shaped text signs. Complete text runs are rendered by the browser's text engine
 * (HarfBuzz) with the bundled Noto Sans Telugu, so conjuncts and vowel signs are
 * shaped correctly. No pseudo-glyphs are ever synthesised.
 */
import * as THREE from 'three';
import { assetUrl } from './textures';

let teluguPromise: Promise<void> | null = null;

export const TELUGU_FAMILY = 'Noto Sans Telugu';

export function ensureTeluguFont(): Promise<void> {
  if (teluguPromise) return teluguPromise;
  teluguPromise = (async () => {
    try {
      const face = new FontFace(TELUGU_FAMILY, `url(${assetUrl('assets/fonts/NotoSansTelugu-Variable.ttf')})`, {
        weight: '100 900',
        stretch: '62.5% 100%',
        style: 'normal',
        display: 'block',
      });
      const loaded = await face.load();
      document.fonts.add(loaded);
    } catch (err) {
      console.warn('[art] Noto Sans Telugu failed to load; Telugu text may fall back to system fonts', err);
    }
    try {
      await document.fonts.load(`700 48px "${TELUGU_FAMILY}"`, 'ఉప్పల్ తార్నాక');
    } catch {
      /* ignore */
    }
  })();
  return teluguPromise;
}

export interface SignLine {
  text: string;
  lang: 'en' | 'te';
}

export interface SignOpts {
  bg?: string;
  fg?: string;
  width?: number;
  height?: number;
}

export async function createSignTexture(lines: SignLine[], opts: SignOpts = {}): Promise<THREE.CanvasTexture> {
  if (lines.some((l) => l.lang === 'te')) await ensureTeluguFont();
  else await document.fonts.ready.catch(() => undefined);
  const w = opts.width ?? 1024;
  const h = opts.height ?? 256;
  const bg = opts.bg ?? '#0f3b73';
  const fg = opts.fg ?? '#ffffff';
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // inner border for a manufactured-sign look
  const b = Math.max(3, h * 0.04);
  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(2, h * 0.012);
  ctx.strokeRect(b, b, w - 2 * b, h - 2 * b);
  ctx.globalAlpha = 1;

  const n = Math.max(1, lines.length);
  const padX = w * 0.05;
  const padY = h * 0.1;
  const usableH = h - padY * 2;
  // Telugu needs more vertical room than Latin for stacked vowel signs
  const weights = lines.map((l) => (l.lang === 'te' ? 1.25 : 1));
  const total = weights.reduce((a, b2) => a + b2, 0);
  let y = padY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as unknown as { textRendering?: string }).textRendering = 'optimizeLegibility';
  for (let i = 0; i < n; i++) {
    const line = lines[i];
    const lh = (usableH * weights[i]) / total;
    const family = line.lang === 'te' ? `"${TELUGU_FAMILY}", "Noto Sans", sans-serif` : `"Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif`;
    (ctx as unknown as { lang?: string }).lang = line.lang === 'te' ? 'te' : 'en';
    let size = lh * (line.lang === 'te' ? 0.78 : 0.82);
    ctx.font = `${line.lang === 'te' ? 600 : 700} ${size}px ${family}`;
    const maxW = w - padX * 2;
    const m = ctx.measureText(line.text).width;
    if (m > maxW) {
      size *= maxW / m;
      ctx.font = `${line.lang === 'te' ? 600 : 700} ${size}px ${family}`;
    }
    ctx.fillStyle = fg;
    ctx.fillText(line.text, w / 2, y + lh / 2);
    y += lh;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}
