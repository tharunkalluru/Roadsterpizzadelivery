import * as THREE from 'three';
import { Batch,toTpl,type Tpl } from '../core/util';

const cache=new Map<string,Tpl>();

/** One pressed, shallow auto legshield. The centre lower cut clears the front
 * wheel/fender; joined returned sides leave the driver's feet behind it. */
export function rickshawCowl(b:Batch,paint:string){
  const front=(x:number)=>-1.205-.04*(1-(x/.55)**2);
  const point=(u:number,v:number)=>{const bottom=.31+.30*(1-Math.abs(u))**.6,x=u*(.52+.05*Math.sin(v*Math.PI));return [x,bottom+(1.225-bottom)*v,front(x)];};
  for(let j=0;j<12;j++)for(let i=0;i<24;i++){
    const a=point(-1+2*i/24,j/12),c=point(-1+2*i/24,(j+1)/12),d=point(-1+2*(i+1)/24,(j+1)/12),e=point(-1+2*(i+1)/24,j/12);
    b.quad(a,c,d,e,paint);b.quad(e.map((v,k)=>k===2?v+.035:v),d.map((v,k)=>k===2?v+.035:v),c.map((v,k)=>k===2?v+.035:v),a.map((v,k)=>k===2?v+.035:v),paint);
  }
  for(const side of [-1,1])for(let j=0;j<12;j++){
    const a=point(side,j/12),c=point(side,(j+1)/12),d=[c[0],c[1],-.73],e=[a[0],a[1],-.73];
    if(side>0)b.quad(a,c,d,e,paint);else b.quad(e,d,c,a,paint);
  }
  // The mask conforms to the same pressed surface, instead of a flat plate
  // floating ahead of two exaggerated separate cowl pods.
  for(let i=0;i<24;i++){
    const x=-.50+i/24,x1=-.50+(i+1)/24,z=(x:number)=>front(x)-.004;
    b.quad([x,.93,z(x)],[x,1.18,z(x)],[x1,1.18,z(x1)],[x1,.93,z(x1)],'#17161b');
    const a=point(-1+2*i/24,1),c=point(-1+2*(i+1)/24,1);
    b.quad(a,[a[0],1.225,-1.18],[c[0],1.225,-1.18],c,paint);
  }
}
export function ellipticalLoft(rings:readonly (readonly [number,number,number,number])[],sides=16):Tpl{
  const key=`loft:${sides}:${JSON.stringify(rings)}`;let t=cache.get(key);if(t)return t;
  const p:number[]=[],ix:number[]=[];
  for(let j=0;j<rings.length;j++){
    const [y,w,d,z]=rings[j];for(let i=0;i<=sides;i++){const a=i/sides*Math.PI*2;p.push(Math.sin(a)*w,y,Math.cos(a)*d+z);if(j&&i){const a=(j-1)*(sides+1)+i-1,b=j*(sides+1)+i-1;ix.push(a,a+1,b,a+1,b+1,b);}}
  }
  for(let i=1;i<sides-1;i++){ix.push(0,i+1,i);const n=(rings.length-1)*(sides+1);ix.push(n,n+i,n+i+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();t=toTpl(g);g.dispose();cache.set(key,t);return t;
}
export function cycleMudguard(b:Batch,z:number,y:number,radius:number,width:number,paint:string){
  for(let i=0;i<18;i++){
    const a=.15+Math.PI*.90*i/18,c=.15+Math.PI*.90*(i+1)/18;
    const p=(s:number,t:number)=>[s*width/2,y+Math.sin(t)*radius,z+Math.cos(t)*radius];
    b.quad(p(-1,a),p(1,a),p(1,c),p(-1,c),paint);
    for(const s of [-1,1]){const q=(t:number,d:number)=>[s*width/2,y+Math.sin(t)*(radius-d),z+Math.cos(t)*(radius-d)];
      if(s>0)b.quad(q(a,.025),q(c,.025),q(c,0),q(a,0),paint);else b.quad(q(a,0),q(c,0),q(c,.025),q(a,.025),paint);}
  }
}
/** A formed sheet with thickness, rather than disconnected cylindrical bars. */
export function facePanel(b:Batch,outline:readonly number[][],z:number,depth:number,color:string){
  const key=JSON.stringify([outline,z,depth]);let template=cache.get(key);
  if(!template){const shape=new THREE.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:5});geo.translate(0,0,z-depth/2);template=toTpl(geo);geo.dispose();cache.set(key,template);}
  b.add(template,0,0,0,1,1,1,color);
}

/** Side sheet metal with a finite semicircular tyre opening. Optional door
 * intervals split the actual sheet; a painted rectangle cannot erase a door. */
export function archedSide(b:Batch,side:number,x:number,z0:number,z1:number,bottom:number,top:number,axles:readonly number[],wheelY:number,radius:number,color:string){
  const steps=Math.max(1,Math.ceil((z1-z0)/.07));
  const low=(z:number)=>{let h=bottom;for(const a of axles){const dz=z-a;if(Math.abs(dz)<radius)h=Math.max(h,wheelY+Math.sqrt(Math.max(0,radius*radius-dz*dz)));}return Math.min(top-.015,h);};
  for(let i=0;i<steps;i++){
    const a=z0+(z1-z0)*i/steps,c=z0+(z1-z0)*(i+1)/steps;
    const p=[[x,low(a),a],[x,top,a],[x,top,c],[x,low(c),c]];
    if(side>0)b.quad(p[0],p[1],p[2],p[3],color);else b.quad(p[3],p[2],p[1],p[0],color);
    // A shallow return closes the cut fender lip against the interior.
    const inner=x-side*.065;
    const q=[[x,low(a),a],[x,low(c),c],[inner,low(c),c],[inner,low(a),a]];
    if(side>0)b.quad(q[0],q[1],q[2],q[3],color);else b.quad(q[3],q[2],q[1],q[0],color);
  }
}
export function archLip(b:Batch,side:number,x:number,z:number,wheelY:number,radius:number,width:number,color:string){
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI,c=(i+1)/24*Math.PI;
    const p=[[x,wheelY+Math.sin(a)*radius,z+Math.cos(a)*radius],[x,wheelY+Math.sin(c)*radius,z+Math.cos(c)*radius],
      [x+side*.008,wheelY+Math.sin(c)*(radius+width),z+Math.cos(c)*(radius+width)],[x+side*.008,wheelY+Math.sin(a)*(radius+width),z+Math.cos(a)*(radius+width)]];
    if(side>0)b.quad(p[0],p[1],p[2],p[3],color);else b.quad(p[3],p[2],p[1],p[0],color);
  }
}

export function formedCabFrame(body:Batch,glazing:Batch,side:number,halfWidth:number,front:number,rear:number,belt:number,top:number,paint:string){
  const outer=new THREE.Shape();outer.moveTo(front+.02,belt-.065);outer.lineTo(front+.14,top-.16);outer.quadraticCurveTo(front+.18,top-.035,front+.32,top-.025);outer.lineTo(rear-.10,top-.025);outer.quadraticCurveTo(rear-.035,top-.025,rear-.035,top-.10);outer.lineTo(rear-.035,belt-.065);outer.closePath();
  const aperture=new THREE.Path();aperture.moveTo(front+.15,belt+.07);aperture.lineTo(front+.25,top-.17);aperture.quadraticCurveTo(front+.27,top-.12,front+.35,top-.12);aperture.lineTo(rear-.15,top-.12);aperture.lineTo(rear-.15,belt+.07);aperture.closePath();outer.holes.push(aperture);
  const xAt=(y:number)=>halfWidth-.035*Math.max(0,Math.min(1,(y-belt)/(top-belt)));
  const sheet=new THREE.ExtrudeGeometry(outer,{depth:.04,bevelEnabled:false,curveSegments:6}),p=sheet.getAttribute('position');for(let i=0;i<p.count;i++){const z=p.getX(i),y=p.getY(i),d=p.getZ(i);p.setXYZ(i,side*(xAt(y)-d),y,z);}
  const indices=Array.from({length:p.count},(_,i)=>i);if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];sheet.setIndex(indices);sheet.computeVertexNormals();body.add(toTpl(sheet),0,0,0,1,1,1,paint);sheet.dispose();
  const window=new THREE.ShapeGeometry(new THREE.Shape(aperture.getPoints(8))),w=window.getAttribute('position');for(let i=0;i<w.count;i++){const z=w.getX(i),y=w.getY(i);w.setXYZ(i,side*(xAt(y)-.012),y,z);}window.computeVertexNormals();glazing.add(toTpl(window),0,0,0,1,1,1,'#fff');window.dispose();
}

interface Canopy {width:number;height:number;belt:number;front:number;rear:number;roofFront:number;roofRear:number;suv:boolean;sedan:boolean}
/** Curved roof shell, formed A/C pillars and rounded window apertures are a
 * continuous assembly. Each paint/rubber/glass part joins an existing batch. */
export function carCanopy(body:Batch,glazing:Batch,c:Canopy,paint:string){
  const W=c.width,belt=c.belt,roof=c.height-(c.suv?.10:.055),rf=c.roofFront,rr=c.roofRear;
  const outer=new THREE.Shape();outer.moveTo(c.front-.065,belt-.10);
  outer.quadraticCurveTo(c.front+.02,belt+.15,rf-.10,roof-.055);outer.quadraticCurveTo(rf-.035,roof+.012,rf+.14,roof+.016);
  outer.quadraticCurveTo((rf+rr)/2,roof+.05,rr-.08,roof+.012);outer.quadraticCurveTo(rr+.06,roof+.005,rr+.15,roof-.09);
  outer.quadraticCurveTo(c.rear-.02,belt+.09,c.rear+.065,belt-.10);outer.lineTo(c.front-.065,belt-.10);outer.closePath();
  const frontWindow=new THREE.Path();frontWindow.moveTo(c.front+.13,belt+.065);frontWindow.quadraticCurveTo(c.front+.14,belt+.14,rf+.025,roof-.085);frontWindow.quadraticCurveTo(rf+.10,roof-.045,rf+.2,roof-.045);frontWindow.lineTo(.035,roof-.04);frontWindow.lineTo(.035,belt+.065);frontWindow.closePath();
  const rearWindow=new THREE.Path();rearWindow.moveTo(.13,belt+.065);rearWindow.lineTo(.13,roof-.04);rearWindow.lineTo(rr-.15,roof-.06);rearWindow.quadraticCurveTo(rr-.03,roof-.07,rr+.04,roof-.15);rearWindow.lineTo(c.rear-(c.suv?.20:c.sedan?.23:.17),belt+.075);rearWindow.closePath();
  outer.holes.push(frontWindow,rearWindow);
  const windowPoints=[frontWindow.getPoints(8),rearWindow.getPoints(8)];
  const xAt=(y:number)=>W*(.47-.11*Math.max(0,Math.min(1,(y-belt)/(roof-belt))));
  for(const side of [-1,1]){
    const geometry=new THREE.ExtrudeGeometry(outer,{depth:.035,bevelEnabled:false,curveSegments:8}),positions=geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){const z=positions.getX(i),y=positions.getY(i),depth=positions.getZ(i);positions.setXYZ(i,side*(xAt(y)+depth),y,z);}
    const ix=Array.from({length:positions.count},(_,i)=>i);if(side>0)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];geometry.setIndex(ix);geometry.computeVertexNormals();const template=toTpl(geometry);body.add(template,0,0,0,1,1,1,paint);geometry.dispose();
    for(const points of windowPoints){
      const shape=new THREE.Shape(points),window=new THREE.ShapeGeometry(shape,8),p=window.getAttribute('position');
      for(let i=0;i<p.count;i++){const z=p.getX(i),y=p.getY(i);p.setXYZ(i,side*(xAt(y)+.006),y,z);}window.computeVertexNormals();glazing.add(toTpl(window),0,0,0,1,1,1,'#fff');window.dispose();
      // Flush rubber reveal follows the opening; no exposed pillar end caps.
      const center=points.reduce((a,p)=>a.add(p),new THREE.Vector2()).multiplyScalar(1/points.length);
      for(let i=0;i<points.length-1;i++){
        const a=points[i],d=points[i+1],inner=(p:THREE.Vector2)=>p.clone().sub(center).multiplyScalar(.967).add(center);
        const ai=inner(a),di=inner(d),v=(p:THREE.Vector2)=>[side*(xAt(p.y)+.038),p.y,p.x];
        if(side>0)body.quad(v(a),v(d),v(di),v(ai),'#20292e');else body.quad(v(ai),v(di),v(d),v(a),'#20292e');
      }
    }
  }
  // Smooth crown with a real underside and returned side edges.
  const p:number[]=[],ix:number[]=[],uSteps=12,zSteps=12;
  for(let j=0;j<=zSteps;j++)for(let i=0;i<=uSteps;i++){
    const u=-1+2*i/uSteps,t=j/zSteps,z=rf-.045+(rr-rf+.11)*t,w=W*(.36+.008*Math.sin(t*Math.PI));
    p.push(u*w,roof-.006+.022*Math.sin(t*Math.PI)+.035*(1-u*u),z);
    if(i&&j){const a=(j-1)*(uSteps+1)+i-1,d=j*(uSteps+1)+i-1;ix.push(a,d,a+1,a+1,d,d+1);}
  }
  const skin=new THREE.BufferGeometry();skin.setAttribute('position',new THREE.Float32BufferAttribute(p,3));skin.setIndex(ix);skin.computeVertexNormals();body.add(toTpl(skin),0,0,0,1,1,1,paint);
  const underside=skin.clone();underside.translate(0,-.045,0);const ui=underside.index!;for(let i=0;i<ui.count;i+=3){const a=ui.getX(i+1);ui.setX(i+1,ui.getX(i+2));ui.setX(i+2,a);}underside.computeVertexNormals();body.add(toTpl(underside),0,0,0,1,1,1,'#33383b');skin.dispose();underside.dispose();
  for(const rear of [false,true]){
    const bottom=rear?c.rear:c.front,top=rear?rr+.065:rf-.045;
    for(let j=0;j<8;j++)for(let i=0;i<12;i++){
      const point=(u:number,v:number)=>[u*W*(.405+(.36-.405)*v),belt+(roof-.006-belt)*v+.035*(1-u*u)*v,bottom+(top-bottom)*v-(rear?-1:1)*.035*Math.sin(v*Math.PI)*(1-u*u)];
      glazing.quad(point(-1+2*i/12,j/8),point(-1+2*(i+1)/12,j/8),point(-1+2*(i+1)/12,(j+1)/8),point(-1+2*i/12,(j+1)/8),'#fff');
    }
  }
}
