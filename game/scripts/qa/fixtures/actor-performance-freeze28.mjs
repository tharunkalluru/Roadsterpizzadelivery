// Exact actor section from freeze28 bundle SHA256 c1ccd6addde85e4d9ba7629fa97a4bf721f04a66ada89916c35ffcd5cdb617de.
// Test-only reference; never imported by the game.
import {Bone,BoxGeometry,BufferAttribute,BufferGeometry,CylinderGeometry,DynamicDrawUsage,Euler,ExtrudeGeometry,Group,MathUtils,Matrix4,Mesh,MeshStandardMaterial,Object3D,Quaternion,Shape,SkinnedMesh,Sphere,Vector3} from 'three';
import {CharacterSculpt}from '../../../src/delivery/modules/character-sculpt';
import {faceMesh,reviewedFaceAnnotation,validFaceAnnotation}from '../../../src/delivery/art/face-annotations';
// src/delivery/art/actor-performance.ts
var EATERS = /* @__PURE__ */ new Set(["pushpa-raj", "ram-vvr", "jessie", "hasini", "bhanumathi", "sukumar", "nani-jersey", "arjun-reddy", "maruthi", "vakeel-saab", "srikanth-odela"]);
var clamp2 = MathUtils.clamp;
var smooth = (value) => {
  const t = clamp2(value, 0, 1);
  return t * t * (3 - 2 * t);
};
var step = (dt) => Number.isFinite(dt) ? clamp2(dt, 0, 0.1) : 0;
function receivedCartonDepth(root, head, drop) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), headY = head.getWorldPosition(new Vector3()).applyMatrix4(inverse).y;
  let front = -Infinity;
  const point = new Vector3();
  root.traverse((node) => {
    if (!(node instanceof Mesh) || node.name.startsWith("received-")) return;
    for (let parent = node; parent && parent !== root; parent = parent.parent) {
      if (!parent.visible) return;
      if (parent instanceof Bone && /^(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand|Index|Middle|Ring|Pinky|Thumb)/.test(parent.name)) return;
    }
    const position = node.geometry.getAttribute("position");
    if (!position) return;
    const indices = node.geometry.getAttribute("skinIndex"), weights = node.geometry.getAttribute("skinWeight");
    if (node instanceof SkinnedMesh) node.skeleton.update();
    for (let i = 0; i < position.count; i++) {
      if (node instanceof SkinnedMesh && indices && weights) {
        let arms = 0;
        for (let k = 0; k < 4; k++) {
          const name = node.skeleton.bones[indices.getComponent(i, k)]?.name ?? "";
          if (/Shoulder|Arm|Hand|Index|Middle|Ring|Pinky|Thumb/.test(name)) arms += weights.getComponent(i, k);
        }
        if (arms > 0.2) continue;
      }
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
      if (point.x < -0.095 || point.x > 0.305 || point.y < headY - drop + 0.012 || point.y > headY - 0.12) continue;
      front = Math.max(front, point.z);
    }
  });
  return Number.isFinite(front) ? Math.max(0.4, front + 0.16 + 0.045) : 0.43;
}
function createMouthPerformance(root, resources, annotation, allowPicked = false) {
  if (!annotation || !validFaceAnnotation(root, annotation, annotation.characterId, allowPicked)) return null;
  const head = root.getObjectByName(annotation.headNode), mesh = faceMesh(root, annotation);
  root.updateWorldMatrix(true, true);
  const anchor = new Object3D();
  anchor.name = "delivery-mouth-anchor";
  anchor.position.fromArray(annotation.anchorHeadLocal);
  head.add(anchor);
  const edits = /* @__PURE__ */ new Map([[mesh, annotation.mask]]);
  const buffers = [];
  let bytes = 0, vertices = 0, disposed = false, previous = -1;
  for (const [mesh2, entries] of edits) {
    const source = mesh2.geometry, geometry = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    if (source.index) geometry.setIndex(source.index);
    geometry.groups = source.groups.map((group) => ({ ...group }));
    geometry.drawRange = { ...source.drawRange };
    geometry.boundingBox = source.boundingBox?.clone() ?? null;
    geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
    if (geometry.boundingSphere) geometry.boundingSphere.radius += 9e-3;
    const original = source.getAttribute("position");
    const position = new BufferAttribute(new Float32Array(original.array), 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", position);
    geometry.name = `${source.name}:instance-mouth`;
    geometry.userData = { ...source.userData, deliveryMouthInstance: true };
    mesh2.geometry = resources.geometry(geometry);
    const delta = new Vector3(...annotation.displacementUp);
    buffers.push({ attribute: position, source: original, edits: entries, delta, low: Math.min(...entries.map((e) => e.index)) * 3, high: (Math.max(...entries.map((e) => e.index)) + 1) * 3 });
    bytes += position.array.byteLength;
    vertices += entries.length;
    if (mesh2 instanceof SkinnedMesh && mesh2.boundingSphere) mesh2.boundingSphere.radius += 9e-3;
  }
  return { point: anchor, bytes, vertices, set(amount) {
    if (disposed) return;
    const value = Number.isFinite(amount) ? clamp2(amount, 0, 1) : 0;
    if (value === previous) return;
    previous = value;
    for (const buffer of buffers) {
      for (const entry of buffer.edits) {
        const d = value * entry.weight * (entry.lower ? -8e-3 : 15e-4), i = entry.index;
        buffer.attribute.setXYZ(i, buffer.source.getX(i) + buffer.delta.x * d, buffer.source.getY(i) + buffer.delta.y * d, buffer.source.getZ(i) + buffer.delta.z * d);
      }
      buffer.attribute.clearUpdateRanges();
      buffer.attribute.addUpdateRange(buffer.low, buffer.high - buffer.low);
      buffer.attribute.needsUpdate = true;
    }
  }, dispose() {
    if (disposed) return;
    this.set(0);
    disposed = true;
    anchor.removeFromParent();
  } };
}
var ikScratch = /* @__PURE__ */ new WeakMap();
function solveHandTarget(root, side, target, iterations = 5, palmOrientation, elbowPole, palmOffset = new Vector3(0, 0.035, 0)) {
  const hand = root.getObjectByName(`${side}Hand`), elbow = root.getObjectByName(`${side}ForeArm`), shoulder = root.getObjectByName(`${side}Arm`);
  if (!hand || !elbow || !shoulder) return false;
  let scratch = ikScratch.get(root);
  if (!scratch) {
    scratch = { palm: new Vector3(), joint: new Vector3(), from: new Vector3(), to: new Vector3(), world: new Quaternion(), parent: new Quaternion(), turn: new Quaternion() };
    ikScratch.set(root, scratch);
  }
  const { palm, joint, from, to, world, parent, turn } = scratch;
  const orientHand = () => {
    if (!palmOrientation) return;
    parent.identity();
    hand.parent?.getWorldQuaternion(parent);
    hand.quaternion.copy(parent.invert().multiply(palmOrientation));
    hand.updateWorldMatrix(true, false);
  };
  if (elbowPole && palmOrientation) {
    orientHand();
    const start = shoulder.getWorldPosition(new Vector3()), middle = elbow.getWorldPosition(new Vector3()), end = hand.getWorldPosition(new Vector3());
    const wrist = target.clone().sub(palmOffset.clone().applyQuaternion(palmOrientation));
    const upper = start.distanceTo(middle), lower = middle.distanceTo(end), axis = wrist.clone().sub(start), length = axis.length();
    if (upper > 1e-6 && lower > 1e-6 && length > 1e-6) {
      axis.divideScalar(length);
      const distance = clamp2(length, Math.abs(upper - lower) + 1e-5, upper + lower - 1e-5), along = (upper * upper - lower * lower + distance * distance) / (2 * distance), radius = Math.sqrt(Math.max(0, upper * upper - along * along));
      const pole = elbowPole.clone().addScaledVector(axis, -elbowPole.dot(axis)).normalize(), goal = start.clone().addScaledVector(axis, along).addScaledVector(pole, radius);
      const aim = (bone, fromPoint, toPoint) => {
        bone.getWorldPosition(joint);
        from.subVectors(fromPoint, joint).normalize();
        to.subVectors(toPoint, joint).normalize();
        turn.setFromUnitVectors(from, to);
        bone.getWorldQuaternion(world);
        world.premultiply(turn);
        parent.identity();
        bone.parent?.getWorldQuaternion(parent);
        bone.quaternion.copy(parent.invert().multiply(world));
        bone.updateWorldMatrix(true, true);
      };
      aim(shoulder, middle, goal);
      elbow.getWorldPosition(middle);
      hand.getWorldPosition(end);
      aim(elbow, end, start.clone().addScaledVector(axis, distance));
      orientHand();
      return true;
    }
  }
  for (let pass = 0; pass < iterations; pass++) for (const bone of [elbow, shoulder]) {
    orientHand();
    hand.updateWorldMatrix(true, false);
    palm.copy(palmOffset).applyMatrix4(hand.matrixWorld);
    bone.getWorldPosition(joint);
    from.subVectors(palm, joint);
    to.subVectors(target, joint);
    if (from.lengthSq() < 1e-9 || to.lengthSq() < 1e-9) continue;
    turn.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(world);
    world.premultiply(turn);
    parent.identity();
    bone.parent?.getWorldQuaternion(parent);
    bone.quaternion.copy(parent.invert().multiply(world));
  }
  orientHand();
  hand.updateWorldMatrix(true, false);
  return true;
}
function supportPalmSurface(root, side) {
  root.updateWorldMatrix(true, true);
  const hand = root.getObjectByName(`${side}Hand`), point = new Vector3();
  const samples = [];
  if (!hand) return { offset: new Vector3(0, 0.035, 0), samples };
  const inverse = hand.matrixWorld.clone().invert(), best = new Vector3(0, 0.105, 0.02), pattern = new RegExp(`^${side}(?:Hand|Index|Middle|Ring|Pinky|Thumb)`);
  let highest = -Infinity;
  root.traverse((node) => {
    if (!(node instanceof SkinnedMesh) || node.name.startsWith("received-")) return;
    const indices = node.geometry.getAttribute("skinIndex"), weights = node.geometry.getAttribute("skinWeight"), position = node.geometry.getAttribute("position");
    if (!indices || !weights || !position) return;
    node.skeleton.update();
    const selected = [];
    for (let i = 0; i < position.count; i++) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (pattern.test(node.skeleton.bones[indices.getComponent(i, k)]?.name ?? "")) weight += weights.getComponent(i, k);
      if (weight < 0.6) continue;
      selected.push(i);
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
      if (Math.abs(point.x) > 0.026 || point.y < 0.085 || point.y > 0.125 || point.z < highest) continue;
      highest = point.z;
      best.copy(point);
    }
    if (selected.length) samples.push({ mesh: node, indices: selected });
  });
  return { offset: best, samples };
}
function installActorPerformance(actor, identity, resources, previewAnnotation) {
  const root = actor.group, head = root.getObjectByName("Head");
  if (!head) return { bytes: 0, dispose() {
  } };
  const annotation = previewAnnotation?.characterId === identity ? previewAnnotation : reviewedFaceAnnotation(identity);
  const mouth = createMouthPerformance(root, resources, annotation, !!previewAnnotation), eligible = !!mouth && EATERS.has(identity) && !!root.getObjectByName("LeftHand") && !!root.getObjectByName("RightHand");
  const state = { phase: "idle", time: 0, mouth: 0, speech: 0, eligible, mouthVertices: mouth?.vertices ?? 0 };
  root.userData.deliveryPerformance = state;
  const baseAnimate = actor.animate, baseCatch = actor.catchPose, up = new Vector3(), leftTarget = new Vector3(), rightTarget = new Vector3(), mouthTarget = new Vector3();
  const handPoint = new Vector3(), sliceTip = new Vector3(), sliceGrip = new Vector3();
  const restingSlice = new Quaternion(), biteSlice = new Quaternion().setFromEuler(new Euler(0.3, Math.PI, 0));
  const palmUpLocal = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), palmUpWorld = new Quaternion();
  const leftGripLocal = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0))), leftGripWorld = new Quaternion();
  const leftSupport = eligible ? supportPalmSurface(root, "Left") : { offset: new Vector3(0, 0.035, 0), samples: [] };
  const leftElbowPole = new Vector3(), rightElbowPole = new Vector3();
  const carton = new Group(), hinge = new Group(), slice = new Group();
  carton.name = "received-pizza-openable-carton";
  hinge.name = "received-carton-lid";
  slice.name = "received-pizza-slice";
  let fullPizza, remainingPizza;
  const cartonDrop = 0.47;
  let built = false, received = false, disposed = false, speech = 0, meal = 0, bookVisible = actor.book?.visible ?? true, cartonDepth = 0.43;
  const material = (key, color) => {
    const m = new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    resources.material(`delivery-meal-${identity}-${key}`, m);
    return m;
  };
  const addBox = (parent, w, h, d, x, y, z, m) => {
    const mesh = new Mesh(resources.geometry(new BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const build = () => {
    if (built) return;
    built = true;
    root.updateWorldMatrix(true, true);
    const reach = [];
    for (const side of ["Left", "Right"]) {
      const arm = root.getObjectByName(`${side}Arm`), fore = root.getObjectByName(`${side}ForeArm`), hand = root.getObjectByName(`${side}Hand`);
      if (!arm || !fore || !hand) continue;
      const a = arm.getWorldPosition(new Vector3()), b = fore.getWorldPosition(new Vector3()), c = hand.getWorldPosition(new Vector3());
      reach.push(new Sphere(a, a.distanceTo(b) + b.distanceTo(c) + 0.18));
    }
    root.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      if (!node.boundingSphere) node.computeBoundingSphere();
      else node.boundingSphere = node.boundingSphere.clone();
      const inverse = node.matrixWorld.clone().invert();
      for (const sphere of reach) node.boundingSphere.union(sphere.clone().applyMatrix4(inverse));
    });
    const card = material("card", "#DBBD88"), lid = material("lid", "#BB3D2E"), cheese = material("cheese", "#F1BC40"), crust = material("crust", "#C98232");
    addBox(carton, 0.32, 0.018, 0.32, 0, 0, 0, card);
    for (const x of [-0.154, 0.154]) addBox(carton, 0.012, 0.04, 0.32, x, 0.024, 0, card);
    for (const z of [-0.154, 0.154]) addBox(carton, 0.32, 0.04, 0.012, 0, 0.024, z, card);
    hinge.position.set(0, 0.025, -0.16);
    carton.add(hinge);
    addBox(hinge, 0.32, 0.012, 0.32, 0, 0.014, 0.16, lid);
    addBox(hinge, 0.15, 1e-3, 0.15, 0, 0.0205, 0.16, card);
    const pizzaMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    resources.material(`delivery-meal-${identity}-pizza-top`, pizzaMaterial);
    const makeRoundPizza = (cut) => {
      const sculpture = new CharacterSculpt(), length = cut ? Math.PI * 2 - 0.8 : Math.PI * 2, start = cut ? 0.4 : 0;
      const crustGeometry = new CylinderGeometry(0.168, 0.168, 0.014, 32, 1, false, start, length);
      crustGeometry.translate(0, 0.023, 0);
      sculpture.add(crustGeometry, "#BF762A");
      const cheeseGeometry = new CylinderGeometry(0.151, 0.151, 4e-3, 32, 1, false, start, length);
      cheeseGeometry.translate(0, 0.032, 0);
      sculpture.add(cheeseGeometry, "#EABD45");
      for (const [x, z] of [[-0.07, -0.06], [0.06, -0.07], [-0.09, 0.04], [0.08, 0.05], [0, -0.02]]) {
        const disc = new CylinderGeometry(0.018, 0.018, 2e-3, 10);
        disc.translate(x, 0.035, z);
        sculpture.add(disc, "#A73B27");
      }
      const mesh = new Mesh(resources.geometry(sculpture.finish()), pizzaMaterial);
      mesh.scale.setScalar(0.84);
      carton.add(mesh);
      return mesh;
    };
    fullPizza = makeRoundPizza(false);
    remainingPizza = makeRoundPizza(true);
    remainingPizza.visible = false;
    const shape = new Shape();
    shape.moveTo(-0.085, -0.085);
    shape.lineTo(0.085, -0.085);
    shape.lineTo(0, 0.13);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: 0.011, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    slice.add(new Mesh(resources.geometry(geometry), cheese));
    addBox(slice, 0.17, 0.019, 0.025, 0, 8e-3, -0.079, crust);
    slice.name = "received-pizza-slice";
    root.add(carton, slice);
    carton.visible = slice.visible = false;
  };
  const apply = () => {
    if (disposed) return;
    if (received && eligible) {
      const t = meal, opening = smooth((t - 0.45) / 0.9), lifting = smooth((t - 1.8) / 1.15), lowering = smooth((t - 4.4) / 1.05), lift = lifting * (1 - lowering);
      const sliceScale = (t > 3.65 ? 0.73 : 1) * 0.7;
      slice.quaternion.slerpQuaternions(restingSlice, biteSlice, lift);
      slice.scale.setScalar(sliceScale);
      sliceGrip.set(0, 8e-3, identity === "pushpa-raj" ? -0.039 : -0.079).applyQuaternion(slice.quaternion).multiplyScalar(sliceScale);
      head.getWorldPosition(up);
      root.worldToLocal(up);
      carton.position.set(0.105, up.y - cartonDrop, cartonDepth);
      hinge.rotation.x = -1.55 * opening;
      carton.visible = true;
      if (fullPizza) fullPizza.visible = t < 1.75;
      if (remainingPizza) remainingPizza.visible = t >= 1.75;
      root.updateWorldMatrix(true, true);
      root.getWorldQuaternion(palmUpWorld);
      palmUpWorld.multiply(palmUpLocal);
      root.getWorldQuaternion(leftGripWorld);
      leftGripWorld.multiply(leftGripLocal);
      leftElbowPole.set(1, 0, 0).transformDirection(root.matrixWorld);
      leftTarget.set(carton.position.x + 0.14, carton.position.y - 0.0115, cartonDepth - 0.14);
      root.localToWorld(leftTarget);
      solveHandTarget(root, "Left", leftTarget, 9, leftGripWorld, leftElbowPole, leftSupport.offset);
      const angle = hinge.rotation.x, release = smooth((t - 1.05) / 0.35), pick = smooth((t - 1.4) / 0.35);
      const gripY = carton.position.y + 0.025 + 0.014 * Math.cos(angle) - 0.12 * Math.sin(angle) - 0.03;
      const gripZ = cartonDepth - 0.16 + 0.014 * Math.sin(angle) + 0.12 * Math.cos(angle) + 0.015;
      rightTarget.set(-0.145 + pick * 0.035, MathUtils.lerp(gripY, carton.position.y + 0.06, release), MathUtils.lerp(gripZ, cartonDepth - 0.07, release));
      root.localToWorld(rightTarget);
      if (t >= 4.4) {
        rightTarget.set(-0.4, up.y - 0.45, 0.23);
        root.localToWorld(rightTarget);
      }
      if (mouth) {
        mouth.point.getWorldPosition(mouthTarget);
        root.worldToLocal(mouthTarget);
        mouthTarget.y -= 6e-3;
        mouthTarget.z += 0.022;
        sliceTip.set(0, 0, 0.13).applyQuaternion(slice.quaternion).multiplyScalar(sliceScale);
        mouthTarget.sub(sliceTip).add(sliceGrip);
        mouthTarget.y -= 0.035;
        root.localToWorld(mouthTarget);
        root.worldToLocal(rightTarget);
        root.worldToLocal(mouthTarget);
        const extraction = smooth((t - 1.8) / 0.4), around = smooth((t - 2.2) / 0.4), inward = smooth((t - 2.6) / 0.4);
        if (t < 4.4) {
          rightTarget.x = MathUtils.lerp(rightTarget.x, -0.205, extraction);
          rightTarget.y = MathUtils.lerp(rightTarget.y, mouthTarget.y, extraction);
          rightTarget.z = MathUtils.lerp(rightTarget.z, mouthTarget.z, around);
          rightTarget.x = MathUtils.lerp(rightTarget.x, mouthTarget.x, inward);
        } else {
          const outward = smooth((t - 4.4) / 0.3), forwards = smooth((t - 4.7) / 0.3), down = smooth((t - 5) / 0.4);
          rightTarget.set(MathUtils.lerp(mouthTarget.x, -0.4, outward), MathUtils.lerp(mouthTarget.y, up.y - 0.45, down), MathUtils.lerp(mouthTarget.z, 0.23, forwards));
        }
        root.localToWorld(rightTarget);
      }
      rightElbowPole.set(-1, 0, 0).transformDirection(root.matrixWorld);
      solveHandTarget(root, "Right", rightTarget, 9, palmUpWorld, rightElbowPole);
      root.updateWorldMatrix(true, true);
      const hand = root.getObjectByName("RightHand");
      slice.position.copy(root.worldToLocal(handPoint.set(0, 0.035, 0).applyMatrix4(hand.matrixWorld))).sub(sliceGrip);
      slice.position.y += 0.035;
      slice.visible = t > 1.75 && t < 5.5;
      state.phase = t < 0.45 ? "holding" : t < 1.4 ? "opening" : t < 3 ? "lifting" : t < 4.4 ? "eating" : t < 5.5 ? "lowering" : "enjoying";
      const chewing = t > 3.05 && t < 4.4 ? 0.25 + 0.55 * Math.abs(Math.sin((t - 3.05) * Math.PI * 4)) : 0;
      state.mouth = Math.max(speech, chewing);
    } else state.mouth = speech;
    mouth?.set(state.mouth);
    root.updateWorldMatrix(true, true);
  };
  actor.setSpeechEnvelope = (amount) => {
    state.speech = Number.isFinite(amount) ? clamp2(amount, 0, 1) : 0;
  };
  actor.receivePizza = () => {
    if (disposed || !eligible || received) return false;
    build();
    if (actor.book) {
      bookVisible = actor.book.visible;
      actor.book.visible = false;
    }
    cartonDepth = receivedCartonDepth(root, head, cartonDrop);
    received = true;
    meal = 0;
    state.phase = "holding";
    apply();
    const inverse = root.matrixWorld.clone().invert(), point = new Vector3();
    for (let pass = 0; pass < 3; pass++) {
      let top = -Infinity;
      for (const sample of leftSupport.samples) {
        sample.mesh.skeleton.update();
        for (const index of sample.indices) {
          sample.mesh.getVertexPosition(index, point).applyMatrix4(sample.mesh.matrixWorld).applyMatrix4(inverse);
          if (Math.abs(point.x - carton.position.x) < 0.159 && Math.abs(point.z - carton.position.z) < 0.159) top = Math.max(top, point.y);
        }
      }
      const correction = top - (carton.position.y - 0.0115);
      if (!Number.isFinite(correction) || correction < 1e-4) break;
      leftSupport.offset.z += Math.min(0.025, correction);
      apply();
    }
    return true;
  };
  actor.animate = (dt, mode, speed) => {
    if (disposed) return;
    const elapsed = step(dt);
    baseAnimate?.(elapsed, received && mode === "dance" ? "idle" : mode, speed);
    if (received) meal = Math.min(6, meal + elapsed);
    state.time = meal;
    speech += (state.speech - speech) * (1 - Math.exp(-elapsed * 25));
    if (Math.abs(speech) < 1e-5) speech = 0;
    apply();
  };
  actor.catchPose = (amount) => {
    baseCatch(amount);
    apply();
  };
  if (eligible) build();
  return { bytes: mouth?.bytes ?? 0, dispose() {
    if (disposed) return;
    disposed = true;
    mouth?.dispose();
    carton.removeFromParent();
    slice.removeFromParent();
    if (actor.book) actor.book.visible = bookVisible;
    delete root.userData.deliveryPerformance;
  } };
}

export {installActorPerformance,receivedCartonDepth};
