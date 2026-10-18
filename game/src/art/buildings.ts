/**
 * Chunk builder: extruded building footprints with atlas facades (window bays and
 * ground-floor shopfronts), parapeted roofs with rooftop clutter (water tanks, stair
 * heads, AC units, dishes). Everything is merged per material per chunk.
 * Shop sign bands are deliberately blank: real names are only rendered when the
 * building carries an OSM `name`.
 */
import * as THREE from 'three';
import type { Building, WorldChunk, WorldChunkV2, WorldCore, RoadEdge, Storefront } from '../world/schema';
import type { Quality } from './api';
import {
  GeoBuilder,
  addBox,
  addHorizontalPolygon,
  boxMatrix,
  distToPolyEdge,
  hashString,
  hex,
  pointInPoly,
  rng,
  signedArea,
} from './geo';
import { getWorldMats } from './mats';
import { BAY_W, FACADE_VARIANTS, FLOOR_H, SHOP_H, SHOP_VARIANTS } from './textures';
import { createSignTexture } from './sign';
import { registerCull } from './cull';

const PALETTE: { c: number; w: number }[] = [
  { c: 0xefdfb8, w: 4.5 }, // cream
  { c: 0xe9e4d6, w: 2.5 }, // off-white
  { c: 0xefc9c0, w: 2 }, // pastel pink
  { c: 0xf0e09c, w: 2 }, // pastel yellow
  { c: 0xc8765c, w: 2 }, // terracotta
  { c: 0xa9c4d8, w: 2 }, // faded blue
  { c: 0xbcd9c8, w: 1.5 }, // mint
  { c: 0xefb98a, w: 1.5 }, // light orange
  { c: 0xb3b0a6, w: 4 }, // grey concrete
  { c: 0xd9a441, w: 0.8 }, // ochre
  { c: 0xe29a86, w: 1.2 }, // salmon
  { c: 0xd2c8ae, w: 4 }, // dusty beige
];
const PAL_TOTAL = PALETTE.reduce((a, p) => a + p.w, 0);

function pickColor(r: () => number): [number, number, number] {
  let t = r() * PAL_TOTAL;
  let c = PALETTE[0].c;
  for (const p of PALETTE) { t -= p.w; if (t <= 0) { c = p.c; break; } }
  const [cr, cg, cb] = hex(c);
  const j = 0.86 + r() * 0.16;
  return [Math.min(1, cr * j), Math.min(1, cg * j), Math.min(1, cb * j)];
}

const RESIDENTIAL = new Set(['house', 'residential', 'detached', 'terrace', 'semidetached_house', 'bungalow', 'apartments', 'dormitory']);
const PLAIN = new Set(['industrial', 'warehouse', 'garage', 'garages', 'shed', 'service', 'hut', 'roof', 'transformer_tower', 'storage_tank', 'construction', 'cabin', 'carport']);
const COMMERCIAL = new Set(['commercial', 'retail', 'office', 'hotel', 'supermarket', 'kiosk', 'mall']);

interface RoadRef { e: RoadEdge; minX: number; maxX: number; minZ: number; maxZ: number }

function nearestRoadPoint(x: number, z: number, roads: RoadRef[], maxD: number): { d: number; px: number; pz: number } | null {
  let best: { d: number; px: number; pz: number } | null = null;
  for (const r of roads) {
    if (x < r.minX - maxD || x > r.maxX + maxD || z < r.minZ - maxD || z > r.maxZ + maxD) continue;
    const pts = r.e.points;
    const hw = r.e.widthM / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
      const px = p[0] + dx * t, pz = p[1] + dz * t;
      const d = Math.hypot(x - px, z - pz) - hw;
      if (!best || d < best.d) best = { d, px, pz };
    }
  }
  return best && best.d <= maxD ? best : null;
}

const signTexCache = new Map<string, Promise<THREE.CanvasTexture>>();
const signMatCache = new Map<string, THREE.MeshBasicMaterial>();
const signGeo = new THREE.PlaneGeometry(1, 1);

export function buildChunk(chunk: WorldChunk, core: WorldCore, quality: Quality): THREE.Group {
  const mats = getWorldMats(quality);
  const group = new THREE.Group();
  group.name = `chunk_${chunk.id}`;
  const facadeB = new GeoBuilder(true);
  const shopB = new GeoBuilder(true);
  const plainB = new GeoBuilder(true);
  const roofB = new GeoBuilder(true);
  const clutterB = new GeoBuilder(true);

  // roads near this chunk (for deciding which walls are shopfronts)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of chunk.buildings) for (const p of b.footprint) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  const roads: RoadRef[] = [];
  for (const e of core.roads) {
    if (e.tunnel || e.points.length < 2) continue;
    if (e.bridge || e.pointElevM.some((v) => v > 0.45)) continue;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const p of e.points) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1]; }
    if (b < minX - 40 || a > maxX + 40 || d < minZ - 40 || c > maxZ + 40) continue;
    roads.push({ e, minX: a, maxX: b, minZ: c, maxZ: d });
  }

  // v2: storefront frontages (see storefronts.ts) replace the generic shopfront bands on the walls they cover
  const storeMap = new Map<string, Storefront[]>();
  for (const sf of (chunk as WorldChunkV2).storefronts ?? []) {
    if (!sf.buildingId || !sf.facade) continue;
    const l = storeMap.get(sf.buildingId);
    if (l) l.push(sf); else storeMap.set(sf.buildingId, [sf]);
  }

  const cylSeg = quality === 'low' ? 6 : 8;
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, cylSeg, 1, true);
  const unitDome = new THREE.SphereGeometry(1, cylSeg, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  const signJobs: Promise<void>[] = [];
  let tris = 0;

  for (const bld of chunk.buildings) {
    tris += addBuilding(bld, quality, roads, { facadeB, shopB, plainB, roofB, clutterB }, unitCyl, unitDome, group, signJobs, storeMap.get(bld.id) ?? null);
  }
  unitCyl.dispose();
  unitDome.dispose();

  const emit = (b: GeoBuilder, mat: THREE.Material, name: string, cast: boolean): void => {
    if (b.vcount === 0) return;
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
  };
  // plain walls reuse a blank plaster patch of the facade atlas; clutter reuses the roof material
  facadeB.appendBuilder(plainB, [(4 + 12 / 128) / FACADE_VARIANTS, 0.78]);
  roofB.appendBuilder(clutterB, [0.5, 0.5]);
  emit(facadeB, mats.facade, 'facades', true);
  emit(shopB, mats.shop, 'shopfronts', true);
  emit(roofB, mats.roof, 'roofs', true);
  registerCull(group);
  group.userData.triangles = tris;
  group.userData.pending = Promise.all(signJobs).then(() => undefined);
  return group;
}

interface Builders { facadeB: GeoBuilder; shopB: GeoBuilder; plainB: GeoBuilder; roofB: GeoBuilder; clutterB: GeoBuilder }

function addBuilding(
  bld: Building,
  quality: Quality,
  roads: RoadRef[],
  B: Builders,
  unitCyl: THREE.BufferGeometry,
  unitDome: THREE.BufferGeometry,
  group: THREE.Group,
  signJobs: Promise<void>[],
  stores: Storefront[] | null,
): number {
  let ring = bld.footprint.map((p) => [p[0], p[1]] as [number, number]);
  if (ring.length > 2) {
    const f = ring[0], l = ring[ring.length - 1];
    if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) ring = ring.slice(0, -1);
  }
  if (ring.length < 3) return 0;
  const area = signedArea(ring);
  const absArea = Math.abs(area);
  if (absArea < 3) return 0;
  const r = rng(hashString(bld.id));
  const H = Math.min(150, Math.max(3, bld.heightM));
  const tint = pickColor(r);
  const kind = (bld.kind || 'yes').toLowerCase();
  const plainKind = PLAIN.has(kind);
  const commercial = COMMERCIAL.has(kind);
  const residential = RESIDENTIAL.has(kind);
  const gh = H >= 5.2 ? SHOP_H : H;
  const upperH = H - gh;
  const nFloors = upperH > 1.2 ? Math.max(1, Math.round(upperH / FLOOR_H)) : 0;

  // facade style for this building
  const styles = commercial ? [3, 3, 2, 6, 7] : residential ? [1, 0, 7, 2, 5, 6] : [0, 1, 2, 5, 6, 7, 3];
  const main = styles[Math.floor(r() * styles.length)];
  const alt = styles[Math.floor(r() * styles.length)];
  const patternLen = 1 + Math.floor(r() * 3);
  const styleShade = r() < 0.35;
  const shopChance = plainKind ? 0 : residential ? 0.25 : commercial ? 0.95 : 0.7;

  let tris = 0;
  const rings: { pts: [number, number][]; hole: boolean }[] = [{ pts: ring, hole: false }];
  if (bld.holes) for (const h of bld.holes) if (h.length >= 3) rings.push({ pts: h.map((p) => [p[0], p[1]] as [number, number]), hole: true });

  let bestFront: { len: number; ax: number; az: number; bx: number; bz: number; nx: number; nz: number } | null = null;

  for (const rg of rings) {
    const pts = rg.pts;
    const a = signedArea(pts);
    const outwardSign = (a > 0 ? 1 : -1) * (rg.hole ? -1 : 1);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      // outward normal (away from the solid)
      const nx = (dz / len) * outwardSign, nz = (-dx / len) * outwardSign;
      const nrm: [number, number, number] = [nx, 0, nz];
      // is this wall facing a road?
      let facing = false;
      let apron = !rg.hole;
      if (!rg.hole && roads.length) {
        const mx = (p[0] + q[0]) / 2 + nx * 1.5, mz = (p[1] + q[1]) / 2 + nz * 1.5;
        const hit = nearestRoadPoint(mx, mz, roads, 22);
        if (hit) {
          if (hit.d < 6) apron = false;
          const vx = hit.px - mx, vz = hit.pz - mz;
          const vl = Math.hypot(vx, vz) || 1;
          facing = (vx * nx + vz * nz) / vl > 0.35;
        }
      }
      if (apron && len > 1.5 && absArea > 16) {
        const ap = 1.5;
        const grey = 0.62 + r() * 0.12;
        B.roofB.quad([p[0], 0.03, p[1], q[0], 0.03, q[1], q[0] + nx * ap, 0.03, q[1] + nz * ap, p[0] + nx * ap, 0.03, p[1] + nz * ap], [p[0] / 5, p[1] / 5, q[0] / 5, q[1] / 5, q[0] / 5, q[1] / 5 + 0.3, p[0] / 5, p[1] / 5 + 0.3], [0, 1, 0], [grey, grey * 0.97, grey * 0.9]);
        tris += 2;
      }
      // does a v2 storefront sit on this wall segment?
      let covered = false;
      if (stores && !rg.hole) {
        for (const sf of stores) {
          const fa = sf.facade!;
          const mx = (fa[0][0] + fa[1][0]) / 2, mz = (fa[0][1] + fa[1][1]) / 2;
          const t = ((mx - p[0]) * dx + (mz - p[1]) * dz) / (len * len);
          if (t < -0.02 || t > 1.02) continue;
          const dist = Math.abs((mx - p[0]) * nx + (mz - p[1]) * nz);
          if (dist > 1.2) continue;
          const fl = Math.hypot(fa[1][0] - fa[0][0], fa[1][1] - fa[0][1]) || 1;
          if (Math.abs(((fa[1][0] - fa[0][0]) * dx + (fa[1][1] - fa[0][1]) * dz) / (fl * len)) < 0.9) continue;
          covered = true;
          break;
        }
      }
      const shopWall = !covered && facing && !plainKind && len >= 3 && r() < shopChance * 1.6 + 0.0 && absArea > 25;
      if (facing && len > (bestFront?.len ?? 0)) bestFront = { len, ax: p[0], az: p[1], bx: q[0], bz: q[1], nx, nz };

      const nb = Math.max(1, Math.round(len / BAY_W));
      for (let k = 0; k < nb; k++) {
        const t0 = k / nb, t1 = (k + 1) / nb;
        const x0 = p[0] + dx * t0, z0 = p[1] + dz * t0;
        const x1 = p[0] + dx * t1, z1 = p[1] + dz * t1;
        const jitter = 0.97 + r() * 0.06;
        const col: [number, number, number] = [tint[0] * jitter, tint[1] * jitter, tint[2] * jitter];
        const quadWall = (b: GeoBuilder, y0: number, y1: number, u0: number, u1: number, v0: number, v1: number, c: ArrayLike<number>): void => {
          b.quad([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], [u0, v0, u1, v0, u1, v1, u0, v1], nrm, c);
          tris += 2;
        };
        // ground floor
        if (shopWall && gh >= SHOP_H - 0.01) {
          const variant = Math.floor(r() * SHOP_VARIANTS);
          const lightTint: [number, number, number] = [tint[0] * 0.35 + 0.65, tint[1] * 0.35 + 0.65, tint[2] * 0.35 + 0.65];
          const u0 = (variant + 0.03) / SHOP_VARIANTS, u1 = (variant + 0.97) / SHOP_VARIANTS;
          quadWall(B.shopB, 0, gh, u0, u1, 0, 1, lightTint);
        } else if (plainKind || gh < SHOP_H - 0.01 || covered) {
          quadWall(B.plainB, 0, gh, 0, (len / nb) / 4, 0, gh / 4, col);
        } else {
          const variant = r() < 0.5 ? 4 : main;
          const u0 = (variant + 0.03) / FACADE_VARIANTS, u1 = (variant + 0.97) / FACADE_VARIANTS;
          quadWall(B.facadeB, 0, gh, u0, u1, 0.02, 1.0 * (gh / FLOOR_H) - 0.02, col);
        }
        // upper floors
        if (nFloors > 0) {
          if (plainKind) {
            const u0 = (4 + 0.03) / FACADE_VARIANTS, u1 = (4 + 0.97) / FACADE_VARIANTS;
            const g = 0.82 + r() * 0.1;
            quadWall(B.facadeB, gh, H, u0, u1, 0, nFloors, [col[0] * g, col[1] * g, col[2] * g]);
          } else {
            const patIdx = k % patternLen;
            let variant = patIdx === 0 ? main : alt;
            if (!facing && !shopWall && r() < 0.25) variant = 4;
            if (r() < 0.07) variant = 4;
            const u0 = (variant + 0.03) / FACADE_VARIANTS, u1 = (variant + 0.97) / FACADE_VARIANTS;
            quadWall(B.facadeB, gh, H, u0, u1, 0, nFloors, col);
          }
        }
      }

      // ---- wall relief (Hyderabad shophouse look): painted cornice, plinth, sun shades, balconies
      if (!rg.hole && len >= 4 && quality !== 'low' && absArea > 20) {
        const yaw = Math.atan2(-dz, dx);
        const slab = (t: number, off: number, cy: number, sx: number, sy: number, sz: number, c: ArrayLike<number>): void => {
          addBox(B.plainB, sx, sy, sz, boxMatrix(p[0] + dx * t + nx * off, cy, p[1] + dz * t + nz * off, yaw), 1, c, { bottom: true });
          tris += 12;
        };
        const accent: [number, number, number] = r() < 0.5 ? [0.93, 0.92, 0.88] : [tint[0] * 0.62, tint[1] * 0.62, tint[2] * 0.62];
        if (H > 5.5) slab(0.5, 0.07, H - 0.22, len, 0.42, 0.14, accent); // cornice band
        if (!covered && !shopWall && gh >= SHOP_H - 0.01 && !plainKind) slab(0.5, 0.025, 0.25, len, 0.5, 0.05, [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5]); // plinth
        if (!covered && facing && nFloors >= 1 && !plainKind) {
          const fh = upperH / nFloors;
          if (styleShade) {
            for (let f = 0; f < nFloors; f++) slab(0.5, 0.27, gh + (f + 1) * fh - 0.62, len * 0.96, 0.07, 0.54, [0.86, 0.85, 0.8]); // sun shades over windows
          }
          if (nFloors >= 2 && (residential || kind === 'yes' || kind === 'apartments') && len >= 5) {
            const bw = Math.min(2.3, BAY_W - 0.6);
            for (let k = 0; k < nb; k++) {
              if (r() > (quality === 'high' ? 0.3 : 0.2)) continue;
              const t = (k + 0.5) / nb;
              const iron: [number, number, number] = r() < 0.5 ? [0.2, 0.21, 0.23] : [0.92, 0.9, 0.84];
              for (let f = 0; f < nFloors; f++) {
                if (r() < 0.15) continue;
                const y0 = gh + f * fh + 0.02;
                slab(t, 0.55, y0 + 0.07, bw, 0.14, 1.1, [0.8, 0.79, 0.74]);
                slab(t, 1.07, y0 + 0.14 + 0.45, bw, 0.9, 0.06, iron);
                if (quality === 'high') {
                  addBox(B.plainB, 0.06, 0.9, 1.0, boxMatrix(p[0] + dx * t + nx * 0.55 + (dx / len) * (bw / 2 - 0.03), y0 + 0.59, p[1] + dz * t + nz * 0.55 + (dz / len) * (bw / 2 - 0.03), yaw), 1, iron);
                  addBox(B.plainB, 0.06, 0.9, 1.0, boxMatrix(p[0] + dx * t + nx * 0.55 - (dx / len) * (bw / 2 - 0.03), y0 + 0.59, p[1] + dz * t + nz * 0.55 - (dz / len) * (bw / 2 - 0.03), yaw), 1, iron);
                  tris += 24;
                }
              }
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- roof
  const roofGrey = 0.62 + r() * 0.22;
  const roofCol: [number, number, number] = [roofGrey, roofGrey * 0.98, roofGrey * 0.94];
  const ph = quality === 'low' ? 0 : 0.75;
  const roofY = H;
  addHorizontalPolygon(B.roofB, ring, bld.holes, roofY, (x, z) => [x / 5, z / 5], roofCol);
  tris += ring.length - 2;
  if (ph > 0 && absArea > 12) {
    for (const rg of rings) {
      const pts = rg.pts;
      const a = signedArea(pts);
      const outwardSign = (a > 0 ? 1 : -1) * (rg.hole ? -1 : 1);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const dx = q[0] - p[0], dz = q[1] - p[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.4) continue;
        const nx = (dz / len) * outwardSign, nz = (-dx / len) * outwardSign;
        const col: [number, number, number] = [tint[0] * 0.95, tint[1] * 0.95, tint[2] * 0.95];
        // outer face
        B.plainB.quad([p[0], H, p[1], q[0], H, q[1], q[0], H + ph, q[1], p[0], H + ph, p[1]], [0, H / 4, len / 4, H / 4, len / 4, (H + ph) / 4, 0, (H + ph) / 4], [nx, 0, nz], col);
        // inner face (reverse), inset slightly, and top coping
        const ix = -nx * 0.22, iz = -nz * 0.22;
        B.plainB.quad([p[0] + ix, H, p[1] + iz, q[0] + ix, H, q[1] + iz, q[0] + ix, H + ph, q[1] + iz, p[0] + ix, H + ph, p[1] + iz], [0, 0, 1, 0, 1, 1, 0, 1], [-nx, 0, -nz], col);
        B.plainB.quad([p[0], H + ph, p[1], q[0], H + ph, q[1], q[0] + ix, H + ph, q[1] + iz, p[0] + ix, H + ph, p[1] + iz], [0, 0, 1, 0, 1, 0.1, 0, 0.1], [0, 1, 0], [col[0] * 1.06, col[1] * 1.06, col[2] * 1.06]);
        tris += 6;
      }
    }
  }

  // --------------------------------------------------------- roof clutter
  if (absArea > 14 && quality !== 'low' || absArea > 40) {
    tris += addClutter(B.clutterB, ring, bld, H + ph * 0.0, r, quality, unitCyl, unitDome, absArea);
  }

  // --------------------------------------------------------- named sign
  if (bld.name && !stores && bestFront && bestFront.len >= 5 && H >= 4.2) {
    const f = bestFront;
    const w = Math.min(f.len * 0.85, 9);
    const h = Math.max(0.9, Math.min(1.5, w * 0.16));
    const cx = (f.ax + f.bx) / 2 + f.nx * 0.06, cz = (f.az + f.bz) / 2 + f.nz * 0.06;
    const y = Math.min(gh + 0.2, H - h / 2 - 0.2) + (gh < SHOP_H ? 0 : 0.0);
    const key = `${bld.name}|${quality}`;
    let matp = signMatCache.get(key);
    const bgs = ['#1d4e89', '#7a1f2b', '#1f6f4a', '#33343a', '#8a5a14'];
    if (!matp) {
      matp = new THREE.MeshBasicMaterial({ color: new THREE.Color(bgs[hashString(bld.name) % bgs.length]), toneMapped: true });
      signMatCache.set(key, matp);
      let job = signTexCache.get(key);
      if (!job) {
        job = createSignTexture([{ text: bld.name, lang: 'en' }], { bg: bgs[hashString(bld.name) % bgs.length], fg: '#ffffff', width: 1024, height: 160 });
        signTexCache.set(key, job);
      }
      const m = matp;
      job.then((t) => { m.map = t; m.color.set(0xffffff); m.needsUpdate = true; }).catch(() => undefined);
    }
    const mesh = new THREE.Mesh(signGeo, matp);
    mesh.position.set(cx, y, cz);
    mesh.rotation.y = Math.atan2(f.nx, f.nz);
    mesh.scale.set(w, h, 1);
    mesh.name = 'building-sign';
    mesh.userData.buildingId = bld.id;
    group.add(mesh);
    const job = signTexCache.get(key);
    if (job) signJobs.push(job.then(() => undefined, () => undefined));
  }
  return tris;
}

function addClutter(
  b: GeoBuilder,
  ring: [number, number][],
  bld: Building,
  roofY: number,
  r: () => number,
  quality: Quality,
  unitCyl: THREE.BufferGeometry,
  unitDome: THREE.BufferGeometry,
  area: number,
): number {
  let tris = 0;
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const place = (margin: number): [number, number] | null => {
    for (let t = 0; t < 14; t++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (pointInPoly(x, z, ring) && distToPolyEdge(x, z, ring) > margin) return [x, z];
    }
    return null;
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const tankBlack = [0.035, 0.037, 0.04];
  const tankGrey = [0.12, 0.13, 0.14];
  const white = hex(0xe8e4da);
  const steel = hex(0x6a7178);
  const tall = bld.heightM > 28;
  const cyl = (x: number, y: number, z: number, rx: number, h: number, c: ArrayLike<number>): void => {
    pv.set(x, y + h / 2, z); s.set(rx, h, rx); q.identity();
    m.compose(pv, q, s);
    b.appendGeometry(unitCyl, m, c);
    tris += unitCyl.getIndex()!.count / 3;
  };
  const dome = (x: number, y: number, z: number, rx: number, h: number, c: ArrayLike<number>): void => {
    pv.set(x, y, z); s.set(rx, h, rx); q.identity();
    m.compose(pv, q, s);
    b.appendGeometry(unitDome, m, c);
    tris += unitDome.getIndex()!.count / 3;
  };

  // Syntex-style black water tanks (most residential/mixed buildings)
  if (!tall && area > 30) {
    const n = area > 160 ? 2 + (r() > 0.5 ? 1 : 0) : r() > 0.35 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const p = place(1.4);
      if (!p) continue;
      const rad = 0.52 + r() * 0.22;
      const h = 1.0 + r() * 0.5;
      if (quality !== 'low') addBox(b, rad * 2.2, 0.3, rad * 2.2, boxMatrix(p[0], roofY + 0.15, p[1]), 1, white);
      cyl(p[0], roofY + (quality === 'low' ? 0 : 0.3), p[1], rad, h, tankBlack);
      dome(p[0], roofY + (quality === 'low' ? 0 : 0.3) + h, p[1], rad * 0.98, 0.28, tankBlack);
      tris += 12;
    }
  }
  // stair head (mumty)
  if (area > 45) {
    const p = place(1.6);
    if (p) {
      const w = 2.0 + r() * 1.0, d = 2.0 + r() * 0.8, h = 2.4;
      const rot = r() < 0.5 ? 0 : Math.PI / 2;
      addBox(b, w, h, d, boxMatrix(p[0], roofY + h / 2, p[1], rot), 2, [0.86, 0.84, 0.78]);
      addBox(b, w + 0.3, 0.14, d + 0.3, boxMatrix(p[0], roofY + h + 0.07, p[1], rot), 2, [0.7, 0.7, 0.68]);
      if (quality !== 'low') addBox(b, 0.9, 1.8, 0.06, boxMatrix(p[0] + Math.sin(rot) * 0 - (rot === 0 ? 0 : d / 2 + 0.03), roofY + 0.9, p[1] + (rot === 0 ? d / 2 + 0.03 : 0), rot), 1, [0.25, 0.16, 0.1]);
      tris += 36;
    }
  }
  if (quality === 'low') return tris;
  // AC outdoor units / small boxes
  const nAc = Math.floor(r() * 3);
  for (let i = 0; i < nAc; i++) {
    const p = place(0.9);
    if (!p) continue;
    addBox(b, 0.9, 0.6, 0.45, boxMatrix(p[0], roofY + 0.3, p[1], r() * 3), 1, [0.82, 0.82, 0.8]);
    tris += 12;
  }
  // solar water heater: flat plate on a frame + drum (very common in Hyderabad)
  if (!tall && area > 40 && r() < 0.35) {
    const p = place(1.6);
    if (p) {
      const rot = r() < 0.5 ? 0 : Math.PI / 2;
      addBox(b, 1.9, 0.07, 1.1, boxMatrix(p[0], roofY + 0.7, p[1], rot, -0.5), 1, [0.1, 0.16, 0.26]);
      addBox(b, 0.08, 0.7, 0.08, boxMatrix(p[0] - 0.8, roofY + 0.35, p[1], rot), 1, steel);
      addBox(b, 0.08, 0.7, 0.08, boxMatrix(p[0] + 0.8, roofY + 0.35, p[1], rot), 1, steel);
      tris += 36;
    }
  }
  // mast + dish
  if (r() < 0.22) {
    const p = place(1.0);
    if (p) {
      cyl(p[0], roofY, p[1], 0.04, 3.2 + r() * 2, steel);
      const hh = 2.4;
      dome(p[0] + 0.25, roofY + hh, p[1], 0.38, 0.2, white);
    }
  }
  return tris;
}
