/** Pure shelf packing shared by the sign renderer and crowded-atlas regression checks. */
export interface SignAtlasCell { wm:number;hm:number;px:number;py:number;pw:number;ph:number;page?:number;priority?:boolean;minimumDensity?:number }
/** Small photographed boards need proportionate borders, not a fixed 24 cm inset. */
export function signTextArea(widthM:number,heightM:number):{widthM:number;heightM:number}{
  return {widthM:widthM-2*Math.min(.17,widthM*.1),heightM:heightM-2*Math.min(.12,heightM*.12)};
}
/** A minimum raster height must not inflate horizontal margins on a short board. */
export function signCellPadding(cell:SignAtlasCell):number{
  return .12*Math.min(cell.pw/cell.wm,cell.ph/cell.hm);
}
export function packSignAtlas(cells:SignAtlasCell[],density:number,size:number):number {
  const padding=5;
  for(const cell of cells){
    const localDensity=cell.priority?Math.max(density,cell.minimumDensity??64):density;
    cell.pw=Math.max(16,Math.min(size-2*padding,Math.ceil(cell.wm*localDensity)));
    cell.ph=Math.max(16,Math.min(size-2*padding,Math.ceil(cell.hm*localDensity)));
  }
  const order=cells.slice().sort((a,b)=>Number(!!b.priority)-Number(!!a.priority)||b.ph-a.ph);
  let x=padding,y=padding,rowHeight=0;
  for(const cell of order){
    if(x+cell.pw+padding>size){x=padding;y+=rowHeight+padding;rowHeight=0;}
    if(y+cell.ph+padding>size)return -1;
    cell.px=x;cell.py=y;x+=cell.pw+padding;rowHeight=Math.max(rowHeight,cell.ph);
  }
  return y+rowHeight+padding;
}

/** Never publish a failed packing: overflow would sample another shop's text.
 * Grow crowded chunks, then use additional pages at the same readable density. */
export function layoutSignAtlasPages(cells:SignAtlasCell[],density:number,initialSize:number,maxSize=2048):{size:number;pages:number}{
  let size=initialSize;
  const widest=cells.reduce((n,c)=>Math.max(n,c.priority?Math.max(c.wm,c.hm)*(c.minimumDensity??64)+10:0),0);
  while(size<Math.min(widest,maxSize))size*=2;
  while(packSignAtlas(cells,density,size)<0&&size<maxSize)size=Math.min(maxSize,size*2);
  // packSignAtlas has now sized every cell. Repack every cell, including overflow,
  // into explicit pages; no stale/default coordinates can survive a failed attempt.
  const order=cells.slice().sort((a,b)=>Number(!!b.priority)-Number(!!a.priority)||b.ph-a.ph);
  const padding=5;let x=padding,y=padding,rowHeight=0,page=0;
  for(const cell of order){
    if(x+cell.pw+padding>size){x=padding;y+=rowHeight+padding;rowHeight=0;}
    if(y+cell.ph+padding>size){page++;x=padding;y=padding;rowHeight=0;}
    cell.page=page;cell.px=x;cell.py=y;x+=cell.pw+padding;rowHeight=Math.max(rowHeight,cell.ph);
  }
  return {size,pages:cells.length?page+1:0};
}
