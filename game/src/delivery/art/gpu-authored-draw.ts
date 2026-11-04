import * as THREE from 'three';

export interface AuthoredCharacterDrawContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  composer?: { readBuffer: THREE.WebGLRenderTarget } | null;
}

interface RendererQueue { epoch: number; tail: Promise<void> }
const queues = new WeakMap<THREE.WebGLRenderer, RendererQueue>();

function queueFor(renderer: THREE.WebGLRenderer) {
  let state = queues.get(renderer);
  if (!state) {
    state = { epoch: 0, tail: Promise.resolve() };
    queues.set(renderer, state);
    const invalidate = () => { state!.epoch++; };
    renderer.domElement.addEventListener('webglcontextlost', invalidate);
    renderer.domElement.addEventListener('webglcontextrestored', invalidate);
  }
  return state;
}

function yieldWithContext(renderer: THREE.WebGLRenderer, yieldTask: () => Promise<void>, check: () => void) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const canvas = renderer.domElement;
    const finish = (error?: unknown) => {
      if (settled) return; settled = true;
      canvas.removeEventListener('webglcontextlost', changed);
      canvas.removeEventListener('webglcontextrestored', changed);
      if (error) reject(error); else resolve();
    };
    const changed = () => finish(new Error('Authored character draw preparation was interrupted by a context change.'));
    canvas.addEventListener('webglcontextlost', changed);
    canvas.addEventListener('webglcontextrestored', changed);
    Promise.resolve().then(yieldTask).then(() => { try { check(); finish(); } catch (error) { finish(error); } }, finish);
  });
}

/** A detached render-only snapshot. No source children, callbacks, materials,
 * geometry, skeletons or shadow textures are moved, cloned or disposed. */
function authoredSnapshot(root: THREE.Group, context: AuthoredCharacterDrawContext) {
  const { scene: sourceScene, camera: sourceCamera } = context;
  const far = (sourceCamera as THREE.PerspectiveCamera | THREE.OrthographicCamera).far;
  if ((!('isPerspectiveCamera' in sourceCamera) && !('isOrthographicCamera' in sourceCamera)) ||
      !Number.isFinite(far) || far <= 0) {
    throw new Error('Authored draw preparation needs a finite perspective or orthographic camera.');
  }
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  scene.fog = sourceScene.fog;
  scene.environment = sourceScene.environment;
  scene.environmentIntensity = sourceScene.environmentIntensity;
  scene.environmentRotation.copy(sourceScene.environmentRotation);
  scene.overrideMaterial = sourceScene.overrideMaterial;
  // No background means render() cannot request a background clear.
  scene.background = null;
  const camera = sourceCamera.clone(false);
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;
  camera.matrixWorld.copy(sourceCamera.matrixWorld);
  camera.matrixWorldInverse.copy(sourceCamera.matrixWorldInverse);

  const origin = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
  const offset = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld)
    .multiplyScalar(far * 1024).add(new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)).sub(origin);
  if (![offset.x, offset.y, offset.z].every(Number.isFinite)) throw new Error('Invalid authored draw preparation transform.');
  const translation = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
  let meshes = 0;
  root.traverse(source => {
    if (!(source instanceof THREE.Mesh)) return;
    if (source instanceof THREE.InstancedMesh || (source as THREE.Mesh & { isBatchedMesh?: boolean }).isBatchedMesh) {
      throw new Error('Instanced authored draw preparation requires a dedicated instance snapshot.');
    }
    const materials = Array.isArray(source.material) ? source.material : [source.material];
    if (materials.some(material => material.onBeforeRender !== THREE.Material.prototype.onBeforeRender)) {
      throw new Error('Authored draw preparation cannot invoke custom material render callbacks.');
    }
    let mesh: THREE.Mesh;
    if (source instanceof THREE.SkinnedMesh) {
      if (!source.skeleton?.boneTexture) throw new Error('Authored bones must be prepared before their draw.');
      const skin = new THREE.SkinnedMesh(source.geometry, source.material);
      skin.skeleton = source.skeleton;
      skin.bindMode = THREE.DetachedBindMode;
      skin.bindMatrix.copy(source.bindMatrix);
      skin.bindMatrixInverse.copy(source.bindMatrixInverse);
      mesh = skin;
    } else mesh = new THREE.Mesh(source.geometry, source.material);
    mesh.name = `authored-preparation:${source.name}`;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.matrixWorld.copy(source.matrixWorld).premultiply(translation);
    mesh.matrix.copy(mesh.matrixWorld);
    mesh.frustumCulled = false;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    // Prepare future-visible meshes without changing any source visibility or
    // layers. Lighting still matches the real camera's currently visible lights.
    mesh.layers.mask = camera.layers.mask;
    mesh.morphTargetDictionary = source.morphTargetDictionary ? { ...source.morphTargetDictionary } : undefined;
    mesh.morphTargetInfluences = source.morphTargetInfluences?.slice();
    scene.add(mesh); meshes++;
  });
  sourceScene.traverseVisible(source => {
    if (!(source instanceof THREE.Light) || !source.layers.test(sourceCamera.layers)) return;
    const light = source.clone(false) as THREE.Light & { target?: THREE.Object3D; shadow?: unknown };
    light.matrixAutoUpdate = false; light.matrixWorldAutoUpdate = false;
    light.matrixWorld.copy(source.matrixWorld); light.matrix.copy(light.matrixWorld);
    const actual = source as THREE.Light & { target?: THREE.Object3D; shadow?: unknown };
    if (actual.target) {
      light.target = actual.target.clone(false);
      light.target.matrixAutoUpdate = false; light.target.matrixWorldAutoUpdate = false;
      light.target.matrixWorld.copy(actual.target.matrixWorld);
    }
    // Borrow existing shadow uniforms/maps, while the synchronous draw below
    // suppresses all shadow updates. Never dispose these snapshot lights.
    if (actual.shadow) light.shadow = actual.shadow;
    scene.add(light);
  });
  return { scene, camera, meshes };
}

/** Exercise authored shader/VAO/draw setup after textures, bones, compilation
 * and shared buffer upload. Caller must retain the registry GPU borrow until
 * this promise settles and supply the current, validated actor world matrices.
 *
 * The real scene-pass target preserves its framebuffer format, samples, output
 * space and tone-mapping variant. Render-only meshes are placed far beyond the
 * camera's far plane, with CPU culling disabled so native draws still occur.
 * A zero-area scissor protects both scene-pass targets even if a future asset
 * is larger than the clipping offset. No clear/shadow pass runs. No world
 * pixels should change; the native fixture must verify that invariant
 * and measure whether a particular driver actually benefits from the warmup.
 * This does not establish mobile FPS or force GPU completion with a stall.
 */
export function warmAuthoredCharacterDraw(
  root: THREE.Group,
  context: AuthoredCharacterDrawContext,
  yieldTask: () => Promise<void>,
  valid: () => boolean = () => true,
): Promise<number> {
  const { renderer } = context, state = queueFor(renderer), epoch = state.epoch;
  const check = () => {
    if (!valid() || state.epoch !== epoch || renderer.getContext().isContextLost()) {
      throw new Error('Authored character draw preparation was interrupted.');
    }
  };
  const job = state.tail.then(async () => {
    check(); await yieldWithContext(renderer, yieldTask, check); check();
    const snapshot = authoredSnapshot(root, context);
    if (!snapshot.meshes) return 0;
    const target = context.composer?.readBuffer ?? null;
    const priorTarget = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
    const flags = { sort: renderer.sortObjects, xr: renderer.xr.enabled, autoClear: renderer.autoClear,
      shadowAuto: renderer.shadowMap.autoUpdate, shadowNeeds: renderer.shadowMap.needsUpdate, infoAuto: renderer.info.autoReset };
    const counts = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      points: renderer.info.render.points, lines: renderer.info.render.lines };
    try {
      renderer.sortObjects = false; renderer.xr.enabled = false; renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.info.autoReset = false;
      renderer.setRenderTarget(target);
      renderer.setScissor(0, 0, 0, 0); renderer.setScissorTest(true);
      check(); renderer.render(snapshot.scene, snapshot.camera); check();
    } finally {
      try {
        // These setters restore the canvas logical scissor, then rebinding the
        // original target restores its own physical viewport/scissor as well.
        renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.setRenderTarget(priorTarget, face, mip);
      } finally {
        renderer.sortObjects = flags.sort; renderer.xr.enabled = flags.xr; renderer.autoClear = flags.autoClear;
        renderer.shadowMap.autoUpdate = flags.shadowAuto; renderer.shadowMap.needsUpdate = flags.shadowNeeds;
        renderer.info.autoReset = flags.infoAuto;
        Object.assign(renderer.info.render, counts);
        // info.render.frame stays monotonic: Three uses it for skeleton and
        // geometry updates. No borrowed material/geometry/skeleton is disposed.
        snapshot.scene.clear();
      }
    }
    return snapshot.meshes;
  });
  state.tail = job.then(() => {}, () => {});
  return job;
}
