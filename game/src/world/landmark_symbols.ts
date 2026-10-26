import type { Kit } from './landmarks';

export const JAGANNATH_HEIGHT = 72 * 0.3048;
export const NILA_CHAKRA_SPOKES = 8;
export function drawTemplePennant(K: Kit, u: number, v: number, top: number, width: number, height: number, color: string) {
  for (const side of [-1, 1]) {
    const p = [[u,top],[u,top-height],[u+width,top-height*.48],[u,top]].map(([x,y]) => { const [wx,wz]=K.P(x,v+side*.03); return [wx,K.y0+y,wz]; });
    if (side > 0) p.reverse();
    K.k.B.st.quad(p[0],p[1],p[2],p[3],color);
  }
}
// Temple-owner architecture reference identifies an eight-spoke Ashtadhatu Nilachakra. This is a separate
// temple finial, with bronze/aged-metal appearance from dated exterior photos, not the national flag's Chakra.
// https://www.shrijagannathtemplehyderabad.com/architecture-devalayams.html
export function drawNilaChakra(K: Kit, u: number, v: number, y: number, radius: number) {
  const col = '#76634b', inner = radius * 0.86, hub = radius * 0.15;
  const face = (p: [number, number][]) => {
    for (const side of [-1, 1]) {
      const vertices = p.map(([du, dy]) => { const [x, z] = K.P(u + du, v + side * 0.045); return [x, K.y0 + y + dy, z]; });
      if (side > 0) vertices.reverse();
      K.k.B.st.quad(vertices[0], vertices[1], vertices[2], vertices[3], col);
    }
  };
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, b = (i + 1) * Math.PI / 16;
    face([[Math.cos(a)*radius,Math.sin(a)*radius],[Math.cos(b)*radius,Math.sin(b)*radius],[Math.cos(b)*inner,Math.sin(b)*inner],[Math.cos(a)*inner,Math.sin(a)*inner]]);
  }
  for (let i = 0; i < NILA_CHAKRA_SPOKES; i++) {
    const a = i * Math.PI / 4, dx = Math.cos(a), dy = Math.sin(a), nx = -dy * radius * 0.045, ny = dx * radius * 0.045;
    face([[dx*hub+nx,dy*hub+ny],[dx*hub-nx,dy*hub-ny],[dx*inner-nx,dy*inner-ny],[dx*inner+nx,dy*inner+ny]]);
  }
  for (let i = 0; i < 16; i++) {
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
    face([[0,0],[Math.cos(a)*hub,Math.sin(a)*hub],[Math.cos(b)*hub,Math.sin(b)*hub],[0,0]]);
  }
}
