// Same luck for every design: every random draw is a pure function of (seed, session, purpose),
// so two designs that ask the same visitor the same question get the same answer.

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mix(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Uniform in [0, 1) keyed by any parts. */
export function u(...parts: (string | number)[]): number {
  return mix(fnv1a(parts.join("|"))) / 4294967296;
}

export class Stream {
  private n = 0;
  private readonly key: string;
  constructor(key: string) { this.key = key; }
  next(): number { return u(this.key, this.n++); }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)] as T; }
  weighted<T extends string>(w: Record<T, number>): T {
    const entries = Object.entries(w) as [T, number][];
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let r = this.next() * total;
    for (const [k, v] of entries) { r -= v; if (r < 0) return k; }
    return (entries[entries.length - 1] as [T, number])[0];
  }
  normal(): number {
    const a = Math.max(this.next(), 1e-12);
    const b = this.next();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  logNormal(median: number, sigma: number): number { return median * Math.exp(sigma * this.normal()); }
}

export function weightedBy<T extends string>(x: number, w: Record<T, number>): T {
  const entries = Object.entries(w) as [T, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = x * total;
  for (const [k, v] of entries) { r -= v; if (r < 0) return k; }
  return (entries[entries.length - 1] as [T, number])[0];
}
