// Parses a Salesforce booleanFilter such as "1 AND (2 OR 3)" into a function over criterion results.

type Node = { kind: "ref"; n: number } | { kind: "and" | "or"; l: Node; r: Node } | { kind: "not"; a: Node };

function tokens(src: string): string[] {
  const out = src.toUpperCase().match(/\d+|AND|OR|NOT|\(|\)|\S/g);
  return out ?? [];
}

export type Tri = boolean | null;

/** Three-valued: null means unknown. AND with a false is false, OR with a true is true. */
export function parseBooleanFilter(src: string, criteriaCount: number): (results: Tri[]) => Tri {
  const toks = tokens(src);
  let pos = 0;
  const peek = (): string | undefined => toks[pos];
  const take = (want?: string): string => {
    const t = toks[pos];
    if (t === undefined || (want && t !== want)) throw new Error(want ? `expected ${want}` : "unexpected end");
    pos++;
    return t;
  };

  const factor = (): Node => {
    const t = peek();
    if (t === "NOT") { take(); return { kind: "not", a: factor() }; }
    if (t === "(") { take("("); const e = expr(); take(")"); return e; }
    if (t && /^\d+$/.test(t)) {
      take();
      const n = Number(t);
      if (n < 1 || n > criteriaCount) throw new Error(`refers to criterion ${n} but the entry has ${criteriaCount}`);
      return { kind: "ref", n };
    }
    throw new Error(`unexpected '${t ?? "end"}'`);
  };
  const term = (): Node => {
    let l = factor();
    while (peek() === "AND") { take(); l = { kind: "and", l, r: factor() }; }
    return l;
  };
  const expr = (): Node => {
    let l = term();
    while (peek() === "OR") { take(); l = { kind: "or", l, r: term() }; }
    return l;
  };

  const root = expr();
  if (pos !== toks.length) throw new Error(`unexpected '${toks[pos]}'`);

  const ev = (n: Node, r: Tri[]): Tri => {
    switch (n.kind) {
      case "ref": { const v = r[n.n - 1]; return v === undefined ? null : v; }
      case "and": { const a = ev(n.l, r), b = ev(n.r, r); return a === false || b === false ? false : a === null || b === null ? null : true; }
      case "or": { const a = ev(n.l, r), b = ev(n.r, r); return a === true || b === true ? true : a === null || b === null ? null : false; }
      case "not": { const a = ev(n.a, r); return a === null ? null : !a; }
    }
  };
  return (results) => ev(root, results);
}
