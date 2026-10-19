/**
 * Delivery destination marker (ground outline + distant parcel guidance) and landing
 * footprint marker (state is carried by shape AND icon AND colour).
 */
import * as THREE from 'three';
import type { LandingMarker } from './api';
import { GeoBuilder, addHorizontalPolygon, makeSamples, strip } from './geo';

const DELIVERY_COLOR = 0x22c8ff;
const STATE_COLORS = { clear: 0x38e07a, uncertain: 0xffb81f, blocked: 0xff4a4a } as const;

function nowSec(): number {
  return performance.now() / 1000;
}

/** Fade elevated guidance before the chase camera reaches the stop; the exact ground edge remains. */
export function deliveryGuidanceFade(distanceM: number): number {
  const t = Math.max(0, Math.min(1, (distanceM - 18) / 24));
  return t * t * (3 - 2 * t);
}

const beamVert = /* glsl */ `
varying float vH;
void main() {
  vH = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uHeight;
uniform float uTime;
uniform float uAlpha;
varying float vH;
void main() {
  float t = clamp(vH / uHeight, 0.0, 1.0);
  float fade = pow(1.0 - t, 1.6);
  float pulse = 0.82 + 0.18 * sin(uTime * 2.6 - vH * 0.18);
  gl_FragColor = vec4(uColor, uAlpha * fade * pulse);
  #include <colorspace_fragment>
}
`;

function canvasIcon(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  draw(ctx, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function badge(ctx: CanvasRenderingContext2D, s: number, color: string): void {
  ctx.fillStyle = 'rgba(8,16,24,0.55)';
  ctx.beginPath(); ctx.arc(s / 2, s / 2 + 4, s * 0.47, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.45, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = s * 0.045;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export function createDeliveryMarker(polygon: [number, number][], elevation: number): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'delivery-marker';
  const color = new THREE.Color(DELIVERY_COLOR);
  const timeU = { value: 0 };

  // centroid
  let cx = 0, cz = 0;
  for (const p of polygon) { cx += p[0]; cz += p[1]; }
  cx /= Math.max(1, polygon.length); cz /= Math.max(1, polygon.length);

  // fill + outline
  const fillB = new GeoBuilder();
  const coreB = new GeoBuilder();
  const glowB = new GeoBuilder();
  const y = elevation + 0.055;
  if (polygon.length >= 3) {
    addHorizontalPolygon(fillB, polygon, undefined, y, () => [0, 0]);
    const closed = polygon.concat([polygon[0]]);
    const samples = makeSamples(closed, y);
    // miter factors can explode on closed loops; clamp the offsets by using thin strips
    strip(coreB, samples, -0.085, 0.085, 0.01, () => [0, 0]);
    strip(glowB, samples, -0.18, 0.18, 0.0, () => [0, 0]);
  }
  const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.035, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.09, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });
  for (const [b, m, n, ro] of [[fillB, fillMat, 'delivery-fill', 1], [glowB, glowMat, 'delivery-outline-glow', 2], [coreB, coreMat, 'delivery-outline', 3]] as const) {
    if (b.vcount === 0) continue;
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.name = n;
    mesh.renderOrder = ro;
    mesh.frustumCulled = true;
    root.add(mesh);
  }

  // A thin, non-additive locator at distance, never a bright volume around the parked car.
  const beamH = 12;
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    uniforms: { uColor: { value: color }, uHeight: { value: beamH }, uTime: timeU, uAlpha: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: false,
  });
  const beamGeo = new THREE.CylinderGeometry(0.075, 0.13, beamH, 10, 1, true);
  beamGeo.translate(0, beamH / 2, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(cx, elevation, cz);
  beam.renderOrder = 10;
  beam.name = 'delivery-beam';
  root.add(beam);

  // Compact parcel badge; opacity follows the same near-stop fade as the beacon.
  const iconTex = canvasIcon((ctx, s) => {
    badge(ctx, s, hexCss(DELIVERY_COLOR));
    // parcel glyph
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s * 0.28, s * 0.36, s * 0.44, s * 0.34);
    ctx.fillStyle = hexCss(DELIVERY_COLOR);
    ctx.fillRect(s * 0.47, s * 0.36, s * 0.06, s * 0.34);
    ctx.fillRect(s * 0.28, s * 0.5, s * 0.44, s * 0.05);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.36); ctx.lineTo(s * 0.4, s * 0.27); ctx.lineTo(s * 0.46, s * 0.25); ctx.lineTo(s * 0.5, s * 0.33); ctx.lineTo(s * 0.54, s * 0.25); ctx.lineTo(s * 0.6, s * 0.27); ctx.closePath(); ctx.fill();
  });
  const iconMat = new THREE.SpriteMaterial({ map: iconTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
  const icon = new THREE.Sprite(iconMat);
  icon.position.set(cx, elevation + 4.2, cz);
  icon.scale.set(1.35, 1.35, 1);
  icon.renderOrder = 20;
  icon.name = 'delivery-icon';
  root.add(icon);

  const cameraPosition = new THREE.Vector3();
  const updateGuidance = (camera: THREE.Camera): void => {
    camera.getWorldPosition(cameraPosition);
    const fade = deliveryGuidanceFade(Math.hypot(cameraPosition.x - cx, cameraPosition.z - cz));
    beamMat.uniforms.uAlpha.value = .18 * fade;
    iconMat.opacity = .78 * fade;
    timeU.value = nowSec();
  };
  beam.onBeforeRender = (_renderer, _scene, camera): void => updateGuidance(camera);
  icon.onBeforeRender = (_renderer, _scene, camera): void => updateGuidance(camera);

  root.userData.dispose = (): void => {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      // Sprite geometry is a Three.js shared quad, not owned by this marker.
      if (m.isMesh && m.geometry) geometries.add(m.geometry);
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => materials.add(x)); else if (mat) materials.add(mat);
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    iconTex.dispose();
  };
  return root;
}

export function createLandingMarker(): LandingMarker {
  const root = new THREE.Group();
  root.name = 'landing-marker';
  const R = 3.7;
  const r0 = 3.15;
  const mat = new THREE.MeshBasicMaterial({ color: STATE_COLORS.clear, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const fillMat = new THREE.MeshBasicMaterial({ color: STATE_COLORS.clear, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });

  const solidGeo = new THREE.RingGeometry(r0, R, 56);
  solidGeo.rotateX(-Math.PI / 2);
  const solid = new THREE.Mesh(solidGeo, mat);
  solid.position.y = 0.09;
  solid.renderOrder = 6;

  // dashed ring: 14 arcs
  const dashB = new GeoBuilder();
  const arcs = 14;
  const arcLen = (Math.PI * 2) / arcs;
  for (let i = 0; i < arcs; i++) {
    const a0 = i * arcLen, a1 = a0 + arcLen * 0.56;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const t0 = a0 + ((a1 - a0) * k) / n, t1 = a0 + ((a1 - a0) * (k + 1)) / n;
      const p = [
        Math.cos(t0) * r0, 0, Math.sin(t0) * r0,
        Math.cos(t0) * R, 0, Math.sin(t0) * R,
        Math.cos(t1) * R, 0, Math.sin(t1) * R,
        Math.cos(t1) * r0, 0, Math.sin(t1) * r0,
      ];
      dashB.quad(p, [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0]);
    }
  }
  const dashed = new THREE.Mesh(dashB.build(), mat);
  dashed.position.y = 0.09;
  dashed.renderOrder = 6;

  // X cross inside the ring
  const crossB = new GeoBuilder();
  const cw = 0.3, cl = r0 * 0.78;
  for (const s of [1, -1]) {
    const c = Math.SQRT1_2;
    // rotated rectangle along (1, s)/sqrt2
    const dx = c, dz = c * s;
    const nx = -dz, nz = dx;
    const p = [
      -dx * cl - nx * cw, 0, -dz * cl - nz * cw,
      dx * cl - nx * cw, 0, dz * cl - nz * cw,
      dx * cl + nx * cw, 0, dz * cl + nz * cw,
      -dx * cl + nx * cw, 0, -dz * cl + nz * cw,
    ];
    crossB.quad(p, [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0]);
  }
  const cross = new THREE.Mesh(crossB.build(), mat);
  cross.position.y = 0.09;
  cross.renderOrder = 6;

  const fillGeo = new THREE.CircleGeometry(r0, 40);
  fillGeo.rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(fillGeo, fillMat);
  fill.position.y = 0.07;
  fill.renderOrder = 5;

  // corner ticks (always on): car-sized bracket hints for alignment
  const tickB = new GeoBuilder();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 1.1, z = sz * 2.1;
    const L = 0.8, w = 0.12;
    tickB.quad([x, 0, z, x + -sx * L, 0, z, x + -sx * L, 0, z + sz * w, x, 0, z + sz * w], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0]);
    tickB.quad([x, 0, z, x, 0, z + -sz * L, x + sx * w, 0, z + -sz * L, x + sx * w, 0, z], [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 0]);
  }
  const ticks = new THREE.Mesh(tickB.build(), mat);
  ticks.position.y = 0.09;
  ticks.renderOrder = 6;
  ticks.visible = false;

  const makeIcon = (color: number, glyph: 'check' | 'q' | 'x'): THREE.CanvasTexture =>
    canvasIcon((ctx, s) => {
      badge(ctx, s, hexCss(color));
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.1;
      if (glyph === 'check') {
        ctx.beginPath(); ctx.moveTo(s * 0.27, s * 0.52); ctx.lineTo(s * 0.43, s * 0.68); ctx.lineTo(s * 0.74, s * 0.34); ctx.stroke();
      } else if (glyph === 'x') {
        ctx.beginPath(); ctx.moveTo(s * 0.32, s * 0.32); ctx.lineTo(s * 0.68, s * 0.68); ctx.moveTo(s * 0.68, s * 0.32); ctx.lineTo(s * 0.32, s * 0.68); ctx.stroke();
      } else {
        ctx.font = `800 ${s * 0.62}px "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', s / 2, s * 0.53);
      }
    });
  const icons = {
    clear: makeIcon(STATE_COLORS.clear, 'check'),
    uncertain: makeIcon(STATE_COLORS.uncertain, 'q'),
    blocked: makeIcon(STATE_COLORS.blocked, 'x'),
  };
  const iconMat = new THREE.SpriteMaterial({ map: icons.clear, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const icon = new THREE.Sprite(iconMat);
  icon.position.y = 3.4;
  icon.scale.set(2.6, 2.6, 1);
  icon.renderOrder = 30;

  root.add(fill, solid, dashed, cross, ticks, icon);
  root.onBeforeRender = (): void => undefined;
  const pulse = (): void => {
    const s = 1 + Math.sin(nowSec() * 4) * 0.025;
    solid.scale.set(s, 1, s);
    dashed.rotation.y = nowSec() * 0.35;
    icon.position.y = 3.4 + Math.sin(nowSec() * 2.4) * 0.12;
  };
  solid.onBeforeRender = pulse;
  dashed.onBeforeRender = pulse;

  const api: LandingMarker = {
    object: root,
    setState(state): void {
      root.visible = state !== 'hidden';
      if (state === 'hidden') return;
      const c = STATE_COLORS[state];
      mat.color.setHex(c);
      fillMat.color.setHex(c);
      iconMat.map = icons[state];
      iconMat.needsUpdate = true;
      solid.visible = state === 'clear' || state === 'blocked';
      dashed.visible = state === 'uncertain';
      cross.visible = state === 'blocked';
      ticks.visible = state === 'clear';
      fillMat.opacity = state === 'blocked' ? 0.22 : state === 'clear' ? 0.16 : 0.12;
    },
  };
  api.setState('hidden');
  return api;
}
