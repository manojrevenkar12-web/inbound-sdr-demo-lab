// One conversation turn on the live service. The model has already read the message;
// from here on, code decides: what may be shown, what to ask next, whether personal data
// may be requested, who the lead belongs to.

import { decideConsent, type CmpState, type InChatConsent } from "../consent/gate.ts";
import { checkAnswer, type CheckedAnswer } from "../grounding/claims.ts";
import type { Kit, PlatformConfig } from "../kit.ts";
import { mergeFacts } from "../model/facts.ts";
import type { ReaderOutput } from "../model/types.ts";
import { qualify, type Decision, type Facts } from "../qualify/qualify.ts";
import { RoundRobin, routeLead, type RoutingDecision } from "../routing/router.ts";
import { buildLead } from "./lead.ts";
import { matchDomain } from "../salesforce/accounts.ts";

export interface ConversationState {
  id: string;
  facts: Facts;
  cmpMarketing: CmpState;
  inChatConsent: InChatConsent;
  awaitingConsent: boolean;
  companyDomain: string | null;
  booked: { owner: string; via: RoutingDecision["via"] } | null;
}

export interface TurnResult {
  reply: string;
  answer: CheckedAnswer;
  decision: Decision;
  consent: ReturnType<typeof decideConsent>;
  routing: RoutingDecision | null;
  assignee: string | null;
  next: "ask_country" | "ask_employees" | "ask_role" | "ask_consent" | "ask_email" | "booked" | "support" | "nurture" | "disqualified" | "continue";
  state: ConversationState;
}

const ASK: Record<"country" | "employees" | "role", string> = {
  country: "Which country is your team based in?",
  employees: "Roughly how many people work at your company?",
  role: "What is your role in the team looking at this?",
};

export function newConversation(id: string, cmpMarketing: CmpState, companyDomain: string | null): ConversationState {
  return { id, facts: {}, cmpMarketing, inChatConsent: "not_asked", awaitingConsent: false, companyDomain, booked: null };
}

/** The visitor's reply to the consent question is read by fixed rules, not by the model. */
export function readConsentReply(message: string): InChatConsent | null {
  const m = message.trim().toLowerCase();
  if (/^(yes|yeah|yep|sure|ok|okay|ja|gerne|of course|agreed|i agree)\b/.test(m)) return "granted";
  if (/^(no|nope|nein|rather not|don't|do not)\b/.test(m)) return "denied";
  return null;
}

export function decideTurn(
  prev: ConversationState,
  message: string,
  read: ReaderOutput,
  kit: Kit,
  cfg: PlatformConfig,
  rr: RoundRobin,
): TurnResult {
  const state: ConversationState = { ...prev, facts: mergeFacts(prev.facts, read.facts) };
  if (state.awaitingConsent) {
    const c = readConsentReply(message);
    if (c) { state.inChatConsent = c; state.awaitingConsent = false; }
  }

  const lookup = (id: string): string | undefined => kit.passages.find((p) => p.id === id)?.text;
  const answer = checkAnswer(read.draft, lookup, cfg.claims, kit.playbook.brandTerms);
  const account = kit.accounts.match(matchDomain(state.facts.email, state.companyDomain));
  const isCustomer = account?.type === "Customer";
  const decision = qualify(state.facts, kit.playbook.qualification, isCustomer);
  const consent = decideConsent(
    { country: state.facts.country ?? null, cmpMarketing: state.cmpMarketing, inChat: state.inChatConsent },
    cfg.consent,
  );

  const parts: string[] = answer.reply ? [answer.reply] : [];
  let next: TurnResult["next"] = "continue";
  let routing: RoutingDecision | null = null;
  let assignee: string | null = null;

  if (state.booked) {
    next = "booked";
  } else if (decision.action === "ask") {
    next = `ask_${decision.field}`;
    parts.push(ASK[decision.field]);
  } else if (decision.action === "support") {
    next = "support";
    parts.push(`Our support team can help with that: ${kit.playbook.rulesOfEngagement.existingCustomerSupportTo}.`);
  } else if (decision.action === "disqualify") {
    next = "disqualified";
  } else if (decision.action === "nurture") {
    next = "nurture";
    if (parts.length === 0) parts.push("Happy to answer anything else you want to know.");
  } else if (!consent.mayCollectPersonalData) {
    if (consent.askInChat) {
      next = "ask_consent";
      state.awaitingConsent = true;
      state.inChatConsent = "not_asked";
      parts.push(kit.playbook.consent.prompt);
    } else {
      next = "nurture";
      parts.push(kit.playbook.consent.fallback);
    }
  } else if (!state.facts.email) {
    next = "ask_email";
    parts.push("What is your work email, so I can send the invite?");
  } else {
    routing = routeLead(buildLead(state.facts, kit.playbook.salesforce.leadSource), matchDomain(state.facts.email, state.companyDomain), {
      rule: kit.rule,
      accounts: kit.accounts,
      defaultOwner: kit.org.defaultLeadOwner,
      reviewQueue: cfg.routing.reviewQueue,
      routeToAccountOwnerWhen: kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
    });
    assignee = rr.assignee(routing.owner);
    const name = kit.org.users[assignee]?.name ?? assignee;
    state.booked = { owner: assignee, via: routing.via };
    next = "booked";
    parts.push(routing.via === "review"
      ? "Thanks. Our team will confirm the right specialist and send you a time within one working day."
      : `You are booked with ${name}. The invite is on its way.`);
  }

  return { reply: parts.join(" "), answer, decision, consent, routing, assignee, next, state };
}
