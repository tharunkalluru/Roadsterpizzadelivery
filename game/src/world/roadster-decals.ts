import * as THREE from 'three';

/** Static cutout vinyl: shared by both doors, with no transparent sorting. */
function sticker(text: string, rear = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = rear ? 96 : 174;
  const ctx = canvas.getContext('2d')!, h = canvas.height;
  ctx.beginPath(); ctx.moveTo(40, 5); ctx.lineTo(1018, 5);
  ctx.lineTo(984, h - 5); ctx.lineTo(6, h - 5); ctx.closePath();
  ctx.fillStyle = '#21172e'; ctx.fill();
  ctx.strokeStyle = '#fff1ce'; ctx.lineWidth = rear ? 6 : 8; ctx.stroke();
  // A gold leading slash and teal underline give the wordmark a racing-vinyl finish.
  ctx.fillStyle = '#ffbc28';
  ctx.beginPath(); ctx.moveTo(47, 12); ctx.lineTo(77, 12);
  ctx.lineTo(47, h - 13); ctx.lineTo(17, h - 13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#35e3cf'; ctx.fillRect(95, h - (rear ? 15 : 21), 844, rear ? 5 : 8);
  ctx.font = `italic 800 ${rear ? 74 : 132}px "Baloo 2", "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width;
  ctx.save(); ctx.translate(532, h * .48); ctx.scale(858 / Math.max(1, width), 1);
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#100d1b'; ctx.lineWidth = rear ? 3 : 5;
  ctx.strokeText(text, 0, 0); ctx.fillStyle = '#fff4d5'; ctx.fillText(text, 0, 0); ctx.restore();
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map, alphaTest: .4, transparent: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
}

export function roadsterDecals() {
  return { side: sticker('tfigames.com'), rear: sticker('pizzadeliveryboy', true) };
}
