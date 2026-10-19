export interface ExplicitLineLayout { lines:string[];size:number }

/** Authored hard breaks are layout instructions. Keep every row, including blank
 * rows, and scale all glyphs together to fit the available width and height. */
export function layoutExplicitLines(text:string,maxW:number,maxH:number,measure:(text:string,size:number)=>number):ExplicitLineLayout|null {
  if(!/[\r\n]/.test(text))return null;
  const lines=text.split(/\r\n?|\n/),cap=Math.max(0,maxH)*.8/lines.length;
  let size=cap;
  for(const line of lines){const width=measure(line,cap);if(width>0)size=Math.min(size,cap*Math.max(0,maxW)/width);}
  return{lines,size};
}
