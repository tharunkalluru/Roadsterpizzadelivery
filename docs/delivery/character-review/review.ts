/** Review-only page. Production actor geometry, never a release approval. */
import * as THREE from 'three';
import { createSceneCharacter, type CharacterStyle } from '../../../src/delivery/modules/character';

const data = {
  pushpa: { name: 'Allu Arjun / Pushpa Raj', image: 'allu-arjun.jpg', note: 'Pushpa 2 press-meet portrait; hairstyle/costume differs from a specific film scene.', film: 'https://www.youtube.com/watch?v=g3JUbgOHgdw', publisher: 'Mythri Movie Makers — official Pushpa 2 trailer' },
  trainHero: { name: 'Ram Charan / Ram', image: '/docs/delivery/character-review/evidence/ram-vvr-official-trailer-52s.jpg', note: 'Actual official Vinaya Vidheya Rama trailer, 0:52. Correct film face, hair and costume reference; not the precise train pose.', film: 'https://www.youtube.com/watch?v=aV5HMqRas5g&t=52s', publisher: 'DVV Entertainment — official Vinaya Vidheya Rama trailer' },
  simhadri: { name: 'Jr NTR / Devara', image: 'jr-ntr.jpg', note: 'Contemporary portrait. Existing candidate is SIMHADRI, the wrong role and costume for Devara.', film: 'https://www.youtube.com/watch?v=HNYA6bqL6bU', publisher: 'NTR Arts — official Devara release trailer' },
  gabbar: { name: 'Pawan Kalyan / Vakeel Saab', image: 'pawan-kalyan.jpg', note: 'Official public portrait. Existing candidate is GABBAR SINGH, the wrong role and costume for Vakeel Saab.', film: 'https://www.youtube.com/watch?v=P1xKV0Dmetg', publisher: 'Dil Raju — official Vakeel Saab trailer' },
  jersey: { name: 'Nani / Jersey', image: 'nani.png', note: 'Interview portrait; NOT Jersey costume or cricket-scene evidence.', film: 'https://www.youtube.com/watch?v=Rl6T0bM94Qs', publisher: 'Sithara Entertainments — official Jersey teaser; exact scene reference still required' },
};
const poses = [{ id: 'front', angle: 0 }, { id: 'three', angle: .6 }, { id: 'profile', angle: Math.PI / 2 }, { id: 'body', angle: .6 }, { id: 'catch', angle: .6 }];
const renderers = poses.map(p => new THREE.WebGLRenderer({ canvas: document.getElementById(p.id) as HTMLCanvasElement, antialias: true }));
for (const renderer of renderers) { renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; }
let ownedGeometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>(), catchAmount = 0;
function draw() {
  ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); ownedGeometries.clear(); ownedMaterials.clear();
  const style = (document.getElementById('actor') as HTMLSelectElement).value as keyof typeof data, d = data[style];
  document.getElementById('name')!.textContent = d.name;
  (document.getElementById('reference') as HTMLImageElement).src = d.image.startsWith('/') ? d.image : `/delivery/celebrities/${d.image}`;
  document.getElementById('reference-note')!.textContent = d.note;
  const film = document.getElementById('film')!; film.replaceChildren(); const link = document.createElement('a'); link.href = d.film; link.textContent = d.publisher; link.target = '_blank'; link.rel = 'noopener'; film.append(link);
  document.getElementById('sources')!.textContent = 'Portrait credit and license: /delivery/celebrities/credits.html. No numerical likeness score is asserted.';
  const counts: string[] = [];
  for (const [i, p] of poses.entries()) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#bdbbb3');
    const actor = createSceneCharacter(style as CharacterStyle, style === 'pushpa', { geometry: g => { ownedGeometries.add(g); return g; }, material: (_, m) => ownedMaterials.add(m) });
    actor.catchPose(p.id === 'catch' ? 1 : catchAmount); scene.add(actor.group);
    const actorHeight = new THREE.Box3().setFromObject(actor.group).max.y;
    const face = i < 3, camera = new THREE.PerspectiveCamera(face ? 25 : 32, 1, .02, 100), target = new THREE.Vector3(0, face ? actorHeight - .13 : actorHeight * .52, .025), distance = face ? .76 : 3.6;
    camera.position.set(Math.sin(p.angle) * distance, target.y + (face ? .02 : .1), Math.cos(p.angle) * distance); camera.lookAt(target);
    const canvas = renderers[i].domElement, width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight); renderers[i].setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); renderers[i].render(scene, camera);
    if (!i) { let triangles = 0, draws = 0; actor.group.traverse(n => { if (n instanceof THREE.Mesh) { draws++; triangles += (n.geometry.index?.count ?? n.geometry.getAttribute('position').count) / 3; } }); counts.push(`${triangles.toLocaleString()} triangles, ${draws} draws per actor`); }
  }
  document.getElementById('metrics')!.textContent = counts.join('');
}
document.getElementById('actor')!.addEventListener('change', draw);
document.getElementById('pose')!.addEventListener('click', () => { catchAmount = catchAmount ? 0 : 1; draw(); });
addEventListener('resize', draw); addEventListener('pagehide', () => { ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); renderers.forEach(r => r.dispose()); }); draw();
