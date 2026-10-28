import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { asphaltTexture, tileTexture, radialTexture, facadeTextures, shopfrontTextures, kerbTexture } from './util';
import { makeSky, Mood, sunDirection } from './sky';
import { SceneResolutionController } from './performance-monitor';
import { showLoading, hideLoading } from '../ui/loading';

export class Engine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  sky = makeSky(); hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1); sun = new THREE.DirectionalLight('#ffffff', 2);
  composer: EffectComposer | null = null; bloom: UnrealBloomPass | null = null;
  mats: Record<string, any> = {};
  lampLights: THREE.PointLight[] = [];
  pmrem: THREE.PMREMGenerator; envRT: THREE.WebGLRenderTarget | null = null; envKey = '';
  mood!: Mood;
  sceneScale = new SceneResolutionController();
  targetFPS = 60; adaptiveResolution = false; gpuMs: number | null = null;
  private envScene = new THREE.Scene(); private envSky = makeSky(); private envUpdated = -Infinity;
  private gpuExtension: any = null; private gpuQuery: WebGLQuery | null = null; private gpuFrames = 0;
  private renderSize = new THREE.Vector2(); private contextLost = false;
  private restoring = false; private recoveryOwnsLoading = false;
  private stopResize: (() => void) | undefined;
  private lastRenderAt = 0;
  private uploadScene = new THREE.Scene();
  private uploadCamera = new THREE.OrthographicCamera(-1,1,1,-1,.01,2);
  private uploadGeometry = new THREE.BufferGeometry();
  private uploadMaterial = new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,depthTest:false,toneMapped:false});
  private uploadMesh = new THREE.Mesh(this.uploadGeometry,this.uploadMaterial);
  private uploadTarget = new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false});
  private uploaded = new WeakSet<THREE.BufferGeometry>();
  readonly uploadStats = {count:0,totalMs:0,maxMs:0};
  get graphicsReady() { return !this.contextLost && !this.restoring; }
  get canPresent() { return this.graphicsReady && (typeof document==='undefined' || (!document.hidden && !document.documentElement.classList.contains('ui-blocks-world') && !document.documentElement.classList.contains('game-loading'))); }
  constructor(public container: HTMLElement, public opts: { lowQ: boolean; still?: { w: number; h: number } }) {
    const still = opts.still;
    this.renderer = new THREE.WebGLRenderer({ antialias: !still, preserveDrawingBuffer: !!still, powerPreference: 'high-performance' });
    const W = still ? still.w : container.clientWidth, H = still ? still.h : container.clientHeight;
    this.renderer.setPixelRatio(still ? 1 : Math.min(window.devicePixelRatio || 1, opts.lowQ ? 1.25 : 1.75));
    this.renderer.setSize(W, H);
    this.gpuExtension = this.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
    this.envSky.scale.setScalar(.03); this.envScene.add(this.envSky);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.contextLost = true; this.resetAdaptiveAfterContextChange(false);
      this.recoveryOwnsLoading=!document.documentElement.classList.contains('game-loading');
      if(this.recoveryOwnsLoading)showLoading('Restoring graphics…','view');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.uploaded = new WeakSet();
      this.contextLost = false; this.restoring=true; this.resetAdaptiveAfterContextChange(true); this.gpuExtension=this.renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
      this.envKey = ''; this.envUpdated = -Infinity; if (this.mood) this.applyMood(this.mood);
      void this.prepareFrame().then(()=>{this.restoring=false;if(this.recoveryOwnsLoading)hideLoading();this.recoveryOwnsLoading=false;}).catch(()=>{this.restoring=true;showLoading('Graphics recovery failed. Reload to try again.','view');});
    });
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
    if (!still) {
      let resizeFrame = 0;
      const resize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => this.resize()); };
      addEventListener('resize', resize);
      addEventListener('pageshow', resize);
      window.visualViewport?.addEventListener('resize', resize);
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      observer?.observe(container);
      this.stopResize = () => { cancelAnimationFrame(resizeFrame); removeEventListener('resize',resize);removeEventListener('pageshow',resize);window.visualViewport?.removeEventListener('resize',resize);observer?.disconnect(); };
    }
  }
  // Only used for invalidated GPU state on loss/restoration; no valid query is
  // deleted here. Preserve the last visible scale while the context is lost.
  private resetAdaptiveAfterContextChange(restored: boolean) {
    this.gpuQuery = null; this.gpuMs = null; this.gpuFrames = 0; this.lastRenderAt = 0;
    const ready = restored && !this.contextLost;
    this.sceneScale.reset(ready);
    // Read the current DOM size even if the scale was already 1: resize events
    // skipped during loss may have changed the viewport. Still fixtures retain
    // their explicit fixed dimensions. prepareFrame runs after this reset.
    if (ready && !this.opts.still) this.resize();
  }
  resize() {
    if (this.contextLost) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, this.opts.lowQ ? 1.25 : 1.75) * this.sceneScale.scale;
    if (this.renderer.getPixelRatio() !== ratio) { this.renderer.setPixelRatio(ratio); this.composer?.setPixelRatio(ratio); }
    const size = this.renderer.getSize(this.renderSize);
    if (size.x === w && size.y === h) return;
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
    const colors = [new THREE.Color(m.skyTop), new THREE.Color(m.skyHor)];
    const k = colors.map(c => [c.r,c.g,c.b].map(v=>Math.round(v*24)).join(',')).join(':');
    const now = performance.now();
    if (!this.envRT || k !== this.envKey && now - this.envUpdated >= 5000) {
      this.envKey = k;
      this.envUpdated = now;
      const target = (this.envSky.material as THREE.ShaderMaterial).uniforms;
      for (const name of Object.keys(u)) { const v=u[name].value; if (target[name].value?.copy) target[name].value.copy(v); else target[name].value=v; }
      const rt = this.pmrem.fromScene(this.envScene, 0.02);
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
  async prepareFrame() {
    if (!this.opts.still) this.resize();
    // Upload the first scene while the opaque loader still covers it.
    await this.renderer.compileAsync(this.scene, this.camera);
    this.render(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    this.render(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  /** Upload one bounded base geometry behind the current view, using public APIs. */
  prepareMesh(source: THREE.Mesh) {
    if (this.contextLost || this.uploaded.has(source.geometry)) return;
    const start=performance.now(), target=this.renderer.getRenderTarget();
    // A regular Mesh deliberately ignores an InstancedMesh's count=0 LOD state.
    // Small per-instance attributes still upload on first actual instance use.
    this.uploadMesh.geometry=source.geometry;this.uploadMesh.frustumCulled=false;
    this.uploadScene.add(this.uploadMesh);
    try {
      this.renderer.setRenderTarget(this.uploadTarget);
      this.renderer.render(this.uploadScene,this.uploadCamera);
      this.uploaded.add(source.geometry);
    } finally {
      this.renderer.setRenderTarget(target);this.uploadScene.remove(this.uploadMesh);this.uploadMesh.geometry=this.uploadGeometry;
      const elapsed=performance.now()-start;this.uploadStats.count++;this.uploadStats.totalMs+=elapsed;this.uploadStats.maxMs=Math.max(this.uploadStats.maxMs,elapsed);
    }
  }
  render(force = false) {
    if (this.contextLost) return false;
    // count every pass of the frame together (the stats overlay reads these after the frame)
    this.renderer.info.autoReset = false; this.renderer.info.reset();
    if (!force && !this.canPresent) return false;
    this.sky.position.copy(this.camera.position);
    const gl = this.renderer.getContext() as WebGL2RenderingContext, ext = this.gpuExtension;
    if (ext && this.gpuQuery && gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT_AVAILABLE)) {
      this.gpuMs = !gl.getParameter(ext.GPU_DISJOINT_EXT) ? gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT) / 1e6 : null;
      gl.deleteQuery(this.gpuQuery); this.gpuQuery = null;
    }
    const measure = ext && !this.gpuQuery && (++this.gpuFrames % 20 === 0);
    if (measure) { this.gpuQuery = gl.createQuery(); if (this.gpuQuery) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.gpuQuery); }
    try { if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera); }
    finally { if (measure && this.gpuQuery) gl.endQuery(ext.TIME_ELAPSED_EXT); }
    if (!force) { const now=performance.now(), dt=this.lastRenderAt?Math.min(.25,(now-this.lastRenderAt)/1000):0;this.lastRenderAt=now;const old=this.sceneScale.scale; this.sceneScale.update(dt, this.gpuMs, this.targetFPS, this.adaptiveResolution); if(old!==this.sceneScale.scale)this.resize(); }
    return true;
  }
  dispose() {
    this.stopResize?.(); this.stopResize=undefined;
    this.uploadTarget.dispose();this.uploadMaterial.dispose();this.uploadGeometry.dispose();
    if (this.gpuQuery) (this.renderer.getContext() as WebGL2RenderingContext).deleteQuery(this.gpuQuery);
    this.envSky.geometry.dispose(); (this.envSky.material as THREE.Material).dispose();
    this.envRT?.dispose(); this.pmrem.dispose(); this.composer?.dispose(); this.renderer.dispose();
  }
}
