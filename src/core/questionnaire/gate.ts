// Security questionnaires: the model drafts an answer and names its evidence; code decides whether the
// answer can go out. Evidence must exist, be approved, be in date, and support every sentence.
// Anything else goes to the evidence owner, with the reason.

import { checkSentence, type ClaimPolicy } from "../grounding/claims.ts";
import { sentences } from "../grounding/text.ts";

export interface EvidenceItem {
  id: string;
  title: string;
  owner: string;
  approved: boolean;
  validUntil: string;
  text: string;
}

export interface QuestionnaireDraft {
  questionId: string;
  answer: string | null;
  evidenceIds: string[];
}

export interface GatedAnswer {
  questionId: string;
  status: "auto" | "owner";
  answer: string | null;
  citations: string[];
  routeTo: string | null;
  reasons: string[];
}

export function gateAnswer(
  draft: QuestionnaireDraft,
  library: EvidenceItem[],
  today: string,
  policy: ClaimPolicy,
  defaultOwner: string,
  neutralTerms: string[] = [],
): GatedAnswer {
  const byId = new Map(library.map((e) => [e.id, e]));
  const reasons: string[] = [];
  const cited = draft.evidenceIds.map((id) => byId.get(id));
  const firstOwner = cited.find((e) => e)?.owner ?? defaultOwner;
  const toOwner = (why: string[]): GatedAnswer => ({
    questionId: draft.questionId,
    status: "owner",
    answer: null,
    citations: draft.evidenceIds,
    routeTo: firstOwner,
    reasons: why,
  });

  if (!draft.answer || draft.answer.trim() === "") return toOwner(["model did not draft an answer"]);
  if (draft.evidenceIds.length === 0) return toOwner(["answer cites no evidence"]);
  draft.evidenceIds.forEach((id, i) => {
    const e = cited[i];
    if (!e) reasons.push(`${id} is not in the evidence library`);
    else if (!e.approved) reasons.push(`${id} is not approved for customers`);
    else if (e.validUntil < today) reasons.push(`${id} expired on ${e.validUntil}`);
  });
  if (reasons.length > 0) return toOwner(reasons);

  const joined = cited.map((e) => (e as EvidenceItem).text).join(" ");
  for (const s of sentences(draft.answer)) {
    const v = checkSentence({ text: s, citation: "evidence" }, () => joined, policy, neutralTerms);
    if (!v.supported) return toOwner([`"${s}": ${v.reason}`]);
  }
  return { questionId: draft.questionId, status: "auto", answer: draft.answer, citations: draft.evidenceIds, routeTo: null, reasons: ["every sentence supported by in-date, approved evidence"] };
}
