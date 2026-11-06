import plan from './osmania-university-plan.json';
// The published campus boundary controls only synthetic commercial dressing.
// Actual source businesses, roads, geometry and collision remain unchanged.
const kx=Math.cos(17.4063*Math.PI/180)*6380050.094*Math.PI/180,kz=6341141.9*Math.PI/180;
const ring=plan.campusOutlineLonLat.map(([lon,lat])=>[(lon-78.4966)*kx,-(lat-17.4063)*kz]);
const bounds=[Math.min(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[1]))];
const academic=new Map(plan.academicBuildings.map(b=>[b.buildingId,b]));
export function inOsmaniaCampus(x:number,z:number){
 if(x<bounds[0]||x>bounds[1]||z<bounds[2]||z>bounds[3])return false;
 let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;
}
export function osmaniaAcademicBuilding(id:string){return academic.get(id);}
