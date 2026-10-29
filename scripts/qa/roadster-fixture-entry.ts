// Synthetic visual fixture using the application's real Player and Engine.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Engine } from '../../src/core/engine';
import { Player } from '../../src/game/player';
import { MOODS } from '../../src/core/sky';
import { initTemplates, rng } from '../../src/core/util';
declare const FIXTURE_VARIANT: string;
declare const FIXTURE_SOURCE_HASH: string;
const query = new URLSearchParams(location.search), w = 1280, h = 720;
const pose = { view: query.get('view') || 'rear', mood: query.get('mood') || 'day', deployment: +(query.get('deploy') || 0),
  steer: +(query.get('steer') || 0), wheelRoll: +(query.get('roll') || 0), kickflip: +(query.get('flip') || 0) };
const main = async () => {
  await Promise.all(['64px "Bungee"', '800 30px "Baloo 2"'].map(font => document.fonts.load(font)));
  initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, .12), ring: new THREE.RingGeometry(1, 1.35, 40) });
  const engine = new Engine(document.getElementById('game')!, { lowQ: false, still: { w, h } });
  const city: any = { surfaceGrid: new Map(), buildingGrid: new Map(), walls: new Map(), obstacles: new Map(), landmarkSurfaceGrid: new Map(), bounds: { minX: -100, minZ: -100, maxX: 100, maxZ: 100 } };
  const player = new Player(city, engine.mats); player.addTo(engine.scene);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), engine.mats.road); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; engine.scene.add(ground);
  // Fixed stage objects expose genuine reflection, lighting and shadow changes.
  const stageMaterial = new THREE.MeshStandardMaterial({ color: '#c6b7a0', roughness: .7 });
  for (const x of [-8, 8]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 16), stageMaterial); wall.position.set(x, 2.5, 0); wall.castShadow = wall.receiveShadow = true; engine.scene.add(wall); }
  player.pos.set(0, .55 + (pose.kickflip ? 3 : 0), 0); player.group.position.copy(player.pos);
  player.thrusterDeployment = pose.deployment; player.setDeployment(pose.deployment);
  for (let i = 0; i < player.wheels.length; i++) player.wheels[i].rotation.y = i < 2 ? -pose.steer * .38 : 0;
  for (const roller of player.wheelRollers) roller.rotation.x = pose.wheelRoll;
  const pivot = (player as any).kickflipPivot as THREE.Group; pivot.rotation.z = pose.kickflip;
  player.group.updateMatrixWorld(true);
  // Keep procedural puffs deterministic despite different constructor UUID counts.
  const savedRandom = Math.random; Math.random = rng(37218);
  try { player.animateThrusters(0, 7.25, pose.deployment > 0 ? 1 : 0); } finally { Math.random = savedRandom; }
  player.glow.position.set(0, .06, 0); player.glow.visible = true;
  player.light.position.set(0, player.pos.y - .2, 0);
  const camera = pose.view === 'front' ? [-6, 3.4, -8] : pose.view === 'side' ? [8, 2.8, 2] : pose.view === 'wheel' ? [3.2, 1.6, -2.8] : [6, 3.4, 8];
  engine.camera.position.set(...camera as [number, number, number]); engine.camera.lookAt(0, 1 + player.pos.y * .25, 0);
  engine.applyMood(MOODS[pose.mood] || MOODS.day); engine.placeSun(new THREE.Vector3(0, 0, 0));
  engine.lampLights.forEach((light, i) => light.position.set(i % 2 ? 4 : -4, 5, (i - 2) * 3));
  await engine.prepareFrame(); engine.render(true);
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); engine.render(true);
  let meshes = 0, visibleMeshes = 0; const geometry = new Set<string>(), materials = new Set<string>();
  player.group.traverse(node => { if ((node as THREE.Mesh).isMesh) { meshes++; geometry.add((node as THREE.Mesh).geometry.uuid); const m = (node as THREE.Mesh).material; if (!Array.isArray(m)) materials.add(m.uuid); } });
  player.group.traverseVisible(node => { if ((node as THREE.Mesh).isMesh) visibleMeshes++; });
  (window as any).__fixture = { kind: 'synthetic actual-Player/Engine material and geometry fixture; no gameplay/FPS claim', variant: FIXTURE_VARIANT,
    sourceHash: FIXTURE_SOURCE_HASH, pose, width: w, height: h, dpr: devicePixelRatio, drawBuffer: [engine.renderer.domElement.width, engine.renderer.domElement.height],
    fontsReady: document.fonts.status, meshes, visibleMeshes, uniqueGeometry: geometry.size, materials: materials.size,
    carBounds: new THREE.Box3().setFromObject(player.group), kickflipCentre: (player as any).kickflipCentre, jumpBodyTop: (player as any).jumpBodyTop,
    render: { ...engine.renderer.info.render }, resources: { ...engine.renderer.info.memory }, batching: player.group.userData.staticBatching || null,
    physicalCanopy: true, actualLabelsAndTextures: true, actualSkyPMREMEnvironment: true, actualShadowMap: engine.renderer.shadowMap.enabled };
  (window as any).__fixtureReady = true;
};
main().catch(error => { (window as any).__fixtureError = String(error?.stack || error); throw error; });
