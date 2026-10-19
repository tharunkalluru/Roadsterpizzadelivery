import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Quality } from './api';
import { addBox, boxMatrix, GeoBuilder, hex } from './geo';

export type ObservedStock = 'medicines' | 'cement_bags' | 'appliances' | 'framed_art' | 'hardware_goods' | 'luggage_goods';
export interface StockFrame {
  widthM:number; baseY:number; topY:number; insetM:number; yaw:number;
  at(u:number,n:number):[number,number];
}
const sack = new RoundedBoxGeometry(1,1,1,1,.15);
const bucket = new THREE.CylinderGeometry(.5,.45,1,12);

/** Original shallow stock models; used only by an explicitly observed display record. */
export function appendObservedStock(kind:ObservedStock,side:'left'|'right'|'both'|undefined,f:StockFrame,quality:Quality,body:GeoBuilder,lit:GeoBuilder):{kind:ObservedStock;pieces:number} {
  const box=(builder:GeoBuilder,w:number,h:number,d:number,u:number,y:number,n:number,color:number)=>{
    const[x,z]=f.at(u,n);addBox(builder,w,h,d,boxMatrix(x,y,z,f.yaw),1,hex(color));
  };
  const width=Math.max(.2,f.widthM),height=Math.max(.2,f.topY-f.baseY),sides=side==='left'?[-1]:side==='right'?[1]:[-1,1];
  let pieces=0;
  if(kind==='medicines'){
    // A few subdued product hints leave the glazed bay predominant. This is an
    // original abstraction, not a reconstructed shelf/interior arrangement.
    const span=Math.min(.62,width*.23),cw=Math.min(.11,span*.21),ch=Math.min(.15,height*.12),rows=height>.7?2:1;
    for(const edge of sides)for(let row=0;row<rows;row++){
      const u=edge*width*.3,y=f.baseY+Math.min(.22,height*.2)+row*Math.min(.23,height*.18);
      box(body,span,.018,.055,u,y,f.insetM+.078,0x536c64);
      for(let column=0;column<3;column++){
        box(lit,cw,ch,.035,u+(column-1)*span*.29,y+ch/2+.012,f.insetM+.08,[0x809689,0x8797a0,0x9c9c83][(column+row)%3]);pieces++;
      }
    }
  }else if(kind==='cement_bags'){
    const w=Math.min(.74,width*.36),h=.18,d=.34,rows=Math.max(1,Math.min(10,Math.floor((height-.18)/h)));
    for(const edge of sides)for(let row=0;row<rows;row++){
      const u=edge*(width/2-w/2-.04)+(row%2?.012:-.012),y=f.baseY+h/2+row*h,n=f.insetM+.20;
      const[x,z]=f.at(u,n),matrix=boxMatrix(x,y,z,f.yaw+(row%2?.025:-.025));matrix.scale(new THREE.Vector3(w,h*.96,d));
      body.appendGeometry(sack,matrix,hex([0xc9c8b3,0xb7c3b5,0xd4cebb][row%3]));
      // Small folded end seams identify a soft woven sack, without copied packaging or logos.
      if(quality!=='low')for(const end of [-1,1])box(body,.012,h*.45,d*.78,u+end*w*.45,y,n,0x929984);
      pieces++;
    }
  }else if(kind==='appliances'){
    const n=Math.max(1,Math.min(3,Math.floor(width/.75))),span=Math.min(width-.12,n*.72);
    for(let i=0;i<n;i++){
      const u=(i-(n-1)/2)*span/n,w=Math.min(.59,span/n*.84),h=Math.min(height-.1,i%2===0?.87:1.5),cy=f.baseY+h/2;
      box(body,w,h,.28,u,cy,f.insetM+.2,i%2===0?0xd9ddd6:0xb6bdb8);
      box(lit,w*.83,.09,.012,u,f.baseY+h-.12,f.insetM+.35,0x455453);
      if(i%2===0){
        const ring=new THREE.TorusGeometry(w*.27,.027,quality==='low'?4:6,quality==='low'?12:18),[x,z]=f.at(u,f.insetM+.365);
        body.appendGeometry(ring,boxMatrix(x,f.baseY+h*.44,z,f.yaw),hex(0x4b5b5d));ring.dispose();
        box(lit,w*.34,w*.34,.01,u,f.baseY+h*.44,f.insetM+.36,0x203034);
      }else box(body,.025,h*.35,.03,u+w*.3,f.baseY+h*.63,f.insetM+.36,0x677875);
      pieces++;
    }
  }else if(kind==='hardware_goods'){
    // Plain pails and a small ladder reproduce visible stock types, not a branded interior.
    const w=Math.min(.4,width*.27),h=Math.min(.35,height*.22),count=Math.max(1,Math.min(4,Math.floor(width/.58)));
    const span=Math.min(width-.12,count*.54);
    for(let i=0;i<count;i++)for(let row=0;row<(i%2?2:1);row++){
      const u=(i-(count-1)/2)*span/count,y=f.baseY+(row+.5)*h,n=f.insetM+.19,[x,z]=f.at(u,n);
      const matrix=boxMatrix(x,y,z,f.yaw);matrix.scale(new THREE.Vector3(w,h,.29));
      body.appendGeometry(bucket,matrix,hex(0xd9d7c5));
      box(lit,w*.82,.07,.012,u,y,f.insetM+.338,[0x738e80,0xb6a266,0x758ca1][i%3]);
      box(body,w*.86,.025,.29,u,y+h*.48,n,0x9eaaa2);pieces++;
    }
    const lh=Math.min(1.85,height-.08),lw=Math.min(.36,width*.22),u=width/2-lw/2-.04;
    for(const edge of [-1,1])box(body,.025,lh,.045,u+edge*(lw-.025)/2,f.baseY+lh/2,f.insetM+.12,0xa4aca2);
    for(let y=.22;y<lh-.05;y+=.27)box(body,lw,.025,.045,u,f.baseY+y,f.insetM+.12,0xa4aca2);
    pieces++;
  }else if(kind==='luggage_goods'){
    // Independently modelled bags: muted fabric, front pockets and handles, with no copied labels.
    const count=Math.max(1,Math.min(5,Math.floor(width/.62))),span=Math.min(width-.12,count*.59),w=Math.min(.48,span/count*.85);
    for(let i=0;i<count;i++){
      const u=(i-(count-1)/2)*span/count,h=Math.min(height-.14,.62+(i%3)*.11),y=f.baseY+h/2,n=f.insetM+.18,[x,z]=f.at(u,n);
      const matrix=boxMatrix(x,y,z,f.yaw);matrix.scale(new THREE.Vector3(w,h,.27));
      body.appendGeometry(sack,matrix,hex([0x496477,0x80705f,0x934f49,0x596c56][i%4]));
      box(lit,w*.7,h*.32,.055,u,f.baseY+h*.3,f.insetM+.326,0x354744);
      for(const edge of [-1,1])box(body,.025,.07,.025,u+edge*w*.15,f.baseY+h+.025,n,0x343f3e);
      box(body,w*.32,.025,.025,u,f.baseY+h+.05,n,0x343f3e);pieces++;
    }
  }else{
    const n=Math.max(1,Math.min(4,Math.floor(width/.65))),span=Math.min(width-.1,n*.7),w=Math.min(.6,span/n*.85),h=Math.min(1.12,height-.18),y=f.baseY+h/2+.08;
    for(let i=0;i<n;i++){
      const u=(i-(n-1)/2)*span/n,c=i%2?0x796341:0xb29a56;
      box(lit,w,h,.035,u,y,f.insetM+.13,0x384b45);
      for(const edge of [-1,1]){
        box(body,w,.045,.05,u,y+edge*(h-.045)/2,f.insetM+.16,c);
        box(body,.045,h,.05,u+edge*(w-.045)/2,y,f.insetM+.16,c);
      }
      // Independent abstract insets, not replicas of the photographed religious artwork.
      box(lit,w*.40,h*.46,.012,u,y,f.insetM+.155,i%2?0xb6a16e:0x8a7157);
      pieces++;
    }
  }
  return{kind,pieces};
}
