// Actual rendered upward faces, not footprint/bounding-box roofs. The30m grid is
// streamed with its owning tile. A triangle keeps its source landmark for audits.
export type LandmarkVertex = [number, number, number];
export interface LandmarkSurface { id: string; a: LandmarkVertex; b: LandmarkVertex; c: LandmarkVertex }
export type LandmarkSurfaceGrid = Map<string, LandmarkSurface[]>;
export const LANDMARK_SURFACE_CELL = 30;
// Exclude undersides and near-vertical faces; slopes steeper than78.5deg cannot
// support wheels. Physics may impose its own driving/traction slope limit.
export const MIN_LANDMARK_NORMAL_Y = .2;

export function landmarkTriangleHeight(t: LandmarkSurface, x: number, z: number): number | null {
  const {a,b,c}=t, den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
  if (Math.abs(den)<1e-8) return null;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den;
  const v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den, w=1-u-v;
  if(u < -1e-7 || v < -1e-7 || w < -1e-7) return null;
  return u*a[1]+v*b[1]+w*c[1];
}
export function addLandmarkSurface(grid: LandmarkSurfaceGrid, t: LandmarkSurface) {
  const ab=t.b.map((v,i)=>v-t.a[i]), ac=t.c.map((v,i)=>v-t.a[i]);
  const nx=ab[1]*ac[2]-ab[2]*ac[1], ny=ab[2]*ac[0]-ab[0]*ac[2], nz=ab[0]*ac[1]-ab[1]*ac[0];
  if(ny/Math.hypot(nx,ny,nz)<MIN_LANDMARK_NORMAL_Y || !Number.isFinite(ny) || Math.abs(ny)<.02) return;
  const minX=Math.floor(Math.min(t.a[0],t.b[0],t.c[0])/30), maxX=Math.floor(Math.max(t.a[0],t.b[0],t.c[0])/30);
  const minZ=Math.floor(Math.min(t.a[2],t.b[2],t.c[2])/30), maxZ=Math.floor(Math.max(t.a[2],t.b[2],t.c[2])/30);
  for(let i=minX;i<=maxX;i++) for(let j=minZ;j<=maxZ;j++) {const key=`${i},${j}`;let bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(t);}
}
export function landmarkHeightAt(grid: LandmarkSurfaceGrid | undefined, x: number, z: number, maxY=Infinity): number | null {
  let best:number|null=null;
  for(const t of grid?.get(`${Math.floor(x/30)},${Math.floor(z/30)}`)||[]) {const y=landmarkTriangleHeight(t,x,z);if(y!==null&&y<=maxY+1e-6&&(best===null||y>best))best=y;}
  return best;
}
export function landmarkRoofUnder(grid: LandmarkSurfaceGrid | undefined, x: number, z: number): number {return Math.max(0,landmarkHeightAt(grid,x,z)??0);}
