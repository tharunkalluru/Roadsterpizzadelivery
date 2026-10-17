/**
 * Warm dry-daytime environment: gradient sky dome with sun glow and soft clouds,
 * matching haze fog, sun + hemisphere lighting, PMREM image-based lighting captured
 * from the same sky, a shadow camera that follows the target (texel-snapped), a dusty
 * ground plane, and a blob shadow fallback for the low preset.
 */
import * as THREE from 'three';
import type { Quality } from './api';
import { getSoftSprite } from './textures';
import { getWorldMats } from './mats';
import { applyCull } from './cull';

export const SUN_DIR = new THREE.Vector3(0.42, 0.74, 0.52).normalize();
export const HAZE = 0xd9d3c4;

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  mat4 v = viewMatrix;
  v[3] = vec4(0.0, 0.0, 0.0, 1.0);
  vec4 p = projectionMatrix * v * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
uniform vec3 uHaze;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uGround;
uniform float uGroundMix;
uniform float uClouds;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float up = max(e, 0.0);
  vec3 col = mix(uHaze, uMid, smoothstep(0.0, 0.22, up));
  col = mix(col, uZenith, smoothstep(0.12, 0.85, up));
  // below the horizon: haze to ground
  col = mix(col, mix(uHaze, uGround, uGroundMix), smoothstep(0.0, 0.12, -e));
  float sd = max(dot(d, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.88, 0.68) * (pow(sd, 6.0) * 0.12 + pow(sd, 64.0) * 0.28 + pow(sd, 900.0) * 14.0);
  // horizon glow toward the sun
  col += vec3(1.0, 0.85, 0.6) * pow(sd, 3.0) * 0.07 * (1.0 - smoothstep(0.0, 0.5, up));
  if (uClouds > 0.5 && e > 0.015) {
    vec2 cp = d.xz / (e + 0.22) * 1.35 + vec2(3.7, 1.3);
    float n = fbm(cp);
    float c = smoothstep(0.52, 0.80, n);
    c *= smoothstep(0.015, 0.2, e);
    float lit = 0.82 + 0.35 * pow(sd, 3.0);
    vec3 cc = mix(vec3(0.82, 0.84, 0.88), vec3(1.0, 0.98, 0.94), smoothstep(0.55, 0.9, n)) * lit;
    col = mix(col, cc, c * 0.78);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeSkyMaterial(clouds: boolean, groundMix: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'sky',
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uHaze: { value: new THREE.Color(HAZE) },
      uZenith: { value: new THREE.Color(0x2f73c4) },
      uMid: { value: new THREE.Color(0x7fb0e0) },
      uGround: { value: new THREE.Color(0x938f86) },
      uGroundMix: { value: groundMix },
      uClouds: { value: clouds ? 1 : 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
}

export interface EnvHandle {
  update(target: THREE.Vector3): void;
  dispose(): void;
}

export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer, quality: Quality): EnvHandle {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shadows = quality !== 'low';
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const created: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(o: T): T => { created.push(o); return o; };

  // ---- sky dome (rendered at far depth, never clipped by the camera far plane)
  const skyMat = own(makeSkyMaterial(quality !== 'low', 0));
  const skyGeo = own(new THREE.SphereGeometry(1, 32, 16));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky-dome';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  // ---- image based lighting captured from the same sky
  const prevBackground = scene.background;
  const prevEnv = scene.environment;
  const prevFog = scene.fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMat = own(makeSkyMaterial(false, 0.85));
  const envDome = new THREE.Mesh(skyGeo, envMat);
  envDome.frustumCulled = false;
  envScene.add(envDome);
  const envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = quality === 'low' ? 0.75 : 0.95;
  created.push({ dispose: () => envRT.dispose() });

  // ---- fog
  const fogColor = new THREE.Color(HAZE);
  const fogNear = quality === 'low' ? 90 : quality === 'standard' ? 140 : 180;
  const fogFar = quality === 'low' ? 650 : quality === 'standard' ? 1100 : 1700;
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
  scene.background = fogColor.clone();

  // ---- lights
  const sun = new THREE.DirectionalLight(0xffefd2, 3.1);
  sun.name = 'sun';
  const hemi = new THREE.HemisphereLight(0xd4dfec, 0xa59f94, quality === 'low' ? 1.5 : 1.25);
  hemi.name = 'hemisphere';
  scene.add(sun, sun.target, hemi);

  const shadowRadius = quality === 'high' ? 85 : 65;
  const shadowSize = quality === 'high' ? 2048 : 1024;
  const texel = (shadowRadius * 2) / shadowSize;
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const cam = sun.shadow.camera;
    cam.left = -shadowRadius; cam.right = shadowRadius; cam.top = shadowRadius; cam.bottom = -shadowRadius;
    cam.near = 20; cam.far = 420;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.35;
  }

  // light-space basis for texel snapping
  const lightDir = SUN_DIR.clone();
  const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lightDir).normalize();
  const ly = new THREE.Vector3().crossVectors(lightDir, lx).normalize();
  const snapped = new THREE.Vector3();

  // ---- ground
  const mats = getWorldMats(quality);
  const groundSize = 5120;
  const tile = 64;
  mats.ground.map!.repeat.set(groundSize / tile, groundSize / tile);
  const groundGeo = own(new THREE.PlaneGeometry(groundSize, groundSize, 1, 1));
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, mats.ground);
  ground.name = 'ground';
  ground.position.y = -0.14;
  ground.receiveShadow = shadows;
  ground.frustumCulled = false;
  scene.add(ground);

  // ---- blob shadow (low preset only; real shadows are disabled there)
  let blob: THREE.Mesh | null = null;
  let blobMat: THREE.MeshBasicMaterial | null = null;
  if (!shadows) {
    blobMat = own(new THREE.MeshBasicMaterial({ map: getSoftSprite('blob'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, fog: false }));
    const g = own(new THREE.PlaneGeometry(6.4, 7.6));
    g.rotateX(-Math.PI / 2);
    blob = new THREE.Mesh(g, blobMat);
    blob.name = 'blob-shadow';
    blob.renderOrder = 5;
    blob.frustumCulled = false;
    scene.add(blob);
  }

  return {
    update(target: THREE.Vector3): void {
      applyCull(target.x, target.z, fogFar);
      // sun follows target; snap in light space to prevent shadow shimmer
      const a = Math.round(target.dot(lx) / texel) * texel;
      const b = Math.round(target.dot(ly) / texel) * texel;
      const c = target.dot(lightDir);
      snapped.copy(lx).multiplyScalar(a).addScaledVector(ly, b).addScaledVector(lightDir, c);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 220);
      sun.target.updateMatrixWorld();
      ground.position.x = Math.round(target.x / tile) * tile;
      ground.position.z = Math.round(target.z / tile) * tile;
      if (blob && blobMat) {
        blob.position.set(target.x, 0.06, target.z);
        blobMat.opacity = Math.max(0, 0.9 - target.y / 28);
        blob.visible = blobMat.opacity > 0.02;
      }
    },
    dispose(): void {
      scene.remove(sky, sun, sun.target, hemi, ground);
      if (blob) scene.remove(blob);
      sun.shadow.map?.dispose();
      sun.dispose();
      hemi.dispose();
      for (const o of created) o.dispose();
      scene.environment = prevEnv;
      scene.background = prevBackground;
      scene.fog = prevFog;
    },
  };
}
