import type { CoreData } from '../world/types';

// "Where do you want to deliver?" — the first screen, and the "Change area" sheet later on.
// Popular areas as big buttons, a search over every neighbourhood and metro station, or pick a spot on the city map.
export interface AreaChoice { name: string; x: number; z: number }

const CSS = `
.apick{position:absolute;inset:0;z-index:7;pointer-events:auto;background:radial-gradient(120% 90% at 50% 0%,#2A2152 0%,#17132B 62%);display:flex;justify-content:center;overflow:auto;padding:max(18px,env(safe-area-inset-top,0px)) 14px max(18px,env(safe-area-inset-bottom,0px))}
.apick[hidden]{display:none}
.apick .in{width:min(720px,100%);display:flex;flex-direction:column;gap:14px}
.apick h1{margin:6px 0 0;font-family:var(--display);font-weight:400;font-size:clamp(24px,5vw,38px);line-height:1.05;color:var(--saffron);text-shadow:0 3px 0 #0C0A1A}
.apick .lead{font-size:15px;color:var(--muted);margin:0}
.apick .search{position:relative}
.apick input{width:100%;box-sizing:border-box;height:52px;border-radius:14px;border:2px solid var(--line);background:#120F22;color:var(--cream);font:700 17px var(--body);padding:0 16px}
.apick input:focus{outline:none;border-color:var(--teal)}
.apick .res{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.apick .res button{height:46px;text-align:left;border:0;border-radius:12px;background:#2A2347;color:var(--cream);font:700 16px var(--body);padding:0 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
.apick .res button small{color:var(--muted);font-weight:500;font-size:12px}
.apick .chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.apick .chips button{min-height:52px;border:0;border-radius:14px;background:#2A2347;color:var(--cream);font:800 16px var(--body);cursor:pointer;padding:6px 10px;text-align:left}
.apick .chips button:hover,.apick .res button:hover{background:#3A3160}
.apick .chips button:focus-visible,.apick .res button:focus-visible{outline:3px solid var(--teal);outline-offset:2px}
.apick .k{margin-top:4px}
.apick .acts{display:flex;gap:8px;flex-wrap:wrap}.apick .acts .btn{flex:1;min-width:200px}
`;

const POPULAR: [string, number, number][] = [
  ['RTC X Roads', 17.4063, 78.4966], ['Charminar', 17.3616, 78.4747], ['Ameerpet', 17.4375, 78.4482], ['Kukatpally', 17.4849, 78.4138],
  ['HITEC City', 17.4474, 78.3762], ['Gachibowli', 17.4401, 78.3489], ['Secunderabad', 17.4399, 78.4983], ['Uppal', 17.4058, 78.5591],
  ['Nagaram', 17.4836, 78.6040], ['ECIL', 17.4700, 78.5710], ['Dilsukh Nagar', 17.3688, 78.5247], ['LB Nagar', 17.3457, 78.5522],
  ['Mehdipatnam', 17.3950, 78.4400], ['Banjara Hills', 17.4126, 78.4390], ['Kompally', 17.5390, 78.4870], ['Miyapur', 17.4968, 78.3614],
];

export class AreaPicker {
  root: HTMLElement; list: AreaChoice[] = []; popular: AreaChoice[] = [];
  onPick: (c: AreaChoice) => void = () => {};
  onMap: () => void = () => {};
  onClose: (() => void) | null = null;
  constructor(host: HTMLElement, core: CoreData) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const o = core.origin, KX = Math.cos((o.lat * Math.PI) / 180) * 6380050.094 * Math.PI / 180, KZ = 6341141.9 * Math.PI / 180;
    const xz = (lat: number, lon: number) => ({ x: (lon - o.lon) * KX, z: -(lat - o.lat) * KZ });
    this.popular = POPULAR.map(([name, lat, lon]) => ({ name, ...xz(lat, lon) }));
    // searchable: every named neighbourhood (one entry per name) plus metro stations
    const seen = new Set<string>();
    const rank: Record<string, number> = { locality: 0, macrohood: 1, neighborhood: 2, microhood: 3 };
    for (const p of [...core.places].sort((a, b) => (rank[a.kind] ?? 4) - (rank[b.kind] ?? 4))) {
      if (/^Ward \d+/.test(p.name) || /^(Greater )?Hyderabad$/.test(p.name)) continue;
      const k = p.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      this.list.push({ name: p.name, x: p.p[0], z: p.p[1] });
    }
    for (const s of core.metro.stations) { const k = (s.name + ' metro').toLowerCase(); if (seen.has(k)) continue; seen.add(k); this.list.push({ name: `${s.name} Metro`, x: s.p[0], z: s.p[1] }); }
    for (const p of this.popular) if (!seen.has(p.name.toLowerCase())) { seen.add(p.name.toLowerCase()); this.list.push(p); }
    this.root = document.createElement('div'); this.root.className = 'apick'; this.root.hidden = true;
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-label', 'Choose where to deliver');
    host.appendChild(this.root);
  }
  show(opts: { first: boolean; last?: AreaChoice | null; current?: string }) {
    const last = opts.last;
    this.root.innerHTML = `<div class="in">
      <h1>${opts.first ? 'Where do you want to deliver?' : 'Deliver somewhere else'}</h1>
      <p class="lead">${opts.first ? 'Pick your part of Hyderabad. Pizza orders come from kitchens around you. You can move after any delivery: open the map and choose “Deliver from here”.' : `You're in ${esc(opts.current || 'Hyderabad')}. Choose a new area; your coins and theatres stay with you.`}</p>
      ${last ? `<div class="acts"><button type="button" class="btn go" id="ap-last">Continue in ${esc(last.name)}</button></div>` : ''}
      <div class="search"><input id="ap-q" type="search" placeholder="Search an area or metro station: Uppal, Nagaram, Tarnaka…" autocomplete="off" aria-label="Search an area"><div class="res" id="ap-res"></div></div>
      <div class="k">Popular areas</div>
      <div class="chips">${this.popular.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}</button>`).join('')}</div>
      <div class="acts"><button type="button" class="btn alt" id="ap-map">Pick a spot on the map</button>${this.onClose ? '<button type="button" class="btn alt" id="ap-close">Stay here</button>' : ''}</div>
    </div>`;
    this.root.hidden = false;
    const q = this.root.querySelector('#ap-q') as HTMLInputElement, res = this.root.querySelector('#ap-res') as HTMLElement;
    const render = () => {
      const t = q.value.trim().toLowerCase();
      if (t.length < 2) { res.innerHTML = ''; return; }
      const hits = this.list.filter((c) => c.name.toLowerCase().includes(t)).sort((a, b) => +!a.name.toLowerCase().startsWith(t) - +!b.name.toLowerCase().startsWith(t) || a.name.length - b.name.length).slice(0, 7);
      res.innerHTML = hits.length ? hits.map((c, i) => `<button type="button" data-h="${i}">${esc(c.name)}<small>Start here</small></button>`).join('') : '<div class="sm">No area by that name. Try the map.</div>';
      res.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.choose(hits[+(b as HTMLElement).dataset.h!])));
    };
    q.addEventListener('input', render);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = res.querySelector('button') as HTMLButtonElement | null; b?.click(); } e.stopPropagation(); });
    this.root.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => this.choose(this.popular[+(b as HTMLElement).dataset.i!])));
    this.root.querySelector('#ap-map')!.addEventListener('click', () => { this.hide(); this.onMap(); });
    this.root.querySelector('#ap-last')?.addEventListener('click', () => this.choose(last!));
    this.root.querySelector('#ap-close')?.addEventListener('click', () => { this.hide(); this.onClose?.(); });
    // phones: don't pop the keyboard over the list; desktops: type straight away
    if (!matchMedia('(pointer: coarse)').matches) q.focus();
  }
  choose(c: AreaChoice) { this.hide(); this.onPick(c); }
  hide() { this.root.hidden = true; }
  get open() { return !this.root.hidden; }
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
