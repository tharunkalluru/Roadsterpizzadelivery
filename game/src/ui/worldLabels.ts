import { Vector3, type PerspectiveCamera } from 'three';
import type { ReadableSign } from '../art/api';
import type { WorldPhysics } from '../world/collision';
import type { Building, Vec2 } from '../world/schema';

export type { ReadableSign } from '../art/api';
type LabelWorld = Pick<WorldPhysics, 'buildingAt'>;

const LIMIT = 1;
const NEAR_LIMIT = 8;
const RANGE = 48;
const INTERVAL_MS = 100;
const PHONE_WIDTH = 180;
const DESKTOP_WIDTH = 220;
const LINE_HEIGHT = 16;
const MAX_LINES = 3;

interface LabelLayout { width: number; height: number; lines: number }

/** Match the small parked label's word wrapping once, when its source chunk arrives. */
export function measureLabelLayout(text: string, maxWidth: number, measure: (text: string) => number): LabelLayout | null {
  const width = Math.min(Math.ceil(measure(text)) + 20, maxWidth);
  const contentWidth = width - 20;
  let lines = 1, line = '';
  for (const word of text.split(' ')) {
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= contentWidth) { line = joined; continue; }
    if (line) { lines++; line = ''; }
    if (lines > MAX_LINES) return null;
    if (measure(word) <= contentWidth) { line = word; continue; }
    // CSS overflow-wrap:anywhere also handles an unusually long source token.
    for (const character of word) {
      if (line && measure(line + character) > contentWidth) { lines++; line = ''; }
      if (lines > MAX_LINES) return null;
      line += character;
    }
  }
  return { width, height: lines * LINE_HEIGHT + 12, lines };
}

export interface LabelInspectionContext {
  speedMps: number;
  airborne: boolean;
  inspecting: boolean;
}

/** A deliberate stopped glance, with a short reading window after the finger leaves. */
export class LabelInspectionGate {
  private startedAt = -Infinity;
  private lastHeldAt = -Infinity;
  private ready = false;

  reset() { this.startedAt = this.lastHeldAt = -Infinity; this.ready = false; }

  update(enabled: boolean, context: LabelInspectionContext, nowMs: number): boolean {
    if (!enabled || context.airborne || !Number.isFinite(context.speedMps) || Math.abs(context.speedMps) > .15) {
      this.reset();
      return false;
    }
    if (context.inspecting) {
      if (nowMs - this.lastHeldAt > 1500) { this.startedAt = nowMs; this.ready = false; }
      this.lastHeldAt = nowMs;
      if (nowMs - this.startedAt >= 350) this.ready = true;
    } else if (!this.ready || nowMs - this.lastHeldAt > 1500) {
      this.reset();
    }
    return this.ready;
  }
}

interface Candidate {
  source: ReadableSign;
  text: string;
  key: string;
  phoneLayout: LabelLayout | null;
  desktopLayout: LabelLayout | null;
  score: number;
  sx: number;
  sy: number;
  left: number;
  top: number;
  width: number;
  height: number;
  active: boolean;
}
interface BuildingBlocker { building: Building; minX: number; maxX: number; minZ: number; maxZ: number }
interface ChunkLabels { candidates: Candidate[]; blockers: BuildingBlocker[]; minX: number; maxX: number; minZ: number; maxZ: number }
interface Slot { node: HTMLDivElement; name: HTMLSpanElement; candidate: Candidate | null }
interface ReservedRect { left: number; top: number; width: number; height: number }

/** Fixed DOM pool for existing, rendered signs. It never creates a business or changes source data. */
export class WorldLabels {
  readonly stats = { candidates: 0, visible: 0, updates: 0, rayChecks: 0 };
  private readonly root: HTMLDivElement;
  private readonly slots: Slot[] = [];
  private readonly chunks = new Map<string, ChunkLabels>();
  private readonly near: Candidate[] = [];
  private readonly selected: Candidate[] = [];
  private readonly projected = new Vector3();
  private readonly measure: CanvasRenderingContext2D | null;
  private readonly inspection = new LabelInspectionGate();
  private lastUpdate = -Infinity;
  private visible = false;
  private width = 0;
  private height = 0;
  private buildingCount = 0;
  private readonly reserved: ReservedRect[] = [];
  private readonly observedControls = new Set<HTMLElement>();
  private readonly layoutObserver: ResizeObserver;
  private layoutDirty = true;

  constructor(host: HTMLElement) {
    this.layoutObserver = new ResizeObserver(() => { this.layoutDirty = true; });
    this.root = document.createElement('div');
    this.root.className = 'world-labels';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < LIMIT; i++) {
      const node = document.createElement('div'), name = document.createElement('span');
      node.className = 'world-label'; name.className = 'world-label__name';
      node.hidden = true; node.append(name); this.root.append(node);
      this.slots.push({ node, name, candidate: null });
    }
    host.append(this.root);
    this.measure = document.createElement('canvas').getContext('2d');
    if (this.measure) this.measure.font = '650 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  }

  attachChunk(id: string, signs: readonly ReadableSign[], buildings: readonly Building[] = []) {
    this.removeChunk(id);
    const chunk: ChunkLabels = { candidates: [], blockers: [], minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const measure = (text: string) => this.measure?.measureText(text).width ?? text.length * 7;
    for (const source of signs) {
      const text = source.text.trim().replace(/\s+/g, ' ');
      if (!text || !Number.isFinite(source.x + source.y + source.z + source.nx + source.nz)) continue;
      const phoneLayout = measureLabelLayout(text, PHONE_WIDTH, measure);
      const desktopLayout = measureLabelLayout(text, DESKTOP_WIDTH, measure);
      chunk.candidates.push({ source, text, key: `${id}:${source.id}`, phoneLayout, desktopLayout, score: 0, sx: 0, sy: 0, left: 0, top: 0, width: 0, height: 0, active: false });
      chunk.minX = Math.min(chunk.minX, source.x); chunk.maxX = Math.max(chunk.maxX, source.x);
      chunk.minZ = Math.min(chunk.minZ, source.z); chunk.maxZ = Math.max(chunk.maxZ, source.z);
    }
    for (const building of buildings) {
      if (building.intrudesCarriageway || building.footprint.length < 3) continue;
      const blocker: BuildingBlocker = { building, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (const point of building.footprint) {
        blocker.minX = Math.min(blocker.minX, point[0]); blocker.maxX = Math.max(blocker.maxX, point[0]);
        blocker.minZ = Math.min(blocker.minZ, point[1]); blocker.maxZ = Math.max(blocker.maxZ, point[1]);
      }
      chunk.blockers.push(blocker);
      chunk.minX = Math.min(chunk.minX, blocker.minX); chunk.maxX = Math.max(chunk.maxX, blocker.maxX);
      chunk.minZ = Math.min(chunk.minZ, blocker.minZ); chunk.maxZ = Math.max(chunk.maxZ, blocker.maxZ);
    }
    this.chunks.set(id, chunk);
    this.stats.candidates += chunk.candidates.length;
    this.buildingCount += chunk.blockers.length;
    this.lastUpdate = -Infinity;
  }

  removeChunk(id: string) {
    const chunk = this.chunks.get(id);
    if (!chunk) return;
    this.stats.candidates -= chunk.candidates.length;
    this.buildingCount -= chunk.blockers.length;
    for (const slot of this.slots) if (slot.candidate?.key.startsWith(`${id}:`)) {
      slot.candidate = null; slot.node.hidden = true;
    }
    this.near.length = 0; this.selected.length = 0;
    this.stats.visible = this.visible ? this.slots.reduce((count, slot) => count + Number(!slot.node.hidden), 0) : 0;
    this.chunks.delete(id);
    this.lastUpdate = -Infinity;
  }

  setVisible(visible: boolean) {
    if (!visible) this.inspection.reset();
    this.applyVisibility(visible);
  }

  private applyVisibility(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible; this.root.hidden = !visible;
    if (visible) { this.lastUpdate = -Infinity; this.layoutDirty = true; }
    else {
      this.stats.visible = 0;
      for (const slot of this.slots) {
        if (slot.candidate) slot.candidate.active = false;
        slot.candidate = null; slot.node.hidden = true;
      }
    }
  }

  update(camera: PerspectiveCamera, world: LabelWorld, enabled: boolean, context: LabelInspectionContext, nowMs = performance.now()) {
    const visible = this.inspection.update(enabled, context, nowMs);
    this.applyVisibility(visible);
    if (!visible) return;
    const width = window.innerWidth, height = window.innerHeight;
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; this.lastUpdate = -Infinity; this.layoutDirty = true; }
    if (nowMs - this.lastUpdate < INTERVAL_MS) return;
    this.lastUpdate = nowMs; this.stats.updates++; this.stats.rayChecks = 0;
    if (this.layoutDirty) this.reserveControls();
    this.near.length = 0; this.selected.length = 0;
    const phone = width <= 900;
    const minY = phone ? 104 : 112, maxY = height - (phone ? 92 : 132);
    camera.updateMatrixWorld();
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (const chunk of this.chunks.values()) {
      if (cx + RANGE < chunk.minX || cx - RANGE > chunk.maxX || cz + RANGE < chunk.minZ || cz - RANGE > chunk.maxZ) continue;
      for (const candidate of chunk.candidates) {
        const sign = candidate.source, dx = cx - sign.x, dz = cz - sign.z, dy = cy - sign.y;
        const distance2 = dx * dx + dy * dy + dz * dz;
        if (distance2 > RANGE * RANGE || distance2 < 9 || dx * sign.nx + dz * sign.nz <= .6) continue;
        this.projected.set(sign.x, sign.y, sign.z).project(camera);
        const p = this.projected;
        if (p.z < -1 || p.z > 1 || Math.abs(p.x) > .97 || Math.abs(p.y) > .94) continue;
        candidate.sx = (p.x + 1) * width * .5; candidate.sy = (1 - p.y) * height * .5;
        const layout = phone ? candidate.phoneLayout : candidate.desktopLayout;
        if (!layout) continue;
        candidate.width = layout.width;
        candidate.height = layout.height;
        candidate.left = Math.max(10, Math.min(width - candidate.width - 10, candidate.sx - candidate.width / 2));
        candidate.top = candidate.sy - candidate.height - 12;
        if (candidate.top < minY) candidate.top = candidate.sy + 12;
        if (candidate.top < minY || candidate.top + candidate.height > maxY) continue;
        if (this.reserved.some(rect => overlaps(candidate, rect))) continue;
        // A glance belongs at the roadside. The entire forward driving corridor stays clear.
        if (candidate.left < width * .66 && candidate.left + candidate.width > width * .34) continue;
        // Keep already visible names stable when two nearby signs have similar distance.
        candidate.score = distance2 * (candidate.active ? .72 : 1);
        let at = this.near.length;
        while (at > 0 && this.near[at - 1].score > candidate.score) at--;
        if (at >= NEAR_LIMIT) continue;
        if (this.near.length < NEAR_LIMIT) this.near.push(candidate);
        for (let j = this.near.length - 1; j > at; j--) this.near[j] = this.near[j - 1];
        this.near[at] = candidate;
      }
    }
    for (const candidate of this.near) {
      if (this.selected.length >= LIMIT || this.stats.rayChecks >= 8) break;
      this.stats.rayChecks++;
      if (this.occluded(candidate.source, camera.position, world)) continue;
      this.selected.push(candidate);
    }
    for (const slot of this.slots) if (slot.candidate) slot.candidate.active = false;
    for (const candidate of this.selected) candidate.active = true;
    // Retain the same DOM node for a continuing sign; assign unused nodes only on selection changes.
    for (const slot of this.slots) if (slot.candidate && !slot.candidate.active) { slot.candidate = null; slot.node.hidden = true; }
    for (const candidate of this.selected) {
      let slot = this.slots.find(item => item.candidate === candidate);
      if (!slot) {
        slot = this.slots.find(item => !item.candidate)!;
        slot.candidate = candidate; slot.name.textContent = candidate.text;
        // Evidence status is disclosed by the persistent preview badge, entry gate and atlas.
        // Keep the source status available without repeating it over the roadway.
        slot.node.dataset.provisional = String(candidate.source.provisional);
        slot.node.dataset.signId = candidate.source.id;
      }
      slot.node.style.width = `${candidate.width}px`;
      slot.node.style.height = `${candidate.height}px`;
      slot.node.style.transform = `translate(${Math.round(candidate.left)}px, ${Math.round(candidate.top)}px)`;
      slot.node.hidden = false;
    }
    this.stats.visible = this.selected.length;
  }

  dispose() {
    this.chunks.clear(); this.near.length = 0; this.selected.length = 0;
    for (const slot of this.slots) slot.candidate = null;
    this.reserved.length = 0;
    this.layoutObserver.disconnect(); this.observedControls.clear();
    this.buildingCount = 0;
    this.stats.candidates = 0; this.stats.visible = 0; this.root.remove();
  }

  private reserveControls() {
    this.layoutDirty = false; this.reserved.length = 0;
    // Read layout only after resize/resume or an observed HUD size change, such as collecting cargo.
    for (const selector of ['.hud-top', '[data-steer]', '.rbtns', '.flightmeter', '[data-interact]', '.hold', '.pilot-zone-label']) {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) continue;
      if (!this.observedControls.has(node)) { this.observedControls.add(node); this.layoutObserver.observe(node); }
      const rect = node.getBoundingClientRect();
      if (rect.width && rect.height) this.reserved.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
  }

  private occluded(sign: ReadableSign, camera: { x: number; y: number; z: number }, world: LabelWorld) {
    if (!this.buildingCount) return labelOccluded(sign, camera, world);
    const minX = Math.min(sign.x, camera.x), maxX = Math.max(sign.x, camera.x);
    const minZ = Math.min(sign.z, camera.z), maxZ = Math.max(sign.z, camera.z);
    for (const chunk of this.chunks.values()) {
      if (chunk.minX > maxX || chunk.maxX < minX || chunk.minZ > maxZ || chunk.maxZ < minZ) continue;
      for (const blocker of chunk.blockers) {
        if (blocker.minX > maxX || blocker.maxX < minX || blocker.minZ > maxZ || blocker.maxZ < minZ) continue;
        if (labelOccludedByBuilding(sign, camera, blocker.building)) return true;
      }
    }
    return false;
  }
}

function overlaps(a: ReservedRect, b: ReservedRect) {
  return a.left < b.left + b.width + 8 && a.left + a.width + 8 > b.left && a.top < b.top + b.height + 8 && a.top + a.height + 8 > b.top;
}

/** Eight bounded spatial-grid samples hide names behind other building bodies.
 * Ignore the target building only at the final sample: a far-side board must not label through its own body.
 * This conservative helper is not a geometry/access or verification claim. */
export function labelOccluded(sign: ReadableSign, camera: { x: number; y: number; z: number }, world: LabelWorld): boolean {
  for (let sample = 1; sample <= 8; sample++) {
    const t = sample / 9;
    const hit = world.buildingAt(camera.x + (sign.x - camera.x) * t, camera.z + (sign.z - camera.z) * t);
    if (hit && hit.top > camera.y + (sign.y - camera.y) * t + .25 && !(sample === 8 && hit.id === sign.buildingId)) return true;
  }
  return false;
}

/** Exact segment/footprint intersection for loaded buildings, including thin occluders and courtyards.
 * Height follows the rendered source body. Door/access cutouts are conservatively treated as solid.
 * The target building is not exempt: far-side labels must never be visible through its body. */
export function labelOccludedByBuilding(sign: ReadableSign, camera: { x: number; y: number; z: number }, building: Building): boolean {
  const dx = sign.x - camera.x, dy = sign.y - camera.y, dz = sign.z - camera.z;
  const base = building.baseHeightM ?? 0, top = building.heightM;
  let start = .00001, end = .99999;
  if (Math.abs(dy) < 1e-8) { if (camera.y <= base || camera.y >= top) return false; }
  else {
    const a = (base - camera.y) / dy, b = (top - camera.y) / dy;
    start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
    if (end <= start) return false;
  }
  if (insideBuilding(camera.x + dx * (start + 1e-7), camera.z + dz * (start + 1e-7), building)) return true;
  const holes = building.holes;
  for (let r = 0; r <= (holes?.length ?? 0); r++) {
    const ring = r ? holes![r - 1] : building.footprint;
    for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
      const a = ring[previous], b = ring[i], ex = b[0] - a[0], ez = b[1] - a[1];
      const denominator = dx * ez - dz * ex;
      if (Math.abs(denominator) < 1e-8) continue;
      const ax = a[0] - camera.x, az = a[1] - camera.z;
      const t = (ax * ez - az * ex) / denominator, u = (ax * dz - az * dx) / denominator;
      if (t < start || t >= end || u < 0 || u > 1) continue;
      const beyond = Math.min(end, t + 1e-7);
      if (insideBuilding(camera.x + dx * beyond, camera.z + dz * beyond, building)) return true;
    }
  }
  return false;
}

function insideBuilding(x: number, z: number, building: Building) {
  if (!insideRing(x, z, building.footprint)) return false;
  if (building.holes) for (const hole of building.holes) if (insideRing(x, z, hole)) return false;
  return true;
}

function insideRing(x: number, z: number, ring: Vec2[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
