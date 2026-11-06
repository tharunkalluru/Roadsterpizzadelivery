import * as THREE from 'three';
import type { TileBuilt, Surface } from '../../src/world/city';
import type { Player } from '../../src/game/player';

export interface GeometryBounds { minX:number;maxX:number;minZ:number;maxZ:number }
interface Triangle {
  p:number[]; tile:string; index:number; minX:number;maxX:number;minZ:number;maxZ:number;
  ux:number;uz:number;vx:number;vz:number;gy:number;gz:number; lift:number|null; roadId:string|null;
}
function triangle(p:number[],tile:string,index:number):Triangle|null {
  const bx=p[3]-p[0],bz=p[5]-p[2],cx=p[6]-p[0],cz=p[8]-p[2],det=bx*cz-bz*cx;
  if(Math.abs(det)<1e-10)return null;
  return{p,tile,index,minX:Math.min(p[0],p[3],p[6]),maxX:Math.max(p[0],p[3],p[6]),minZ:Math.min(p[2],p[5],p[8]),maxZ:Math.max(p[2],p[5],p[8]),
    ux:cz/det,uz:-cx/det,vx:-bz/det,vz:bx/det,gy:((p[4]-p[1])*cz-(p[7]-p[1])*bz)/det,gz:(bx*(p[7]-p[1])-cx*(p[4]-p[1]))/det,lift:null,roadId:null};
}
function height(t:Triangle,x:number,z:number):number|null {
  if(x<t.minX-1e-5||x>t.maxX+1e-5||z<t.minZ-1e-5||z>t.maxZ+1e-5)return null;
  const dx=x-t.p[0],dz=z-t.p[2],u=dx*t.ux+dz*t.uz,v=dx*t.vx+dz*t.vz;
  return u>=-1e-5&&v>=-1e-5&&u+v<=1.00001?t.p[1]+t.gy*dx+t.gz*dz:null;
}
function surfaceHeight(s:Surface,x:number,z:number):number|null {
  if(!s.roadQuad)return null;
  const q=s.roadQuad;
  for(const ids of[[0,1,2],[0,2,3]]){const t=triangle(ids.flatMap(i=>q[i]),'',0);if(t){const y=height(t,x,z);if(y!==null)return y;}}
  return null;
}

/** Independent height/volume oracle over actual emitted Float32 buffers.
 * Support metadata supplies only the separately declared asphalt film lift;
 * road and soffit heights always come from emitted vertices. */
export class EmittedPlayerGeometry {
  readonly road=new Map<string,Triangle[]>();readonly solid=new Map<string,Triangle[]>();
  readonly counts={tiles:0,road:0,solid:0,missingLift:0};readonly cell=4;
  constructor(readonly bounds:GeometryBounds){}
  collect(tile:TileBuilt){
    this.counts.tiles++;
    for(const buffer of tile.buffers){
      if(buffer.mat!=='road'&&buffer.mat!=='st')continue;
      if(!(buffer.pos instanceof Float32Array))throw Error('Oracle requires actual emitted Float32 road/solid buffers');
      for(let n=0;n<buffer.pos.length;n+=9){
        const t=triangle(Array.from(buffer.pos.slice(n,n+9)),tile.key,n/9);if(!t)continue;
        if(t.maxX<this.bounds.minX||t.minX>this.bounds.maxX||t.maxZ<this.bounds.minZ||t.minZ>this.bounds.maxZ)continue;
        if(buffer.mat==='road'){
          const x=(t.p[0]+t.p[3]+t.p[6])/3,z=(t.p[2]+t.p[5]+t.p[8])/3,y=(t.p[1]+t.p[4]+t.p[7])/3;
          let error=.003;
          for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const s of tile.surfaceGrid.get(`${Math.floor(x/30)+i},${Math.floor(z/30)+j}`)||[]){
            if(s.kind!=='road')continue;const h=surfaceHeight(s,x,z);if(h===null)continue;
            const lift=s.paintLift??0,d=Math.abs(h+lift-y);if(d<error){error=d;t.lift=lift;t.roadId=s.e?.id??null;}
          }
          this.counts.road++;if(t.lift===null)this.counts.missingLift++;
        }else this.counts.solid++;
        const grid=buffer.mat==='road'?this.road:this.solid;
        const x0=Math.floor(Math.max(t.minX,this.bounds.minX)/this.cell),x1=Math.floor(Math.min(t.maxX,this.bounds.maxX)/this.cell),z0=Math.floor(Math.max(t.minZ,this.bounds.minZ)/this.cell),z1=Math.floor(Math.min(t.maxZ,this.bounds.maxZ)/this.cell);
        for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x},${z}`,list=grid.get(key)||[];list.push(t);grid.set(key,list);}
      }
    }
  }
  frame(x:number,z:number){
    const lowX=Math.floor((x-6)/this.cell),lowZ=Math.floor((z-6)/this.cell),nx=Math.floor((x+6)/this.cell)-lowX+1,nz=Math.floor((z+6)/this.cell)-lowZ+1;
    const roads:Triangle[][]=[],solids:Triangle[][]=[];
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){roads.push(this.road.get(`${lowX+i},${lowZ+j}`)||[]);solids.push(this.solid.get(`${lowX+i},${lowZ+j}`)||[]);}
    const at=(grid:Map<string,Triangle[]>,cache:Triangle[][],x:number,z:number)=>{const i=Math.floor(x/this.cell)-lowX,j=Math.floor(z/this.cell)-lowZ;return i>=0&&i<nx&&j>=0&&j<nz?cache[j*nx+i]:grid.get(`${Math.floor(x/this.cell)},${Math.floor(z/this.cell)}`)||[];};
    return{
      roadAt:(x:number,z:number)=>at(this.road,roads,x,z),solidAt:(x:number,z:number)=>at(this.solid,solids,x,z),
      nearestSupport:(x:number,z:number,feet:number)=>{
        let best:{y:number;asphalt:number;roadId:string|null}|null=null,error=1.6;
        for(const t of at(this.road,roads,x,z)){if(t.lift===null)continue;const y=height(t,x,z);if(y===null)continue;const support=y-t.lift,d=Math.abs(support-feet);if(d<error){error=d;best={y:support,asphalt:y,roadId:t.roadId};}}
        return best;
      },
    };
  }
}

function visible(object:THREE.Object3D){for(let p:THREE.Object3D|null=object;p;p=p.parent)if(!p.visible)return false;return true;}
export function actualPlayerContactProbe(player:Player,geometry:EmittedPlayerGeometry){
  const meshes:{mesh:THREE.Mesh;positions:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;label:string;tyre:number}[]=[];
  const tyres=player.wheelRollers.map((r,i)=>{const mesh=r.children[0];if(!(mesh instanceof THREE.Mesh)||mesh.geometry.type!=='CylinderGeometry')throw Error(`Missing real tyre ${i}`);return mesh;});
  player.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const positions=object.geometry.getAttribute('position');if(positions)meshes.push({mesh:object,positions,label:object.name||`mesh[${meshes.length}]`,tyre:tyres.indexOf(object)});});
  let measuredFrames=0,visibleVertices=0,slabFrames=0,wheelFramesOutside1cm=0,missingWheelFrames=0,slabVertexHits=0;
  let minBodySupport=Infinity,minTyreSupport=Infinity,maxWheelGap=0,minWheelGap=0;
  const witnesses:any[]=[],wheelWitnesses:any[]=[],point=new THREE.Vector3();
  const measure=(frame:number)=>{
    player.group.updateMatrixWorld(true);
    const local=geometry.frame(player.pos.x,player.pos.z),feet=player.pos.y-.55;
    let slab=false,badWheel=false,missingWheel=false;
    for(const {mesh,positions,label,tyre} of meshes){
      if(!visible(mesh))continue;const e=mesh.matrixWorld.elements;
      for(let i=0;i<positions.count;i++){
        const a=positions.getX(i),b=positions.getY(i),c=positions.getZ(i),x=e[0]*a+e[4]*b+e[8]*c+e[12],y=e[1]*a+e[5]*b+e[9]*c+e[13],z=e[2]*a+e[6]*b+e[10]*c+e[14];visibleVertices++;
        const supported=local.nearestSupport(x,z,feet);
        if(supported){const gap=y-supported.y;if(tyre>=0)minTyreSupport=Math.min(minTyreSupport,gap);else minBodySupport=Math.min(minBodySupport,gap);}
        // Retain the exact prior independent slab thresholds. The actual Player
        // transform replaces the old hand-built pitch/yaw/roll=0 matrix.
        for(const t of local.roadAt(x,z)){
          const top=height(t,x,z);if(top===null||top-feet<.45||y>=top-.02)continue;
          const bottom=local.solidAt(x,z).map(t=>height(t,x,z)).find(h=>h!==null&&top-h>.85&&top-h<1.05);
          if(bottom===undefined||bottom===null||y<=bottom+.02)continue;
          slab=true;slabVertexHits++;
          if(witnesses.length<5&&!witnesses.some(w=>w.frame===frame))witnesses.push({frame,mesh:label,point:[x,y,z],feet,top,bottom,penetrationAboveSoffit:y-bottom,tile:t.tile,roadId:t.roadId,triangle:t.p,playerMatrixWorld:player.group.matrixWorld.toArray()});
        }
      }
    }
    const wheels=player.wheels.map((wheel,index)=>{
      point.set(0,-.36,0).applyMatrix4(wheel.matrixWorld);const s=local.nearestSupport(point.x,point.z,feet);
      if(!s){missingWheel=true;return{index,point:point.toArray(),support:null};}
      const gap=point.y-s.y;minWheelGap=Math.min(minWheelGap,gap);maxWheelGap=Math.max(maxWheelGap,gap);if(Math.abs(gap)>.01)badWheel=true;
      return{index,point:point.toArray(),support:s.y,asphalt:s.asphalt,gap,roadId:s.roadId};
    });
    if(slab)slabFrames++;if(badWheel)wheelFramesOutside1cm++;if(missingWheel)missingWheelFrames++;
    if((badWheel||missingWheel)&&wheelWitnesses.length<4)wheelWitnesses.push({frame,wheels,playerMatrixWorld:player.group.matrixWorld.toArray()});
    measuredFrames++;
    return{slab,badWheel,missingWheel,wheels};
  };
  const result=()=>({measuredFrames,visibleVertexEvaluations:visibleVertices,slabFrames,slabVertexHits,wheelFramesOutside1cm,missingWheelFrames,
    minBodySupport:Number.isFinite(minBodySupport)?minBodySupport:null,minTyreSupport:Number.isFinite(minTyreSupport)?minTyreSupport:null,minWheelGap,maxWheelGap,witnesses,wheelWitnesses});
  return{measure,result};
}
