import { TPL } from '../core/util';
import type { Kit } from './landmarks';
// L&T as-built press release25Sep2020:233.85m span,25.8m overall
// width,52stays,1.8m footpaths. Pylon head follows the designer's leaf/spear
// silhouette; decorative dimensions are stylised, not a fabrication drawing.
export const DURGAM_BRIDGE={mainSpan:233.85,deckLength:435,width:25.8,footpath:1.8,stayCount:52,upperPylon:28} as const;
export function drawDurgamBridge(K:Kit){
  const D = DURGAM_BRIDGE, half = D.mainSpan / 2;
  const centre = K.k.roadY(K.x0, K.z0) ?? 6.8;
  // The source carriageways sit either side of the median. Sample both lanes,
  // not only a median point which may have no road surface at all.
  const height = (v: number) => {
    const ys = [-6, 0, 6].map(u => K.k.roadY(...K.P(u, v))).filter((y): y is number => y !== null && Number.isFinite(y));
    return ys.length ? Math.max(...ys) : centre;
  };
  const point = (u: number, v: number, y: number): [number, number, number] => { const p = K.P(u, v); return [p[0], K.y0 + y, p[1]]; };
  const face = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], color: string) => {
    K.k.B.st.tri(a, b, c, color); K.k.B.st.tri(a, c, d, color);
  };
  const strip = (u: number, width: number, v0: number, v1: number, y0: number, y1: number, thickness: number, color: string) => {
    const a = point(u - width / 2, v0, y0), b = point(u + width / 2, v0, y0), c = point(u + width / 2, v1, y1), d = point(u - width / 2, v1, y1);
    const low = (p: [number, number, number]): [number, number, number] => [p[0], p[1] - thickness, p[2]], aa = low(a), bb = low(b), cc = low(c), dd = low(d);
    face(a, b, c, d, color); face(aa, dd, cc, bb, color);
    face(a, aa, bb, b, color); face(b, bb, cc, c, color); face(c, cc, dd, d, color); face(d, dd, aa, a, color);
  };
  // Continuous sloped prisms follow the inherited deck/approach road height.
  // Independent flat boxes previously left a raised slab or footpath step where
  // the mapped approach descended. No shoreline, road XY or absolute datum changes.
  const segments = Math.ceil(D.deckLength / 8);
  for (let i = 0; i < segments; i++) {
    const v0 = -D.deckLength / 2 + i * D.deckLength / segments, v1 = -D.deckLength / 2 + (i + 1) * D.deckLength / segments;
    const y0 = height(v0), y1 = height(v1);
    strip(0, D.width, v0, v1, y0 - .05, y1 - .05, 1.2, '#c4c5c1');
    for (const side of [-1, 1]) {
      strip(side * (D.width / 2 - D.footpath / 2), D.footpath, v0, v1, y0 + .28, y1 + .28, .22, '#d8d6cc');
      strip(side * (D.width / 2 - .12), .16, v0, v1, y0 + 1.18, y1 + 1.18, .9, '#daddd9');
      strip(side * .55, .24, v0, v1, y0 + .81, y1 + .81, .75, '#d6d6ce');
    }
  }
  for (const side of [-1, 1]) for (let v = -D.deckLength / 2 + 2; v < D.deckLength / 2; v += 5)
    K.box(side * (D.width / 2 - .14), v, height(v) + .28, .12, 1.1, .12, '#edf0ed');
  for(const pv of [-half,half]){
    const y = height(pv);
    // The real lower supports are not planted in the middle of the main span.
    K.box(0,pv,0,4.5,Math.max(.5,y-1),3.8,'#aeb4af');
    K.box(0,pv,y,3.2,D.upperPylon-6,3.8,'#e1e0d9');
    // Faceted pointed leaf, replacing the unrelated bulb/dome cap.
    const leaf=[[-1.5,0],[-2.2,2],[-2.15,5],[-1.2,8],[0,10],[1.2,8],[2.15,5],[2.2,2],[1.5,0]];
    for(const face of [-1,1])for(let i=0;i<leaf.length-1;i++){
      const a=K.P(leaf[i][0],pv+face*2),b=K.P(leaf[i+1][0],pv+face*2),c=K.P(0,pv+face*2.05),yy=y+D.upperPylon-10;
      if(face>0)K.k.B.st.tri([a[0],yy+leaf[i][1],a[1]],[c[0],yy+4,c[1]],[b[0],yy+leaf[i+1][1],b[1]],'#d8ce9a');
      else K.k.B.st.tri([a[0],yy+leaf[i][1],a[1]],[b[0],yy+leaf[i+1][1],b[1]],[c[0],yy+4,c[1]],'#d8ce9a');
    }
    K.ob(0,pv,2.4,y+D.upperPylon);
    for(const dir of [-1,1])for(let n=0;n<13;n++){
      const intoMain=dir*pv<0,reach=18+n*(intoMain?7.65:5.8),v=pv+dir*reach;
      const top=y+17+n*.52,end=height(v)+.6;
      const length=Math.hypot(reach,top-end),m=K.P(0,(pv+v)/2),rx=dir*Math.atan2(reach,top-end);
      K.k.B.st.add(TPL.box,m[0],(top+end)/2,m[1],.14,length,.14,'#e6e7dd',{ry:K.ry0,rx});
      // A thin illumination strip shares each actual cable; daytime structure
      // remains white rather than52pairs of detached glowing coloured bars.
      K.k.B.lit.add(TPL.box,m[0]+K.c*.08,(top+end)/2,m[1]+K.s*.08,.035,length,.035,n%3===0?'#f06a73':n%3===1?'#eeeeea':'#8abfdf',{ry:K.ry0,rx});
    }
  }
}
