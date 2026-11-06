// Independent audit geometry: exact renderer Euler YXZ box volume versus a
// triangulated building's vertical prisms. No game clearance code is imported.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function rendererBox(x,y,z,w,h,length,{rx=0,ry=0,rz=0}={}){
  const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  const rotate=([u,v,t])=>{const a=u*cz-v*sz,b=u*sz+v*cz,c=b*cx-t*sx,d=b*sx+t*cx;return[cy*a+sy*d,c,-sy*a+cy*d];};
  const axes=[[1,0,0],[0,1,0],[0,0,1]].map(rotate), vertices=[];
  for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1]){const p=rotate([a*w/2,b*h/2,c*length/2]);vertices.push([x+p[0],y+p[1],z+p[2]]);}
  const points=vertices.map(p=>[p[0],p[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=list=>{const out=[];for(const p of list){while(out.length>=2&&turn(out.at(-2),out.at(-1),p)<=1e-10)out.pop();out.push(p);}return out;};
  const low=half(points),high=half(points.slice().reverse());low.pop();high.pop();
  return{vertices,axes,ring:[...low,...high],bottom:Math.min(...vertices.map(p=>p[1])),top:Math.max(...vertices.map(p=>p[1])),pitched:!!(rx||rz)};
}
export function prismIntersectsBox(triangle,bottom,top,box,epsilon=1e-5){
  const vertices=[...triangle.map(p=>[p[0],bottom,p[1]]),...triangle.map(p=>[p[0],top,p[1]])];
  const edges=triangle.map((p,i)=>{const q=triangle[(i+1)%3];return[q[0]-p[0],0,q[1]-p[1]];});edges.push([0,1,0]);
  const axes=[[0,1,0],...edges.slice(0,3).map(e=>[-e[2],0,e[0]]),...box.axes,...edges.flatMap(e=>box.axes.map(a=>cross(e,a)))];
  for(const a of axes){const len=Math.hypot(...a);if(len<1e-10)continue;const axis=a.map(v=>v/len),p=vertices.map(v=>dot(v,axis)),q=box.vertices.map(v=>dot(v,axis));
    if(Math.max(...p)<=Math.min(...q)+epsilon||Math.max(...q)<=Math.min(...p)+epsilon)return false;}
  return true;
}
