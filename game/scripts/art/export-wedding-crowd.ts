import {mkdirSync,writeFileSync} from 'node:fs';
import * as THREE from 'three';
import {WeddingCrowd} from '../../src/delivery/art/wedding-crowd';
const out=process.argv[2]??'/tmp/roadster-wedding-crowd-production';mkdirSync(out,{recursive:true});
const crowd=new WeddingCrowd();crowd.update(12);const matrix=new THREE.Matrix4();
for(const view of ['wedding-people','wedding-profiles','wedding-procession']){
 const objects=[];
 const add=(g:THREE.BufferGeometry,name:string)=>{objects.push({name,position:Array.from(g.getAttribute('position').array),normal:Array.from(g.getAttribute('normal').array),color:Array.from(g.getAttribute('color').array)});g.dispose();};
 if(view==='wedding-procession')for(let i=0;i<crowd.count;i++){const mesh=crowd.meshes[i%4],g=mesh.geometry.clone();g.applyMatrix4(crowd.getMatrixAt(i,matrix));add(g,`guest-${i}`);}
 else for(const [i,mesh] of crowd.meshes.entries()){const g=mesh.geometry.clone();if(view==='wedding-profiles')g.rotateY(Math.PI/2);g.translate((i-1.5)*1.35,0,0);add(g,mesh.name);}
 writeFileSync(`${out}/${view}.json`,JSON.stringify({view,objects,width:view==='wedding-procession'?22:6.1,height:view==='wedding-procession'?12:3.1,targetY:1.0,targetZ:view==='wedding-procession'?-13.5:0,camera:view==='wedding-procession'?[18,12,-30]:undefined,roughness:.82,metalness:0}));
}
crowd.dispose();console.log(out);
