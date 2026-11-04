/** DEV evidence only: observer callback cadence after an advancing simulation.
 * This does not measure GPU presentation, input latency, temperature or battery.
 * Game time is never altered; inactive/hidden/loading transitions break samples. */
export class GameplayCadence {
  private previousNow=NaN;
  private previousSimulated=0;
  private previousActive=false;
  private histogram=new Uint32Array(4001);
  private intervals=0;
  private elapsed=0;
  private simulated=0;
  private longest=0;
  private overflow=0;
  private over60=0;
  private over90=0;
  private over120=0;
  sample(now:number,simulatedSeconds:number,active:boolean){
    if(!Number.isFinite(now)||!Number.isFinite(simulatedSeconds)){this.break();return false;}
    const previousNow=this.previousNow,previousSimulated=this.previousSimulated,previousActive=this.previousActive;
    this.previousNow=now;this.previousSimulated=simulatedSeconds;this.previousActive=active;
    if(!Number.isFinite(previousNow)||!active||!previousActive||now<=previousNow||simulatedSeconds<=previousSimulated)return false;
    const ms=now-previousNow;
    this.intervals++;this.elapsed+=ms;this.simulated+=(simulatedSeconds-previousSimulated)*1000;
    this.longest=Math.max(this.longest,ms);this.histogram[Math.min(4000,Math.floor(ms*4))]++;
    if(ms>=1000)this.overflow++;
    if(ms>1000/60+.5)this.over60++;
    if(ms>1000/90+.5)this.over90++;
    if(ms>1000/120+.5)this.over120++;
    return true;
  }
  break(){this.previousNow=NaN;this.previousActive=false;}
  summary(){
    const percentile=(fraction:number)=>{if(!this.intervals)return null;const goal=Math.ceil(this.intervals*fraction);let count=0;
      for(let i=0;i<this.histogram.length;i++){count+=this.histogram[i];if(count>=goal)return i===4000?1000:(i+.5)/4;}return null;};
    return {intervals:this.intervals,activeWallMs:this.elapsed,simulatedMs:this.simulated,
      observedCallbacksPerSecond:this.elapsed?this.intervals*1000/this.elapsed:null,
      intervalMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),longest:this.longest,atLeast1000ms:this.overflow},
      missedBudgetWithHalfMillisecondTolerance:{fps60:this.over60,fps90:this.over90,fps120:this.over120}};
  }
}
