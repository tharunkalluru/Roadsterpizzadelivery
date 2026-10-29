import type { Kit } from './landmarks';
import { TPL } from '../core/util';
import { chakraFaces } from './indian_flag';

export const JAGANNATH_HEIGHT = 72 * 0.3048;
export const NILA_CHAKRA_SPOKES = 8;

// The four back-to-back lions and circular abacus are described by the Government
// of India's State Emblem schedule. This is a small 3D rooftop sculpture, not a
// substitute for the official 2D emblem artwork. Relief animals and inscriptions
// are intentionally not replaced by invented lettering or arbitrary marks.
// https://tribal.nic.in/writereaddata/News/201902141107219843646State_emblem.pdf
export const LION_CAPITAL = Object.freeze({ lions: 4, wheelSpokes: 24, height: 4.6 });
export function drawLionCapital(K: Kit, u: number, v: number, y: number, height = LION_CAPITAL.height) {
  const s = height / 4.05, bronze = '#b4934a', light = '#c3a45b', shade = '#80692f';
  const C = (x: number, z: number, yy: number, r: number, h: number, col: string) => K.cyl(u+x*s,v+z*s,y+yy*s,r*s,h*s,col,'cyl24');
  C(0,0,0,1.58,.2,bronze); C(0,0,.2,1.5,.66,bronze); C(0,0,.86,1.62,.14,light);
  for (let lion = 0; lion < LION_CAPITAL.lions; lion++) {
    const a = lion * Math.PI / 2, sn = Math.sin(a), cs = Math.cos(a);
    const P = (side: number, out: number): [number,number] => [u+(side*cs+out*sn)*s,v+(-side*sn+out*cs)*s];
    const ellipsoid = (side: number, out: number, yy: number, rx: number, ry: number, rz: number, col = bronze) => {
      const [lu,lv] = P(side,out), [x,z] = K.P(lu,lv);
      K.k.B.st.add(rx>.3?TPL.sph:TPL.sphL,x,K.y0+y+yy*s,z,rx*s,ry*s,rz*s,col,{ry:K.ry0+a});
    };
    // Separate seated haunches, chest, mane and head retain a lion silhouette
    // from either side; the old recipe was four unarticulated gold boxes.
    ellipsoid(0,.42,1.65,.61,.74,.66); ellipsoid(0,.7,2.35,.51,.96,.53);
    for (const side of [-1,1]) {
      const [lu,lv] = P(side*.32,1.0); K.cyl(lu,lv,y+1.0*s,.15*s,1.32*s,light,'cyl8');
      ellipsoid(side*.32,1.14,1.1,.23,.12,.38,light);
    }
    ellipsoid(0,.73,3.2,.64,.83,.52,shade); ellipsoid(0,1.02,3.4,.48,.54,.43,light);
    // Curled mane border and ears, not a crown or a fifth animal.
    for (let i=0;i<12;i++) {const t=i*Math.PI/6;ellipsoid(Math.cos(t)*.5,.78,3.2+Math.sin(t)*.68,.13,.18,.14,bronze);}
    for (const side of [-1,1]) {ellipsoid(side*.39,.92,3.87,.15,.18,.12);ellipsoid(side*.21,1.36,3.5,.075,.05,.04,shade);}
    ellipsoid(0,1.4,3.2,.32,.17,.19,light); ellipsoid(0,1.52,3.35,.12,.07,.08,shade);
    ellipsoid(0,1.42,3.04,.21,.035,.08,shade);
    // The abacus wheel is vertical and faces outwards on each cardinal side.
    for (const face of chakraFaces(.24*s)) {
      const vertices = face.points.map(([dx,dy]) => {
        const [x,z]=K.P(u+(dx*cs+1.506*s*sn),v+(-dx*sn+1.506*s*cs));
        return [x,K.y0+y+.53*s+dy,z];
      });
      vertices.reverse(); K.k.B.st.quad(vertices[0],vertices[1],vertices[2],vertices[3],shade);
    }
  }
}

// The inspected Gowliguda photograph (Kuldeepburjbhalaike,2025-10-14) shows
// cloth hanging close to the mast. A rectangle flying broadside fabricated a
// visible design. Retain the observed cloth hue, model its folded silhouette and
// add the spearhead allowed by Sikh Rehat Maryada IV.III(r). The hidden Khanda
// print is not inferred from a fold. The contemporary local flag is not surveyed.
// https://commons.wikimedia.org/wiki/File:Central_Gurdwara_Saheb,_Hyderabad.jpg
// https://sgpc.net/wp-content/uploads/2025/06/Sikh-Rehat-Maryada-English-n.pdf
export function drawFurledNishanSahib(K: Kit, u: number, v: number, height: number) {
  const cloth='#dc9c32', metal='#a9a196';
  K.cyl(u,v,0,.11,height,metal,'cyl10');
  const bottom=height-3.1;
  // Tapered folded cloth hangs from a narrow tied hoist, with no fabricated
  // inscription/printed insignia visible through the cloth.
  const outline:[number,number,number][]=[[0,height-.55,.1],[.32,height-.8,.14],[.26,bottom+.8,.24],[.16,bottom,.12],[-.08,bottom+.3,-.07],[-.18,height-1.2,-.1]];
  const centre=[.08,(height+bottom)/2,.08];
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length];
    const world=(p:number[])=>{const[x,z]=K.P(u+p[0],v+p[2]);return[x,K.y0+p[1],z];};
    K.k.B.st.tri(world(centre),world(a),world(b),i%2?cloth:'#bd8129');
    K.k.B.st.tri(world(centre),world(b),world(a),i%2?cloth:'#bd8129');
  }
  K.cyl(u,v,height,.045,.55,metal,'cyl8');
  K.shape('cone',u,v,height+.55,.22,.68,.22,metal);
}
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
