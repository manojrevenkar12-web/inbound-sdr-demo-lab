// What the model is allowed to do: read a visitor message, pull out facts, draft cited sentences.
// It never routes, never decides qualification and never decides consent.

import type { DraftSentence } from "../grounding/claims.ts";
import type { Passage } from "../grounding/retrieve.ts";
import type { Facts } from "../qualify/qualify.ts";

export interface ReaderInput {
  message: string;
  company: string;
  passages: Passage[];
  known: Facts;
}

export interface ReaderOutput {
  facts: Facts;
  draft: DraftSentence[];
  source: "claude" | "keyword" | "fallback";
  error?: string;
}

export interface Reader {
  read(input: ReaderInput): Promise<ReaderOutput>;
}
