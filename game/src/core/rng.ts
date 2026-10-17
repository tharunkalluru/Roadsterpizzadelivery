/** Seeded PRNG (sfc32) with independent named streams (MASTER §24). */
export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number) {
    this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = seed >>> 0;
    for (let i = 0; i < 15; i++) this.nextU32();
  }
  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t >>> 0;
  }
  next(): number { return this.nextU32() / 4294967296; }
  range(min: number, max: number): number { return min + (max - min) * this.next(); }
  int(min: number, maxExclusive: number): number { return min + Math.floor(this.next() * (maxExclusive - min)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  getState(): [number, number, number, number] { return [this.a, this.b, this.c, this.d]; }
  setState(s: [number, number, number, number]): void { [this.a, this.b, this.c, this.d] = s; }
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Separate streams so cosmetic randomness never perturbs consequential traffic (MASTER §24). */
export class RngStreams {
  mission: Rng; traffic: Rng; cosmetic: Rng;
  constructor(public readonly seed: number) {
    this.mission = new Rng(hashString(`mission:${seed}`));
    this.traffic = new Rng(hashString(`traffic:${seed}`));
    this.cosmetic = new Rng(hashString(`cosmetic:${seed}`));
  }
  snapshot() { return { mission: this.mission.getState(), traffic: this.traffic.getState(), cosmetic: this.cosmetic.getState() }; }
  restore(s: ReturnType<RngStreams['snapshot']>) { this.mission.setState(s.mission); this.traffic.setState(s.traffic); this.cosmetic.setState(s.cosmetic); }
}
