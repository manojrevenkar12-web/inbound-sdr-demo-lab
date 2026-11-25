// Code checks every sentence the model wants to show against the passage it cites.
// A sentence stays only if its numbers, its names and its absolute words ("only", "never", ...)
// all appear in the cited passage, and most of its other content words do too.

import { contentTerms, namesIn, numbersIn, stem, tokens } from "./text.ts";

export interface ClaimPolicy {
  minContentCoverage: number;
  guardWords: string[];
  fallbackSentence: string;
}

export interface DraftSentence {
  text: string;
  /** Passage or evidence id the model cites; null when it cites nothing. */
  citation: string | null;
}

export interface SentenceVerdict {
  text: string;
  citation: string | null;
  supported: boolean;
  reason: string;
}

export function checkSentence(
  s: DraftSentence,
  lookup: (id: string) => string | undefined,
  policy: ClaimPolicy,
  neutralTerms: string[] = [],
): SentenceVerdict {
  const base = { text: s.text, citation: s.citation };
  if (!s.citation) return { ...base, supported: false, reason: "no citation" };
  const source = lookup(s.citation);
  if (source === undefined) return { ...base, supported: false, reason: `cites ${s.citation}, which is not approved content` };

  const srcTerms = new Set(contentTerms(source));
  const srcTokens = new Set(tokens(source));
  const srcNumbers = new Set(numbersIn(source));
  const neutral = new Set(neutralTerms.map((t) => stem(t.toLowerCase())));

  const missingNumbers = numbersIn(s.text).filter((n) => !srcNumbers.has(n));
  if (missingNumbers.length > 0) return { ...base, supported: false, reason: `number ${missingNumbers.join(", ")} not in source` };

  const guard = new Set(policy.guardWords.map((g) => g.toLowerCase()));
  const missingGuards = tokens(s.text).filter((t) => guard.has(t) && !srcTokens.has(t));
  if (missingGuards.length > 0) return { ...base, supported: false, reason: `absolute word '${missingGuards[0]}' not in source` };

  const missingNames = namesIn(s.text).filter((n) => !srcTerms.has(n.stem) && !neutral.has(n.stem));
  if (missingNames.length > 0) return { ...base, supported: false, reason: `name '${missingNames[0]?.word}' not in source` };

  const terms = contentTerms(s.text).filter((t) => !neutral.has(t));
  if (terms.length === 0) return { ...base, supported: true, reason: "no factual content" };
  const covered = terms.filter((t) => srcTerms.has(t)).length / terms.length;
  if (covered < policy.minContentCoverage) {
    return { ...base, supported: false, reason: `only ${Math.round(covered * 100)}% of its terms are in the source` };
  }
  return { ...base, supported: true, reason: `${Math.round(covered * 100)}% of terms in ${s.citation}` };
}

export interface CheckedAnswer {
  shown: SentenceVerdict[];
  removed: SentenceVerdict[];
  usedFallback: boolean;
  reply: string;
}

export function checkAnswer(
  draft: DraftSentence[],
  lookup: (id: string) => string | undefined,
  policy: ClaimPolicy,
  neutralTerms: string[] = [],
): CheckedAnswer {
  const verdicts = draft.map((s) => checkSentence(s, lookup, policy, neutralTerms));
  const shown = verdicts.filter((v) => v.supported);
  const removed = verdicts.filter((v) => !v.supported);
  const usedFallback = shown.length === 0 && draft.length > 0;
  const reply = shown.length > 0 ? shown.map((v) => v.text).join(" ") : draft.length > 0 ? policy.fallbackSentence : "";
  return { shown, removed, usedFallback, reply };
}
