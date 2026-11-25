// The designs compared on the same visitors and the same luck.
// form_and_wait     the status quo: a contact form, an SDR calls back
// rules_chatbot     a decision-tree chat widget with routing re-typed by hand
// model_alone       an LLM agent that answers, qualifies, routes and asks for data on its own judgment
// platform          the model reads; code checks claims, gates consent, qualifies and routes from Salesforce
// platform_*        the platform with one safeguard removed (ablations)

import { buildLead } from "../core/agent/lead.ts";
import { decideConsent } from "../core/consent/gate.ts";
import { checkAnswer } from "../core/grounding/claims.ts";
import { PassageIndex } from "../core/grounding/retrieve.ts";
import type { Kit, PlatformConfig } from "../core/kit.ts";
import { qualify, type Facts } from "../core/qualify/qualify.ts";
import { routeLead, type RoutingContext } from "../core/routing/router.ts";
import { AccountIndex, matchDomain } from "../core/salesforce/accounts.ts";
import { activeRule, importAssignmentRules } from "../core/salesforce/metadata.ts";
import type { AssignmentRule } from "../core/salesforce/types.ts";
import { SimModel } from "./simmodel.ts";
import { decidingEntryKind, salesforceOwner, type RefOwner } from "./world/reference.ts";
import type { Session, World } from "./world/world.ts";

export interface AnswerRecord {
  questionId: string;
  shownText: string[];
  removedText: string[];
  answered: boolean;
}

export interface Outcome {
  answers: AnswerRecord[];
  left: boolean;
  meeting: { owner: RefOwner; via: string; minutesToBook: number } | null;
  review: boolean;
  supportHandoff: boolean;
  personalData: "none" | "consented" | "not_required" | "without_consent";
  firstResponseMinutes: number | null;
  modelCalls: number;
}

export interface DesignSpec {
  name: string;
  kind: "form_and_wait" | "rules_chatbot" | "model_alone" | "platform";
  label: string;
  ablate?: ("claim_check" | "consent_gate" | "imported_rules" | "enrichment" | "account_match")[];
}

export interface DesignContext {
  world: World;
  kit: Kit;
  cfg: PlatformConfig;
  sim: SimModel;
  index: PassageIndex;
  importedRule: AssignmentRule;
  handRule: AssignmentRule;
  emptyAccounts: AccountIndex;
}

export function makeContext(world: World, kit: Kit, cfg: PlatformConfig): DesignContext {
  return {
    world,
    kit,
    cfg,
    sim: new SimModel(world),
    index: new PassageIndex(kit.passages, cfg.retrieval.k1, cfg.retrieval.b),
    importedRule: kit.rule,
    handRule: activeRule(importAssignmentRules(world.handXml), kit.playbook.salesforce.activeRule),
    emptyAccounts: new AccountIndex([]),
  };
}

const empty = (): Outcome => ({
  answers: [], left: false, meeting: null, review: false, supportHandoff: false, personalData: "none", firstResponseMinutes: null, modelCalls: 0,
});

// ------------------------------------------------------------------ status quo

function formAndWait(s: Session, ctx: DesignContext): Outcome {
  const o = empty();
  const w = ctx.world;
  for (let k = 0; k < s.questions.length; k++) {
    const q = s.questions[k];
    if (!q) continue;
    o.answers.push({ questionId: q.id, shownText: [], removedText: [], answered: false });
    if (w.leavesAfterUnanswered(s, k)) { o.left = true; return o; }
  }
  if (s.intent === "support") return o;
  if (!s.wantsMeeting || !w.fillsForm(s)) return o;
  // The form carries its own consent checkbox, so the record is consented.
  o.personalData = w.isOptInCountry(s.country) ? "consented" : "not_required";
  const minutes = w.sdrResponseMinutes(s);
  o.firstResponseMinutes = minutes;
  const b = w.cfg.behaviour;
  const pBook = b.sdrBooksFromCallback * Math.exp(-minutes / 60 / b.bookingDecayHours);
  if (w.draw(s, "sdr-book") >= pBook) return o;
  if (!s.fit && w.draw(s, "sdr-junk") >= b.sdrJunkMeetingShare) return o;
  o.meeting = { owner: s.trueOwner, via: "salesforce", minutesToBook: minutes };
  return o;
}

// ------------------------------------------------------------------ decision-tree chatbot

function rulesChatbot(s: Session, ctx: DesignContext): Outcome {
  const o = empty();
  const w = ctx.world;
  o.firstResponseMinutes = 0;
  for (let k = 0; k < s.questions.length; k++) {
    const q = s.questions[k];
    if (!q) continue;
    const understands = w.draw(s, "bot-understands", q.id) < w.cfg.behaviour.chatbotUnderstands;
    const passage = q.correct ? ctx.kit.passages.find((p) => p.id === q.correct?.citation) : undefined;
    const answered = understands && passage !== undefined;
    o.answers.push({ questionId: q.id, shownText: answered && passage ? [passage.text] : [], removedText: [], answered });
    if (!answered && w.leavesAfterUnanswered(s, k)) { o.left = true; return o; }
  }
  const b = w.cfg.behaviour;
  const clicks = s.wantsMeeting
    ? w.draw(s, "bot-click") < b.chatbotTalkToSalesBuyers
    : s.intent !== "support" && w.draw(s, "bot-click") < b.chatbotTalkToSalesNonBuyers;
  if (!clicks) return o;
  o.personalData = w.isOptInCountry(s.country) && s.cmp !== "granted" ? "without_consent" : w.isOptInCountry(s.country) ? "consented" : "not_required";
  if (!w.acceptsSlot(s)) return o;
  const facts: Facts = { country: s.country, company: s.company, email: s.email, employees: null };
  const routing = routeLead(buildLead(facts, "Web Chat"), s.email, routingCtx(ctx, ctx.handRule, ctx.emptyAccounts));
  if (routing.via === "review") { o.review = true; return reviewMeeting(s, ctx, o); }
  o.meeting = { owner: routing.owner, via: routing.via, minutesToBook: 0 };
  return o;
}

// ------------------------------------------------------------------ shared chat flow

function routingCtx(ctx: DesignContext, rule: AssignmentRule, accounts: AccountIndex): RoutingContext {
  return {
    rule,
    accounts,
    defaultOwner: ctx.kit.org.defaultLeadOwner,
    reviewQueue: ctx.cfg.routing.reviewQueue,
    routeToAccountOwnerWhen: ctx.kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
  };
}

/** A lead parked in review is assigned by a person the next working morning, correctly. */
function reviewMeeting(s: Session, ctx: DesignContext, o: Outcome): Outcome {
  const b = ctx.world.cfg.behaviour;
  const minutes = s.minutesToNextBusinessMorning + 60;
  const p = b.sdrBooksFromCallback * Math.exp(-minutes / 60 / b.bookingDecayHours);
  if (ctx.world.draw(s, "review-book") < p) o.meeting = { owner: s.trueOwner, via: "review", minutesToBook: minutes };
  return o;
}

function answerQuestions(s: Session, ctx: DesignContext, o: Outcome, checkClaims: boolean): boolean {
  for (let k = 0; k < s.questions.length; k++) {
    const q = s.questions[k];
    if (!q) continue;
    const hits = ctx.index.search(q.text, ctx.cfg.retrieval.topK);
    const draft = ctx.sim.answer(s, q, hits);
    o.modelCalls++;
    let shown: string[];
    let removed: string[];
    if (checkClaims) {
      const lookup = (id: string): string | undefined => ctx.index.byId.get(id)?.text;
      const checked = checkAnswer(draft, lookup, ctx.cfg.claims, ctx.kit.playbook.brandTerms);
      shown = checked.shown.map((v) => v.text);
      removed = checked.removed.map((v) => v.text);
    } else {
      shown = draft.map((d) => d.text);
      removed = [];
    }
    const answered = shown.length > 0;
    o.answers.push({ questionId: q.id, shownText: shown, removedText: removed, answered });
    if (!answered && ctx.world.leavesAfterUnanswered(s, k)) { o.left = true; return false; }
  }
  return true;
}

// ------------------------------------------------------------------ model alone

function modelAlone(s: Session, ctx: DesignContext): Outcome {
  const o = empty();
  const w = ctx.world;
  const sim = ctx.sim;
  o.firstResponseMinutes = 0;
  if (!answerQuestions(s, ctx, o, false)) return o;
  const ip = w.reverseIp(s);
  const facts: Facts = {
    country: s.country,
    company: ip?.company ?? s.company,
    intent: sim.intent(s),
    stage: sim.stage(s),
    wantsMeeting: s.wantsMeeting,
    employees: ip?.employees ?? (w.statesUnprompted(s, "employees") ? sim.employees(s) : null),
    role: w.statesUnprompted(s, "role") ? sim.role(s) : undefined,
  };
  o.modelCalls++;
  for (const field of ["employees", "role"] as const) {
    if (facts[field] === null || facts[field] === undefined) {
      if (w.leavesWhenAsked(s, field)) { o.left = true; return o; }
      if (field === "employees") facts.employees = sim.employees(s);
      else facts.role = sim.role(s);
      o.modelCalls++;
    }
  }
  const account = ctx.kit.accounts.match(ip?.domain ?? null);
  let d = qualify(facts, ctx.kit.playbook.qualification, account?.type === "Customer").action;
  if (sim.aloneFlipsQualification(s)) d = d === "book" ? "nurture" : d === "nurture" ? "book" : d;
  if (d === "support") { o.supportHandoff = true; return o; }
  if (d !== "book" || !s.wantsMeeting) return o;

  const optIn = w.isOptInCountry(s.country);
  if (optIn && s.cmp !== "granted" && !sim.aloneAsksEmailWithoutConsent(s)) {
    if (w.consentReply(s) === "denied") return o;
    o.personalData = "consented";
  } else {
    o.personalData = !optIn ? "not_required" : s.cmp === "granted" ? "consented" : "without_consent";
  }
  const enrich = w.emailEnrichment(s);
  const lead = buildLead({ ...facts, email: s.email, employees: enrich?.employees ?? facts.employees, industry: enrich?.industry ?? null, partnerReferral: s.partner, partnerName: s.partnerName }, "Web Chat");
  if (!w.acceptsSlot(s)) return o;

  const crm = w.accounts.find((a) => a.domain === s.domain) ?? null;
  let owner: RefOwner;
  const reference = salesforceOwner(w.rule, lead as Record<string, string | number | boolean | null>, w.defaultOwner);
  const ownedByAe = crm && crm.ownerId && (crm.type === "Customer" || crm.openOpportunity);
  if (ownedByAe && sim.aloneChecksAccountOwner(s)) owner = { type: "User", id: crm.ownerId };
  else {
    const kind = decidingEntryKind(w.rule, lead as Record<string, string | number | boolean | null>);
    owner = kind === "default" || sim.aloneRoutesRight(s, kind)
      ? reference
      : { type: "Queue", id: sim.aloneWrongQueue(s, Object.keys(w.queues), reference.id) };
  }
  o.meeting = { owner, via: "model", minutesToBook: 0 };
  return o;
}

// ------------------------------------------------------------------ platform

function platform(s: Session, ctx: DesignContext, ablate: Set<string>): Outcome {
  const o = empty();
  const w = ctx.world;
  const sim = ctx.sim;
  o.firstResponseMinutes = 0;
  if (!answerQuestions(s, ctx, o, !ablate.has("claim_check"))) return o;

  const ip = ablate.has("enrichment") ? null : w.reverseIp(s);
  const facts: Facts = {
    country: s.country,
    company: ip?.company ?? null,
    employees: ip?.employees ?? (w.statesUnprompted(s, "employees") ? sim.employees(s) : null),
    role: w.statesUnprompted(s, "role") ? sim.role(s) : undefined,
    intent: sim.intent(s),
    stage: sim.stage(s),
    wantsMeeting: s.wantsMeeting,
  };
  o.modelCalls++;
  const accounts = ablate.has("account_match") ? ctx.emptyAccounts : ctx.kit.accounts;
  let decision = qualify(facts, ctx.kit.playbook.qualification, accounts.match(ip?.domain ?? null)?.type === "Customer");
  for (let i = 0; i < 3 && decision.action === "ask"; i++) {
    const field = decision.field;
    if (w.leavesWhenAsked(s, field)) { o.left = true; return o; }
    if (field === "employees") facts.employees = sim.employees(s);
    else if (field === "role") facts.role = sim.role(s);
    else facts.country = sim.country(s);
    o.modelCalls++;
    decision = qualify(facts, ctx.kit.playbook.qualification, accounts.match(ip?.domain ?? null)?.type === "Customer");
  }
  if (decision.action === "support") { o.supportHandoff = true; return o; }
  if (decision.action !== "book" || !s.wantsMeeting) return o;

  if (ablate.has("consent_gate")) {
    const optIn = w.isOptInCountry(s.country);
    o.personalData = !optIn ? "not_required" : s.cmp === "granted" ? "consented" : "without_consent";
  } else {
    let c = decideConsent({ country: facts.country ?? null, cmpMarketing: s.cmp, inChat: "not_asked" }, ctx.cfg.consent);
    if (c.askInChat) c = decideConsent({ country: facts.country ?? null, cmpMarketing: s.cmp, inChat: w.consentReply(s) }, ctx.cfg.consent);
    if (!c.mayCollectPersonalData) return o;
    o.personalData = c.basis === "not_required" ? "not_required" : "consented";
  }
  const enrich = ablate.has("enrichment") ? null : w.emailEnrichment(s);
  facts.email = s.email;
  if (enrich) { facts.employees = enrich.employees; facts.industry = enrich.industry; }
  facts.partnerReferral = s.partner;
  facts.partnerName = s.partnerName;
  if (!w.acceptsSlot(s)) return o;
  const rule = ablate.has("imported_rules") ? ctx.handRule : ctx.importedRule;
  const routing = routeLead(buildLead(facts, ctx.kit.playbook.salesforce.leadSource), matchDomain(s.email, ip?.domain), routingCtx(ctx, rule, accounts));
  if (routing.via === "review") { o.review = true; return reviewMeeting(s, ctx, o); }
  o.meeting = { owner: routing.owner, via: routing.via, minutesToBook: 0 };
  return o;
}

export function runDesign(spec: DesignSpec, s: Session, ctx: DesignContext): Outcome {
  switch (spec.kind) {
    case "form_and_wait": return formAndWait(s, ctx);
    case "rules_chatbot": return rulesChatbot(s, ctx);
    case "model_alone": return modelAlone(s, ctx);
    case "platform": return platform(s, ctx, new Set(spec.ablate ?? []));
  }
}

