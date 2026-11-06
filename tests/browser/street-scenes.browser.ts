import * as THREE from 'three';
import { AngleParking, ClassroomHandoff, GateDelivery, RopeBucket, WalkingHandoff, WeddingHandoff } from '../../src/delivery/modules/street-scenes';
import type { DeliveryModule, DeliveryPlayer } from '../../src/delivery/modules/types';

const canvas = document.querySelector<HTMLCanvasElement>('#world')!, output = document.querySelector<HTMLOutputElement>('#status')!;
const stats = document.querySelector<HTMLOutputElement>('#stats')!, select = document.querySelector<HTMLSelectElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#A5B7C0');
const floorGeometry = new THREE.PlaneGeometry(340, 340), floorMaterial = new THREE.MeshBasicMaterial({ color: '#A39E8F' });
const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -.15; scene.add(floor);
const player: DeliveryPlayer = { x: 0, y: .6, z: 48, yaw: 0, speed: 0 };
const vehicleGeometry = new THREE.BoxGeometry(1.9, .85, 4.2), vehicleMaterial = new THREE.MeshBasicMaterial({ color: '#E7E9E5' });
const vehicle = new THREE.Mesh(vehicleGeometry, vehicleMaterial); scene.add(vehicle);
let module: DeliveryModule, lastEvent = '', angle = .27, elevation = .35, distance = 68, following = false;
const camera = new THREE.PerspectiveCamera(47, 1, .1, 800), look = new THREE.Vector3(0, 7, -12);
function reset() {
  module?.teardown(); lastEvent = ''; following = false;
  Object.assign(player, { x: 0, y: .6, z: 48, yaw: 0, speed: 0 });
  const constructors = { ropeBucket: RopeBucket, walkingHandoff: WalkingHandoff, weddingHandoff: WeddingHandoff,
    angleParking: AngleParking, classroomHandoff: ClassroomHandoff };
  const constructor = constructors[select.value as keyof typeof constructors] ?? GateDelivery; module = new constructor();
  module.setup({ scene, player: () => player, destination: { x: 0, y: 0, z: 0, label: select.selectedOptions[0].text },
    emit: (type, detail) => { lastEvent = `${type}${detail?.reason ? ': ' + detail.reason : ''}`; }, canInteract: () => true },
  { theme: select.value, villaNumber: 17 });
}
select.onchange = reset; document.querySelector<HTMLButtonElement>('#reset')!.onclick = reset;
document.querySelector<HTMLButtonElement>('#deliver')!.onclick = () => module.onDrop();
document.querySelector<HTMLButtonElement>('#approach')!.onclick = () => {
  Object.assign(player, { x: module.target.x, y: module.target.y + .6, z: module.target.z + 3, speed: 0, yaw: 0 });
  if (select.value === 'angleParking') { player.z = module.target.z; player.yaw = Math.PI / 4; }
  if (select.value === 'walkingHandoff') { player.x += 3; player.z = module.target.z; player.speed = 1.1; following = true; }
};
document.querySelector<HTMLButtonElement>('#front')!.onclick = () => { angle = .27; elevation = .35; distance = 68; };
document.querySelector<HTMLButtonElement>('#above')!.onclick = () => { angle = .1; elevation = 1.15; distance = 85; };
let drag: { x: number; y: number } | null = null;
canvas.onpointerdown = event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
canvas.onpointermove = event => {
  if (!drag) return; angle -= (event.clientX - drag.x) * .008;
  elevation = THREE.MathUtils.clamp(elevation + (event.clientY - drag.y) * .005, .1, 1.4); drag = { x: event.clientX, y: event.clientY };
};
canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
canvas.onwheel = event => { event.preventDefault(); distance = THREE.MathUtils.clamp(distance + event.deltaY * .04, 12, 150); };
const keys = new Set<string>();
window.onkeydown = event => { if (['Space', 'KeyE', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) event.preventDefault(); keys.add(event.code); if (event.code === 'KeyE' && !event.repeat) module.onDrop(); };
window.onkeyup = event => keys.delete(event.code); window.onblur = () => keys.clear();
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
window.addEventListener('resize', resize); resize(); reset(); let previous = performance.now();
function frame(now: number) {
  const dt = Math.min(.05, (now - previous) / 1000); previous = now;
  if (!document.hidden) {
    if (keys.has('KeyA')) player.yaw += dt; if (keys.has('KeyD')) player.yaw -= dt;
    if (keys.has('KeyW')) { player.speed = Math.min(10, player.speed + dt * 3); following = false; }
    if (keys.has('KeyS')) { player.speed = Math.max(-5, player.speed - dt * 3); following = false; }
    if (keys.has('Space')) { player.speed *= Math.max(0, 1 - dt * 8); following = false; }
    player.x -= Math.sin(player.yaw) * player.speed * dt; player.z -= Math.cos(player.yaw) * player.speed * dt;
    module.update(dt);
    if (following) { player.x = module.target.x + 3; player.z = module.target.z; }
    vehicle.position.set(player.x, player.y, player.z); vehicle.rotation.y = player.yaw;
    camera.position.set(Math.sin(angle) * Math.cos(elevation) * distance, look.y + Math.sin(elevation) * distance,
      look.z + Math.cos(angle) * Math.cos(elevation) * distance); camera.lookAt(look); renderer.render(scene, camera);
    output.textContent = `${module.status.instruction}\nAction: ${module.status.actionLabel}${module.status.canDrop ? ' — ready' : ' — waiting'}\n${lastEvent}`;
    stats.textContent = `${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles\n${renderer.info.memory.geometries} geometry buffers`;
    document.documentElement.dataset.sceneStatus = JSON.stringify({ instruction: module.status.instruction, canDrop: module.status.canDrop, event: lastEvent, draws: renderer.info.render.calls });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { module.teardown(); vehicleGeometry.dispose(); vehicleMaterial.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose(); });
