import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Engine } from '../../src/core/engine';
import { makeSky, MOODS } from '../../src/core/sky';

interface CaptureSky {
  mesh: ReturnType<typeof makeSky>;
  scene: THREE.Scene;
  geometryDisposals: number;
  materialDisposals: number;
}

// Run real applyMood/capture ownership with real Three objects and disposal
// events. Only synchronous PMREM generation is replaced; no WebGL is needed.
function fixture() {
  const engine = Object.create(Engine.prototype) as Engine;
  const mainSky = makeSky(), previous = new THREE.WebGLRenderTarget(1, 1);
  const captures: CaptureSky[] = [], calls: THREE.Scene[] = [], replacements: THREE.WebGLRenderTarget[] = [];
  let previousDisposals = 0, mainGeometryDisposals = 0, mainMaterialDisposals = 0;
  let render: (scene: THREE.Scene, sigma: number) => THREE.WebGLRenderTarget;
  previous.addEventListener('dispose', () => previousDisposals++);
  mainSky.geometry.addEventListener('dispose', () => mainGeometryDisposals++);
  mainSky.material.addEventListener('dispose', () => mainMaterialDisposals++);
  Object.assign(engine, {
    sky: mainSky, hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(),
    scene: new THREE.Scene(), renderer: { toneMappingExposure: 1 },
    mats: { lit: { color: new THREE.Color() }, wall: {}, shop: {}, glow: {}, vLight: { color: new THREE.Color() } },
    lampLights: [], bloom: null, envRT: previous, envKey: 'previous-environment',
    pmrem: {
      fromScene(scene: THREE.Scene, sigma: number) {
        calls.push(scene);
        if (!captures.some(capture => capture.scene === scene)) {
          const mesh = scene.children[0] as ReturnType<typeof makeSky>;
          const record: CaptureSky = { mesh, scene, geometryDisposals: 0, materialDisposals: 0 };
          mesh.geometry.addEventListener('dispose', () => record.geometryDisposals++);
          mesh.material.addEventListener('dispose', () => record.materialDisposals++);
          captures.push(record);
        }
        const mesh = scene.children[0] as ReturnType<typeof makeSky>;
        try { return render(scene, sigma); }
        finally { mesh.material.uniformsNeedUpdate = false; }
      },
    },
  });
  engine.scene.fog = new THREE.FogExp2(0xffffff); engine.scene.environment = previous.texture;
  const replacement = () => { const target = new THREE.WebGLRenderTarget(1, 1); replacements.push(target); return target; };
  render = replacement;
  return {
    engine, mainSky, previous, captures, calls, replacements, replacement,
    setRender(next: typeof render) { render = next; },
    counts: () => ({ previousDisposals, mainGeometryDisposals, mainMaterialDisposals }),
  };
}

function assertSameSkyInput(capture: ReturnType<typeof makeSky>, visible: ReturnType<typeof makeSky>) {
  const oldSource = makeSky(); oldSource.scale.setScalar(.03);
  oldSource.material.uniforms = THREE.UniformsUtils.clone(visible.material.uniforms);
  try {
    assert.notEqual(capture, visible); assert.notEqual(capture.geometry, visible.geometry); assert.notEqual(capture.material, visible.material);
    assert.equal(capture.material.vertexShader, oldSource.material.vertexShader);
    assert.equal(capture.material.fragmentShader, oldSource.material.fragmentShader);
    for (const key of ['side', 'depthWrite', 'fog', 'lights', 'toneMapped', 'transparent'] as const)
      assert.equal(capture.material[key], oldSource.material[key]);
    for (const name of Object.keys(oldSource.geometry.attributes))
      assert.deepEqual(capture.geometry.getAttribute(name).array, oldSource.geometry.getAttribute(name).array);
    assert.deepEqual(capture.geometry.index?.array, oldSource.geometry.index?.array);
    capture.updateMatrixWorld(true); oldSource.updateMatrixWorld(true);
    assert.deepEqual(capture.matrixWorld.elements, oldSource.matrixWorld.elements);
    for (const name of ['top', 'hor', 'bot', 'sunDir', 'sunCol']) {
      assert.notEqual(capture.material.uniforms[name].value, visible.material.uniforms[name].value);
      assert.ok(capture.material.uniforms[name].value.equals(oldSource.material.uniforms[name].value));
    }
    assert.equal(capture.material.uniforms.sunAmt.value, oldSource.material.uniforms.sunAmt.value);
  } finally { oldSource.geometry.dispose(); oldSource.material.dispose(); }
}

test('sky transitions reuse one private scene/geometry/material and keep its program owner alive', () => {
  const f = fixture(), targetDisposals: number[] = [];
  let first: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material; uniforms: object; values: unknown[]; version: number };
  f.setRender((scene, sigma) => {
    const mesh = scene.children[0] as ReturnType<typeof makeSky>;
    const material = mesh.material, values = ['top', 'hor', 'bot', 'sunDir', 'sunCol'].map(name => material.uniforms[name].value);
    assert.equal(sigma, .02); assert.equal(material.uniformsNeedUpdate, true);
    if (!first) first = { mesh, geometry: mesh.geometry, material, uniforms: material.uniforms, values, version: material.version };
    else {
      assert.equal(mesh, first.mesh); assert.equal(mesh.geometry, first.geometry); assert.equal(material, first.material);
      assert.equal(material.version, first.version, 'refreshing uniforms must not invalidate the linked shader variant');
      assert.equal(material.uniforms, first.uniforms); values.forEach((value, index) => assert.equal(value, first.values[index]));
    }
    assert.deepEqual([f.captures[0].geometryDisposals, f.captures[0].materialDisposals], [0, 0]);
    const next = f.replacement(), index = targetDisposals.push(0) - 1;
    next.addEventListener('dispose', () => targetDisposals[index]++); return next;
  });
  for (let index = 0; index < 32; index++) f.engine.applyMood(index % 2 ? MOODS.night : MOODS.dawn);
  assert.equal(f.calls.length, 32); assert.equal(f.captures.length, 1);
  assert.deepEqual(targetDisposals, [...Array(31).fill(1), 0]);
  assert.equal(f.engine.envRT, f.replacements.at(-1)); assert.equal(f.engine.scene.environment, f.replacements.at(-1)!.texture);
  assert.deepEqual(f.counts(), { previousDisposals: 1, mainGeometryDisposals: 0, mainMaterialDisposals: 0 });
  f.engine.applyMood(MOODS.night); assert.equal(f.calls.length, 32, 'unchanged key still skips PMREM');
});

test('capture retains the exact old sky geometry, shaders, uniform values, transform and PMREM sigma', () => {
  const f = fixture(); f.mainSky.position.set(412, 32, -85);
  f.setRender((scene, sigma) => {
    assert.equal(scene.fog, null); assert.equal(scene.children.length, 1); assert.equal(sigma, .02);
    assertSameSkyInput(scene.children[0] as ReturnType<typeof makeSky>, f.mainSky);
    return f.replacement();
  });
  f.engine.applyMood(MOODS.day); f.engine.applyMood(MOODS.dusk); f.engine.applyMood(MOODS.night);
  assert.equal(f.calls.length, 3); assert.equal(f.captures.length, 1);
  assert.deepEqual(f.mainSky.position.toArray(), [412, 32, -85]);
});

test('failed capture keeps its bounded owner and previous environment, then retries the same key', () => {
  const f = fixture(), failure = new Error('PMREM failed');
  f.setRender(scene => { assert.equal((scene.children[0] as ReturnType<typeof makeSky>).material.uniformsNeedUpdate, true); throw failure; });
  assert.throws(() => f.engine.applyMood(MOODS.dusk), error => error === failure);
  assert.equal(f.engine.envRT, f.previous); assert.equal(f.engine.scene.environment, f.previous.texture);
  assert.equal(f.engine.envKey, 'previous-environment');
  assert.deepEqual(f.counts(), { previousDisposals: 0, mainGeometryDisposals: 0, mainMaterialDisposals: 0 });
  assert.deepEqual([f.captures[0].geometryDisposals, f.captures[0].materialDisposals], [0, 0]);
  const failedVersion = f.captures[0].mesh.material.version;
  assert.equal(f.captures[0].mesh.material.uniformsNeedUpdate, false, 'mock PMREM consumed the upload request before failing');
  const next = f.replacement(); f.setRender(scene => {
    const material = (scene.children[0] as ReturnType<typeof makeSky>).material;
    assert.equal(material.uniformsNeedUpdate, true, 'retry must request upload after the previous attempt consumed it');
    assert.equal(material.version, failedVersion); return next;
  }); f.engine.applyMood(MOODS.dusk);
  assert.equal(f.calls.length, 2); assert.equal(f.captures.length, 1, 'retry retains the same material/program owner');
  assert.equal(f.engine.envRT, next); assert.equal(f.engine.scene.environment, next.texture);
  assert.equal(f.engine.envKey, MOODS.dusk.skyTop + MOODS.dusk.skyHor);
  assert.equal(f.counts().previousDisposals, 1);
});

test('explicit release is idempotent and cannot dispose the visible sky or current environment result', () => {
  const f = fixture(); f.engine.applyMood(MOODS.day);
  const result = f.engine.envRT!; let resultDisposals = 0; result.addEventListener('dispose', () => resultDisposals++);
  f.engine.releaseEnvironmentCapture(); f.engine.releaseEnvironmentCapture();
  assert.deepEqual([f.captures[0].geometryDisposals, f.captures[0].materialDisposals], [1, 1]);
  assert.equal(f.captures[0].mesh.parent, null); assert.equal(f.engine.envKey, '');
  assert.equal(f.engine.envRT, result); assert.equal(f.engine.scene.environment, result.texture); assert.equal(resultDisposals, 0);
  assert.deepEqual(f.counts(), { previousDisposals: 1, mainGeometryDisposals: 0, mainMaterialDisposals: 0 });
  f.engine.applyMood(MOODS.day); assert.equal(f.captures.length, 2); assert.notEqual(f.captures[0].mesh, f.captures[1].mesh);
  assert.equal(resultDisposals, 1, 'only a successful replacement retires the previous result');
});

test('BFCache and context restoration retain the source owner, while final page exit releases it once', () => {
  const f = fixture(), canvas = new EventTarget(), page = new EventTarget();
  (f.engine as any).watchEnvironmentCaptureLifecycle(canvas, page);
  f.engine.applyMood(MOODS.day);
  const cachedExit = new Event('pagehide'); Object.defineProperty(cachedExit, 'persisted', { value: true });
  page.dispatchEvent(cachedExit); canvas.dispatchEvent(new Event('webglcontextlost'));
  assert.deepEqual([f.captures[0].geometryDisposals, f.captures[0].materialDisposals], [0, 0]);
  canvas.dispatchEvent(new Event('webglcontextrestored')); assert.equal(f.engine.envKey, '');
  f.engine.applyMood(MOODS.day); assert.equal(f.calls.length, 2); assert.equal(f.captures.length, 1);
  const finalExit = new Event('pagehide'); Object.defineProperty(finalExit, 'persisted', { value: false });
  page.dispatchEvent(finalExit); page.dispatchEvent(finalExit);
  assert.deepEqual([f.captures[0].geometryDisposals, f.captures[0].materialDisposals], [1, 1]);
  assert.deepEqual(f.counts(), { previousDisposals: 1, mainGeometryDisposals: 0, mainMaterialDisposals: 0 });
});
