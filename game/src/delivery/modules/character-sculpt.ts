import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Small authored surfaces merged into a single opaque, vertex-lit actor draw.
 * Lighting is baked at setup; city night lighting does not erase faces and no
 * per-character lights, textures, transparent layers or animation uploads run. */
export class CharacterSculpt {
  private parts: THREE.BufferGeometry[] = [];
  private light = new THREE.Vector3(-.38,.7,.6).normalize();
  add(geometry:THREE.BufferGeometry,color:string,contrast=1) {
    const c=new THREE.Color(color),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),authored=geometry.getAttribute('color');
    const colors=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++) {
      const key=Math.max(0,normal.getX(i)*this.light.x+normal.getY(i)*this.light.y+normal.getZ(i)*this.light.z);
      const fill=.64+.36*key;
      // Subtle deterministic surface variation, not a noisy texture or runtime effect.
      const grain=1+.012*Math.sin(position.getX(i)*173+position.getY(i)*97+position.getZ(i)*131);
      const value=Math.max(.35,Math.min(1.08,1+(fill*grain-1)*contrast));
      colors[i*3]=(authored?authored.getX(i):c.r)*value;colors[i*3+1]=(authored?authored.getY(i):c.g)*value;colors[i*3+2]=(authored?authored.getZ(i):c.b)*value;
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');this.parts.push(geometry);
  }
  orb(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:string,segments=12,rings=8) {
    this.add(new THREE.SphereGeometry(1,segments,rings).scale(rx,ry,rz).translate(x,y,z),color);
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string) {
    this.add(new THREE.BoxGeometry(w,h,d).translate(x,y,z),color);
  }
  limb(a:readonly number[],b:readonly number[],ra:number,rb:number,color:string,segments=10,depth=1) {
    const from=new THREE.Vector3(...a as [number,number,number]),to=new THREE.Vector3(...b as [number,number,number]),direction=to.clone().sub(from);
    const geometry=new THREE.CylinderGeometry(rb,ra,direction.length(),segments,2).scale(1,1,depth);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    geometry.translate((from.x+to.x)/2,(from.y+to.y)/2,(from.z+to.z)/2);this.add(geometry,color);
  }
  curve(points:number[][],radius:number,color:string,steps=8,sides=5) {
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])));
    this.add(new THREE.TubeGeometry(path,steps,radius,sides,false),color);
  }
  lock(points:number[][],radius:number,color:string,steps=10) {
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),g=new THREE.TubeGeometry(path,steps,radius,6,false),p=g.getAttribute('position'),center=new THREE.Vector3();
    for(let i=0;i<=steps;i++){
      const t=i/steps,scale=.12+.88*Math.sin(t*Math.PI)**.45;path.getPointAt(t,center);
      for(let j=0;j<=6;j++){const n=i*7+j;p.setXYZ(n,center.x+(p.getX(n)-center.x)*scale,center.y+(p.getY(n)-center.y)*scale,center.z+(p.getZ(n)-center.z)*scale);}
    }
    g.computeVertexNormals();this.add(g,color);
  }
  /** Elliptical rings give a continuous jaw, neck, torso or trouser silhouette. */
  rings(rows:readonly (readonly [number,number,number,number])[],color:string,segments=18) {
    const positions:number[]=[],indices:number[]=[];
    for(const[y,rx,rz,z]of rows)for(let j=0;j<=segments;j++){
      const angle=j/segments*Math.PI*2;positions.push(Math.sin(angle)*rx,y,Math.cos(angle)*rz+z);
    }
    for(let i=1;i<rows.length;i++)for(let j=0;j<segments;j++){
      const a=(i-1)*(segments+1)+j,b=i*(segments+1)+j;indices.push(a,a+1,b,a+1,b+1,b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();this.add(g,color);
  }
  append(other:CharacterSculpt,matrix?:THREE.Matrix4){
    for(const geometry of other.parts){if(matrix)geometry.applyMatrix4(matrix);this.parts.push(geometry);}
    other.parts=[];
  }
  finish():THREE.BufferGeometry {
    const indexed=this.parts.every(g=>g.index);
    const prepared=indexed?this.parts:this.parts.map(g=>g.index?g.toNonIndexed():g);
    const merged=mergeGeometries(prepared,false)!;
    prepared.forEach((g,i)=>{if(g!==this.parts[i])g.dispose();});this.parts.forEach(g=>g.dispose());this.parts=[];
    merged.computeBoundingBox();merged.computeBoundingSphere();return merged;
  }
}
