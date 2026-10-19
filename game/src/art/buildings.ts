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
import { buildStreetLife } from './streetLife';
import { profileFacades, type ProfileFacade } from './profileFacades';
import { surveyFront,appendResearchedBuilding,appendBuildingAccess,researchedFacesOf,type ResearchedBuilders } from './researchedBuildings';
import { accessRoadIndex,buildingAccessPlan,accessRecessForFacade,type BuildingAccessPlan } from '../world/buildingAccess';
import type { RoadIndex } from '../world/roadIndex';

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

function sourceColour(value:string|undefined):number|undefined{
  if(!value)return;
  if(/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value))return new THREE.Color(value).getHex();
  return (THREE.Color.NAMES as Record<string,number>)[value.toLowerCase()];
}
function materialColour(value:string|undefined,roof=false):number|undefined{
  if(!value)return;
  const s=value.toLowerCase();
  if(/brick|terracotta|tile/.test(s))return roof?0x9d674f:0xb48066;
  if(/concrete|cement|stone/.test(s))return 0xbab9ad;
  if(/metal|steel|aluminium|aluminum|zinc/.test(s))return 0x9aa5a4;
  if(/wood|timber/.test(s))return 0x977553;
  if(/glass/.test(s))return 0x476b7d;
}

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
signGeo.userData.shared = true;

export function buildChunk(chunk: WorldChunk, core: WorldCore, quality: Quality): THREE.Group {
  const mats = getWorldMats(quality);
  const group = new THREE.Group();
  group.name = `chunk_${chunk.id}`;
  const facadeB = new GeoBuilder(true);
  const shopB = new GeoBuilder(true);
  const plainB = new GeoBuilder(true);
  const roofB = new GeoBuilder(true);
  const clutterB = new GeoBuilder(true);
  const researchB:ResearchedBuilders={cladding:new GeoBuilder(true),glazing:new GeoBuilder(true),details:new GeoBuilder(true)};

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
    if(!sf.placeId.startsWith('survey:')&&(sf.placement?.display==='listing_only'||sf.placement?.floorBasis==='unknown'))continue;
    if (!sf.buildingId || !sf.facade) continue;
    const l = storeMap.get(sf.buildingId);
    if (l) l.push(sf); else storeMap.set(sf.buildingId, [sf]);
  }

  const needsAccess=chunk.buildings.some(b=>b.researchedProfile?.fronts.some(f=>f.access)||['madhapur_commercial','madhapur_brown_commercial','habsiguda_gatsi_block'].includes(b.surveyStyle??''));
  const accessRoads=needsAccess?accessRoadIndex(core):undefined;
  const cylSeg = quality === 'low' ? 6 : 8;
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, cylSeg, 1, true);
  const unitDome = new THREE.SphereGeometry(1, cylSeg, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  const signJobs: Promise<void>[] = [];
  let tris = 0;

  for (const bld of chunk.buildings) {
    tris += addBuilding(bld, quality, roads, { facadeB, shopB, plainB, roofB, clutterB, researchB,accessRoads }, unitCyl, unitDome, group, signJobs, storeMap.get(bld.id) ?? null);
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
  emit(researchB.cladding,mats.stationSteel,'researched-cladding',true);
  emit(researchB.glazing,mats.stationSteel,'researched-glazing',false);
  emit(researchB.details,mats.stationSteel,'researched-details',quality!=='low');
  group.add(buildStreetLife(chunk, core, quality));
  registerCull(group);
  group.userData.triangles = tris;
  group.userData.architectureEvidence={
    observedProfiles:chunk.buildings.filter(b=>b.researchedProfile?.appearanceStatus==='observed'||b.surveyStyle).length,
    sourceColours:chunk.buildings.filter(b=>sourceColour(b.sourceProperties?.facadeColor)!==undefined).length,
    sourceMaterials:chunk.buildings.filter(b=>!!b.sourceProperties?.facadeMaterial).length,
    inferredAppearance:chunk.buildings.filter(b=>!b.researchedProfile&&!b.surveyStyle&&!b.sourceProperties?.facadeColor&&!b.sourceProperties?.facadeMaterial).length,
    heightBasis:chunk.buildings.reduce((out,b)=>{const key=b.heightBasis??'legacy_provisional';out[key]=(out[key]??0)+1;return out;},{}as Record<string,number>),
  };
  group.userData.pending = Promise.all(signJobs).then(() => undefined);
  return group;
}

interface Builders { facadeB: GeoBuilder; shopB: GeoBuilder; plainB: GeoBuilder; roofB: GeoBuilder; clutterB: GeoBuilder; researchB:ResearchedBuilders;accessRoads?:RoadIndex }

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
  const totalHeight = Math.min(400, Math.max(.5, bld.heightM));
  const baseHeight = Math.max(0, Math.min(bld.baseHeightM??0,totalHeight-1));
  const H = totalHeight-baseHeight;
  const builders=[B.facadeB,B.shopB,B.plainB,B.roofB,B.clutterB,B.researchB.cladding,B.researchB.glazing,B.researchB.details];
  const starts=builders.map(b=>b.pos.length),childStart=group.children.length;
  const architectural = bld as Building & { surveyStyle?:string;facadeColor?:string;appearance?: {style?:string;facadeColor?:string} };
  const appearance = architectural.appearance ?? {style:architectural.surveyStyle,facadeColor:architectural.facadeColor};
  const researched=bld.researchedProfile?.signageOnly?undefined:bld.researchedProfile;
  const bespoke = !!researched || appearance?.style === 'hotel_suprabhat' || appearance?.style === 'madhapur_commercial' || appearance?.style === 'madhapur_brown_commercial' || appearance?.style === 'madhapur_sn_heights' || appearance?.style === 'habsiguda_gatsi_block';
  const sourceWall=sourceColour(researched?.wallColor??appearance?.facadeColor??bld.sourceProperties?.facadeColor)??materialColour(bld.sourceProperties?.facadeMaterial);
  const tint = sourceWall!==undefined ? hex(sourceWall) : pickColor(r);
  const kind = (bld.sourceProperties?.class || bld.kind || 'yes').toLowerCase();
  const plainKind = PLAIN.has(kind) || bespoke;
  const commercial = COMMERCIAL.has(kind);
  const residential = RESIDENTIAL.has(kind);
  const gh = H >= 5.2 ? SHOP_H : H;
  const upperH = H - gh;
  const nFloors = upperH > 1.2 ? Math.max(1,bld.levels!==null?bld.levels-1:Math.round(upperH / FLOOR_H)) : 0;

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
  const accessPlan=B.accessRoads?buildingAccessPlan(bld,stores??[],B.accessRoads):undefined;
  const dataFaces=researched?.fronts.flatMap(front=>researchedFacesOf(bld,front,stores))??[];

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
      let apron = !rg.hole && baseHeight===0;
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
      let covered = dataFaces.some(({facade:[a,b]})=>{
        const vx=b[0]-a[0],vz=b[1]-a[1],width=Math.hypot(vx,vz),mx=(p[0]+q[0])/2,mz=(p[1]+q[1])/2;
        const along=((mx-a[0])*vx+(mz-a[1])*vz)/(width*width);
        return along>=-.02&&along<=1.02&&Math.abs((mx-a[0])*vz-(mz-a[1])*vx)/width<.65&&Math.abs((vx*dx+vz*dz)/(width*len))>.98;
      });
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
          // The researched raised and basement fronts supply the recessed facade. An
          // opaque generic skin here would hide them behind the original wall plane.
          if(!((researched||appearance?.style==='madhapur_commercial'||appearance?.style==='madhapur_brown_commercial'||appearance?.style==='habsiguda_gatsi_block'&&!!accessPlan?.recesses.length) && covered))quadWall(B.plainB, 0, gh, 0, (len / nb) / 4, 0, gh / 4, col);
        } else {
          const variant = r() < 0.5 ? 4 : main;
          const u0 = (variant + 0.03) / FACADE_VARIANTS, u1 = (variant + 0.97) / FACADE_VARIANTS;
          quadWall(B.facadeB, 0, gh, u0, u1, 0.02, 1.0 * (gh / FLOOR_H) - 0.02, col);
        }
        // upper floors
        if (nFloors > 0 && !(researched&&covered)) {
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
      if (!bespoke && !rg.hole && len >= 4 && quality !== 'low' && absArea > 20) {
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
  const sourceRoof=sourceColour(bld.sourceProperties?.roofColor)??materialColour(bld.sourceProperties?.roofMaterial,true);
  const roofCol: [number, number, number] = sourceRoof!==undefined?hex(sourceRoof):[roofGrey, roofGrey * 0.98, roofGrey * 0.94];
  const ph = quality === 'low' || H<4 ? 0 : 0.75;
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
  if (!bespoke && (absArea > 14 && quality !== 'low' || absArea > 40)) {
    tris += addClutter(B.clutterB, ring, bld, H + ph * 0.0, r, quality, unitCyl, unitDome, absArea);
  }

  if(researched){
    const before=Object.values(B.researchB).reduce((n,b)=>n+b.idx.length,0);
    appendResearchedBuilding(bld,researched,stores,B.researchB,quality,accessPlan);
    tris+=(Object.values(B.researchB).reduce((n,b)=>n+b.idx.length,0)-before)/3;
  }
  const observedFaces=bespoke?profileFacades(bld,stores):[];
  if(!researched){
    if(appearance?.style==='hotel_suprabhat') addSuprabhatFacade(H,group,quality,observedFaces[0]);
    if(appearance?.style==='madhapur_commercial') addMadhapurFacade(H,group,quality,stores,observedFaces,accessPlan);
    if(appearance?.style==='madhapur_brown_commercial') addMadhapurBrownFacade(bld,H,group,quality,observedFaces[0],accessPlan);
    if(appearance?.style==='madhapur_sn_heights') addSnHeightsFacade(bld,H,group,quality,observedFaces[0],signJobs);
    if(appearance?.style==='habsiguda_gatsi_block') addGatsiFacade(H,group,quality,observedFaces[0],accessPlan);
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
  // Source min_height is shared with physical collision; never turn a raised building into a ground wall.
  if(baseHeight>0){
    for(let k=0;k<builders.length;k++)for(let i=starts[k]+1;i<builders[k].pos.length;i+=3)builders[k].pos[i]+=baseHeight;
    for(let i=childStart;i<group.children.length;i++)group.children[i].position.y+=baseHeight;
  }
  if(B.accessRoads){
    const plan=accessPlan!;
    if(plan.adjustments.length){
      const before=Object.values(B.researchB).reduce((n,b)=>n+b.idx.length,0);
      appendBuildingAccess(plan,B.researchB);
      tris+=(Object.values(B.researchB).reduce((n,b)=>n+b.idx.length,0)-before)/3;
      (group.userData.buildingAccess??=[]).push({buildingId:bld.id,adjustments:plan.adjustments,solidPieces:plan.boxes.filter(b=>b.solid).length+plan.beams.length});
    }
  }
  return tris;
}

/** Specific April 2026 MedPlus/Prestige block composition, on its canonical surveyed frontage. */
function addMadhapurFacade(H:number, group:THREE.Group, quality:Quality, stores:Storefront[]|null, faces:ProfileFacade[],access?:BuildingAccessPlan) {
  const white=new GeoBuilder(true), glazing=new GeoBuilder(true), dark=new GeoBuilder(true);
  for(const face of faces) {
    const front=surveyFront(face.facade,face.heading,access&&accessRecessForFacade(access,face.facade,face.heading)),W=front.W;
    const box=(builder:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,c:number)=>front.box(builder,w,h,d,x,y,z,c);
    // Basement and raised ground floor, then white frames around the blue glazing.
    box(dark,W,1.18,.12,0,.6,-.72,0x202c31);
    box(white,W+.25,.24,.8,0,.89,.24,0xd8dad3);
    const spacing=(H-1)/5;
    for(let f=0;f<5;f++) {
      const y=1.0+f*spacing;
      if(f>0)box(glazing,W-.35,spacing-.65,.07,0,y+spacing*.45,.12,0x355f79);
      box(white,W+.12,.3,.42,0,y+spacing-.15,.24,0xeeeae0);
      if(quality!=='low')for(let x=-W/2+.5;x<W/2;x+=1.4)box(dark,.035,spacing-.7,.12,x,y+spacing*.45,.2,0x9aafb5);
    }
    const n=Math.max(2,Math.round(W/4.5));
    for(let k=0;k<=n;k++)box(white,.38,H-.6,.6,-W/2+W*k/n,H/2+.3,.26,0xe5e5da);
    box(white,W+1,.45,1.1,0,H-.05,.4,0xdbdfdb);

  }
  const med=stores?.find(sf=>sf.id==='survey-madhapur-medplus');
  if(med?.facade){
    const front=surveyFront(med.facade,med.facingHeading),W=front.W;
    const level=med.appearance?.frontBaseM??1.25,entry=W/2-1.25;
    group.userData.madhapurAccess={sourceId:'sv-madhapur-medplus-2026-04-chrome-20261017',geometryStatus:'provisional',mainStairCount:1,risers:8,landingHeightM:level,entryLocal:entry};
  }
  // A separate stair serves the eastern, stepped-back part of this same footprint.
  // It is not a second copy of the MedPlus entrance.
  const east=stores?.find(sf=>sf.id==='survey-madhapur-just-for-u');
  if(east?.facade){
    const front=surveyFront(east.facade,east.facingHeading),level=1.2;
    // Observed frosted panels and terracotta planters; the unknown left tenant stays unnamed.
    front.box(glazing,front.W-2.2,1.65,.06,-.5,2.1,.08,0xa8b8b6);
    group.userData.madhapurEastAccess={geometryStatus:'provisional',mainStairCount:1,risers:6,landingHeightM:level};
  }
  const mats=getWorldMats(quality);
  for(const [builder,mat,name]of [[white,mats.stationSteel,'madhapur-white-frame'],[glazing,mats.stationSteel,'madhapur-blue-window-ribbons'],[dark,mats.stationSteel,'madhapur-basement-mullions']]as const){
    const mesh=new THREE.Mesh(builder.build(),mat);mesh.name=name;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;group.add(mesh);
  }
}

/** April 2026 adjacent brown commercial block; no source image is used as a texture. */
function addMadhapurBrownFacade(bld:Building,H:number,group:THREE.Group,quality:Quality,face:ProfileFacade|undefined,access?:BuildingAccessPlan){
  if(!face)return;
  const front=surveyFront(face.facade,face.heading,access&&accessRecessForFacade(access,face.facade,face.heading)),W=front.W;
  const frame=new GeoBuilder(true),glass=new GeoBuilder(true),details=new GeoBuilder(true);
  const level=1.2,floorH=(H-level)/5;
  front.box(details,W,1.12,.08,0,.56,-.35,0x182529);
  for(let f=0;f<5;f++){
    const y=level+f*floorH;
    front.box(glass,W-1.1,floorH-.4,.07,0,y+(floorH-.4)/2,.08,0x354f54);
    front.box(frame,W,.24,.42,0,y-.12,.2,0xe0d9c7);
    if(quality!=='low')for(let x=-W/2+.8;x<W/2-.4;x+=1.25)front.box(details,.035,floorH-.42,.07,x,y+(floorH-.4)/2,.14,0x8c9892);
  }
  for(const t of [-.47,.07,.17,.47])front.box(frame,.62,H,.5,W*t,H/2,.28,0x906344);
  front.box(frame,W*.055,H-1,.42,W*.12,(H+1)/2,.24,0xe7e0d0);
  front.box(frame,W+.35,.5,.68,0,H-.12,.3,0xd9d2c1);
  const mats=getWorldMats(quality);
  for(const [builder,name]of [[frame,'madhapur-brown-piers'],[glass,'madhapur-brown-glazing'],[details,'madhapur-brown-access']]as const){
    const mesh=new THREE.Mesh(builder.build(),mats.stationSteel);mesh.name=name;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.madhapurBrownAccess={buildingId:bld.id,geometryStatus:'provisional',mainStairCount:2,risers:6,landingHeightM:level};
}

/** April 2026 SN Heights: three glass levels, offwhite roof fascia and a rose right-hand strip. */
function addSnHeightsFacade(bld:Building,H:number,group:THREE.Group,quality:Quality,face:ProfileFacade|undefined,signJobs:Promise<void>[]){
  if(!face)return;
  const front=surveyFront(face.facade,face.heading),W=front.W;
  const frame=new GeoBuilder(true),glass=new GeoBuilder(true),details=new GeoBuilder(true);
  const upperBase=.2,floorH=(H-.95-upperBase)/3;
  for(let f=0;f<3;f++){
    const y=upperBase+f*floorH;
    front.box(glass,W-.45,floorH-.24,.07,0,y+(floorH-.24)/2,.08,0x40585d);
    front.box(frame,W,.18,.3,0,y-.06,.18,0xbc7d7d);
    if(quality!=='low')for(let x=-W/2+.7;x<W/2-.3;x+=1.5)front.box(details,.035,floorH-.24,.07,x,y+(floorH-.24)/2,.14,0x88908b);
  }
  front.box(frame,W+0.1,.95,.55,0,H-.475,.24,0xe8e2d7);
  front.box(frame,W*.18,H,.5,W*.40,H/2,.28,0xba8180);
  front.box(frame,.28,H,.4,-W/2+.12,H/2,.2,0xe4dfd6);
  // An abstract gold relief evokes the observed ornament without copying its artwork.
  front.box(details,.65,.65,.06,W*.40,H-.58,.56,0xbb9b4e);
  front.box(frame,W*.11,.14,.075,W*.40,H-.58,.61,0xba8180);
  front.box(frame,.14,.5,.075,W*.40,H-.58,.61,0xba8180);
  const mats=getWorldMats(quality);
  for(const [builder,name]of [[frame,'sn-heights-fascia'],[glass,'sn-heights-glazing'],[details,'sn-heights-mullions']]as const){
    const mesh=new THREE.Mesh(builder.build(),mats.stationSteel);mesh.name=name;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;group.add(mesh);
  }
  if(bld.name){
    const key=`observed-sn-heights|${quality}`;
    let mat=signMatCache.get(key);
    if(!mat){
      mat=new THREE.MeshBasicMaterial({color:0x233854});signMatCache.set(key,mat);
      signTexCache.set(key,createSignTexture([{text:bld.name,lang:'en'}],{bg:'#e8e2d7',fg:'#233854',width:1024,height:128}));
      const target=mat;
      signTexCache.get(key)!.then(t=>{target.map=t;target.color.set(0xffffff);target.needsUpdate=true;}).catch(()=>undefined);
    }
    const sign=new THREE.Mesh(signGeo,mat),position=front.world(-W*.14,H-.475,.525);
    sign.position.copy(position);
    const normal=front.world(0,0,1).sub(front.world(0,0,0));sign.rotation.y=Math.atan2(normal.x,normal.z);
    sign.scale.set(W*.48,.62,1);sign.name='sn-heights-name';sign.userData.buildingId=bld.id;group.add(sign);
    signJobs.push(signTexCache.get(key)!.then(()=>undefined,()=>undefined));
  }
}

/** January 2026 Gatsi / Amaravathi block. Dimensions are authored estimates. */
function addGatsiFacade(H:number,group:THREE.Group,quality:Quality,face:ProfileFacade|undefined,access?:BuildingAccessPlan){
  if(!face)return;
  const front=surveyFront(face.facade,face.heading,access&&accessRecessForFacade(access,face.facade,face.heading)),W=front.W;
  const frame=new GeoBuilder(true),glass=new GeoBuilder(true),details=new GeoBuilder(true);
  const box=(builder:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,col:number)=>front.box(builder,w,h,d,x,y,z,col);
  // Dark squared cladding surrounds three broad recessed upper window ribbons.
  box(frame,1.35,H,.45,-W/2+.675,H/2,.12,0x343b3c);
  box(frame,1.35,H,.45,W/2-.675,H/2,.12,0x343b3c);
  box(frame,W,1.25,.5,0,H-.625,.12,0x343b3c);
  for(let floor=0;floor<3;floor++){
    const y=5.0+floor*3.6;
    box(glass,W-2.7,2.6,.06,0,y+1.3,.04,0x314445);
    box(frame,W-2.7,.65,.25,0,y-.18,.12,0xb9bdb6);
    if(quality!=='low')for(let x=-W/2+2.2;x<W/2-1.5;x+=1.8)box(details,.035,2.6,.07,x,y+1.3,.09,0x63706c);
  }
  // The shared central stair entrance sits between the ground-floor businesses.
  box(glass,2.8,3.2,.08,0,1.75,.05,0x111c1f);
  for(const x of [-W*.27,W*.28]){
    box(details,.95,.65,.45,x,5.2,.25,0xaeb2aa);
    box(details,.6,.48,.06,x,5.2,.51,0x525e5b);
  }
  const mats=getWorldMats(quality);
  for(const [builder,name]of [[frame,'gatsi-charcoal-frame'],[glass,'gatsi-window-ribbons'],[details,'gatsi-entry-details']]as const){
    const mesh=new THREE.Mesh(builder.build(),mats.stationSteel);mesh.name=name;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;group.add(mesh);
  }
}

/** Dated Street View-derived anchor appearance; footprint unchanged, height remains estimated. */
function addSuprabhatFacade(H:number, group:THREE.Group, quality:Quality, face:ProfileFacade|undefined) {
  if(!face)return;
  const front=surveyFront(face.facade,face.heading),W=front.W;
  const stone=new GeoBuilder(true),dark=new GeoBuilder(true),glazed=new GeoBuilder();
  const box=(builder:GeoBuilder,w:number,h:number,d:number,x:number,y:number,z:number,col:number)=>front.box(builder,w,h,d,x,y,z,col);
  // Cantilever over the roadside facade; four light stone piers define the rhythm.
  box(dark,W+1.6,.55,2.2,0,H-.1,.5,0x454a49);
  box(stone,W,.28,.4,0,3.55,.17,0xd2d2c3);
  for(const floor of [0,1,2]) {
    const y=4.0+floor*3.0;
    box(dark,W-3.2,1.95,.08,-1.2,y+1.0,.18,0x334346);
    // Stone bands and recessed balconies supply the actual wide horizontal composition.
    box(stone,W-.5,.3,.62,0,y-.08,.25,0xe0ddce);
    box(stone,W-3.3,.16,.75,-1.2,y+2.05,.35,0xd3d3c5);
    box(dark,W-3.8,.065,.08,-1.3,y+.72,.66,0x697372);
    if(quality!=='low')for(let x=-W/2+.9;x<W/2-3.1;x+=1.1)box(dark,.035,.7,.035,x,y+.37,.66,0x6f7673);
    for(let x=-W/2+.5;x<W/2-2.5;x+=5.2)box(stone,.32,2.7,.45,x,y+.85,.3,0xd8d6c8);
  }
  // Dark glazed vertical bay on the right as viewed from the road.
  box(glazed,3.1,9.4,.15,W/2-2.0,8.0,.27,0xffffff);
  for(let y=3.6;y<H-.8;y+=1.6)box(dark,3.25,.055,.18,W/2-2.0,y,.39,0x9bada9);
  box(stone,.45,10.2,.45,W/2-.17,8.0,.4,0xd7d5c7);
  box(stone,.45,10.2,.45,W/2-3.8,8.0,.4,0xd7d5c7);
  const mats=getWorldMats(quality);
  for(const [builder,mat,name] of [[stone,mats.stationSteel,'suprabhat-stone'],[dark,mats.stationSteel,'suprabhat-balconies'],[glazed,mats.stationGlass,'suprabhat-glazed-bay']] as const) {
    const mesh=new THREE.Mesh(builder.build(),mat);mesh.name=name;mesh.castShadow=quality!=='low';mesh.receiveShadow=true;group.add(mesh);
  }
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
