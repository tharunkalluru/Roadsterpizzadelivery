import { TPL } from '../core/util';
import type { Kit } from './landmarks';
// L&T as-built press release25Sep2020:233.85m span,25.8m overall
// width,52stays,1.8m footpaths. Pylon head follows the designer's leaf/spear
// silhouette; decorative dimensions are stylised, not a fabrication drawing.
export const DURGAM_BRIDGE={mainSpan:233.85,deckLength:435,width:25.8,footpath:1.8,stayCount:52,upperPylon:28} as const;
export function drawDurgamBridge(K:Kit){
  const D=DURGAM_BRIDGE,half=D.mainSpan/2,deck=K.k.roadY(K.x0,K.z0)??6.8;
  // A continuous box-girder deck below existing mapped carriageway paint.
  K.box(0,0,deck-1.25,D.width,1.20,D.deckLength,'#c4c5c1');
  for(const side of [-1,1]){
    K.box(side*(D.width/2-D.footpath/2),0,deck+.06,D.footpath,.22,D.deckLength,'#d8d6cc');
    K.box(side*(D.width/2-.12),0,deck+.28,.16,.9,D.deckLength,'#daddd9');
    for(let v=-D.deckLength/2+2;v<D.deckLength/2;v+=5)K.box(side*(D.width/2-.14),v,deck+.28,.12,1.1,.12,'#edf0ed');
    K.box(side*.55,0,deck+.06,.24,.75,D.deckLength,'#d6d6ce');
  }
  for(const pv of [-half,half]){
    const p=K.P(0,pv),y=K.k.roadY(...p)??deck;
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
      const top=y+17+n*.52,end=(K.k.roadY(...K.P(0,v))??deck)+.6;
      const length=Math.hypot(reach,top-end),m=K.P(0,(pv+v)/2),rx=dir*Math.atan2(reach,top-end);
      K.k.B.st.add(TPL.box,m[0],(top+end)/2,m[1],.14,length,.14,'#e6e7dd',{ry:K.ry0,rx});
      // A thin illumination strip shares each actual cable; daytime structure
      // remains white rather than52pairs of detached glowing coloured bars.
      K.k.B.lit.add(TPL.box,m[0]+K.c*.08,(top+end)/2,m[1]+K.s*.08,.035,length,.035,n%3===0?'#f06a73':n%3===1?'#eeeeea':'#8abfdf',{ry:K.ry0,rx});
    }
  }
}
