export interface CallButtonRect { left: number; top: number; width: number; height: number }

const GAP = 8;
const intersects = (a: CallButtonRect, b: CallButtonRect) =>
  a.left < b.left + b.width + GAP && a.left + a.width + GAP > b.left &&
  a.top < b.top + b.height + GAP && a.top + a.height + GAP > b.top;

/** Place the contextual call chip in the host's reserved steering-row slot.
 * Narrow landscapes keep the chip centered by wrapping its label, rather than
 * putting an icon over another driving control. All dimensions are CSS pixels.
 */
export function callButtonLayout(bounds: CallButtonRect, obstacles: readonly CallButtonRect[], slot?: CallButtonRect): CallButtonRect | null {
  const height = Math.min(slot?.height || 48, bounds.height >= 48 ? 48 : 44);
  if (bounds.width < 44 || bounds.height < height) return null;
  const preferredWidth = Math.min(slot?.width || 156, bounds.width);
  const widths = [...new Set([preferredWidth, 136, 120, 96, 80, 60, 44].filter(width => width <= preferredWidth && width >= 44))];
  for (const width of widths) {
    const minX = Math.ceil(bounds.left), minY = Math.ceil(bounds.top);
    const maxX = Math.floor(bounds.left + bounds.width - width), maxY = Math.floor(bounds.top + bounds.height - height);
    if (maxX < minX || maxY < minY) continue;
    const clampX = (x: number) => Math.max(minX, Math.min(maxX, Math.round(x)));
    const clampY = (y: number) => Math.max(minY, Math.min(maxY, Math.round(y)));
    const preferredX = clampX(slot ? slot.left + (slot.width - width) / 2 : bounds.left + (bounds.width - width) / 2);
    const preferredY = clampY(slot ? slot.top + (slot.height - height) / 2 : bounds.top + bounds.height * .68 - height / 2);
    const xs = [preferredX, minX, maxX], ys = [preferredY, minY, maxY];
    for (const obstacle of obstacles) {
      xs.push(clampX(obstacle.left - width - GAP), clampX(obstacle.left + obstacle.width + GAP));
      ys.push(clampY(obstacle.top - height - GAP), clampY(obstacle.top + obstacle.height + GAP));
    }
    let best: CallButtonRect | null = null, bestScore = Infinity;
    for (const left of xs) for (const top of ys) {
      const score = (left - preferredX) ** 2 + (top - preferredY) ** 2 * 4;
      if (score >= bestScore) continue;
      const candidate = { left, top, width, height };
      if (obstacles.some(obstacle => intersects(candidate, obstacle))) continue;
      best = candidate; bestScore = score;
    }
    if (best) return best;
  }
  return null;
}

/** Place the complete delivery action, including its instruction, independently
 * of input mode. Desktop can also run in a shallow landscape window. */
export function actionBlockLayout(bounds:CallButtonRect,obstacles:readonly CallButtonRect[],size:{width:number;height:number},anchor?:CallButtonRect):CallButtonRect|null {
  if(size.width<44||size.height<44)return null;
  return overlayBlockLayout(bounds,obstacles,{width:Math.ceil(size.width),height:Math.ceil(size.height)},anchor);
}

/** Shared geometry placement; noninteractive badges may be shorter than buttons. */
export function overlayBlockLayout(bounds:CallButtonRect,obstacles:readonly CallButtonRect[],size:{width:number;height:number},anchor?:CallButtonRect):CallButtonRect|null {
  const width=Math.ceil(size.width),height=size.height;
  if(width<=0||height<=0||width>bounds.width||height>bounds.height)return null;
  const minX=Math.ceil(bounds.left),minY=Math.ceil(bounds.top),maxX=Math.floor(bounds.left+bounds.width-width),maxY=Math.floor(bounds.top+bounds.height-height);
  const clampX=(x:number)=>Math.max(minX,Math.min(maxX,Math.round(x))),clampY=(y:number)=>Math.max(minY,Math.min(maxY,Math.round(y)));
  const preferredX=clampX(anchor?anchor.left+(anchor.width-width)/2:maxX),preferredY=clampY(anchor?anchor.top-height-GAP:maxY-78);
  const xs=[preferredX,minX,maxX],ys=[preferredY,minY,maxY];
  for(const obstacle of obstacles){xs.push(clampX(obstacle.left-width-GAP),clampX(obstacle.left+obstacle.width+GAP));ys.push(clampY(obstacle.top-height-GAP),clampY(obstacle.top+obstacle.height+GAP));}
  let best:CallButtonRect|null=null,score=Infinity;
  for(const left of xs)for(const top of ys){
    const candidate={left,top,width,height},cost=(left-preferredX)**2+(top-preferredY)**2*1.2;
    if(cost>=score||obstacles.some(obstacle=>intersects(candidate,obstacle)))continue;
    best=candidate;score=cost;
  }
  return best;
}
