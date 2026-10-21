/** Shared world materials (roads, concrete, buildings), cached per quality preset. */
import * as THREE from 'three';
import type { Quality } from './api';
import { anisoFor, getFacadeAtlas, getNoiseTexture, getRoadSurface, getShopAtlas, loadMapTexture } from './textures';
import { markTerrainMaterial } from './terrainCutouts';

export interface WorldMats {
  asphalt: THREE.MeshStandardMaterial;
  lineWhite: THREE.MeshStandardMaterial;
  lineYellow: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  paving: THREE.MeshStandardMaterial;
  railSteel: THREE.MeshStandardMaterial;
  trackBed: THREE.MeshStandardMaterial;
  track: THREE.MeshStandardMaterial;
  stationRoof: THREE.MeshStandardMaterial;
  stationGlass: THREE.MeshStandardMaterial;
  stationSteel: THREE.MeshStandardMaterial;
  metroBlue: THREE.MeshStandardMaterial;
  facade: THREE.MeshStandardMaterial;
  shop: THREE.MeshStandardMaterial;
  plain: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  clutter: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  verge: THREE.MeshStandardMaterial;
}

const cache = new Map<Quality, WorldMats>();

export function getWorldMats(q: Quality): WorldMats {
  const hit = cache.get(q);
  if (hit) return hit;
  const aniso = anisoFor(q);
  const res = q === 'high' ? 1024 : 512;
  const a = `assets/materials/aerial_asphalt_01/aerial_asphalt_01`;
  const c = `assets/materials/concrete_wall_006/concrete_wall_006`;

  const asphalt = new THREE.MeshStandardMaterial({
    name: 'asphalt',
    color: q === 'high' ? 0xe6ded2 : 0x59656b,
    map: q === 'high' ? loadMapTexture(`${a}_diff_1024.jpg`, true, aniso) : getRoadSurface(),
    roughnessMap: q === 'high' ? loadMapTexture(`${a}_arm_512.jpg`, false, aniso) : null,
    roughness: 1,
    metalness: 0,
  });
  if (q === 'high') {
    asphalt.normalMap = loadMapTexture(`${a}_nor_${res}.jpg`, false, aniso);
    asphalt.normalScale.set(0.9, 0.9);
  }

  const lineWhite = new THREE.MeshStandardMaterial({ name: 'markings', color: 0xffffff, vertexColors: true, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lineYellow = new THREE.MeshStandardMaterial({ name: 'line-yellow', color: 0xe9b92a, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

  const concrete = new THREE.MeshStandardMaterial({
    name: 'concrete',
    color: 0xcfcac1,
    map: q === 'high' ? loadMapTexture(`${c}_diff_1024.jpg`, true, aniso) : getNoiseTexture('plaster', q),
    roughnessMap: q === 'high' ? loadMapTexture(`${c}_arm_512.jpg`, false, aniso) : null,
    roughness: 1,
    metalness: 0,
  });
  if (q === 'high') {
    concrete.normalMap = loadMapTexture(`${c}_nor_${res}.jpg`, false, aniso);
    concrete.normalScale.set(0.8, 0.8);
  }
  // pavement: same concrete maps, lighter and slightly warmer
  const paving = concrete.clone();
  paving.name = 'paving';
  paving.color = new THREE.Color(q === 'high' ? 0xfff7e8 : 0xbeb9a9);
  concrete.color.setHex(q === 'high' ? 0xe9e2d5 : 0xc6c4b9);

  const railSteel = new THREE.MeshStandardMaterial({ name: 'rail-steel', color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 });
  const trackBed = new THREE.MeshStandardMaterial({ name: 'track-bed', color: 0x5f5e5a, roughness: 1 });
  const stationRoof = new THREE.MeshStandardMaterial({ name: 'station-roof', color: 0xe9ecef, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide });
  const stationGlass = new THREE.MeshStandardMaterial({ name: 'station-glass', color: 0x5d86a8, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.55 });
  const stationSteel = new THREE.MeshStandardMaterial({ name: 'station-steel', color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.45 });
  const track = new THREE.MeshStandardMaterial({ name: 'track', color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.4 });
  const metroBlue = new THREE.MeshStandardMaterial({ name: 'metro-blue', color: 0x1f5db0, roughness: 0.5, metalness: 0.1 });

  const facade = new THREE.MeshStandardMaterial({
    name: 'facade',
    map: getFacadeAtlas(q),
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });
  const shop = new THREE.MeshStandardMaterial({
    name: 'shop',
    map: getShopAtlas(q),
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  const plain = new THREE.MeshStandardMaterial({
    name: 'plain-wall',
    map: getNoiseTexture('plaster', q),
    vertexColors: true,
    roughness: 0.95,
  });
  const roof = new THREE.MeshStandardMaterial({
    name: 'roof',
    map: getNoiseTexture('roof', q),
    vertexColors: true,
    roughness: 0.95,
  });
  const clutter = new THREE.MeshStandardMaterial({ name: 'roof-clutter', vertexColors: true, roughness: 0.7, metalness: 0.15 });

  const groundTex = getNoiseTexture('ground', q);
  const ground = new THREE.MeshStandardMaterial({
    name: 'ground',
    color: 0xa9a699,
    map: groundTex,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: 3,
    polygonOffsetUnits: 3,
  });

  const verge = new THREE.MeshStandardMaterial({ name: 'verge', vertexColors: true, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mats: WorldMats = { asphalt, lineWhite, lineYellow, concrete, paving, railSteel, trackBed, track, stationRoof, stationGlass, stationSteel, metroBlue, facade, shop, plain, roof, clutter, ground, verge };
  for(const material of [asphalt,paving,ground,verge,lineWhite,lineYellow])markTerrainMaterial(material);
  cache.set(q, mats);
  return mats;
}
