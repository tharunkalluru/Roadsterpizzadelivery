import * as THREE from 'three';
import { Batch, TPL, Rng, AddOpts, Tpl, toTpl } from '../core/util';
import type { HumanPartSink } from './human-anatomy';
import { drawContinuousBody } from './human-body';
import { skinWalkingGeometry } from './human-gait';
import {HumanSkinBatch,rigidHumanTemplate,HUMAN_BONES} from './human-skin';

// People of Hyderabad: one builder for the static crowds at shop fronts and for animated walkers.
// Local frame: feet at y=0, facing -z. `s` scales the whole figure (1 = adult of about 1.65 m).

export type Kind = 'sari' | 'salwar' | 'burqa' | 'western_f' | 'schoolgirl' | 'schoolboy' | 'shirt' | 'lungi' | 'kurta_cap' | 'elder_m' | 'elder_f' | 'tee' | 'teen_m' | 'teen_f';
export interface PersonSpec { kind: Kind; s: number; skin: string; hair: string; a: string; b: string; c: string; walk: number;
  sleeve?: 'short' | 'long'; pattern?: 'plain' | 'check' | 'stripe'; bindi?: boolean; facialHair?: boolean;
  age?: 'child' | 'teen' | 'adult' | 'elder'; build?: 'slim' | 'average' | 'broad'; face?: number; hairstyle?: number;
}

const SKIN = ['#5b3a29', '#6e452f', '#7d5135', '#8d5a3b', '#9c6644', '#a8704b', '#b97f55', '#c68f62', '#d1a074', '#e0b48a'];
const SARI = ['#C2185B', '#E65100', '#2E7D32', '#6A1B9A', '#F9A825', '#00838F', '#AD1457', '#1565C0', '#D84315', '#7B1FA2', '#EC407A', '#00897B'];
const KURTI = ['#F48FB1', '#FFCC80', '#80CBC4', '#B39DDB', '#FFF59D', '#EF9A9A', '#A5D6A7', '#90CAF9', '#FFAB91', '#CE93D8'];
const SHIRT = ['#E9EEF5', '#9EC1E8', '#F2E6C9', '#C9D9B5', '#E3B9B4', '#2F4A7A', '#7A2F3B', '#4A6B3A', '#ffffff', '#D7C4E8', '#F3C567'];
const TROUSER = ['#2b2a31', '#3f4b6b', '#5d4b3c', '#6f6a60', '#2e3b55', '#1f2433'];
const TEE = ['#E8413A', '#1F5FCC', '#22B573', '#1b1a1f', '#F06A9B', '#FFB627', '#8E5BD0', '#2BA39A', '#ffffff'];
// Wrapped cloth and tunics hang close to the body; a wide skirt cone makes a
// sari, lungi or kurta read as a bell-shaped dress at every distance.
const WRAPPED = toTpl(new THREE.CylinderGeometry(.5, .56, 1, 12));
const TUNIC = toTpl(new THREE.CylinderGeometry(.5, .68, 1, 10));

// adult mix: about half women, with kids and elders; weights tuned to look like a busy Hyderabad footpath
const MIX: [Kind, number][] = [['sari', 14], ['salwar', 12], ['burqa', 6], ['western_f', 6], ['schoolgirl', 4], ['schoolboy', 4], ['teen_m', 6], ['teen_f', 6],
  ['shirt', 16], ['lungi', 5], ['kurta_cap', 5], ['elder_m', 5], ['elder_f', 5], ['tee', 10]];

export const personAge = (p: PersonSpec) => p.age ?? (p.kind.startsWith('school') ? 'child' : p.kind.startsWith('teen') ? 'teen' : p.kind.startsWith('elder') ? 'elder' : 'adult');
export const personFemale = (p: PersonSpec) => ['sari','salwar','burqa','western_f','schoolgirl','elder_f','teen_f'].includes(p.kind);
export function personProportions(p: PersonSpec) {
  const age = personAge(p), build = p.build === 'slim' ? .89 : p.build === 'broad' ? 1.13 : 1;
  return { age, female: personFemale(p), width: build*(age==='teen'?.90:age==='child'?.91:1), head: age==='child'?1.11:age==='teen'?1.025:1, hip: .84, knee: .45, ankle: .09 };
}

export function randomPerson(r: Rng): PersonSpec {
  let tot = 0; for (const [, w] of MIX) tot += w;
  let p = r() * tot, kind: Kind = 'shirt';
  for (const [k, w] of MIX) { p -= w; if (p <= 0) { kind = k; break; } }
  const kid = kind === 'schoolgirl' || kind === 'schoolboy';
  const teen = kind === 'teen_m' || kind === 'teen_f';
  const elder = kind === 'elder_m' || kind === 'elder_f';
  const female = ['sari', 'salwar', 'burqa', 'western_f', 'schoolgirl', 'elder_f','teen_f'].includes(kind);
  const s = kid ? r.range(0.68, 0.78) : teen ? r.range(female?.87:.91,female?.95:1) : (female ? r.range(0.9, 1.0) : r.range(0.97, 1.08)) * (elder ? 0.97 : 1);
  const hair = elder ? r.pick(['#d9d6d0', '#bdb8b0', '#9e9a94']) : r.pick(['#141216', '#1d1714', '#2a1d16', '#191515']);
  let a = '#fff', b = '#fff', c = '#fff';
  switch (kind) {
    case 'sari': a = r.pick(SARI); b = r.pick(SARI); c = r.pick(['#E6B422', '#F5D76E', '#ffffff', '#C9A227']); break;
    case 'elder_f': a = r.pick(['#ffffff', '#E7E1D3', '#B0BEC5', '#8D6E63', '#5C6BC0']); b = r.pick(['#ffffff', '#ECEFF1']); c = '#C9A227'; break;
    case 'salwar': a = r.pick(KURTI); b = r.pick(['#ffffff', '#1b1a1f', '#F3E5AB', '#5D4037', ...KURTI]); c = r.pick(SARI); break;
    case 'burqa': a = r.pick(['#121114', '#18161c', '#1c1a22', '#22202a']); b = a; c = r.pick(['#121114', '#3a2f4a', '#2b3a4a']); break;
    case 'western_f': a = r.pick(TEE); b = r.pick(['#2e4a7a', '#3b5998', '#1b1a1f', '#d8cfc0']); c = r.pick(['#ffffff', '#1b1a1f']); break;
    case 'schoolgirl': a = '#ffffff'; b = r.pick(['#1E3A6E', '#5B2C6F', '#2E5E3E', '#7A1F2B']); c = '#E53935'; break;
    case 'schoolboy': a = '#ffffff'; b = r.pick(['#1E3A6E', '#4E4A45', '#2E5E3E']); c = r.pick(['#1F5FCC', '#E8413A', '#FFB627']); break;
    case 'shirt': a = r.pick(SHIRT); b = r.pick(TROUSER); c = '#1b1a1f'; break;
    case 'lungi': a = r.pick(['#ffffff', '#E9EEF5', ...SHIRT]); b = r.pick(['#1565C0', '#2E7D32', '#ffffff', '#6A1B9A', '#B71C1C', '#37474F']); c = '#ffffff'; break;
    case 'kurta_cap': a = r.pick(['#ffffff', '#F2EFE6', '#E9EEF5', '#D7E3D0']); b = a; c = '#ffffff'; break;
    case 'elder_m': a = r.pick(['#ffffff', '#F2EFE6']); b = '#ffffff'; c = '#7a5a3a'; break;
    case 'tee': a = r.pick(TEE); b = r.pick(['#2e4a7a', '#3b5998', '#1b1a1f', '#6f6a60']); c = r.pick(['#E8413A', '#1b1a1f', '#ffffff']); break;
    case 'teen_m': case 'teen_f': a=r.pick(TEE); b=r.pick(['#273c5c','#476080','#2b2930','#635b54']); c=r.pick(['#75442c','#252937','#435a5c']); break;
  }
  const walk = (kid ? 1.35 : elder ? 0.85 : 1.15) * r.range(0.9, 1.15);
  return { kind, s, skin: r.pick(SKIN), hair, a, b, c, walk,
    sleeve: kind === 'shirt' || kind === 'salwar' || kind === 'kurta_cap' || kind === 'elder_m' ? (r() < .7 ? 'long' : 'short') : 'short',
    pattern: kind === 'shirt' || kind === 'lungi' ? r.pick(['plain', 'plain', 'check', 'stripe'] as const) : 'plain',
    bindi: (kind === 'sari' || kind === 'salwar') && r() < .7,
    facialHair: !female && !kid && !teen && r() < .42,
    age: kid?'child':teen?'teen':elder?'elder':'adult', build: r.pick(['slim','average','average','broad'] as const), face:r.int(0,5), hairstyle:r.int(0,3),
  };
}

function tpl(): Record<string, Tpl> { return TPL; }

// legs are drawn separately for walkers so they can swing; static figures include them in the body
export function legsVisible(k: Kind) { return !['sari', 'burqa', 'elder_f', 'lungi'].includes(k); }

interface Sink { add(t: Tpl, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, opts?: AddOpts): void }

// Draw a figure into `sink` at (x, z) facing `ry`. When `legs` is false, leg columns are left out (walkers add their own).
// `lo` draws a light version for static crowds: low-poly parts and no small details
export function drawPerson(sink: Sink, p: PersonSpec, x: number, z: number, ry: number, legs = true, y0 = 0, lo = false) {
  const s=p.s,cs=Math.cos(ry),sn=Math.sin(ry),props=personProportions(p),k=p.kind;
  const put:HumanPartSink=(t,lx,ly,lz,sx,sy,sz,color,o={})=>sink.add(t,x+(lx*props.width*cs+lz*sn)*s,y0+ly*s,z+(-lx*props.width*sn+lz*cs)*s,sx*props.width*s,sy*s,sz*s,color,{...o,ry:ry+(o.ry??0)});
  // The continuous body includes both legs. Legacy callers may still pass
  // legs=false, but no separate rigid leg column is appended to this mesh.
  drawContinuousBody(put,{...p,female:props.female,age:props.age},lo);
  if(k==='elder_m')put(rigidHumanTemplate(TPL.cyl6,HUMAN_BONES.handR),.31,.49,-.08,.015,.97,.015,'#654c32',{rz:-.045});
}

export type PersonSeat = 'bike' | 'scooter' | 'auto' | 'bench' | 'pillion' | 'pillionSide' | 'scooterPillion' | 'rickshawDriver' | 'rickshawPassenger';
/** Pose the same continuous surface into the exact production seat/contact
 * frame. No capped thigh/arm segments or floating standalone palms. */
export function drawSeatedPerson(sink: Sink, p: PersonSpec, x: number, y: number, z: number, seat: PersonSeat) {
  const angle=seat==='pillionSide'?-Math.PI/2:0,cs=Math.cos(angle),sn=Math.sin(angle),s=p.s,props=personProportions(p);
  const put:HumanPartSink=(t,lx,ly,lz,sx,sy,sz,c,o={})=>sink.add(t,x+(lx*cs+lz*sn)*s,y+ly*s,z+(-lx*sn+lz*cs)*s,sx*s,sy*s,sz*s,c,{...o,ry:angle+(o.ry??0)});
  // Occupants remain one merged draw per vehicle; the reduced continuous mesh
  // retains actual facial/hand morphology without multiplying every bus seat
  // by the close-up pedestrian topology budget.
  drawContinuousBody(put,{...p,female:props.female,age:props.age},true,seat);
}

// ---------- animated walkers ----------
interface WalkerGeometry { body: THREE.BufferGeometry; leg: THREE.BufferGeometry | null; rigged?: THREE.BufferGeometry }
interface WalkerGeometryEntry extends WalkerGeometry { refs: number; used: number; bytes: number;skinData:ReturnType<HumanSkinBatch['skinAttributes']> }
const cache = new Map<string, WalkerGeometryEntry>();
const UNUSED_GEOMETRY_LIMIT = 128, UNUSED_GEOMETRY_BYTES = 16 * 1024 * 1024;
let geometryUse = 0;
export const walkerGeometryCacheStats = { entries: 0, activeEntries: 0, activeReferences: 0, unusedEntries: 0, estimatedBytes: 0, unusedBytes: 0,
  created: 0, disposed: 0, maxUnusedEntries: UNUSED_GEOMETRY_LIMIT, maxUnusedBytes: UNUSED_GEOMETRY_BYTES };
function refreshGeometryStats() {
  const s = walkerGeometryCacheStats; s.entries = cache.size; s.activeEntries = s.activeReferences = s.unusedEntries = s.estimatedBytes = s.unusedBytes = 0;
  for (const item of cache.values()) {
    s.estimatedBytes += item.bytes; s.activeReferences += item.refs;
    if (item.refs) s.activeEntries++; else { s.unusedEntries++; s.unusedBytes += item.bytes; }
  }
}
/** Evict only unused appearances; active walkers and cached station figures retain their exact geometry. */
export function trimWalkerGeometryCache(force = false) {
  const unused = [...cache].filter(([, item]) => !item.refs).sort((a, b) => a[1].used - b[1].used);
  let count = unused.length, bytes = unused.reduce((n, [, item]) => n + item.bytes, 0);
  for (const [key, item] of unused) {
    if (!force && count <= UNUSED_GEOMETRY_LIMIT && bytes <= UNUSED_GEOMETRY_BYTES) break;
    cache.delete(key); item.body.dispose(); item.leg?.dispose(); item.rigged?.dispose(); count--; bytes -= item.bytes; walkerGeometryCacheStats.disposed++;
  }
  refreshGeometryStats();
}
function geometryLease(item: WalkerGeometryEntry): WalkerGeometry & { release(): void } {
  item.refs++; item.used = ++geometryUse; refreshGeometryStats(); let released = false;
  return { body: item.body, leg: item.leg, rigged:item.rigged, release() {
    if (released) return; released = true; item.refs--; item.used = ++geometryUse; trimWalkerGeometryCache();
  } };
}
const geometryBytes = (geo: THREE.BufferGeometry | null) => geo ? (Object.values(geo.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (geo.index?.array.byteLength || 0)) * 2 : 0;
export function walkerGeometry(p: PersonSpec, articulated = false) {
  const key = JSON.stringify({ ...p, s: 1, walk: 0 });
  let g = cache.get(key);
  const addRig = (entry: WalkerGeometryEntry) => {
    if(articulated&&!entry.rigged){const rigged=new THREE.BufferGeometry();for(const[name,attribute]of Object.entries(entry.body.attributes))rigged.setAttribute(name,attribute);if(entry.body.index)rigged.setIndex(entry.body.index);rigged.setAttribute('skinIndex',entry.skinData.index);rigged.setAttribute('skinWeight',entry.skinData.weight);entry.rigged=skinWalkingGeometry(rigged,!legsVisible(p.kind));}
    return geometryLease(entry);
  };
  if (g) return addRig(g);
  const body = new HumanSkinBatch(); drawPerson(body, { ...p, s: 1 }, 0, 0, 0, false);
  let leg: THREE.BufferGeometry | null = null;
  const built = { body: body.geometry(), leg };
  const skinData=body.skinAttributes();
  g = { ...built,skinData, refs: 0, used: ++geometryUse, bytes: geometryBytes(built.body) + geometryBytes(leg)+(skinData.index.array.byteLength+skinData.weight.array.byteLength)*2 };
  cache.set(key, g);
  walkerGeometryCacheStats.created++;
  return addRig(g);
}
