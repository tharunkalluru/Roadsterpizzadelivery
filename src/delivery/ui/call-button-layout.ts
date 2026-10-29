export interface CallButtonRect { left: number; top: number; width: number; height: number }

const GAP = 8;
const intersects = (a: CallButtonRect, b: CallButtonRect) =>
  a.left < b.left + b.width + GAP && a.left + a.width + GAP > b.left &&
  a.top < b.top + b.height + GAP && a.top + a.height + GAP > b.top;

/** Keep the entire touch target clear, including the corners of the round map.
 * Inputs are measured CSS pixels relative to the HUD, never device pixels.
 * This runs on layout changes / the UI's slow layout tick, not every frame.
 */
export function callButtonLayout(bounds: CallButtonRect, obstacles: readonly CallButtonRect[], anchor?: CallButtonRect): CallButtonRect | null {
  for (const size of [48, 44]) {
    if (bounds.width < size || bounds.height < size) continue;
    const minX = Math.ceil(bounds.left), minY = Math.ceil(bounds.top);
    const maxX = Math.floor(bounds.left + bounds.width - size), maxY = Math.floor(bounds.top + bounds.height - size);
    if (maxX < minX || maxY < minY) continue;
    const clampX = (x: number) => Math.max(minX, Math.min(maxX, Math.round(x)));
    const clampY = (y: number) => Math.max(minY, Math.min(maxY, Math.round(y)));
    const preferredX = clampX(anchor ? anchor.left + (anchor.width - size) / 2 : maxX);
    const preferredY = clampY(anchor ? anchor.top - size - GAP : maxY - 72);
    const xs = [preferredX, clampX(bounds.left), clampX(maxX)];
    const ys = [preferredY, clampY(bounds.top), clampY(maxY)];
    // A closest free position lies at the preferred point or an obstacle edge.
    // Searching those edges avoids arbitrary percentage offsets and screen
    // model exceptions (including foldable browser chrome / safe areas).
    for (const obstacle of obstacles) {
      xs.push(clampX(obstacle.left - size - GAP), clampX(obstacle.left + obstacle.width + GAP));
      ys.push(clampY(obstacle.top - size - GAP), clampY(obstacle.top + obstacle.height + GAP));
    }
    let best: CallButtonRect | null = null, bestScore = Infinity;
    const candidate: CallButtonRect = { left: 0, top: 0, width: size, height: size };
    for (const left of xs) for (const top of ys) {
      const score = (left - preferredX) ** 2 + (top - preferredY) ** 2 * 1.2;
      if (score >= bestScore) continue;
      candidate.left = left; candidate.top = top;
      if (obstacles.some(obstacle => intersects(candidate, obstacle))) continue;
      best = { ...candidate }; bestScore = score;
    }
    if (best) return best;
  }
  return null;
}

/** Place the complete delivery action, including its instruction, independently
 * of input mode. Desktop can also run in a shallow landscape window. */
export function actionBlockLayout(bounds:CallButtonRect,obstacles:readonly CallButtonRect[],size:{width:number;height:number},anchor?:CallButtonRect):CallButtonRect|null {
  const width=Math.ceil(size.width),height=Math.ceil(size.height);
  if(width<44||height<44||width>bounds.width||height>bounds.height)return null;
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
