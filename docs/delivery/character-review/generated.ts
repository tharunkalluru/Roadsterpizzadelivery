import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const views = [{ id: 'front', angle: 0 }, { id: 'three', angle: .6 }, { id: 'profile', angle: Math.PI / 2 }, { id: 'body', angle: .35 }, { id: 'back', angle: Math.PI }];
const renderers = views.map(view => new THREE.WebGLRenderer({ canvas: document.getElementById(view.id) as HTMLCanvasElement, antialias: true }));
for (const r of renderers) { r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.4; }
const params = new URLSearchParams(location.search), secondPass = params.has('second'), headPass = params.has('head');
const source = await new GLTFLoader().loadAsync(`./candidates/pushpa-trellis-${headPass ? 'portrait-head' : secondPass ? 'second-pass' : 'first-pass'}.glb`);
if (secondPass) { document.querySelector('h1')!.textContent = 'Pushpa — corrected high-detail TRELLIS candidate'; (document.querySelector('aside img') as HTMLImageElement).src = './candidate-inputs/pushpa-promotional-poster-large.jpg'; }
if (headPass) {
  document.querySelector('h1')!.textContent = 'Allu Arjun / Pushpa — portrait-based head/bust candidate';
  document.querySelector('header .warn')!.textContent = 'UNAPPROVED. Generated from the unaltered credited Allu Arjun portrait. This is a head/bust art candidate, not a complete reader, rig or released character.';
  const aside = document.querySelector('aside')!; aside.replaceChildren();
  const portrait = document.createElement('img'); portrait.src = '/delivery/celebrities/allu-arjun.jpg'; portrait.alt = 'Credited Allu Arjun press portrait used without cropping'; aside.append(portrait);
  const note = document.createElement('p'); note.textContent = 'Supplementary identity input: Allu Arjun Pushpa 2 press-meet portrait; credits are in public/delivery/celebrities/credits.json. Exact seated-reader costume remains unverified.'; aside.append(note);
  const film = document.createElement('img'); film.src = './evidence/pushpa-official-profile-139s.jpg'; film.alt = 'Actual Pushpa 2 official Mythri trailer frame at 2:19, film profile reference'; aside.append(film);
  const link = document.createElement('a'); link.href = 'https://www.youtube.com/watch?v=g3JUbgOHgdw&t=139s'; link.textContent = 'Correct-film profile: verified Mythri trailer, observed at 2:19'; aside.append(link);
}
let triangles = 0; source.scene.traverse(node => { if (node instanceof THREE.Mesh) triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3; });
const raw = new THREE.Box3().setFromObject(source.scene).getSize(new THREE.Vector3());
if (raw.z > raw.y * 1.3) source.scene.rotation.x = -Math.PI / 2;
const box = new THREE.Box3().setFromObject(source.scene), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
const scale = 1.85 / size.y; source.scene.scale.multiplyScalar(scale); source.scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
const unlitMaterials: THREE.Material[] = [];
const materialMap = new Map<THREE.BufferGeometry, { original: THREE.MeshStandardMaterial; unlit: THREE.MeshBasicMaterial }>();
source.scene.traverse(node => { if (node instanceof THREE.Mesh) { const original = node.material as THREE.MeshStandardMaterial; const unlit = new THREE.MeshBasicMaterial({ map: original.map, color: original.color, side: original.side }); unlitMaterials.push(unlit); materialMap.set(node.geometry, { original, unlit }); } });
let rotation = 0, flat = true;
function draw() {
  for (const [i, v] of views.entries()) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#bdbbb3');
    const clone = source.scene.clone(true); clone.traverse(node => { if (node instanceof THREE.Mesh) node.material = flat ? materialMap.get(node.geometry)!.unlit : materialMap.get(node.geometry)!.original; });
    const root = new THREE.Group(); root.add(clone); root.rotation.y = rotation; scene.add(root);
    scene.add(new THREE.HemisphereLight('#ffffff', '#a59b8b', flat ? 3.5 : 2.6)); const sun = new THREE.DirectionalLight('#fff5e8', flat ? .3 : 2.2); sun.position.set(2, 4, 3); scene.add(sun);
    const face = i < 3, camera = new THREE.PerspectiveCamera(face ? 27 : 32, 1, .01, 100), target = new THREE.Vector3(0, face ? headPass ? 1.42 : 1.65 : .95, 0), distance = face ? headPass ? 2 : 1.1 : 3.8;
    camera.position.set(Math.sin(v.angle) * distance, target.y + (face ? 0 : .1), Math.cos(v.angle) * distance); camera.lookAt(target);
    const canvas = renderers[i].domElement, w = canvas.clientWidth, h = canvas.clientHeight; renderers[i].setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderers[i].render(scene, camera);
  }
  document.getElementById('status')!.textContent = `${triangles.toLocaleString()} triangles · 1 material · ${headPass ? 'portrait head/bust' : secondPass ? '3.56 MB' : '1.31 MB'} · 0 skins · 0 animations · candidate rotation ${rotation ? '180°' : '0°'} · ${flat ? 'unlit source texture inspection' : 'original PBR: omitted metallicFactor defaults to metal'}`;
}
document.getElementById('rotate')!.addEventListener('click', () => { rotation = rotation ? 0 : Math.PI; draw(); });
document.getElementById('light')!.addEventListener('click', () => { flat = !flat; draw(); });
addEventListener('resize', draw); addEventListener('pagehide', () => { source.scene.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); const mats = Array.isArray(node.material) ? node.material : [node.material]; for (const mat of mats) { for (const value of Object.values(mat)) if (value instanceof THREE.Texture) value.dispose(); mat.dispose(); } } }); unlitMaterials.forEach(m => m.dispose()); renderers.forEach(r => r.dispose()); }); draw();
