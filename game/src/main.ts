import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initTemplates } from './core/util';
import { Engine } from './core/engine';
import { MOODS, moodAt } from './core/sky';
import { World } from './world/world';
import { fetchPack } from './world/packs';
import type { CoreData } from './world/types';
import { prepareRoadGrades, rebaseRoadStops } from './world/road-grades';
import { Game } from './game/game';
import { loadSettings } from './ui/settings';
import { showLoading, hideLoading, loadingRetry } from './ui/loading';

const q = new URLSearchParams(location.search);

async function loadFonts() {
  if (!document.fonts) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.all(['64px "Bungee"', '800 30px "Baloo 2"', '700 30px "Baloo 2"', '700 40px "Noto Sans Telugu"'].map((f) => document.fonts.load(f, 'Aఅ'))), new Promise((r) => { timeout = setTimeout(r, 4000); })]);
  } catch { /* system fallback */ }
  finally { if (timeout !== undefined) clearTimeout(timeout); }
}

// Retry only the download: no WebGL engine, worker or game listeners exist yet.
export async function loadCore(base: string): Promise<CoreData> {
  for (;;) {
    showLoading('Loading Hyderabad…', 'city');
    try { return await fetchPack<CoreData>(base + 'core.pack.wasm'); }
    catch (error) {
      await loadingRetry((error as Error).message, 'Retry loading Hyderabad');
    }
  }
}

export async function boot() {
  const still = q.get('still') ? { w: +(q.get('w') || 1280), h: +(q.get('h') || 592) } : undefined;
  const pref = loadSettings().quality, touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const lowQ = !still && (q.get('q') ? q.get('q') === 'low' : pref === 'auto' ? touch : pref === 'low');
  showLoading('Getting your Roadster ready…', 'fonts');
  await loadFonts();
  initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new THREE.RingGeometry(1.0, 1.35, 40) });
  const base = new URL('city/', location.href).href;
  const core = await loadCore(base);
  showLoading('Preparing Hyderabad streets…', 'streets');
  const originalRoads = core.roads;
  core.roads = prepareRoadGrades(originalRoads);
  rebaseRoadStops(core, originalRoads, core.roads);
  const container = document.getElementById('game')!;
  const engine = new Engine(container, { lowQ, still });
  const world = new World(core, engine.mats, { lowQ, base });
  engine.scene.add(world.group);
  world.signs.init(0.6);
  (window as any).__world = world;

  if (still) {
    const mood = q.get('mood') ? MOODS[q.get('mood')!] : moodAt(+(q.get('hour') || 18.2));
    engine.applyMood(mood, { signs: (v) => world.signs.setEmissive(v) });
    const c = (q.get('cam') || '30,6,40,0,2,-60').split(',').map(Number);
    showLoading('Building the streets…', 'streets');
    world.focus = [c[0], c[2]];
    await world.ensure(c[0], c[2], +(q.get('r') || 700));
    engine.camera.position.set(c[0], c[1], c[2]); engine.camera.lookAt(c[3], c[4], c[5]);
    engine.camera.fov = +(q.get('fov') || 55); engine.camera.updateProjectionMatrix();
    world.signs.update(engine.camera.position.x, engine.camera.position.z, true);
    engine.placeSun(new THREE.Vector3(c[3], 0, c[5]));
    const game = q.get('withgame') ? new Game(engine, core, world, { lowQ, still: true }) : null;
    if (game) game.stillFrame(q);
    showLoading('Getting the view ready…', 'view');
    await engine.prepareFrame();
    hideLoading();
    (window as any).__engine = engine; (window as any).__THREE = THREE;
    (window as any).__done = true;
    return;
  }
  const game = new Game(engine, core, world, { lowQ });
  (window as any).__gameBoot = game;              // __game is set once the first area has loaded
  game.start();
  // Direct area links retain relocation's loading screen until the view is ready.
  if (!game.relocating) hideLoading();
}

boot().catch(async (e) => {
  console.error(e); (window as any).__err = String(e?.stack || e);
  await loadingRetry('Could not start the drive. Please try again.', 'Reload game');
  location.reload();
});
