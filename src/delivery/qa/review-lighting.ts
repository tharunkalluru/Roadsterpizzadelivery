interface ReviewClock { minutes:number; moodT:number }
interface ReviewTimers { every(callback:()=>void,milliseconds:number):unknown; clear(id:unknown):void }
/** Isolated visual review only. Ordinary/full-campaign games never call this.
 * Keep the same night/day lighting while an artist inspects the scene; traffic,
 * player physics, animations, and their clocks continue normally. */
export function lockReviewLighting(game:ReviewClock,timers:ReviewTimers={every:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id as ReturnType<typeof setInterval> )}){
  let minute=23*60,disposed=false;
  const apply=()=>{if(!disposed)game.minutes=minute;};apply();game.moodT=0;
  const timer=timers.every(apply,250);
  return {get minute(){return minute;},toggle(){if(disposed)return;minute=minute===23*60?12*60:23*60;apply();game.moodT=0;},dispose(){if(disposed)return;disposed=true;timers.clear(timer);}};
}
