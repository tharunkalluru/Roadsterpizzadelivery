import type { CoreData, Building } from '../world/types';
import { fetchPack } from '../world/packs';

interface MapPack { roads: Record<string, number[][]>; areas: { k: 'park' | 'water'; r: number[] }[]; metro: number[][] }

// Full-screen city map: drag to move, scroll / pinch / + − to zoom. Opens from the minimap or the M key.
export interface MapState {
  player: { x: number; z: number; yaw: number } | null;
  canMove?: boolean;                     // "Deliver from here" is offered (no order in progress)
  route: [number, number, number][] | null;
  target: { x: number; z: number; label: string } | null;
  theatres: { x: number; z: number; name: string; leased: boolean }[];
  pickups: { x: number; z: number; pizza: boolean }[];
}

const CSS = `
.fmap{position:absolute;inset:0;background:#120f22;pointer-events:auto;touch-action:none;z-index:8}
.fmap[hidden],.fmap [hidden]{display:none!important}
.fmap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
.fmap canvas:active{cursor:grabbing}
.fmap .mbar{position:absolute;top:max(12px,env(safe-area-inset-top,0px));left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));display:flex;justify-content:space-between;align-items:center;gap:8px;pointer-events:none;z-index:1}
.fmap .map-title{background:rgba(23,19,43,.9);border-radius:14px;padding:8px 14px;font-family:var(--display);font-size:15px;color:var(--cream);pointer-events:none}
.fmap .map-title small{display:block;font-family:var(--body);font-size:12px;color:var(--muted);font-weight:500}
.fmap .zoom{position:absolute;right:max(14px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px}
.fmap .zb{width:48px;height:48px;border:0;border-radius:14px;background:rgba(23,19,43,.92);color:var(--cream);font-family:var(--display);font-size:22px;cursor:pointer;pointer-events:auto}
.fmap .zb:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.fmap .close{pointer-events:auto}
.fmap .legend{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));background:rgba(23,19,43,.9);border-radius:12px;padding:8px 12px;font-size:12px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;max-width:min(560px,70vw)}
.fmap .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.fmap .movebtn{position:absolute;left:50%;transform:translateX(-50%);bottom:max(64px,calc(env(safe-area-inset-bottom,0px) + 56px));pointer-events:auto}
.fmap .pickbar{position:absolute;left:50%;transform:translateX(-50%);bottom:max(16px,env(safe-area-inset-bottom,0px));width:min(460px,calc(100vw - 24px));background:rgba(23,19,43,.95);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;pointer-events:auto;z-index:2}
.fmap .pickbar .where{font-weight:800;font-size:17px;color:var(--cream)}
.fmap .pickbar .row{display:flex;gap:8px}.fmap .pickbar .btn{flex:1}
.fmap[data-pick] .legend,.fmap[data-pick] .movebtn{display:none}
.fmap[data-pick] .zoom{bottom:max(150px,calc(env(safe-area-inset-bottom,0px) + 140px))}
.fmap .pin{position:absolute;left:50%;top:50%;width:34px;height:46px;margin:-46px 0 0 -17px;pointer-events:none;display:none}
.fmap[data-pick] .pin{display:block}
`;

export class FullMap {
  root: HTMLElement; cv: HTMLCanvasElement; open = false; dirty = true;
  cx = 0; cz = 0; scale = 0.5;                       // pixels per metre
  layers: { park: Path2D; water: Path2D; roads: { p: Path2D; w: number; col: string; min: number }[]; minor: Map<string, Path2D>; metro: Path2D[] } | null = null; bld = new Path2D(); loading = false;
  pointers = new Map<number, { x: number; y: number }>(); pinch0 = 0; scale0 = 0;
  constructor(host: HTMLElement, public zone: CoreData, public state: () => MapState, public onClose: () => void, public src: { mapUrl: string; buildings: () => Building[] }) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.className = 'fmap'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-label', 'City map');
    this.root.innerHTML = `<canvas aria-label="Map of Hyderabad"></canvas>
      <div class="mbar"><div class="map-title">Hyderabad<small>Drag to move · scroll or pinch to zoom</small></div><button type="button" class="ib close" id="map-close">Close map ✕</button></div>
      <div class="zoom"><button type="button" class="zb" id="map-in" aria-label="Zoom in">+</button><button type="button" class="zb" id="map-out" aria-label="Zoom out">−</button><button type="button" class="zb" id="map-me" aria-label="Centre on my car" style="font-size:15px">◎</button></div>
      <svg class="pin" viewBox="0 0 34 46" aria-hidden="true"><path d="M17 45C17 45 3 27 3 17a14 14 0 0 1 28 0c0 10-14 28-14 28z" fill="#FF8FB1" stroke="#17132B" stroke-width="3"/><circle cx="17" cy="17" r="5.5" fill="#17132B"/></svg>
      <button type="button" class="btn go movebtn" id="map-move" hidden>Deliver from here…</button>
      <div class="pickbar" id="map-pickbar" hidden><div class="sm">Drag the map to put the pin where you want to start</div><div class="where" id="map-where">…</div>
        <div class="row"><button type="button" class="btn alt" id="map-pick-cancel">Cancel</button><button type="button" class="btn go" id="map-pick-ok">Start delivering here</button></div></div>
      <div class="legend"><span><i style="background:#FFB627"></i>You</span><span><i style="background:#45E3D3"></i>Route</span><span><i style="background:#FF8FB1"></i>Cinemas</span><span><i style="background:#F2994A"></i>Pizza pickups</span><span><i style="background:#22B573"></i>Metro</span></div>`;
    host.appendChild(this.root);
    this.cv = this.root.querySelector('canvas')!;
    (this.root.querySelector('#map-close') as HTMLElement).addEventListener('click', () => this.close());
    (this.root.querySelector('#map-move') as HTMLElement).addEventListener('click', () => this.beginPick({ onPick: (x, z) => this.onMove(x, z), onCancel: () => this.endPick() }));
    (this.root.querySelector('#map-pick-cancel') as HTMLElement).addEventListener('click', () => this.cancelPick());
    (this.root.querySelector('#map-pick-ok') as HTMLElement).addEventListener('click', () => { const p = this.pick; if (!p) return; const x = this.cx, z = this.cz; this.endPick(); p.onPick(x, z); });
    (this.root.querySelector('#map-in') as HTMLElement).addEventListener('click', () => this.zoomAt(1.5));
    (this.root.querySelector('#map-out') as HTMLElement).addEventListener('click', () => this.zoomAt(1 / 1.5));
    (this.root.querySelector('#map-me') as HTMLElement).addEventListener('click', () => { const p = this.state().player; if (!p) return; this.cx = p.x; this.cz = p.z; this.dirty = true; });
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.scale0 = this.scale; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (this.pointers.size === 1) { this.cx -= (e.clientX - p.x) / this.scale; this.cz -= (e.clientY - p.y) / this.scale; this.dirty = true; }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = cv.getBoundingClientRect();
        this.zoomTo(this.scale0 * (d / this.pinch0), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch0 = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('resize', () => (this.dirty = true));
  }
  // ---------- choosing a place: the map moves under a fixed pin ----------
  pick: { onPick: (x: number, z: number) => void; onCancel: () => void } | null = null;
  onMove: (x: number, z: number) => void = () => {};
  areaName: (x: number, z: number) => string = () => '';
  lastWhere = '';
  beginPick(p: { onPick: (x: number, z: number) => void; onCancel: () => void }) {
    this.pick = p; this.root.dataset.pick = '1';
    (this.root.querySelector('#map-pickbar') as HTMLElement).hidden = false;
    this.dirty = true;
  }
  endPick() { this.pick = null; delete this.root.dataset.pick; (this.root.querySelector('#map-pickbar') as HTMLElement).hidden = true; this.dirty = true; }
  cancelPick() { const p = this.pick; this.endPick(); p?.onCancel(); }
  // open straight into choosing (start of the game): centred on the city, or on a given spot
  showPick(p: { onPick: (x: number, z: number) => void; onCancel: () => void }, at?: { x: number; z: number; scale?: number }) {
    this.show(at);
    this.beginPick(p);
  }
  // city-wide roads, parks, lakes and metro come from map.pack.wasm (fetched the first time the map opens)
  buildP: Promise<void> | null = null; loadError = false;
  build() {
    if (!this.buildP) this.buildP = this.load().catch((error) => {
      this.loading = false; this.loadError = true; this.buildP = null; this.dirty = true;
      throw error; // a transient network error must be retryable next time the map opens
    });
    return this.buildP;
  }
  async load() {
    this.loading = true; this.loadError = false;
    const mp = await fetchPack<MapPack>(this.src.mapUrl);
    const park = new Path2D(), water = new Path2D();
    for (const a of mp.areas) { const P = a.k === 'water' ? water : park, r = a.r; P.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) P.lineTo(r[i], r[i + 1]); P.closePath(); }
    const STY: Record<string, [number, string]> = { minor: [6, '#8F86B8'], ter: [9, '#CFC6E4'], major: [14, '#F3EEDF'], elev: [13, '#B9A9F0'] };
    // main roads as single paths; the ~400k side streets bucketed in 2 km cells and drawn only when zoomed in and on screen
    const roads = ['ter', 'major', 'elev'].filter((k) => mp.roads[k]).map((k) => {
      const p = new Path2D();
      for (const l of mp.roads[k]) { p.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]); }
      return { p, w: STY[k][0], col: STY[k][1], min: k === 'ter' ? 0.03 : 0 };
    });
    const minor = new Map<string, Path2D>();
    const ml = mp.roads.minor || [];
    // built in slices so preloading it never stalls the game for more than a few milliseconds
    for (let n = 0; n < ml.length; n++) {
      const l = ml[n];
      const k = `${Math.floor(l[0] / 2000)},${Math.floor(l[1] / 2000)}`;
      let p = minor.get(k); if (!p) { p = new Path2D(); minor.set(k, p); }
      p.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]);
      if (n % 8000 === 7999) await new Promise((r) => setTimeout(r, 0));
    }
    const metro = mp.metro.map((l) => { const p = new Path2D(); p.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]); return p; });
    this.layers = { park, water, roads, minor, metro };
    this.loading = false; this.dirty = true;
  }
  show(at?: { x: number; z: number; scale?: number }) {
    this.build().catch((e) => console.error('map', e));
    // building outlines of the streamed tiles around the player
    this.bld = new Path2D();
    for (const b of this.src.buildings()) { const r = b.ring; if (r.length < 3) continue; this.bld.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) this.bld.lineTo(r[i][0], r[i][1]); this.bld.closePath(); }
    const st = this.state(), p = at || st.player || { x: 0, z: 0 };
    this.cx = p.x; this.cz = p.z; if (at?.scale) this.scale = at.scale;
    (this.root.querySelector('#map-move') as HTMLElement).hidden = !st.canMove;
    this.root.hidden = false; this.open = true; this.dirty = true;
    (this.root.querySelector('#map-close') as HTMLElement).focus();
  }
  // Close always dismisses the map; Cancel only backs out of the current picker.
  close() {
    const pick = this.pick;
    this.hide();
    pick?.onCancel();
  }
  hide() {
    if (!this.open) return;
    this.endPick();
    for (const id of this.pointers.keys()) if (this.cv.hasPointerCapture(id)) this.cv.releasePointerCapture(id);
    this.pointers.clear(); this.pinch0 = 0;
    this.root.hidden = true; this.open = false; this.onClose();
  }
  handleKey(e: KeyboardEvent) {
    if (['Escape', 'KeyM', 'KeyP'].includes(e.code)) {
      if (!e.repeat) this.close();
      e.preventDefault();
    } else if (['+', '='].includes(e.key)) { this.zoomAt(1.4); e.preventDefault(); }
    else if (['-', '_'].includes(e.key)) { this.zoomAt(1 / 1.4); e.preventDefault(); }
    else if (e.code.startsWith('Arrow') || (e.code === 'Space' &&
      !(e.target as HTMLElement | null)?.closest?.('button,input,select,textarea,[role="button"]'))) e.preventDefault();
  }
  zoomTo(s: number, ox?: number, oy?: number) {
    const W = this.cv.clientWidth, H = this.cv.clientHeight; ox ??= W / 2; oy ??= H / 2;
    const ns = Math.max(0.012, Math.min(6, s));
    const wx = this.cx + (ox - W / 2) / this.scale, wz = this.cz + (oy - H / 2) / this.scale;
    this.scale = ns; this.cx = wx - (ox - W / 2) / ns; this.cz = wz - (oy - H / 2) / ns; this.dirty = true;
  }
  zoomAt(f: number, ox?: number, oy?: number) { this.zoomTo(this.scale * f, ox, oy); }
  // redraw when something changed; the car marker refreshes a few times a second
  t = 0;
  tick(dt: number) {
    if (!this.open) return;
    this.t += dt; if (this.t > 0.25) { this.t = 0; this.dirty = true; }
    if (this.dirty) { this.dirty = false; this.draw(); }
  }
  draw() {
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d')!, L = this.layers, s = this.scale, st = this.state();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#1B1633'; g.fillRect(0, 0, W, H);
    if (!L) { g.fillStyle = '#F6EEDC'; g.font = '800 18px "Baloo 2", sans-serif'; g.textAlign = 'center'; g.fillText(this.loadError ? 'Map unavailable. Close and reopen to retry.' : 'Loading the city map…', W / 2, H / 2); return; }
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - this.cx * s), dpr * (H / 2 - this.cz * s));
    g.fillStyle = '#2f5a3a'; g.fill(L.park); g.fillStyle = '#2d4f73'; g.fill(L.water);
    if (s > 0.12) { g.fillStyle = '#3a3160'; g.fill(this.bld); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (s >= 0.07) {
      g.strokeStyle = '#8F86B8'; g.lineWidth = Math.max(6, 1.6 / s);
      const x0 = Math.floor((this.cx - W / 2 / s) / 2000), x1 = Math.floor((this.cx + W / 2 / s) / 2000), z0 = Math.floor((this.cz - H / 2 / s) / 2000), z1 = Math.floor((this.cz + H / 2 / s) / 2000);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const p = L.minor.get(`${i},${j}`); if (p) g.stroke(p); }
    }
    for (const r of L.roads) { if (s < r.min) continue; g.strokeStyle = r.col; g.lineWidth = Math.max(r.w, 2.2 / s); g.stroke(r.p); }
    g.strokeStyle = '#22B573'; g.lineWidth = Math.max(3, 3 / s); g.setLineDash([12 / Math.max(0.5, s), 8 / Math.max(0.5, s)]); for (const m of L.metro) g.stroke(m); g.setLineDash([]);
    if (st.route) { g.strokeStyle = '#45E3D3'; g.lineWidth = Math.max(6, 6 / s); g.beginPath(); st.route.forEach((p, i) => (i ? g.lineTo(p[0], p[2]) : g.moveTo(p[0], p[2]))); g.stroke(); }
    // markers in screen space
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toS = (x: number, z: number) => [W / 2 + (x - this.cx) * s, H / 2 + (z - this.cz) * s];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (s > 0.25) for (const p of st.pickups) { const [x, y] = toS(p.x, p.z); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; g.fillStyle = p.pizza ? '#F2994A' : 'rgba(242,153,74,.55)'; g.beginPath(); g.arc(x, y, p.pizza ? 5 : 3, 0, 7); g.fill(); }
    // neighbourhood names
    g.font = `700 ${s > 0.6 ? 14 : 12}px "Baloo 2", sans-serif`; g.fillStyle = 'rgba(246,238,220,.55)';
    for (const p of this.zone.places || []) { if (/^Ward \d+/.test(p.name)) continue; if ((p.kind === 'neighborhood' || p.kind === 'microhood') && s < 0.15) continue; if (p.kind !== 'locality' && s < 0.04) continue; const [x, y] = toS(p.p[0], p.p[1]); if (x > 0 && y > 0 && x < W && y < H) g.fillText(p.name, x, y); }
    for (const t of st.theatres) {
      const [x, y] = toS(t.x, t.z);
      g.fillStyle = t.leased ? '#FFB627' : '#FF8FB1'; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
      g.fillStyle = '#17132B'; g.font = '11px "Bungee", sans-serif'; g.fillText('▶', x + 1, y);
      if (s > 0.18) { g.font = '800 12px "Baloo 2", sans-serif'; g.fillStyle = '#F6EEDC'; g.strokeStyle = 'rgba(18,15,34,.85)'; g.lineWidth = 3; g.strokeText(t.name, x, y - 16); g.fillText(t.name, x, y - 16); }
    }
    if (st.target) { const [x, y] = toS(st.target.x, st.target.z); g.fillStyle = '#FFB627'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.strokeStyle = '#17132B'; g.lineWidth = 3; g.stroke(); g.font = '800 13px "Baloo 2", sans-serif'; g.fillStyle = '#F6EEDC'; g.strokeStyle = 'rgba(18,15,34,.9)'; g.lineWidth = 4; g.strokeText(st.target.label, x, y - 20); g.fillText(st.target.label, x, y - 20); }
    if (st.player) {
      const [px, py] = toS(st.player.x, st.player.z);
      g.save(); g.translate(px, py); g.rotate(-st.player.yaw);
      g.fillStyle = '#FFB627'; g.strokeStyle = '#17132B'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    if (this.pick) { const w = this.areaName(this.cx, this.cz); if (w !== this.lastWhere) { this.lastWhere = w; (this.root.querySelector('#map-where') as HTMLElement).textContent = w || 'Somewhere in Hyderabad'; } }
    // scale bar
    const m = [50, 100, 200, 500, 1000].find((v) => v * s > 70) || 1000;
    g.fillStyle = 'rgba(23,19,43,.9)'; g.fillRect(W / 2 - m * s / 2 - 10, H - 40, m * s + 20, 26);
    g.fillStyle = '#F6EEDC'; g.fillRect(W / 2 - m * s / 2, H - 22, m * s, 3); g.font = '800 11px "Baloo 2", sans-serif'; g.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, W / 2, H - 31);
  }
}
