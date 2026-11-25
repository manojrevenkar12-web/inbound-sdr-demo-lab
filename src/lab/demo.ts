// Builds a per-prospect demo kit for the SE console: the imported routing plan, scripted visitor
// conversations run through the real turn logic, and the prospect's security questionnaire.
// Uses the deterministic keyword reader so a kit builds offline and the same way every time.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decideTurn, newConversation, type TurnResult } from "../core/agent/turn.ts";
import { PassageIndex } from "../core/grounding/retrieve.ts";
import { sentences } from "../core/grounding/text.ts";
import { loadKit, ROOT, type PlatformConfig } from "../core/kit.ts";
import { KeywordReader } from "../core/model/keyword.ts";
import { gateAnswer, type GatedAnswer } from "../core/questionnaire/gate.ts";
import { summarizeThemes, type FeedbackTag } from "../core/feedback/voc.ts";
import { RoundRobin } from "../core/routing/router.ts";
import type { CmpState } from "../core/consent/gate.ts";
import type { DraftSentence } from "../core/grounding/claims.ts";

interface Script {
  conversations: {
    id: string; title: string; country: string; cmp: CmpState; companyDomain: string | null;
    /** A message, or a message with a recorded model draft (kept to show the claim check working). */
    messages: (string | { text: string; recordedDraft: DraftSentence[] })[];
  }[];
  questionnaire: { id: string; text: string }[];
  discovery: { themes: string[]; tags: FeedbackTag[] };
}

export interface DemoTurn {
  visitor: string;
  recordedDraft: boolean;
  reply: string;
  shown: { text: string; citation: string | null; reason: string }[];
  removed: { text: string; citation: string | null; reason: string }[];
  decision: string;
  decisionReasons: string[];
  consent: { region: string; mayCollect: boolean; reason: string };
  routing: { owner: string; via: string; explanation: string[] } | null;
  next: TurnResult["next"];
}

export async function buildDemoKit(prospect: string, cfg: PlatformConfig, root = ROOT): Promise<Record<string, unknown>> {
  const started = performance.now();
  const kit = loadKit(prospect, root);
  const scriptPath = join(root, "config/demo", prospect, "script.json");
  const script = existsSync(scriptPath) ? (JSON.parse(readFileSync(scriptPath, "utf8")) as Script) : { conversations: [], questionnaire: [], discovery: { themes: [], tags: [] } };
  const reader = new KeywordReader();
  const index = new PassageIndex(kit.passages, cfg.retrieval.k1, cfg.retrieval.b);
  const rr = new RoundRobin(kit.org.queues);

  const conversations = [];
  for (const c of script.conversations) {
    let state = newConversation(c.id, c.cmp, c.companyDomain);
    state.facts.country = c.country;
    const turns: DemoTurn[] = [];
    for (const m of c.messages) {
      const message = typeof m === "string" ? m : m.text;
      const passages = index.search(message, cfg.retrieval.topK).map((h) => h.passage);
      const read = await reader.read({ message, company: kit.playbook.company, passages, known: state.facts });
      if (typeof m !== "string") read.draft = m.recordedDraft;
      const t = decideTurn(state, message, read, kit, cfg, rr);
      state = t.state;
      turns.push({
        visitor: message,
        recordedDraft: typeof m !== "string",
        reply: t.reply,
        shown: t.answer.shown.map((v) => ({ text: v.text, citation: v.citation, reason: v.reason })),
        removed: t.answer.removed.map((v) => ({ text: v.text, citation: v.citation, reason: v.reason })),
        decision: t.decision.action,
        decisionReasons: t.decision.reasons,
        consent: { region: t.consent.region, mayCollect: t.consent.mayCollectPersonalData, reason: t.consent.reason },
        routing: t.routing ? { owner: t.assignee ? (kit.org.users[t.assignee]?.name ?? t.assignee) : t.routing.owner.id, via: t.routing.via, explanation: t.routing.explanation } : null,
        next: t.next,
      });
    }
    conversations.push({ id: c.id, title: c.title, country: c.country, cmp: c.cmp, turns });
  }

  // Questionnaire: quote the best-matching evidence, then let the gate decide.
  const evIndex = new PassageIndex(kit.evidence.map((e) => ({ id: e.id, topic: e.title, text: e.text })), cfg.retrieval.k1, cfg.retrieval.b);
  const questionnaire: (GatedAnswer & { question: string })[] = script.questionnaire.map((q) => {
    const top = evIndex.search(q.text, 1)[0];
    const draft = top && top.score > 2 ? { questionId: q.id, answer: sentences(top.passage.text)[0] ?? null, evidenceIds: [top.passage.id] } : { questionId: q.id, answer: null, evidenceIds: [] };
    return { question: q.text, ...gateAnswer(draft, kit.evidence, cfg.questionnaire.today, cfg.claims, `security@${kit.playbook.domain}`, kit.playbook.brandTerms) };
  });

  const voc = summarizeThemes(script.discovery.tags, script.discovery.themes);
  const plan = kit.rule.entries.map((e) => ({
    order: e.order,
    owner: `${e.assignedTo.type} ${e.assignedTo.id}`,
    when: e.formulaSource
      ? `formula: ${e.formulaSource}`
      : e.booleanFilter
        ? `${e.criteria.map((c) => `(${c.index}) ${c.field} ${c.operation} ${c.values.join(", ")}`).join("; ")}; filter ${e.booleanFilter}`
        : e.criteria.map((c) => `${c.field} ${c.operation} ${c.values.join(", ")}`).join(" AND "),
    status: e.refusal ? "refused" : e.partial ? "partial" : "imported",
    note: e.refusal ?? e.partial?.join("; ") ?? "",
  }));

  return {
    prospect,
    company: kit.playbook.company,
    tagline: kit.playbook.tagline,
    brand: kit.playbook.brand,
    org: kit.org.orgName,
    accounts: kit.accounts.rows.length,
    passages: kit.passages.length,
    evidenceItems: kit.evidence.length,
    routingPlan: { rule: kit.rule.name, entries: plan, warnings: kit.rules.warnings, inactiveRules: kit.rules.rules.filter((r) => !r.active).map((r) => r.name) },
    // What the console needs to run the real core router in the browser.
    router: {
      rule: kit.rule,
      accounts: kit.accounts.rows,
      defaultOwner: kit.org.defaultLeadOwner,
      reviewQueue: cfg.routing.reviewQueue,
      routeToAccountOwnerWhen: kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
      users: kit.org.users,
      queues: kit.org.queues,
      leadSource: kit.playbook.salesforce.leadSource,
      sampleDomains: kit.accounts.rows.filter((a) => a.type === "Customer" || a.openOpportunity).slice(0, 4).map((a) => ({ domain: a.domain, name: a.name, type: a.type, openOpportunity: a.openOpportunity })),
    },
    conversations,
    questionnaire,
    voiceOfCustomer: voc,
    builtInMs: Math.round(performance.now() - started),
  };
}
