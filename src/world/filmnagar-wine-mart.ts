import type {Kit} from './landmarks';
export const FILMNAGAR_WINE_MART={
 id:'q_tonique_filmnagar',name:'Q By Tonique · Filmnagar',
 // Official geographic address; front and interior dimensions are authored
 // approximations, not a surveyed shop outline or asserted current branding.
 officialSource:'https://tonique.in/contact-us/',
 officialCoordinate:{lat:17.4217777778,lon:78.4106666667},
 anchor:{lat:17.421717543655934,lon:78.41064506459823},
 rotation:199.0,sceneYaw:-.33154362,marker:{x:-9133.034,z:-1706.318,y:0},
 width:14,depth:10,
};
export function filmnagarWineClearAt(l:{id?:string;x?:number;z?:number},x:number,z:number):boolean|null{
 if(l.id!==FILMNAGAR_WINE_MART.id||l.x==null||l.z==null)return null;
 const r=FILMNAGAR_WINE_MART.rotation*Math.PI/180,dx=x-l.x,dz=z-l.z,u=dx*Math.cos(r)+dz*Math.sin(r),v=dx*Math.sin(r)-dz*Math.cos(r);
 return Math.abs(u)<7&&v< -2&&v> -12;
}
export function drawFilmnagarWineMart(K:Kit){
 const r=FILMNAGAR_WINE_MART.rotation*Math.PI/180;K.c=Math.cos(r);K.s=Math.sin(r);K.ry0=-r;
 const body='#302B2A',trim='#B9A17E';
 K.box(0,-7,4.5,14,.35,10,body);K.box(0,-12,0,14,4.5,.3,body);K.solidRect(0,-12,14,.3,4.5);
 for(const side of [-1,1]){K.box(side*7,-7,0,.3,4.5,10,body);K.solidRect(side*7,-7,.3,10,4.5);K.box(side*5,-2,0,4,4.5,.2,body);K.solidRect(side*5,-2,4,.2,4.5);}
 K.box(0,-2,3.7,6,.8,.25,body);K.box(0,-6,-.02,13.5,.04,10,'#B8ACA0');
 for(const side of [-1,1])K.box(side*3.15,-1.9,0,.12,3.7,.22,trim);
 K.board('Q BY TONIQUE',0,-1.75,4.3,11,.9,body,'#DBC39C');
 K.board('FILMNAGAR',4.9,-1.75,2.5,3,.38,body,'#E4DCD0');
 // This warm entry shell deliberately has no translucent glass blocking the
 // actor: stable phone rendering and a clear view into the bottle shelves.
}
