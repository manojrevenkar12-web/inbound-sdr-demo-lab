// Runs every design over the same visitors and scores outcomes against the hidden truth.

import { gateAnswer } from "../core/questionnaire/gate.ts";
import { routeLead } from "../core/routing/router.ts";
import type { Kit, PlatformConfig } from "../core/kit.ts";
import { makeContext, runDesign, type DesignContext, type DesignSpec, type Outcome } from "./designs.ts";
import { u } from "./rng.ts";
import type { Session, World } from "./world/world.ts";

export interface DesignMetrics {
  design: string;
  label: string;
  sessions: number;
  meetings: number;
  qualifiedMeetingsPer1k: number;
  pipelineEurPer1k: number;
  junkMeetingShare: number;
  aeHoursOnJunkPer1k: number;
  wrongOwnerShare: number;
  reviewShare: number;
  unsupportedClaimsPer1kAnswers: number;
  correctAnswersRemovedPer1kAnswers: number;
  questionsAnsweredShare: number;
  consentViolationsPer1kOptIn: number;
  medianMinutesToFirstResponse: number | null;
  readyBuyersMissedShare: number;
  supportRoutedShare: number;
  modelCallsPer1k: number;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? (a[m] as number) : ((a[m - 1] as number) + (a[m] as number)) / 2;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function score(design: DesignSpec, rows: { s: Session; o: Outcome }[], world: World): DesignMetrics {
  let meetings = 0, qualified = 0, junk = 0, wrong = 0, review = 0, pipeline = 0;
  let answers = 0, falsehoods = 0, correctRemoved = 0, answered = 0;
  let optIn = 0, violations = 0, ready = 0, readyMissed = 0, support = 0, supportRouted = 0, calls = 0;
  const firstResponse: number[] = [];
  const truthQ = new Map(world.questions.map((q) => [q.id, q]));
  for (const { s, o } of rows) {
    calls += o.modelCalls;
    for (const a of o.answers) {
      answers++;
      if (a.answered) answered++;
      const q = truthQ.get(a.questionId);
      if (!q) continue;
      falsehoods += a.shownText.filter((t) => t === q.falsehood.text).length;
      if (q.correct && a.removedText.includes(q.correct.text)) correctRemoved++;
    }
    if (world.isOptInCountry(s.country) && o.personalData !== "none") optIn++;
    if (o.personalData === "without_consent") violations++;
    if (s.wantsMeeting && o.firstResponseMinutes !== null && o.personalData !== "none") firstResponse.push(o.firstResponseMinutes);
    if (o.meeting) {
      meetings++;
      if (s.fit) { qualified++; pipeline += s.pipelineEurIfMeeting; } else junk++;
      if (o.meeting.via === "review") review++;
      if (!world.sameOwner(o.meeting.owner, s.trueOwner)) wrong++;
    }
    if (s.fit && s.stage === "ready" && s.wantsMeeting) { ready++; if (!o.meeting) readyMissed++; }
    if (s.intent === "support") { support++; if (o.supportHandoff) supportRouted++; }
  }
  const n = rows.length;
  const optInSessions = rows.filter((r) => world.isOptInCountry(r.s.country)).length;
  return {
    design: design.name,
    label: design.label,
    sessions: n,
    meetings,
    qualifiedMeetingsPer1k: r1((qualified / n) * 1000),
    pipelineEurPer1k: Math.round((pipeline / n) * 1000),
    junkMeetingShare: r3(meetings ? junk / meetings : 0),
    aeHoursOnJunkPer1k: r1(((junk * 0.75) / n) * 1000),
    wrongOwnerShare: r3(meetings ? wrong / meetings : 0),
    reviewShare: r3(meetings ? review / meetings : 0),
    unsupportedClaimsPer1kAnswers: r1(answers ? (falsehoods / answers) * 1000 : 0),
    correctAnswersRemovedPer1kAnswers: r1(answers ? (correctRemoved / answers) * 1000 : 0),
    questionsAnsweredShare: r3(answers ? answered / answers : 0),
    consentViolationsPer1kOptIn: r1(optInSessions ? (violations / optInSessions) * 1000 : 0),
    medianMinutesToFirstResponse: (() => { const m = median(firstResponse); return m === null ? null : Math.round(m); })(),
    readyBuyersMissedShare: r3(ready ? readyMissed / ready : 0),
    supportRoutedShare: r3(support ? supportRouted / support : 0),
    modelCallsPer1k: Math.round((calls / n) * 1000),
  };
}

export function runConversations(world: World, kit: Kit, cfg: PlatformConfig, designs: DesignSpec[], seeds: number[], perSeed = world.cfg.sessionsPerSeed): DesignMetrics[] {
  const sessions: Session[] = [];
  for (const seed of seeds) for (let i = 0; i < perSeed; i++) sessions.push(world.session(seed, i));
  return designs.map((d) => {
    const ctx: DesignContext = makeContext(world, kit, cfg);
    const rows = sessions.map((s) => ({ s, o: runDesign(d, s, ctx) }));
    return score(d, rows, world);
  });
}

// ------------------------------------------------------------------ routing parity replay

export interface ParityResult {
  variant: string;
  leads: number;
  autoRouted: number;
  matches: number;
  toReview: number;
  parityOfAutoRouted: number;
  reviewShare: number;
  mismatches: { reason: string; count: number }[];
}

export function runParity(world: World, kit: Kit, cfg: PlatformConfig, seeds: number[]): ParityResult[] {
  const ctx = makeContext(world, kit, cfg);
  const variants: { name: string; rule: typeof ctx.importedRule; accounts: typeof kit.accounts }[] = [
    { name: "imported_from_salesforce", rule: ctx.importedRule, accounts: kit.accounts },
    { name: "re_typed_by_hand", rule: ctx.handRule, accounts: ctx.emptyAccounts },
  ];
  return variants.map((v) => {
    let leads = 0, auto = 0, matches = 0, toReview = 0;
    const reasons = new Map<string, number>();
    for (const seed of seeds) {
      for (let i = 0; i < world.cfg.historicalLeadsPerSeed; i++) {
        const h = world.historicalLead(seed, i);
        leads++;
        const truth = world.trueOwnerOf(h.lead, h.account);
        const d = routeLead(h.lead, h.lead.Email as string, {
          rule: v.rule,
          accounts: v.accounts,
          defaultOwner: kit.org.defaultLeadOwner,
          reviewQueue: cfg.routing.reviewQueue,
          routeToAccountOwnerWhen: kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
        });
        if (d.via === "review") { toReview++; continue; }
        auto++;
        if (world.sameOwner(d.owner, truth)) matches++;
        else {
          const freemail = /@(gmail|gmx|web|outlook|yahoo)\./.test(String(h.lead.Email));
          const why = truth.type === "User" && h.account?.ownerId === truth.id
            ? freemail ? "free-mail address, so the owning account cannot be matched" : "account owner ignored"
            : `sent to ${d.owner.id}, Salesforce says ${truth.id}`;
          reasons.set(why, (reasons.get(why) ?? 0) + 1);
        }
      }
    }
    const mismatches = Array.from(reasons.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 6);
    return { variant: v.name, leads, autoRouted: auto, matches, toReview, parityOfAutoRouted: r3(auto ? matches / auto : 0), reviewShare: r3(toReview / leads), mismatches };
  });
}

// ------------------------------------------------------------------ security questionnaires

export interface QuestionnaireMetrics {
  design: string;
  questions: number;
  wrongAnswersPer100: number;
  autoAnsweredShare: number;
  routedToOwnerShare: number;
  seMinutesPer100: number;
}

export function runQuestionnaires(world: World, kit: Kit, cfg: PlatformConfig, seeds: number[]): QuestionnaireMetrics[] {
  const ctx = makeContext(world, kit, cfg);
  const qc = cfg.questionnaire;
  const items: { seed: number; n: number; q: (typeof world.securityQuestions)[number] }[] = [];
  for (const seed of seeds) {
    for (let n = 0; n < world.cfg.questionnaire.questionsPerSeed; n++) {
      const q = world.securityQuestions[Math.floor(u("sq-pick", seed, n) * world.securityQuestions.length)];
      if (q) items.push({ seed, n, q });
    }
  }
  const out: QuestionnaireMetrics[] = [];
  const wrongIf = (q: (typeof items)[number]["q"], answer: string | null): boolean => answer !== null && answer !== q.correct;

  // Manual: the SE answers each question by hand from the evidence library.
  {
    let wrong = 0, routed = 0;
    for (const it of items) {
      if (it.q.correct === null) { routed++; continue; }
      if (u("sq-manual", it.seed, it.n) < world.cfg.questionnaire.manualErrorRate) wrong++;
    }
    out.push({ design: "se_by_hand", questions: items.length, wrongAnswersPer100: r1((wrong / items.length) * 100), autoAnsweredShare: 0, routedToOwnerShare: r3(routed / items.length), seMinutesPer100: Math.round(qc.minutesPerManualAnswer * 100) });
  }
  // Model alone: every drafted answer goes out.
  {
    let wrong = 0, sent = 0;
    for (const it of items) {
      const d = ctx.sim.questionnaire(it.seed, it.n, it.q);
      if (d.answer !== null) { sent++; if (wrongIf(it.q, d.answer)) wrong++; }
    }
    out.push({ design: "model_alone", questions: items.length, wrongAnswersPer100: r1((wrong / items.length) * 100), autoAnsweredShare: r3(sent / items.length), routedToOwnerShare: r3(1 - sent / items.length), seMinutesPer100: Math.round(((sent * qc.minutesPerReviewedAnswer * 0) + (items.length - sent) * qc.minutesPerManualAnswer) / items.length * 100) });
  }
  // Evidence-gated: code decides which answers go out.
  {
    let wrong = 0, auto = 0;
    for (const it of items) {
      const d = ctx.sim.questionnaire(it.seed, it.n, it.q);
      const g = gateAnswer({ questionId: it.q.id, answer: d.answer, evidenceIds: d.evidenceIds }, kit.evidence, qc.today, cfg.claims, "security@" + kit.playbook.domain, kit.playbook.brandTerms);
      if (g.status === "auto") { auto++; if (wrongIf(it.q, g.answer)) wrong++; }
    }
    const minutes = auto * qc.minutesPerReviewedAnswer + (items.length - auto) * qc.minutesPerManualAnswer;
    out.push({ design: "evidence_gated", questions: items.length, wrongAnswersPer100: r1((wrong / items.length) * 100), autoAnsweredShare: r3(auto / items.length), routedToOwnerShare: r3(1 - auto / items.length), seMinutesPer100: Math.round((minutes / items.length) * 100) });
  }
  return out;
}
