import type { Building, Storefront, Vec2 } from './schema';
const signedArea=(p:Vec2[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;

export interface ProfileFacade {
  facade:[Vec2,Vec2];
  heading:number;
  storefrontIds:string[];
}

/** Match dated frontages to footprint edges; nearby roads and raw listing order never choose the face. */
export function profileFacades(building:Building,stores:Storefront[]|null):ProfileFacade[]{
  const reviewed=(stores??[]).filter(s=>s.placeId.startsWith('survey:')&&s.facade);
  const ring=building.footprint,sgn=signedArea(ring)>0?1:-1;
  const groups:{origin:Vec2;nx:number;nz:number;min:number;max:number;ids:Set<string>;score:number}[]=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    if(len<.8)continue;
    const nx=dz/len*sgn,nz=-dx/len*sgn;
    const matches=reviewed.filter(s=>{
      const [p,q]=s.facade!,sx=q[0]-p[0],sz=q[1]-p[1],sw=Math.hypot(sx,sz);
      const parallel=Math.abs((dx*sx+dz*sz)/(len*sw));
      const mid:[number,number]=[(p[0]+q[0])/2,(p[1]+q[1])/2];
      const distance=Math.abs((mid[0]-a[0])*nx+(mid[1]-a[1])*nz);
      const lo=Math.min((p[0]-a[0])*dx/len+(p[1]-a[1])*dz/len,(q[0]-a[0])*dx/len+(q[1]-a[1])*dz/len);
      const hi=Math.max((p[0]-a[0])*dx/len+(p[1]-a[1])*dz/len,(q[0]-a[0])*dx/len+(q[1]-a[1])*dz/len);
      return parallel>.98&&distance<1.5&&Math.min(len,hi)-Math.max(0,lo)>.5&&nx*-Math.sin(s.facingHeading)+nz*-Math.cos(s.facingHeading)>.5;
    });
    if(!matches.length)continue;
    let group=groups.find(g=>g.nx*nx+g.nz*nz>.995&&Math.abs((a[0]-g.origin[0])*g.nx+(a[1]-g.origin[1])*g.nz)<.65);
    if(!group){group={origin:a,nx,nz,min:0,max:0,ids:new Set(),score:0};groups.push(group);}
    for(const p of [a,b]){
      const u=(p[0]-group.origin[0])*group.nz-(p[1]-group.origin[1])*group.nx;
      group.min=Math.min(group.min,u);group.max=Math.max(group.max,u);
    }
    for(const sf of matches)group.ids.add(sf.id);
    group.score+=len;
  }
  return groups.sort((a,b)=>b.score-a.score).map(g=>({
    facade:[[g.origin[0]+g.nz*g.min,g.origin[1]-g.nx*g.min],[g.origin[0]+g.nz*g.max,g.origin[1]-g.nx*g.max]],
    heading:Math.atan2(-g.nx,-g.nz),storefrontIds:[...g.ids],
  }));
}
