import * as THREE from 'three';
import { buildTrafficSignals } from '../../src/art/trafficSignals';
import { forwardOf } from '../../src/world/roadIndex';

/** Browser-only diagnostic. The eager builder below is the signal geometry and
 * placement from e68ad6a, rendered against the batched replacement in one frame.
 * Readbacks are outside timed performance windows and never run in the game. */
export function compareSignals(app: any) {
  const world = app.world, signals = app.session.traffic.signals, renderer = app.renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc6d6d8);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.65);
  sun.position.set(42, 74, 52);
  scene.add(sun, new THREE.HemisphereLight(0xd4dfec, 0x859297, 1.1));
  scene.environment = app.view.scene.environment;
  scene.environmentIntensity = app.view.scene.environmentIntensity;
  const eager = new THREE.Group();
  const pole = new THREE.CylinderGeometry(.09, .11, 5.2, 8);
  const box = new THREE.BoxGeometry(.45, 1.25, .35);
  const lamp = new THREE.SphereGeometry(.14, 12, 8);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: .6, metalness: .4 });
  const heads: { edge: string; group: THREE.Group; lamps: THREE.MeshStandardMaterial[] }[] = [];
  for (const node of signals.nodes) for (const approach of node.approaches) {
    const edge = world.nav.edges.get(approach.edge), road = world.roads.roads.get(edge.roadId);
    const p = world.nav.pointOnDirected(approach.edge, Math.max(0, edge.lengthM - 5));
    const [fx, fz] = forwardOf(p.heading), side = road.widthM / 2 + .8;
    const group = new THREE.Group();
    group.position.set(p.x + fz * side, p.y, p.z - fx * side);
    group.rotation.y = p.heading + Math.PI;
    const post = new THREE.Mesh(pole, dark); post.position.y = 2.6; group.add(post);
    const housing = new THREE.Mesh(box, dark); housing.position.set(0, 4.6, 0); group.add(housing);
    const lamps = [0xff3b30, 0xffb020, 0x34c759].map((emissive, i) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x222222, emissive, emissiveIntensity: .05 });
      const mesh = new THREE.Mesh(lamp, material); mesh.position.set(0, 5 - i * .4, -.2); group.add(mesh);
      return material;
    });
    eager.add(group); heads.push({ edge: approach.edge, group, lamps });
  }
  const batched = buildTrafficSignals(signals, world);
  scene.add(eager, batched.root);
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 250);
  const oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio();
  const gl = renderer.getContext();
  const results: any[] = [];
  const target = new THREE.Vector3(), direction = new THREE.Vector3();
  const selected = heads.slice().sort((a, b) => a.group.position.distanceToSquared(app.view.camera.position) - b.group.position.distanceToSquared(app.view.camera.position));
  try {
    renderer.setPixelRatio(1); renderer.setSize(512, 512, false);
    for (const [index, tick] of [[0, 0], [1, 1080], [7, 1260], [heads.length - 1, -120]] as const) {
      const chosen = selected[index];
      if (!chosen) continue;
      for (const head of heads) {
        const color = signals.colorFor(head.edge, tick);
        head.lamps.forEach((material, i) => material.emissiveIntensity = color === ['red', 'amber', 'green'][i] ? 3 : .05);
      }
      batched.update(signals, tick);
      target.copy(chosen.group.position).y += 3.3;
      direction.set(0, 0, -1).applyEuler(chosen.group.rotation);
      camera.position.copy(target).addScaledVector(direction, 10);
      camera.lookAt(target);
      const images: string[] = [], pixels: Uint8Array[] = [], budgets: unknown[] = [];
      for (const original of [true, false]) {
        eager.visible = original; batched.root.visible = !original;
        renderer.render(scene, camera);
        const bytes = new Uint8Array(512 * 512 * 4);
        gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        pixels.push(bytes); images.push(renderer.domElement.toDataURL('image/png'));
        budgets.push({ ...renderer.info.render });
      }
      let changedPixels = 0, totalDifference = 0, maximumChannelDifference = 0;
      for (let i = 0; i < pixels[0].length; i += 4) {
        let changed = false;
        for (let c = 0; c < 3; c++) {
          const difference = Math.abs(pixels[0][i + c] - pixels[1][i + c]);
          totalDifference += difference; maximumChannelDifference = Math.max(maximumChannelDifference, difference);
          if (difference) changed = true;
        }
        if (changed) changedPixels++;
      }
      results.push({ edge: chosen.edge, tick, position: chosen.group.position.toArray(), budgets,
        changedPixels, changedPixelFraction: changedPixels / (512 * 512),
        meanAbsoluteChannelDifference: totalDifference / (512 * 512 * 3), maximumChannelDifference,
        originalImage: images[0], batchedImage: images[1] });
    }
  } finally {
    renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false);
    batched.dispose(); [pole, box, lamp].forEach(g => g.dispose()); dark.dispose();
    for (const head of heads) head.lamps.forEach(m => m.dispose());
    renderer.render(app.view.scene, app.view.camera);
  }
  return { method: 'Same-task original-v2 and batched rendering of real-world heads, same camera/light/materials; 512px framebuffer pixel comparison. Instancing can introduce subpixel raster differences.', heads: heads.length, results };
}
