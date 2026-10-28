import type { CoreData, Building } from '../world/types';
import { fetchPack } from '../world/packs';
import { DialogFocus } from './dialog';
import { placeCatalogue, PLACE_CATEGORIES, type LandmarkPlace, type PlaceCategory } from '../world/landmark_catalog';
import { layoutPlaceMarkers, mapPlaceCandidates, hitPlaceMarker, placeIcon, type PlaceMarker } from './landmark-icons';
import { metroCorridors, METRO_LINE_COLORS, metroPlatformAssemblies } from '../world/metro-geometry';
import { installPrototypeTheme } from './theme';
import { DESTINATION_MAP_IDENTITIES } from '../world/destination-data';
import { destinationPlaceCatalogue } from '../world/destination-identity';

interface MapPack { roads: Record<string, number[][]>; areas: { k: 'park' | 'water'; r: number[] }[]; metro: number[][] }

// Full-screen city map: drag to move, scroll / pinch / + − to zoom. Opens from the minimap or the M key.
export interface MapState {
  player: { x: number; z: number; yaw: number } | null;
  canMove?: boolean;                     // "Deliver from here" is offered (no order in progress)
  route: [number, number, number][] | null;
  target: { x: number; z: number; label: string } | null;
  pickups: { x: number; z: number; pizza: boolean }[];
}

const CSS = `
.fmap{position:absolute;inset:0;background:#191126;pointer-events:auto;touch-action:none;z-index:8}
.fmap[hidden],.fmap [hidden]{display:none!important}
.fmap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
.fmap canvas:active{cursor:grabbing}
.fmap .mbar{position:absolute;top:max(12px,env(safe-area-inset-top,0px));left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));display:flex;justify-content:space-between;align-items:center;gap:8px;pointer-events:none;z-index:3}
.fmap .map-title{background:var(--ui-plum);border:1px solid #8965AA;border-radius:16px;padding:9px 14px;font-family:var(--display);font-size:15px;color:var(--cream);box-shadow:var(--ui-panel-shadow);min-width:0;pointer-events:none}
.fmap .map-heading{display:flex;align-items:center;gap:8px}.fmap .map-heading svg{width:17px;height:21px;color:var(--pink);filter:drop-shadow(0 0 4px rgba(255,79,174,.35))}
.fmap .map-title small{display:block;font-family:var(--body);font-size:12px;color:var(--muted);font-weight:500}
.fmap .zoom{position:absolute;right:max(14px,env(safe-area-inset-right,0px));bottom:max(18px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px}
.fmap .zb{width:48px;height:48px;border:2px solid #AA85D0;border-radius:16px;background:var(--ui-plum);color:var(--cream);font-family:var(--display);font-size:22px;cursor:pointer;pointer-events:auto;display:grid;place-items:center;box-shadow:var(--ui-panel-shadow),0 0 9px rgba(179,127,230,.12)}
.fmap .zb svg{width:23px;height:23px;display:block;pointer-events:none}.fmap .zb:active{transform:scale(.97)}
.fmap .zb:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.fmap .close{pointer-events:auto;flex:0 0 auto;min-width:44px;min-height:44px;touch-action:manipulation;white-space:nowrap}
.fmap .legend{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));background:var(--ui-plum);border:1px solid #74568F;border-radius:15px;padding:9px 12px;font-size:12px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;max-width:min(560px,70vw);box-shadow:var(--ui-panel-shadow)}
.fmap .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.fmap .movebtn{position:absolute;left:50%;transform:translateX(-50%);bottom:max(100px,calc(env(safe-area-inset-bottom,0px) + 88px));pointer-events:auto}
.fmap .pickbar{position:absolute;left:50%;transform:translateX(-50%);bottom:max(16px,env(safe-area-inset-bottom,0px));box-sizing:border-box;width:min(460px,calc(100vw - 24px));background:var(--ui-plum);border:2px solid #B88DE3;border-radius:20px;padding:14px;display:flex;flex-direction:column;gap:10px;pointer-events:auto;z-index:2;box-shadow:var(--ui-panel-shadow),0 0 18px rgba(179,127,230,.16)}
.fmap .pickbar .where{font-weight:800;font-size:17px;color:var(--cream)}
.fmap .pickbar .row{display:flex;gap:8px}.fmap .pickbar .btn{flex:1}
.fmap .places{position:absolute;top:max(80px,calc(env(safe-area-inset-top,0px) + 68px));left:max(12px,env(safe-area-inset-left,0px));width:min(330px,calc(100% - 84px));z-index:2;color:var(--cream);pointer-events:auto;touch-action:pan-y}
.fmap .places-toggle{min-height:44px;padding:8px 14px;border:1px solid #B08BD4;border-radius:15px;background:var(--ui-plum);color:var(--cream);font:800 14px var(--body);cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:var(--ui-panel-shadow)}
.fmap .places-toggle svg{width:18px;height:20px;color:var(--saffron);pointer-events:none}
.fmap .places-panel,.fmap .place-detail{margin-top:8px;padding:12px;background:var(--ui-plum);border:1px solid #B08BD4;border-radius:18px;box-shadow:var(--ui-panel-shadow),0 0 12px rgba(179,127,230,.14)}
.fmap .place-tools{display:flex;flex-direction:column;gap:8px}.fmap .place-tools input,.fmap .place-tools select{min-height:44px;width:100%;box-sizing:border-box;font:14px var(--body);background:#261B37;color:var(--cream);border:1px solid #87669F;border-radius:11px;padding:8px}.fmap .place-tools input::placeholder{color:#BCAFCC;opacity:1}
.fmap .place-results{max-height:min(38vh,330px);overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;margin-top:8px}
.fmap .place-results button{min-height:48px;text-align:left;flex:0 0 auto;background:transparent;color:var(--cream);border:0;border-bottom:1px solid #5C4276;padding:8px;font:700 14px var(--body);cursor:pointer;border-radius:8px}.fmap .place-results button:active{background:#4C335E}
.fmap .place-results small{display:block;color:var(--muted);font-weight:400}.fmap .place-summary{color:var(--muted);font-size:12px;margin:6px 0}
.fmap .place-detail{font-size:14px}.fmap .place-detail strong{color:var(--saffron)}.fmap .place-detail small{display:block;margin-top:5px;color:var(--muted)}.fmap .place-dismiss{min-height:44px;margin-top:8px;border:1px solid #9573B5;border-radius:12px;background:linear-gradient(145deg,#4C345F,#2C1F3D);color:var(--cream);padding:6px 12px;cursor:pointer}
.fmap .places button:focus-visible,.fmap .places input:focus-visible,.fmap .places select:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.fmap[data-pick] .places{display:none}
@media(max-height:500px){.fmap .places{top:max(66px,calc(env(safe-area-inset-top,0px) + 54px))}.fmap .place-results{max-height:22vh}.fmap .places-panel{padding:8px}.fmap .place-tools{flex-direction:row}}
.fmap[data-pick] .legend,.fmap[data-pick] .movebtn{display:none}
.fmap[data-pick] .zoom{bottom:max(150px,calc(env(safe-area-inset-bottom,0px) + 140px))}
.fmap .pin{position:absolute;left:50%;top:50%;width:34px;height:46px;margin:-46px 0 0 -17px;pointer-events:none;display:none}
.fmap[data-pick] .pin{display:block}
@media(hover:hover) and (pointer:fine){.fmap .zb:hover,.fmap .places-toggle:hover,.fmap .place-dismiss:hover{border-color:#E2C8FF}.fmap .place-results button:hover{background:#3B284C}}
`;

export class FullMap {
  root: HTMLElement; cv: HTMLCanvasElement; open = false; dirty = true;
  private focus?: DialogFocus;
  places: LandmarkPlace[];
  markers: PlaceMarker[] = [];
  selectedPlace: LandmarkPlace | null = null;
  placeCategory: PlaceCategory | '' = '';
  placeQuery = '';
  private gesture: { id: number; x: number; y: number; moved: boolean } | null = null;
  cx = 0; cz = 0; scale = 0.5;                       // pixels per metre
  layers: { park: Path2D; water: Path2D; roads: { p: Path2D; w: number; col: string; min: number }[]; minor: Map<string, Path2D>; metro: { p: Path2D; color: string }[] } | null = null; bld = new Path2D(); loading = false;
  pointers = new Map<number, { x: number; y: number }>(); pinch0 = 0; scale0 = 0;
  constructor(host: HTMLElement, public zone: CoreData, public state: () => MapState, public onClose: () => void, public src: { mapUrl: string; buildings: () => Building[] }) {
    this.places = placeCatalogue(zone.origin);
    // Metro catalogue identities share the runtime's retained service anchors.
    const metroPlaces = { ameerpet_interchange: ['st_ameerpet', 'red'], mgbs_metro: ['st_mahatma_gandhi_bus_station', 'red'], parade_metro: ['st_parade_grounds', 'green'] } as const;
    const platforms = metroPlatformAssemblies(zone.metro.stations, metroCorridors(zone.metro.lines), zone.metro.deckHeight);
    for (const place of this.places) { const target = metroPlaces[place.id as keyof typeof metroPlaces]; if (!target) continue; const platform = platforms.find(p => p.stationId === target[0] && p.lineId === target[1]); if (platform) { place.x = platform.source.p[0]; place.z = platform.source.p[1]; } }
    const normalizedName = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const placeNames = new Map<string, LandmarkPlace[]>();
    for (const place of this.places) { const key = normalizedName(place.name); (placeNames.get(key) || placeNames.set(key, []).get(key)!).push(place); }
    for (const place of destinationPlaceCatalogue(DESTINATION_MAP_IDENTITIES, zone.origin)) {
      const key = normalizedName(place.name), matches = placeNames.get(key) || [];
      if (matches.some(p => Math.hypot(p.x - place.x, p.z - place.z) < 180)) continue;
      this.places.push(place);
      matches.push(place); placeNames.set(key, matches);
    }
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    installPrototypeTheme();
    this.root = document.createElement('div'); this.root.className = 'fmap'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-label', 'City map');
    this.root.innerHTML = `<canvas aria-label="Map of Hyderabad"></canvas>
      <div class="mbar"><div class="map-title"><span class="map-heading"><svg viewBox="0 0 24 30" fill="currentColor" aria-hidden="true"><path d="M12 29C8 24 1 16 1 11a11 11 0 0 1 22 0c0 5-7 13-11 18Z"/><circle cx="12" cy="11" r="4" fill="#241630"/></svg>Hyderabad</span><small>Drag to move · scroll or pinch to zoom</small></div><button type="button" class="ib close" id="map-close">Close map <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
      <div class="places"><button type="button" class="places-toggle" id="map-places" aria-expanded="false" aria-controls="map-places-panel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16M15 5v16"/></svg>Explore ${this.places.length} places</button>
        <section class="places-panel" id="map-places-panel" aria-label="Hyderabad places" hidden><div class="place-tools"><input id="map-place-search" type="search" placeholder="Search Hyderabad places" aria-label="Search Hyderabad places" autocomplete="off"><select id="map-place-category" aria-label="Place category"><option value="">All places</option>${PLACE_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div><div class="place-summary" id="map-place-summary" aria-live="polite"></div><div class="place-results" id="map-place-results"></div></section>
        <section class="place-detail" id="map-place-detail" aria-label="Selected place" hidden><strong id="map-place-name"></strong><small id="map-place-kind"></small><small>Stylised landmark · appearance and location may be approximate.</small><button type="button" class="place-dismiss" id="map-place-dismiss">Dismiss place</button></section>
      </div>
      <div class="zoom"><button type="button" class="zb" id="map-in" aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button><button type="button" class="zb" id="map-out" aria-label="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg></button><button type="button" class="zb" id="map-me" aria-label="Centre on my car"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button></div>
      <svg class="pin" viewBox="0 0 34 46" aria-hidden="true"><path d="M17 45C17 45 3 27 3 17a14 14 0 0 1 28 0c0 10-14 28-14 28z" fill="#FF8FB1" stroke="#17132B" stroke-width="3"/><circle cx="17" cy="17" r="5.5" fill="#17132B"/></svg>
      <button type="button" class="btn go movebtn" id="map-move" hidden>Deliver from here…</button>
      <div class="pickbar" id="map-pickbar" hidden><div class="sm">Drag the map to put the pin where you want to start</div><div class="where" id="map-where">…</div>
        <div class="row"><button type="button" class="btn alt" id="map-pick-cancel">Cancel</button><button type="button" class="btn go" id="map-pick-ok">Start delivering here</button></div></div>
      <div class="legend"><span><i style="background:#FFB627"></i>You</span><span><i style="background:#45E3D3"></i>Route</span><span><i style="background:#F2994A"></i>Pizza pickups</span><span>${Object.entries(METRO_LINE_COLORS).map(([id, color]) => '<i title="' + id + ' line" style="background:' + color + '"></i>').join('')}Metro</span><span><i style="background:#cfbb8b"></i>Places · tap icons</span></div>`;
    host.appendChild(this.root);
    this.focus = new DialogFocus(this.root, {
      initial: () => this.root.querySelector('#map-close'),
      restore: () => host.querySelector('#minimap'),
      key: (event) => this.handleKey(event), captureKeys: true,
    });
    this.cv = this.root.querySelector('canvas')!;
    (this.root.querySelector('#map-close') as HTMLElement).addEventListener('click', () => this.close());
    (this.root.querySelector('#map-move') as HTMLElement).addEventListener('click', () => this.beginPick({ onPick: (x, z) => this.onMove(x, z), onCancel: () => this.endPick() }));
    (this.root.querySelector('#map-pick-cancel') as HTMLElement).addEventListener('click', () => this.cancelPick());
    (this.root.querySelector('#map-pick-ok') as HTMLElement).addEventListener('click', () => { const p = this.pick; if (!p) return; const x = this.cx, z = this.cz; this.endPick(); p.onPick(x, z); });
    (this.root.querySelector('#map-in') as HTMLElement).addEventListener('click', () => this.zoomAt(1.5));
    (this.root.querySelector('#map-out') as HTMLElement).addEventListener('click', () => this.zoomAt(1 / 1.5));
    (this.root.querySelector('#map-me') as HTMLElement).addEventListener('click', () => { const p = this.state().player; if (!p) return; this.cx = p.x; this.cz = p.z; this.dirty = true; });
    const placesToggle = this.root.querySelector<HTMLButtonElement>('#map-places')!;
    placesToggle.addEventListener('click', () => {
      const panel = this.root.querySelector<HTMLElement>('#map-places-panel')!;
      panel.hidden = !panel.hidden; placesToggle.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) { this.root.querySelector<HTMLElement>('#map-place-detail')!.hidden = true; this.renderPlaceResults(); this.root.querySelector<HTMLInputElement>('#map-place-search')!.focus(); }
    });
    this.root.querySelector<HTMLInputElement>('#map-place-search')!.addEventListener('input', (e) => { this.placeQuery = (e.target as HTMLInputElement).value; this.renderPlaceResults(); });
    this.root.querySelector<HTMLSelectElement>('#map-place-category')!.addEventListener('change', (e) => { this.placeCategory = (e.target as HTMLSelectElement).value as PlaceCategory | ''; this.renderPlaceResults(); this.dirty = true; });
    this.root.querySelector<HTMLElement>('#map-place-dismiss')!.addEventListener('click', () => { this.selectedPlace = null; this.root.querySelector<HTMLElement>('#map-place-detail')!.hidden = true; this.dirty = true; placesToggle.focus(); });
    this.renderPlaceResults();
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already ended */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      else this.gesture = null;
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.scale0 = this.scale; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (this.gesture && Math.hypot(e.clientX - this.gesture.x, e.clientY - this.gesture.y) > 8) this.gesture.moved = true;
      if (this.pointers.size === 1) { this.cx -= (e.clientX - p.x) / this.scale; this.cz -= (e.clientY - p.y) / this.scale; this.dirty = true; }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = cv.getBoundingClientRect();
        this.zoomTo(this.scale0 * (d / this.pinch0), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = (e: PointerEvent) => {
      const tap = e.type === 'pointerup' && this.gesture?.id === e.pointerId && !this.gesture.moved && this.pointers.size === 1 && !this.pick;
      this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch0 = 0; this.gesture = null;
      if (tap) {
        const r = cv.getBoundingClientRect(), hit = hitPlaceMarker(this.markers, e.clientX - r.left, e.clientY - r.top);
        if (hit) {
          if (hit.members.length > 1) { this.cx = hit.place.x; this.cz = hit.place.z; this.zoomAt(2); }
          this.selectPlace(hit.place, false);
        }
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
    addEventListener('resize', () => (this.dirty = true));
  }
  filteredPlaces() { return this.places.filter((p) => !this.placeCategory || p.category === this.placeCategory); }
  private placeResultLimit = 80;
  renderPlaceResults(reset = true) {
    if (reset) this.placeResultLimit = 80;
    const q = this.placeQuery.trim().toLocaleLowerCase(), matches = this.filteredPlaces().filter((p) => p.name.toLocaleLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    const list = this.root.querySelector<HTMLElement>('#map-place-results')!; list.replaceChildren();
    this.root.querySelector<HTMLElement>('#map-place-summary')!.textContent = `${matches.length} of ${this.places.length} places · tap to find on map`;
    for (const p of matches.slice(0, this.placeResultLimit)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = p.name;
      const category = document.createElement('small'); category.textContent = p.category; button.appendChild(category);
      button.addEventListener('click', () => this.selectPlace(p, true)); list.appendChild(button);
    }
    if (matches.length > this.placeResultLimit) {
      const more = document.createElement('button'); more.type = 'button'; more.textContent = `Show more places · ${this.placeResultLimit} of ${matches.length}`;
      more.addEventListener('click', () => { this.placeResultLimit += 80; this.renderPlaceResults(false); }); list.appendChild(more);
    }
    if (!matches.length) list.textContent = 'No matching places. Try a different name or category.';
  }
  selectPlace(place: LandmarkPlace, centre: boolean) {
    this.selectedPlace = place;
    if (centre) { this.cx = place.x; this.cz = place.z; this.scale = Math.max(this.scale, 0.3); }
    this.root.querySelector<HTMLElement>('#map-place-name')!.textContent = place.name;
    this.root.querySelector<HTMLElement>('#map-place-kind')!.textContent = place.category;
    this.root.querySelector<HTMLElement>('#map-places-panel')!.hidden = true;
    this.root.querySelector<HTMLElement>('#map-place-detail')!.hidden = false;
    this.root.querySelector<HTMLElement>('#map-places')!.setAttribute('aria-expanded', 'false');
    this.root.querySelector<HTMLElement>('#map-place-dismiss')!.focus({ preventScroll: true });
    this.dirty = true;
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
    const metro = metroCorridors(this.zone.metro.lines).map(c => { const p = new Path2D(), l = c.center.pts; p.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) p.lineTo(l[i][0], l[i][1]); return { p, color: c.color }; });
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
    this.focus?.show();
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
    for (const id of this.pointers.keys()) {
      try { if (this.cv.hasPointerCapture(id)) this.cv.releasePointerCapture(id); } catch { /* already released */ }
    }
    this.pointers.clear(); this.pinch0 = 0; this.gesture = null;
    this.root.hidden = true; this.open = false; this.focus?.hide(); this.onClose();
  }
  handleKey(e: KeyboardEvent) {
    // Typing a place name must not trigger M/P close or +/- zoom shortcuts. Escape still dismisses the map.
    if ((e.target as HTMLElement | null)?.closest?.('input,select,textarea') && e.code !== 'Escape') return;
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
    g.lineWidth = Math.max(3, 3 / s); g.setLineDash([12 / Math.max(0.5, s), 8 / Math.max(0.5, s)]); for (const m of L.metro) { g.strokeStyle = m.color; g.stroke(m.p); } g.setLineDash([]);
    if (st.route) { g.strokeStyle = '#45E3D3'; g.lineWidth = Math.max(3, 3 / s); g.beginPath(); st.route.forEach((p, i) => (i ? g.lineTo(p[0], p[2]) : g.moveTo(p[0], p[2]))); g.stroke(); }
    // markers in screen space
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toS = (x: number, z: number) => [W / 2 + (x - this.cx) * s, H / 2 + (z - this.cz) * s];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (s > 0.25) for (const p of st.pickups) { const [x, y] = toS(p.x, p.z); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue; g.fillStyle = p.pizza ? '#F2994A' : 'rgba(242,153,74,.55)'; g.beginPath(); g.arc(x, y, p.pizza ? 5 : 3, 0, 7); g.fill(); }
    // neighbourhood names
    g.font = `700 ${s > 0.6 ? 14 : 12}px "Baloo 2", sans-serif`; g.fillStyle = 'rgba(246,238,220,.55)';
    const areaLabels: { x: number; y: number; w: number }[] = [];
    for (const p of this.zone.places || []) { if (/^Ward \d+/.test(p.name)) continue; if ((p.kind === 'neighborhood' || p.kind === 'microhood') && s < 0.24) continue; if (p.kind !== 'locality' && s < 0.08) continue; const [x, y] = toS(p.p[0], p.p[1]), w = g.measureText(p.name).width + 20; if (x > 0 && y > 0 && x < W && y < H && !areaLabels.some(b => Math.abs(y-b.y)<24 && Math.abs(x-b.x)<(w+b.w)/2)) { g.fillText(p.name, x, y); areaLabels.push({x,y,w}); } }
    this.markers = layoutPlaceMarkers(mapPlaceCandidates(this.filteredPlaces(), s, this.selectedPlace?.id, !!this.placeCategory), { cx: this.cx, cz: this.cz, scale: s, width: W, height: H }, this.selectedPlace?.id);
    // Cached screen-space icons keep the full catalogue inexpensive; groups expand as you zoom.
    const labels: { x: number; y: number; w: number }[] = [];
    for (const marker of this.markers) {
      const { x, y, place, members } = marker, selected = place.id === this.selectedPlace?.id;
      g.drawImage(placeIcon(place.icon), x - 15, y - 15, 30, 30);
      if (selected) { g.strokeStyle = '#45E3D3'; g.lineWidth = 3; g.strokeRect(x - 17, y - 17, 34, 34); }
      if (members.length > 1) { g.fillStyle = '#cfbb8b'; g.beginPath(); g.arc(x + 13, y - 12, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = '#17132b'; g.font = '800 10px sans-serif'; g.fillText(String(members.length), x + 13, y - 12); }
      if (selected || s >= 1.6 || (place.priority >= 1 && s >= .9) || (place.priority >= 2 && s >= .055)) {
        g.font = '800 12px "Baloo 2", sans-serif'; const w = g.measureText(place.name).width + 8, ly = y + 25;
        if (selected || !labels.some((b) => Math.abs(ly - b.y) < 16 && Math.abs(x - b.x) < (w + b.w) / 2)) {
          g.strokeStyle = '#17132b'; g.lineWidth = 4; g.strokeText(place.name, x, ly); g.fillStyle = '#f6eedc'; g.fillText(place.name, x, ly); labels.push({ x, y: ly, w });
        }
      }
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
