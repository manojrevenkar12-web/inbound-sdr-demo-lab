// A deterministic reader for offline demos and tests: regex facts and extractive answers.
// It quotes the best passage instead of writing new sentences, so it rarely trips the claim check.

import { COUNTRY_NAMES, canonicalCountry } from "../geo.ts";
import { contentTerms, sentences } from "../grounding/text.ts";
import type { Facts, Role } from "../qualify/qualify.ts";
import type { Reader, ReaderInput, ReaderOutput } from "./types.ts";

const ROLE_WORDS: [RegExp, Role][] = [
  [/\b(cfo|chief financial|finance director|head of finance|vp finance|controller|geschäftsführ|ceo|founder)\b/i, "decision_maker"],
  [/\b(finance manager|accounting manager|head of (accounting|logistics|supply chain|operations|it)|logistics manager|it manager|procurement|team lead)\b/i, "influencer"],
  [/\b(accountant|bookkeeper|analyst|buchhalter)\b/i, "practitioner"],
  [/\b(student|thesis|university project)\b/i, "student"],
  [/\b(job|career|hiring|vacanc|apply)\b/i, "job_seeker"],
  [/\b(we sell|our agency|partnership offer|seo services)\b/i, "vendor"],
];

export function keywordFacts(message: string): Facts {
  const f: Facts = {};
  const m = message.toLowerCase();
  const emp = /(\d[\d.,]*)\s*(\+\s*)?(employees?|people|staff|fte|mitarbeiter(?:innen)?)/i.exec(message);
  if (emp?.[1]) f.employees = Number(emp[1].replace(/[.,]/g, ""));
  for (const name of [...COUNTRY_NAMES, "Deutschland", "Österreich", "Schweiz", "UK"]) {
    if (new RegExp(`\\b${name}\\b`, "i").test(message)) { f.country = canonicalCountry(name); break; }
  }
  for (const [re, role] of ROLE_WORDS) if (re.test(message)) { f.role = role; break; }
  if (/\b(login|error|bug|not syncing|broken|support ticket|our account|we are a customer|already use)\b/.test(m)) f.intent = "support";
  else if (f.role === "student" || f.role === "job_seeker" || f.role === "vendor") f.intent = "other";
  else if (/\b(demo|pricing|price|quote|talk to sales|meeting|evaluate|evaluating|replace|switch)\b/.test(m)) f.intent = "sales";
  if (/\b(ready|this quarter|sign|contract|budget approved)\b/.test(m)) f.stage = "ready";
  else if (/\b(evaluat|compar|shortlist|replac|switch|demo|vendors?)\w*/.test(m)) f.stage = "evaluating";
  if (/\b(demo|meeting|talk to sales|call)\b/.test(m)) f.wantsMeeting = true;
  const email = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.exec(message);
  if (email) f.email = email[0].toLowerCase();
  if (/\bpartner\b/i.test(message) && /\b(referred|recommended|via)\b/i.test(message)) f.partnerReferral = true;
  return f;
}

export class KeywordReader implements Reader {
  private readonly minOverlap: number;
  constructor(minOverlap = 1) { this.minOverlap = minOverlap; }

  async read(input: ReaderInput): Promise<ReaderOutput> {
    const facts = keywordFacts(input.message);
    const isQuestion = /\?|\b(do you|does|can|how|what|which|is there|are you|wie|gibt es)\b/i.test(input.message);
    if (!isQuestion || input.passages.length === 0) return { facts, draft: [], source: "keyword" };
    // Score the retrieved passages against the question sentence itself, not the whole message,
    // and quote the best one only if it shares enough terms with it.
    const asked = sentences(input.message).filter((x) => x.includes("?")).join(" ") || input.message;
    const q = new Set(contentTerms(asked));
    let top = input.passages[0];
    let overlap = -1;
    for (const p of input.passages) {
      const o = new Set(contentTerms(p.text).filter((t) => q.has(t))).size;
      if (o > overlap) { top = p; overlap = o; }
    }
    if (!top || overlap < this.minOverlap) return { facts, draft: [], source: "keyword" };
    const draft = sentences(top.text).map((text) => ({ text, citation: top.id }));
    return { facts, draft, source: "keyword" };
  }
}
