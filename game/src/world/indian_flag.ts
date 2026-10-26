import type { Kit } from './landmarks';

// Flag Code of India, Part I §1.1–1.3. Geometry is in the vertical cloth plane, not a horizontal cylinder.
// https://www.mha.gov.in/sites/default/files/flagcodeofindia_070214.pdf
export const INDIAN_FLAG = Object.freeze({ ratio: 3 / 2, spokes: 24, saffron: '#ff9933', white: '#ffffff', green: '#138808', navy: '#000080' });
export interface FlagFace { kind: 'rim' | 'spoke' | 'hub'; points: [number, number][] }
export function chakraFaces(radius: number): FlagFace[] {
  const faces: FlagFace[] = [], inner = radius * 0.9, hub = radius * 0.13, spokeHalf = radius * 0.022;
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
    faces.push({ kind: 'rim', points: [[Math.cos(a) * radius, Math.sin(a) * radius], [Math.cos(b) * radius, Math.sin(b) * radius], [Math.cos(b) * inner, Math.sin(b) * inner], [Math.cos(a) * inner, Math.sin(a) * inner]] });
  }
  for (let i = 0; i < INDIAN_FLAG.spokes; i++) {
    const a = i * Math.PI / 12, dx = Math.cos(a), dy = Math.sin(a), nx = -dy * spokeHalf, ny = dx * spokeHalf;
    faces.push({ kind: 'spoke', points: [[dx * hub + nx, dy * hub + ny], [dx * hub - nx, dy * hub - ny], [dx * inner - nx, dy * inner - ny], [dx * inner + nx, dy * inner + ny]] });
  }
  // One small polygonal hub; the remaining white field stays visible between all 24 spokes.
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
    faces.push({ kind: 'hub', points: [[0, 0], [Math.cos(a) * hub, Math.sin(a) * hub], [Math.cos(b) * hub, Math.sin(b) * hub], [0, 0]] });
  }
  return faces;
}
export function drawIndianFlag(K: Kit, hoistU: number, v: number, top: number, width: number) {
  const height = width / INDIAN_FLAG.ratio, stripe = height / 3, centreU = hoistU + width / 2, centreY = top - height / 2;
  for (const [i, c] of [INDIAN_FLAG.saffron, INDIAN_FLAG.white, INDIAN_FLAG.green].entries()) {
    K.box(centreU, v, top - (i + 1) * stripe, width, stripe, 0.3, c);
  }
  // Diameter close to the white band's width; slight separation on both faces prevents z-fighting.
  const wheel = chakraFaces(stripe * 0.45);
  for (const side of [-1, 1]) for (const face of wheel) {
    const vertices = face.points.map(([u, y]) => { const [x, z] = K.P(centreU + u, v + side * 0.16); return [x, K.y0 + centreY + y, z]; });
    // Each side has its own outward-facing winding; both remain visible with normal front-face culling.
    if (side > 0) vertices.reverse();
    K.k.B.st.quad(vertices[0], vertices[1], vertices[2], vertices[3], INDIAN_FLAG.navy);
  }
}
