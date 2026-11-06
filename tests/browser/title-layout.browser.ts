/** Browser-only regression fixture. Bundle with esbuild, serve with public/fonts,
 * then resize to 667×375, 568×320 and 800×360. Uses the production HUD/title,
 * including its real Bungee/Baloo fonts and paint-safety CSS. */
import { Hud } from '../../src/ui/hud';
import { TitleScreen } from '../../src/ui/title';

const hud=new Hud(true),title=new TitleScreen(hud.root,true,true);
title.show();
const rect=(element:Element)=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
export async function auditTitleLayout(){
  await document.fonts.ready;
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  const cards=[...title.root.querySelectorAll('.how>div')],buttons=[...title.root.querySelectorAll<HTMLButtonElement>('.acts button')];
  const visible=[title.root.querySelector('h1')!,title.root.querySelector('.tag')!,...cards,...buttons];
  const failures:string[]=[];
  for(const element of visible){const r=rect(element);if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push(`outside viewport: ${element.tagName} ${element.textContent}`);}
  for(const button of buttons){const r=rect(button);if(r.height<44||r.width<44)failures.push(`small touch target: ${button.textContent}`);const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(hit!==button&&!button.contains(hit))failures.push(`covered button: ${button.textContent}`);}
  if(cards.length!==3)failures.push('missing instruction card');
  if(innerWidth>innerHeight&&innerHeight<=520&&cards.some(card=>Math.abs(rect(card).top-rect(cards[0]).top)>1))failures.push('instruction cards wrapped to another row');
  if(title.root.scrollHeight>title.root.clientHeight+1)failures.push('title requires vertical scrolling');
  const result={viewport:[innerWidth,innerHeight],fonts:document.fonts.status,cards:cards.map(rect),buttons:buttons.map(rect),scrollHeight:title.root.scrollHeight,clientHeight:title.root.clientHeight,failures};
  document.documentElement.dataset.titleLayoutResult=JSON.stringify(result);
  return result;
}
(window as any).auditTitleLayout=auditTitleLayout;
void auditTitleLayout();
