import type { TileBuilt,Surface } from '../../src/world/city';
import type { TriangleRecord } from './road-release-finite';
export const emittedTriangleKey=(p:number[][])=>p.map(p=>p.map(Math.fround).join(',')).sort().join('|');
export function matchEmittedRoadTriangles(tile:TileBuilt){
  const byVertices=new Map<string,Surface[]>(),surfaces=new Set([...tile.surfaceGrid.values()].flat());
  for(const s of surfaces){if(s.kind!=='road'||!s.roadQuad||!s.e)continue;const q=s.roadQuad,lift=s.paintLift??0;
    for(const indices of[[0,1,2],[0,2,3]]){const key=emittedTriangleKey(indices.map(i=>[q[i][0],q[i][1]+lift,q[i][2]]));(byVertices.get(key)??byVertices.set(key,[]).get(key)!).push(s);}
  }
  const matched:{points:TriangleRecord['points'];surface:Surface;triangulatedPatch:boolean}[]=[],unmatched:{tile:string;points:number[][]}[]=[];
  let roadTriangles=0;
  for(const b of tile.buffers){if(b.mat!=='road')continue;if(!(b.pos instanceof Float32Array))throw Error('Actual Float32 city emission is required');
    for(let at=0;at<b.pos.length;at+=9){const p=[Array.from(b.pos.slice(at,at+3)),Array.from(b.pos.slice(at+3,at+6)),Array.from(b.pos.slice(at+6,at+9))] as TriangleRecord['points'];
      const area=(p[1][0]-p[0][0])*(p[2][2]-p[0][2])-(p[1][2]-p[0][2])*(p[2][0]-p[0][0]);if(Math.abs(area)<1e-8)continue;roadTriangles++;
      const entries=byVertices.get(emittedTriangleKey(p));if(!entries?.length){unmatched.push({tile:tile.key,points:p});continue;}
      for(const surface of new Set(entries)){const q=surface.roadQuad!;matched.push({points:p,surface,triangulatedPatch:q[2][0]===q[3][0]&&q[2][2]===q[3][2]});}
    }
  }
  return{matched,unmatched,roadTriangles};
}
