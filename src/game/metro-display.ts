import * as THREE from 'three';
import { metroLineColor } from '../world/metro-geometry';
import { metroMarqueeOffset, type MetroService } from '../world/metro-service';

interface Display { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; text: string; width: number; drawn: number }
// One texture per directed service is shared by every visible coach. Long
// names scroll at a readable rate; short names remain centred and motionless.
export class MetroTrainDisplays {
  private services = new Map<string, Display>();
  private seconds = 0;
  private plane = new THREE.PlaneGeometry(7.8, .42);
  private backing = new THREE.BoxGeometry(.035, .56, 8.1);
  private dark = new THREE.MeshBasicMaterial({ color: '#111920' });
  private doorway = new THREE.BoxGeometry(.025, 2.4, 1.4);
  private doorLeaf = new THREE.BoxGeometry(.03, 2.4, .7);
  private doorMetal = new THREE.MeshStandardMaterial({ color: '#bfc6cf', roughness: .5 });
  private get(service: MetroService) {
    const key = `${service.lineId}:${service.text}`;
    if (this.services.has(key)) return this.services.get(key)!;
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 112;
    const context = canvas.getContext('2d'); if (!context) return null;
    context.font = '700 64px monospace'; const text = service.text.toUpperCase(), width = context.measureText(text).width;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const result: Display = { canvas, context, texture, material, text, width, drawn: -1 };
    canvas.dataset.metroLine = service.lineId; this.services.set(key, result); this.draw(result, service.lineId); return result;
  }
  private draw(display: Display, lineId: string) {
    const g = display.context, w = display.canvas.width, h = display.canvas.height, viewport = w - 36;
    g.fillStyle = '#101820'; g.fillRect(0, 0, w, h);
    g.fillStyle = metroLineColor(lineId); g.fillRect(0, h - 10, w, 10);
    g.save(); g.beginPath(); g.rect(18, 0, viewport, h - 10); g.clip();
    g.font = '700 64px monospace'; g.textBaseline = 'middle'; g.fillStyle = '#ffcf55';
    const x = display.width <= viewport ? (w - display.width) / 2 : 18 - metroMarqueeOffset(display.width, viewport, this.seconds);
    g.fillText(display.text, x, 48); g.restore(); display.texture.needsUpdate = true; display.drawn = this.seconds;
  }
  assign(train: THREE.Group, service: MetroService | null) {
    train.userData.metroService = service;
    if (!service) return;
    const display = this.get(service); if (!display) return;
    for (const coach of train.children) {
      let panels = coach.userData.metroRoutePanels as THREE.Mesh[] | undefined;
      if (!panels) {
        panels = [];
        for (const side of [-1, 1]) {
          const backing = new THREE.Mesh(this.backing, this.dark); backing.position.set(side * 1.505, 3.2, 0); coach.add(backing);
          const panel = new THREE.Mesh(this.plane, display.material); panel.name = 'Directed metro service display';
          panel.position.set(side * 1.528, 3.2, 0); panel.rotation.y = side * Math.PI / 2; coach.add(panel); panels.push(panel);
        }
        coach.userData.metroRoutePanels = panels;
      }
      for (const panel of panels) panel.material = display.material;
    }
  }
  setDoors(train: THREE.Group, localSide: number | null, openness: number) {
    for (const coach of train.children) {
      const groups = (coach.userData.metroDoorGroups ||= new Map<number, THREE.Group>()) as Map<number, THREE.Group>;
      for (const group of groups.values()) group.visible = false;
      if (localSide === null) continue;
      let group = groups.get(localSide);
      if (!group) {
        group = new THREE.Group(); const leaves: THREE.Mesh[] = [];
        for (const z of [-6.5, 0, 6.5]) {
          const opening = new THREE.Mesh(this.doorway, this.dark); opening.position.set(localSide * 1.505, 1.7, z); group.add(opening);
          for (const side of [-1, 1]) { const leaf = new THREE.Mesh(this.doorLeaf, this.doorMetal); leaf.position.set(localSide * 1.525, 1.7, z + side * .35); leaf.userData.doorCentre = z; leaf.userData.doorSign = side; group.add(leaf); leaves.push(leaf); }
        }
        group.userData.leaves = leaves; groups.set(localSide, group); coach.add(group);
      }
      group.visible = true;
      for (const leaf of group.userData.leaves as THREE.Mesh[]) leaf.position.z = leaf.userData.doorCentre + leaf.userData.doorSign * (.35 + Math.max(0, Math.min(1, openness)) * .65);
    }
  }
  update(dt: number, visible: readonly MetroService[]) {
    this.seconds += Math.max(0, dt);
    for (const service of visible) {
      const display = this.get(service); if (!display) continue;
      if (display.width > display.canvas.width - 36 && this.seconds - display.drawn >= .08) this.draw(display, service.lineId);
    }
  }
}
