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
    setStatus('Loading Hyderabad…');
    try { return await fetchPack<CoreData>(base + 'core.pack.wasm'); }
    catch (error) {
      const el = document.getElementById('loading');
      if (!el) throw error;
      setStatus((error as Error).message + ' ');
      await new Promise<void>((resolve) => {
        const retry = document.createElement('button');
        retry.type = 'button'; retry.textContent = 'Retry loading Hyderabad';
        retry.style.cssText = 'display:block;margin:12px auto 0;padding:10px 16px;font:inherit;cursor:pointer;pointer-events:auto';
        retry.addEventListener('click', () => { retry.remove(); resolve(); }, { once: true });
        el.append(retry);
      });
    }
  }
}

export async function boot() {
  const still = q.get('still') ? { w: +(q.get('w') || 1280), h: +(q.get('h') || 592) } : undefined;
  const pref = loadSettings().quality, touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const lowQ = !still && (q.get('q') ? q.get('q') === 'low' : pref === 'auto' ? touch : pref === 'low');
  setStatus('Loading fonts…');
  await loadFonts();
  initTemplates({ rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12), ring: new THREE.RingGeometry(1.0, 1.35, 40) });
  const base = new URL('city/', location.href).href;
  const core = await loadCore(base);
  setStatus('Preparing Hyderabad streets…');
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
    setStatus('Building the streets…');
    world.focus = [c[0], c[2]];
    await world.ensure(c[0], c[2], +(q.get('r') || 700));
    engine.camera.position.set(c[0], c[1], c[2]); engine.camera.lookAt(c[3], c[4], c[5]);
    engine.camera.fov = +(q.get('fov') || 55); engine.camera.updateProjectionMatrix();
    world.signs.update(engine.camera.position.x, engine.camera.position.z, true);
    engine.placeSun(new THREE.Vector3(c[3], 0, c[5]));
    const game = q.get('withgame') ? new Game(engine, core, world, { lowQ, still: true }) : null;
    if (game) game.stillFrame(q);
    setStatus('');
    for (let i = 0; i < 2; i++) engine.render();
    (window as any).__engine = engine; (window as any).__THREE = THREE;
    (window as any).__done = true;
    return;
  }
  const game = new Game(engine, core, world, { lowQ });
  (window as any).__gameBoot = game;              // __game is set once the first area has loaded
  setStatus('');
  game.start();
}

function setStatus(t: string) { const el = document.getElementById('loading'); if (el) { el.textContent = t; el.hidden = !t; } }
boot().catch((e) => { console.error(e); setStatus('Could not start: ' + (e?.message || e)); (window as any).__err = String(e?.stack || e); });
