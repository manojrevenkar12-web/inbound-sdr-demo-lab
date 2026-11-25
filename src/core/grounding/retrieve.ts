// BM25 over the customer's approved content. Only approved passages can be retrieved or cited.

import { contentTerms } from "./text.ts";

export interface Passage {
  id: string;
  topic: string;
  text: string;
}

export interface Hit {
  passage: Passage;
  score: number;
}

export class PassageIndex {
  private readonly docs: { p: Passage; tf: Map<string, number>; len: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;
  readonly byId: Map<string, Passage>;
  private readonly k1: number;
  private readonly b: number;

  constructor(passages: Passage[], k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.byId = new Map(passages.map((p) => [p.id, p]));
    this.docs = passages.map((p) => {
      const terms = contentTerms(p.text + " " + p.topic.replace(/_/g, " "));
      const tf = new Map<string, number>();
      for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { p, tf, len: terms.length };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, topK: number): Hit[] {
    const q = Array.from(new Set(contentTerms(query)));
    const n = this.docs.length;
    const hits: Hit[] = [];
    for (const d of this.docs) {
      let score = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
      }
      if (score > 0) hits.push({ passage: d.p, score });
    }
    hits.sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id));
    return hits.slice(0, topK);
  }
}
