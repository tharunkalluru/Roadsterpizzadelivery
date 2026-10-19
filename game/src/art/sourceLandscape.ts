/** Source land-use/water outlines. Surface elevation and colours are cartographic assumptions. */
import * as THREE from 'three';
import type { WorldCore } from '../world/schema';
import { landscapeOf, type LandscapeFeature } from '../world/landscape';
import { markTerrainMaterial } from './terrainCutouts';
const colour=(f:LandscapeFeature):string=>{
  if(f.kind==='water')return '#386d79';
  const kind=`${f.class} ${f.subtype}`;
  if(/park|garden|forest|wood|grass|recreation|cemetery|golf|nature/.test(kind))return '#6d7858';
  if(/construction|brownfield|quarry|landfill/.test(kind))return '#95816a';
  if(/industrial|commercial|retail/.test(kind))return '#8c8880';
  if(/pitch|sports|playground/.test(kind))return '#8a8063';
  return '#8b8976';
};
export function buildSourceLandscape(core:WorldCore):THREE.Group {
  const group=new THREE.Group();group.name='source-landscape';const data=landscapeOf(core);if(!data)return group;
  // One geometry per material, with holes retained, keeps the full-city layer inexpensive.
  const batches=new Map<string,number[]>();
  for(const f of data.features){
    const key=`${f.kind}:${colour(f)}`,positions=batches.get(key)??[];batches.set(key,positions);
    for(const p of f.parts){
      const contour=p.footprint.map(v=>new THREE.Vector2(...v)),holes=p.holes.map(r=>r.map(v=>new THREE.Vector2(...v)));
      const vertices=[...contour,...holes.flat()];const triangles=THREE.ShapeUtils.triangulateShape(contour,holes);
      const y=f.kind==='water'?-.075:-.105;
      for(const tri of triangles){const a=vertices[tri[0]],b=vertices[tri[1]],c=vertices[tri[2]];
        // +Y-facing triangles, independent of source exterior winding.
        const cross=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);const order=cross<0?tri:[tri[0],tri[2],tri[1]];
        for(const i of order)positions.push(vertices[i].x,y,vertices[i].y);
      }
    }
  }
  for(const[key,positions]of batches){if(!positions.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const material=markTerrainMaterial(new THREE.MeshStandardMaterial({color:key.split(':')[1],roughness:key.startsWith('water:')?.3:1,metalness:0}));
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.userData.sourceGeometry='source_derived';mesh.userData.elevationStatus='unknown';group.add(mesh);
  }
  group.userData.sourceSnapshot=data.sourceSnapshot;group.userData.featureCount=data.features.length;return group;
}
