import * as THREE from 'three';

export interface Mood {
  skyTop: string; skyHor: string; skyBot: string; sunCol: string; sunInt: number; sunElev: number; sunAz: number;
  hemiSky: string; hemiGround: string; hemiInt: number; fog: string; fogD: number; exposure: number;
  lit: number; signs: number; glow: number; windows: number; bloom: number; env: number; lampLights: number;
}
// Key moods; the clock blends between them.
export const MOODS: Record<string, Mood> = {
  night: { skyTop: '#070a1e', skyHor: '#3a2f5e', skyBot: '#141226', sunCol: '#9fb2ff', sunInt: 0.7, sunElev: 40, sunAz: 30, hemiSky: '#6a6fb0', hemiGround: '#7a5440', hemiInt: 1.35, fog: '#2c2442', fogD: 0.0034, exposure: 1.45, lit: 1.6, signs: 1.1, glow: 0.7, windows: 0.95, bloom: 0.55, env: 0.7, lampLights: 6 },
  dawn: { skyTop: '#3b4f8f', skyHor: '#f4b48a', skyBot: '#6a5a6e', sunCol: '#ffc9a0', sunInt: 1.6, sunElev: 8, sunAz: 100, hemiSky: '#c7b3d6', hemiGround: '#5a4a48', hemiInt: 0.9, fog: '#d7a991', fogD: 0.0027, exposure: 1.0, lit: 0.8, signs: 0.35, glow: 0.12, windows: 0.4, bloom: 0.35, env: 0.8, lampLights: 0 },
  day: { skyTop: '#3d8fe0', skyHor: '#e9f1f4', skyBot: '#cfd6d9', sunCol: '#fff1dc', sunInt: 3.0, sunElev: 62, sunAz: 150, hemiSky: '#e3ecf6', hemiGround: '#9a8a76', hemiInt: 1.05, fog: '#d3dfe9', fogD: 0.0017, exposure: 0.86, lit: 0.45, signs: 0.0, glow: 0.0, windows: 0.0, bloom: 0.12, env: 1.0, lampLights: 0 },
  dusk: { skyTop: '#2a1d52', skyHor: '#f08a5d', skyBot: '#3a2a3e', sunCol: '#ffb070', sunInt: 2.4, sunElev: 9, sunAz: 265, hemiSky: '#c89ac0', hemiGround: '#4a3640', hemiInt: 1.15, fog: '#c98472', fogD: 0.0026, exposure: 1.1, lit: 1.0, signs: 0.75, glow: 0.3, windows: 0.6, bloom: 0.5, env: 0.85, lampLights: 3 },
};
// hour -> blend of moods
const KEYS: [number, string][] = [[0, 'night'], [5, 'night'], [6.3, 'dawn'], [8.5, 'day'], [16.8, 'day'], [18.4, 'dusk'], [19.6, 'night'], [24, 'night']];
export function moodAt(hour: number): Mood {
  let i = 0; while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1];
  const t = h1 > h0 ? Math.min(1, Math.max(0, (hour - h0) / (h1 - h0))) : 0;
  return lerpMood(MOODS[a], MOODS[b], t);
}
const c1 = new THREE.Color(), c2 = new THREE.Color();
export function lerpMood(a: Mood, b: Mood, t: number): Mood {
  const out: any = {};
  for (const k of Object.keys(a)) {
    const va: any = (a as any)[k], vb: any = (b as any)[k];
    if (typeof va === 'number') out[k] = va + (vb - va) * t;
    else out[k] = '#' + c1.set(va).lerp(c2.set(vb), t).getHexString();
  }
  return out;
}

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.2, -1) }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 1 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h*3.0,0.0,1.0),0.7));
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunCol * (pow(d, 900.0) * 6.0 + pow(d, 14.0) * 0.45 + pow(d, 3.0)*0.12) * sunAmt;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -1;
  return m;
}
export function sunDirection(m: Mood) {
  const el = THREE.MathUtils.degToRad(m.sunElev), az = THREE.MathUtils.degToRad(m.sunAz);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}
