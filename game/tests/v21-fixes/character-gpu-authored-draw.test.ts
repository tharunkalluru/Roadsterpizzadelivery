import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warmAuthoredCharacterDraw } from '../../src/delivery/art/gpu-authored-draw';

function fixture(composer = false) {
  const scene = new THREE.Scene(), root = new THREE.Group(), parent = new THREE.Group();
  parent.position.set(4000, 3, -6000); scene.add(parent); parent.add(root); root.position.set(2, 0, 1);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ roughness: .8 });
  geometry.boundingSphere = null;
  const plain = new THREE.Mesh(geometry, material); plain.position.set(0, 1, 0); plain.visible = false;
  let sourceCallbacks = 0, sourceDisposals = 0;
  plain.onBeforeRender = () => { sourceCallbacks++; };
  geometry.addEventListener('dispose', () => { sourceDisposals++; });
  material.addEventListener('dispose', () => { sourceDisposals++; });
  root.add(plain);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const skin = new THREE.SkinnedMesh(geometry, material), bone = new THREE.Bone();
  root.add(skin); skin.add(bone); skin.bind(new THREE.Skeleton([bone])); skin.skeleton.computeBoneTexture();
  skin.skeleton.boneTexture!.addEventListener('dispose', () => { sourceDisposals++; });
  const camera = new THREE.PerspectiveCamera(60, 2, .1, 200); camera.position.set(4000, 4, -5995); camera.lookAt(4000, 4, -6000);
  camera.layers.set(0); scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const light = new THREE.DirectionalLight(0xffd0a0, 2); light.castShadow = true;
  light.shadow.map = new THREE.WebGLRenderTarget(16, 16); light.shadow.needsUpdate = true;
  light.shadow.map.addEventListener('dispose', () => { sourceDisposals++; }); scene.add(light);
  const hiddenLight = new THREE.PointLight(); hiddenLight.visible = false; scene.add(hiddenLight);
  const otherLayer = new THREE.PointLight(); otherLayer.layers.set(1); scene.add(otherLayer);
  scene.fog = new THREE.FogExp2(0x334455, .004); scene.environment = new THREE.Texture(); scene.environmentIntensity = .7;
  scene.updateMatrixWorld(true);
  const canvas = new EventTarget(), prior = new THREE.WebGLRenderTarget(20, 10);
  prior.viewport.set(1, 2, 15, 8); prior.scissor.set(2, 1, 12, 7); prior.scissorTest = true;
  const sceneTarget = new THREE.WebGLRenderTarget(80, 40, { type: THREE.HalfFloatType, samples: 4 });
  let target: THREE.WebGLRenderTarget | null = prior, face = 3, mip = 2, lost = false, fail = false;
  const logicalScissor = new THREE.Vector4(7, 9, 60, 40), logicalViewport = new THREE.Vector4(4, 6, 100, 80);
  let testScissor = false, physicalScissor = prior.scissor.clone(), physicalViewport = prior.viewport.clone();
  const draws: { scene: THREE.Scene; camera: THREE.Camera; meshes: THREE.Mesh[] }[] = [];
  let inspect: ((scene: THREE.Scene, camera: THREE.Camera) => void) | undefined;
  const renderer: any = {
    domElement: canvas, sortObjects: true, xr: { enabled: true }, autoClear: true,
    autoClearColor: false, autoClearDepth: true, autoClearStencil: true,
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true, type: THREE.PCFSoftShadowMap },
    outputColorSpace: THREE.SRGBColorSpace,
    info: { autoReset: true, render: { frame: 17, calls: 7, triangles: 33, points: 1, lines: 2 } },
    getContext: () => ({ isContextLost: () => lost }),
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(next: THREE.WebGLRenderTarget | null, f = 0, m = 0) {
      target = next; face = f; mip = m;
      physicalViewport = (next?.viewport ?? logicalViewport).clone();
      physicalScissor = (next?.scissor ?? logicalScissor).clone();
    },
    getScissor: (out: THREE.Vector4) => out.copy(logicalScissor), getScissorTest: () => testScissor,
    setScissor(x: number | THREE.Vector4, y?: number, w?: number, h?: number) {
      if (x instanceof THREE.Vector4) logicalScissor.copy(x); else logicalScissor.set(x, y!, w!, h!);
      physicalScissor.copy(logicalScissor);
    },
    setScissorTest(value: boolean) { testScissor = value; },
    render(drawScene: THREE.Scene, drawCamera: THREE.Camera) {
      assert.equal(target, composer ? sceneTarget : null, 'actual scene-pass target, not a different-format scratch target');
      assert.equal(renderer.autoClear, false); assert.equal(renderer.xr.enabled, false); assert.equal(renderer.sortObjects, false);
      assert.equal(renderer.shadowMap.enabled, true, 'preserve the real shadow shader variant');
      assert.equal(renderer.shadowMap.autoUpdate, false); assert.equal(renderer.shadowMap.needsUpdate, false);
      assert.equal(renderer.info.autoReset, false);
      assert.equal(testScissor, true);assert.deepEqual(logicalScissor.toArray(), [0, 0, 0, 0],'neither target can receive a pixel, regardless of authored extent');
      assert.equal(drawScene.background, null); assert.equal(drawScene.fog, scene.fog); assert.equal(drawScene.environment, scene.environment);
      const meshes = drawScene.children.filter(n => n instanceof THREE.Mesh) as THREE.Mesh[];
      const lights = drawScene.children.filter(n => n instanceof THREE.Light) as THREE.DirectionalLight[];
      assert.equal(lights.length, 1); assert.notEqual(lights[0], light); assert.equal(lights[0].shadow, light.shadow);
      for (const proxy of meshes) {
        assert.notEqual(proxy, plain); assert.notEqual(proxy, skin); assert.equal(proxy.geometry, geometry); assert.equal(proxy.material, material);
        assert.equal(proxy.frustumCulled, false); assert.equal(proxy.matrixWorldAutoUpdate, false);
        assert.equal(proxy.layers.mask, camera.layers.mask);
        const viewPosition = new THREE.Vector3().setFromMatrixPosition(proxy.matrixWorld).applyMatrix4(drawCamera.matrixWorldInverse);
        assert.ok(viewPosition.z < -camera.far * 100, 'actual draw proxies stay well beyond the far clip plane');
        proxy.onBeforeRender(renderer, drawScene, drawCamera, proxy.geometry, material, null as any);
      }
      const skinned = meshes.find(m => m instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh;
      assert.equal(skinned.skeleton, skin.skeleton); assert.equal(skinned.bindMode, THREE.DetachedBindMode);
      assert.ok(skinned.bindMatrix.equals(skin.bindMatrix)); assert.ok(skinned.bindMatrixInverse.equals(skin.bindMatrixInverse));
      renderer.info.render.frame++; renderer.info.render.calls += meshes.length;
      draws.push({ scene: drawScene, camera: drawCamera, meshes }); inspect?.(drawScene, drawCamera);
      if (fail) throw new Error('simulated authored draw failure');
    },
  };
  const context = { renderer: renderer as THREE.WebGLRenderer, scene, camera, composer: composer ? { readBuffer: sceneTarget } : null };
  return { context, root, parent, plain, skin, bone, geometry, material, camera, light, canvas, prior, sceneTarget, draws,
    flags: () => ({ sort: renderer.sortObjects, xr: renderer.xr.enabled, auto: renderer.autoClear, shadowAuto: renderer.shadowMap.autoUpdate,
      shadowNeeds: renderer.shadowMap.needsUpdate, shadowEnabled: renderer.shadowMap.enabled, infoAuto: renderer.info.autoReset }),
    rectangles: () => ({ logicalScissor: logicalScissor.toArray(), viewport: physicalViewport.toArray(), scissor: physicalScissor.toArray(), testScissor }),
    binding: () => ({ target, face, mip }), counts: () => ({ ...renderer.info.render }),
    sourceCallbacks: () => sourceCallbacks, sourceDisposals: () => sourceDisposals,
    setLost: (v: boolean) => { lost = v; }, setFail: (v: boolean) => { fail = v; },
    inspect: (fn: (scene: THREE.Scene, camera: THREE.Camera) => void) => { inspect = fn; },
  };
}
const noWait = async () => {};

for (const composer of [false, true]) test(`${composer ? 'composer-linear' : 'canvas-sRGB'} authored draw uses exact shared resources with zero-write public render state`, async () => {
  const f = fixture(composer), matrices = [f.root.matrixWorld.clone(), f.plain.matrixWorld.clone(), f.bone.matrixWorld.clone(), f.camera.matrixWorld.clone()];
  const position = f.geometry.attributes.position.array.slice(), index = f.geometry.index!.array.slice();
  assert.equal(await warmAuthoredCharacterDraw(f.root, f.context, noWait), 2);
  assert.equal(f.draws.length, 1); assert.equal(f.sourceCallbacks(), 0); assert.equal(f.sourceDisposals(), 0);
  assert.equal(f.root.parent, f.parent); assert.equal(f.plain.visible, false); assert.equal(f.geometry.boundingSphere, null);
  assert.deepEqual(f.geometry.attributes.position.array, position); assert.deepEqual(f.geometry.index!.array, index);
  assert.ok(f.root.matrixWorld.equals(matrices[0])); assert.ok(f.plain.matrixWorld.equals(matrices[1]));
  assert.ok(f.bone.matrixWorld.equals(matrices[2])); assert.ok(f.camera.matrixWorld.equals(matrices[3]));
  assert.equal(f.light.shadow.needsUpdate, true, 'source shadow state is not rewritten');
  assert.deepEqual(f.flags(), { sort: true, xr: true, auto: true, shadowAuto: true, shadowNeeds: true, shadowEnabled: true, infoAuto: true });
  assert.deepEqual(f.binding(), { target: f.prior, face: 3, mip: 2 });
  assert.deepEqual(f.rectangles(), { logicalScissor: [7, 9, 60, 40], viewport: [1, 2, 15, 8], scissor: [2, 1, 12, 7], testScissor: false });
  assert.deepEqual(f.counts(), { frame: 18, calls: 7, triangles: 33, points: 1, lines: 2 });
});

test('draw failure restores presentation and shadow state, retains resources and permits retry', async () => {
  const f = fixture(); f.setFail(true);
  await assert.rejects(warmAuthoredCharacterDraw(f.root, f.context, noWait), /authored draw failure/);
  assert.deepEqual(f.binding(), { target: f.prior, face: 3, mip: 2 });
  assert.deepEqual(f.flags(), { sort: true, xr: true, auto: true, shadowAuto: true, shadowNeeds: true, shadowEnabled: true, infoAuto: true });
  assert.equal(f.sourceDisposals(), 0); assert.equal(f.counts().frame, 18);
  f.setFail(false); await warmAuthoredCharacterDraw(f.root, f.context, noWait);
  assert.equal(f.draws.length, 2); assert.equal(f.counts().frame, 19, 'frame never rewinds');
});

test('cancellation and context changes before queued drawing cannot touch renderer state or source resources', async () => {
  const f = fixture(); let resume!: () => void, began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const first = warmAuthoredCharacterDraw(f.root, f.context, () => new Promise<void>(resolve => { resume = resolve; began(); }));
  await started; f.canvas.dispatchEvent(new Event('webglcontextrestored')); resume();
  await assert.rejects(first, /interrupted/); assert.equal(f.draws.length, 0); assert.equal(f.counts().frame, 17);
  await assert.rejects(warmAuthoredCharacterDraw(f.root, f.context, noWait, () => false), /interrupted/);
  f.setLost(true); await assert.rejects(warmAuthoredCharacterDraw(f.root, f.context, noWait), /interrupted/);
  f.setLost(false); await warmAuthoredCharacterDraw(f.root, f.context, noWait); assert.equal(f.draws.length, 1);
});

test('a context loss during the draw restores state and does not dispose the borrowed bone texture', async () => {
  const f = fixture(true); f.inspect(() => { f.setLost(true); });
  await assert.rejects(warmAuthoredCharacterDraw(f.root, f.context, noWait), /interrupted/);
  assert.deepEqual(f.binding(), { target: f.prior, face: 3, mip: 2 }); assert.equal(f.sourceDisposals(), 0);
  assert.equal(f.flags().shadowAuto, true); assert.equal(f.flags().shadowNeeds, true); assert.equal(f.counts().frame, 18);
});

test('a context change releases a stalled yield so fresh work is not trapped behind the old queue', async () => {
  const f = fixture(); let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const stalled = warmAuthoredCharacterDraw(f.root, f.context, () => { began(); return new Promise<void>(() => {}); });
  await started; f.canvas.dispatchEvent(new Event('webglcontextlost'));
  await assert.rejects(stalled, /context change/); assert.equal(f.draws.length, 0);
  await warmAuthoredCharacterDraw(f.root, f.context, noWait); assert.equal(f.draws.length, 1);
});

test('render-only morph influences are independent and opaque authored material state remains unchanged', async () => {
  const f = fixture(); f.plain.morphTargetInfluences = [.25]; f.plain.morphTargetDictionary = { smile: 0 };
  const materialVersion = f.material.version;
  f.inspect((_scene, _camera) => { const proxy = f.draws[0].meshes[0]; proxy.morphTargetInfluences![0] = .9; proxy.morphTargetDictionary!.smile = 7; });
  await warmAuthoredCharacterDraw(f.root, f.context, noWait);
  assert.deepEqual(f.plain.morphTargetInfluences, [.25]); assert.deepEqual(f.plain.morphTargetDictionary, { smile: 0 });
  assert.equal(f.material.version, materialVersion); assert.equal(f.material.roughness, .8);
});

test('unsupported callbacks, instancing, unprepared bones and infinite projection fail before target binding', async () => {
  const callback = fixture(); let callbacks = 0; callback.material.onBeforeRender = () => { callbacks++; };
  await assert.rejects(warmAuthoredCharacterDraw(callback.root, callback.context, noWait), /custom material/); assert.equal(callbacks, 0); assert.equal(callback.draws.length, 0);
  const instances = fixture(); instances.root.add(new THREE.InstancedMesh(instances.geometry, instances.material, 1));
  await assert.rejects(warmAuthoredCharacterDraw(instances.root, instances.context, noWait), /dedicated instance/); assert.equal(instances.draws.length, 0);
  const bones = fixture(); bones.skin.skeleton.boneTexture = null;
  await assert.rejects(warmAuthoredCharacterDraw(bones.root, bones.context, noWait), /bones must be prepared/); assert.equal(bones.draws.length, 0);
  const camera = fixture(); camera.camera.far = Infinity;
  await assert.rejects(warmAuthoredCharacterDraw(camera.root, camera.context, noWait), /finite perspective/); assert.equal(camera.draws.length, 0);
});
