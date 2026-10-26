import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { asphaltTexture, tileTexture, radialTexture, facadeTextures, shopfrontTextures, kerbTexture } from './util';
import { makeSky, Mood, sunDirection } from './sky';

export class Engine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  sky = makeSky(); hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1); sun = new THREE.DirectionalLight('#ffffff', 2);
  composer: EffectComposer | null = null; bloom: UnrealBloomPass | null = null;
  mats: Record<string, any> = {};
  lampLights: THREE.PointLight[] = [];
  pmrem: THREE.PMREMGenerator; envRT: THREE.WebGLRenderTarget | null = null; envKey = '';
  mood!: Mood;
  constructor(public container: HTMLElement, public opts: { lowQ: boolean; still?: { w: number; h: number } }) {
    const still = opts.still;
    this.renderer = new THREE.WebGLRenderer({ antialias: !still, preserveDrawingBuffer: !!still, powerPreference: 'high-performance' });
    const W = still ? still.w : container.clientWidth, H = still ? still.h : container.clientHeight;
    this.renderer.setPixelRatio(still ? 1 : Math.min(window.devicePixelRatio || 1, opts.lowQ ? 1.25 : 1.75));
    this.renderer.setSize(W, H);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(60, W / H, 0.3, 2500);
    this.scene.add(this.sky, this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.FogExp2('#ffffff', 0.003);
    const SM = still ? 4096 : opts.lowQ ? 1024 : 2048;
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(SM, SM);
    const sc = this.sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    for (let i = 0; i < (opts.lowQ ? 3 : 6); i++) { const p = new THREE.PointLight('#ffcf8a', 0, 26, 1.6); this.scene.add(p); this.lampLights.push(p); }
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    const fac = facadeTextures(), shop = shopfrontTextures();
    const DS = THREE.DoubleSide;
    this.mats = {
      ground: new THREE.MeshStandardMaterial({ color: '#8d8375', roughness: 0.95 }),
      park: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: DS }),
      water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.3, side: DS }),
      road: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.85, side: DS, polygonOffset: true, polygonOffsetFactor: -1 }),
      marks: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      foot: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.9 }),
      st: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: DS }),
      kerb: new THREE.MeshStandardMaterial({ vertexColors: true, map: kerbTexture(), roughness: 0.8, side: DS }),
      wall: new THREE.MeshStandardMaterial({ vertexColors: true, map: fac.map, emissiveMap: fac.emissive, emissive: new THREE.Color('#ffffff'), roughness: 0.85 }),
      shop: new THREE.MeshStandardMaterial({ vertexColors: true, map: shop.map, emissiveMap: shop.emissive, emissive: new THREE.Color('#ffffff'), roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DS }),
      lit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glow: new THREE.MeshBasicMaterial({ map: radialTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.5 }),
      vBody: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.18 }),
      vLight: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      teal: new THREE.MeshBasicMaterial({ color: new THREE.Color('#45E3D3').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }),
      gold: new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFB627').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }),
      radial: radialTexture(),
    };
    if (!opts.lowQ) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(W, H);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.45, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    if (!still) addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }
  applyMood(m: Mood, extra: { signs?: (v: number) => void } = {}) {
    this.mood = m;
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.top.value.set(m.skyTop); u.hor.value.set(m.skyHor); u.bot.value.set(m.skyBot);
    const sd = sunDirection(m);
    u.sunDir.value.copy(sd); u.sunCol.value.set(m.sunCol); u.sunAmt.value = m.sunElev > 0 && m.lampLights < 4 ? 1 : 0.25;
    this.hemi.color.set(m.skyTop).lerp(new THREE.Color(m.hemiSky), 0.7); this.hemi.groundColor.set(m.hemiGround); this.hemi.intensity = m.hemiInt;
    this.sun.color.set(m.sunCol); this.sun.intensity = m.sunInt;
    (this.scene.fog as THREE.FogExp2).color.set(m.fog); (this.scene.fog as THREE.FogExp2).density = m.fogD;
    this.renderer.toneMappingExposure = m.exposure;
    this.mats.lit.color.setScalar(m.lit);
    this.mats.wall.emissiveIntensity = m.windows; this.mats.shop.emissiveIntensity = m.windows * 1.15;
    this.mats.glow.opacity = m.glow;
    this.mats.vLight.color.setScalar(m.lampLights > 2 ? 2.4 : 1.1);
    extra.signs?.(m.signs);
    this.lampLights.forEach((p, i) => (p.intensity = i < Math.round(m.lampLights) ? 22 : 0));
    if (this.bloom) this.bloom.strength = m.bloom;
    // refresh the image-based light only when the sky changed noticeably
    const k = m.skyTop + m.skyHor;
    if (k !== this.envKey) {
      this.envKey = k;
      const env = new THREE.Scene(); const s2 = makeSky();
      (s2.material as THREE.ShaderMaterial).uniforms = THREE.UniformsUtils.clone(u); s2.scale.setScalar(0.03); env.add(s2);
      const rt = this.pmrem.fromScene(env, 0.02);
      this.envRT?.dispose(); this.envRT = rt;
      this.scene.environment = rt.texture;
    }
    (this.scene as any).environmentIntensity = m.env;
  }
  placeSun(target: THREE.Vector3) {
    const d = sunDirection(this.mood);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(d, 220);
    this.sun.target.updateMatrixWorld();
  }
  render() {
    // count every pass of the frame together (the stats overlay reads these after the frame)
    this.renderer.info.autoReset = false; this.renderer.info.reset();
    this.sky.position.copy(this.camera.position);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
}
