// The simulated world: website visitors with a hidden truth, the customer's real Salesforce behaviour,
// enrichment services, and how visitors react. Designs act on it; only the scorer reads the truth.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Stream, u, weightedBy } from "../rng.ts";
import { parseRules, salesforceOwner, type RefLead, type RefOwner, type RefRule } from "./reference.ts";
import { handEnteredXml, type Drift } from "./drift.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;

export type Role = "decision_maker" | "influencer" | "practitioner" | "student" | "job_seeker" | "vendor";
export type Stage = "researching" | "evaluating" | "ready";
export type Intent = "sales" | "support" | "other";
export type Cmp = "granted" | "denied" | "unset";

export interface TruthQuestion {
  id: string;
  topic: string;
  weight: number;
  text: string;
  correct: { text: string; citation: string } | null;
  falsehood: { text: string; citation: string };
}

export interface TruthSecurityQuestion {
  id: string;
  text: string;
  evidence: string[];
  expired?: boolean;
  unapproved?: boolean;
  correct: string | null;
  falsehood: string;
}

export interface WorldConfig {
  sessionsPerSeed: number;
  historicalLeadsPerSeed: number;
  orgExport: string;
  truth: {
    icpMinEmployees: number;
    servedCountries: string[];
    buyingRoles: Role[];
    routeToAccountOwnerWhen: ("Customer" | "OpenOpportunity")[];
    opportunityRateFromQualifiedMeeting: number;
    acvEurByEmployees: [number, number][];
  };
  visitors: {
    country: Record<string, number>;
    inCrmShare: number;
    employeesMedian: number;
    employeesSigma: number;
    industry: Record<string, number>;
    role: Record<Role, number>;
    stage: Record<Stage, number>;
    customerSupportShare: number;
    researchingWantsMeeting: number;
    partnerReferral: number;
    freemail: number;
    cmpMarketing: Record<Cmp, number>;
    questions: Record<string, number>;
    businessHoursCET: [number, number];
    weekendShare: number;
  };
  behaviour: {
    leaveIfUnanswered: number;
    leaveIfAskedForField: number;
    statesCountryUnprompted: number;
    statesEmployeesUnprompted: number;
    statesRoleUnprompted: number;
    inChatConsentYes: { fitReady: number; fitEvaluating: number; other: number };
    acceptsOfferedSlot: number;
    formFill: Record<Stage, number>;
    sdrResponseMinutesMedianInHours: number;
    sdrResponseSigma: number;
    sdrNextMorningExtraMinutes: number;
    bookingDecayHours: number;
    sdrBooksFromCallback: number;
    sdrJunkMeetingShare: number;
    chatbotUnderstands: number;
    chatbotTalkToSalesBuyers: number;
    chatbotTalkToSalesNonBuyers: number;
  };
  enrichment: { reverseIpCompanyMatch: number; emailDomainMatch: number; employeesAccuracy: number };
  reader: Record<string, number>;
  handEnteredRules: { drifts: Drift[] };
  questionnaire: {
    questionsPerSeed: number;
    reader: { usesCorrectEvidence: number; citesExpiredAnyway: number; hallucinateWhenNoEvidence: number; wrongWhenEvidence: number };
    manualErrorRate: number;
  };
}

export interface CrmAccount {
  id: string; name: string; domain: string; ownerId: string; type: "Customer" | "Prospect"; openOpportunity: boolean;
  employees: number; country: string; industry: string;
}

export interface Session {
  seed: number;
  id: string;
  country: string;
  company: string;
  domain: string;
  employees: number;
  industry: string;
  account: CrmAccount | null;
  role: Role;
  intent: Intent;
  stage: Stage;
  partner: boolean;
  partnerName: string | null;
  email: string;
  freemail: boolean;
  cmp: Cmp;
  inBusinessHours: boolean;
  minutesToNextBusinessMorning: number;
  questions: TruthQuestion[];
  wantsMeeting: boolean;
  /** Hidden truth below this line: designs must not read it. */
  fit: boolean;
  trueOwner: RefOwner;
  pipelineEurIfMeeting: number;
}

const OPT_IN = new Set(["Germany", "Austria", "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "United Kingdom", "Ireland", "Netherlands", "France", "Poland"]);

export class World {
  readonly cfg: WorldConfig;
  readonly questions: TruthQuestion[];
  readonly securityQuestions: TruthSecurityQuestion[];
  readonly exportXml: string;
  readonly handXml: string;
  readonly rule: RefRule;
  readonly accounts: CrmAccount[];
  readonly defaultOwner: RefOwner;
  readonly queues: Record<string, string[]>;

  constructor(root = ROOT) {
    this.cfg = JSON.parse(readFileSync(join(root, "config/lab/world.json"), "utf8")) as WorldConfig;
    const truth = JSON.parse(readFileSync(join(root, "config/lab/northwind-truth.json"), "utf8")) as {
      questions: TruthQuestion[]; questionnaire: TruthSecurityQuestion[];
    };
    this.questions = truth.questions;
    this.securityQuestions = truth.questionnaire;
    const dir = join(root, this.cfg.orgExport);
    this.exportXml = readFileSync(join(dir, "Lead.assignmentRules"), "utf8");
    this.handXml = handEnteredXml(this.exportXml, "Inbound EMEA", this.cfg.handEnteredRules.drifts);
    const rules = parseRules(this.exportXml);
    const active = rules.find((r) => r.active);
    if (!active) throw new Error("world: export has no active rule");
    this.rule = active;
    const org = JSON.parse(readFileSync(join(dir, "org.json"), "utf8")) as { defaultLeadOwner: RefOwner; queues: Record<string, string[]> };
    this.defaultOwner = org.defaultLeadOwner;
    this.queues = org.queues;
    this.accounts = readFileSync(join(dir, "accounts.csv"), "utf8").trim().split("\n").slice(1).map((line) => {
      const cells = line.match(/("[^"]*"|[^,]+)/g) ?? [];
      const c = cells.map((x) => x.replace(/^"|"$/g, ""));
      return {
        id: c[0] ?? "", name: c[1] ?? "", domain: (c[2] ?? "").replace(/^https?:\/\/(www\.)?/, ""), ownerId: c[3] ?? "",
        type: c[4] === "Customer" ? "Customer" : "Prospect", openOpportunity: c[5] === "true",
        employees: Number(c[6]), country: c[7] ?? "", industry: c[8] ?? "",
      };
    });
  }

  /** What the customer's Salesforce, with its rules of engagement, would do with this exact lead. */
  trueOwnerOf(lead: RefLead, account: CrmAccount | null): RefOwner {
    if (account && account.ownerId) {
      const when = this.cfg.truth.routeToAccountOwnerWhen;
      if ((when.includes("Customer") && account.type === "Customer") || (when.includes("OpenOpportunity") && account.openOpportunity)) {
        return { type: "User", id: account.ownerId };
      }
    }
    return salesforceOwner(this.rule, lead, this.defaultOwner);
  }

  /** Same queue, or the same named user, counts as the right owner. */
  sameOwner(a: RefOwner, b: RefOwner): boolean {
    return a.type === b.type && a.id === b.id;
  }

  isOptInCountry(country: string): boolean { return OPT_IN.has(country); }

  private acv(employees: number): number {
    let v = 0;
    for (const [min, eur] of this.cfg.truth.acvEurByEmployees) if (employees >= min) v = eur;
    return v;
  }

  session(seed: number, i: number): Session {
    const id = `s${i}`;
    const v = this.cfg.visitors;
    const s = new Stream(`world:${seed}:${id}`);
    let account: CrmAccount | null = null;
    let country: string;
    let employees: number;
    let industry: string;
    let company: string;
    let domain: string;
    if (s.next() < v.inCrmShare) {
      account = s.pick(this.accounts);
      country = account.country; employees = account.employees; industry = account.industry; company = account.name; domain = account.domain;
    } else {
      country = s.weighted(v.country);
      employees = Math.max(3, Math.round(s.logNormal(v.employeesMedian, v.employeesSigma)));
      industry = s.weighted(v.industry);
      const stem = `${s.pick(["Arc", "Birk", "Cedar", "Delta", "Echo", "Fjord", "Gale", "Harbor", "Iris", "Juno", "Kite", "Lumen", "Mosa", "Nova", "Orbit", "Pine", "Quarz", "Rook", "Saga", "Tide"])}${s.pick(["line", "works", "soft", "trade", "group", "labs", "haus", "hub", "point", "form"])}`;
      company = `${stem} ${i}`;
      domain = `${stem.toLowerCase()}${i}.example`;
    }
    const isCustomer = account?.type === "Customer";
    const role = s.weighted(v.role);
    const stage = s.weighted(v.stage);
    let intent: Intent;
    if (role === "student" || role === "job_seeker" || role === "vendor") intent = "other";
    else if (isCustomer && s.next() < v.customerSupportShare) intent = "support";
    else intent = "sales";
    const partner = intent === "sales" && s.next() < v.partnerReferral;
    const freemail = s.next() < v.freemail;
    const email = freemail ? `visitor${i}@${s.pick(["gmail.com", "gmx.de", "web.de", "outlook.com"])}` : `firstname.lastname@${domain}`;
    const cmp = s.weighted(v.cmpMarketing);
    const weekend = s.next() < v.weekendShare;
    const hour = s.int(0, 23);
    const [open, close] = v.businessHoursCET;
    const inBusinessHours = !weekend && hour >= open && hour < close;
    const minutesToNextBusinessMorning = inBusinessHours ? 0 : (((open + 24 - hour) % 24) * 60) + (weekend ? 24 * 60 : 0);
    const nq = Number(s.weighted(v.questions));
    const questions: TruthQuestion[] = [];
    const weights = Object.fromEntries(this.questions.map((q) => [q.id, q.weight])) as Record<string, number>;
    for (let k = 0; k < nq; k++) {
      const qid = weightedBy(s.next(), weights);
      const q = this.questions.find((x) => x.id === qid) as TruthQuestion;
      if (!questions.includes(q)) questions.push(q);
    }
    const wantsMeeting = intent === "sales" && (stage !== "researching" || s.next() < v.researchingWantsMeeting);
    const t = this.cfg.truth;
    const fit = intent === "sales" && employees >= t.icpMinEmployees && t.servedCountries.includes(country) && t.buyingRoles.includes(role);
    const lead: RefLead = {
      Company: company, Country: country, NumberOfEmployees: employees, Industry: industry, LeadSource: "Web Chat",
      Email: email, Partner_Referral__c: partner, Partner_Name__c: partner ? "Taxpartner Nord" : null,
    };
    return {
      seed, id, country, company, domain, employees, industry, account, role, intent, stage, partner,
      partnerName: partner ? "Taxpartner Nord" : null, email, freemail, cmp, inBusinessHours, minutesToNextBusinessMorning,
      questions, wantsMeeting, fit, trueOwner: this.trueOwnerOf(lead, account),
      pipelineEurIfMeeting: fit ? t.opportunityRateFromQualifiedMeeting * this.acv(employees) : 0,
    };
  }

  /** A true lead record with everything known, for routing parity replays. */
  historicalLead(seed: number, i: number): { lead: RefLead; account: CrmAccount | null; domain: string } {
    const s = this.session(seed + 7919, i);
    return {
      lead: {
        Company: s.company, Country: s.country, NumberOfEmployees: s.employees, Industry: s.industry, LeadSource: u(seed, i, "src") < 0.85 ? "Web Chat" : "Website",
        Email: s.email, Partner_Referral__c: s.partner, Partner_Name__c: s.partnerName,
      },
      account: s.account,
      domain: s.domain,
    };
  }

  // ---- visitor behaviour and services (same luck for every design) ----

  draw(s: Session, ...purpose: (string | number)[]): number { return u("behaviour", s.seed, s.id, ...purpose); }

  leavesAfterUnanswered(s: Session, q: number): boolean { return this.draw(s, "leave-unanswered", q) < this.cfg.behaviour.leaveIfUnanswered; }
  leavesWhenAsked(s: Session, field: string): boolean { return this.draw(s, "leave-asked", field) < this.cfg.behaviour.leaveIfAskedForField; }
  statesUnprompted(s: Session, field: "country" | "employees" | "role"): boolean {
    const b = this.cfg.behaviour;
    const p = field === "country" ? b.statesCountryUnprompted : field === "employees" ? b.statesEmployeesUnprompted : b.statesRoleUnprompted;
    return this.draw(s, "states", field) < p;
  }
  consentReply(s: Session): "granted" | "denied" {
    const c = this.cfg.behaviour.inChatConsentYes;
    const p = s.fit && s.stage === "ready" ? c.fitReady : s.fit ? c.fitEvaluating : c.other;
    return this.draw(s, "consent") < p ? "granted" : "denied";
  }
  acceptsSlot(s: Session): boolean { return this.draw(s, "slot") < this.cfg.behaviour.acceptsOfferedSlot; }
  fillsForm(s: Session): boolean { return this.draw(s, "form") < this.cfg.behaviour.formFill[s.stage]; }
  sdrResponseMinutes(s: Session): number {
    const b = this.cfg.behaviour;
    const st = new Stream(`sdr:${s.seed}:${s.id}`);
    return s.minutesToNextBusinessMorning + (s.inBusinessHours ? 0 : b.sdrNextMorningExtraMinutes) + st.logNormal(b.sdrResponseMinutesMedianInHours, b.sdrResponseSigma);
  }
  /** Reverse IP to company: business-level, works without personal data. */
  reverseIp(s: Session): { company: string; domain: string; employees: number; country: string } | null {
    if (this.draw(s, "revip") >= this.cfg.enrichment.reverseIpCompanyMatch) return null;
    return { company: s.company, domain: s.domain, employees: this.enrichedEmployees(s), country: s.country };
  }
  /** Enrichment from a work email domain (only after the visitor gave the email). */
  emailEnrichment(s: Session): { employees: number; industry: string } | null {
    if (s.freemail || this.draw(s, "emailenrich") >= this.cfg.enrichment.emailDomainMatch) return null;
    return { employees: this.enrichedEmployees(s), industry: s.industry };
  }
  private enrichedEmployees(s: Session): number {
    if (this.draw(s, "enrich-acc") < this.cfg.enrichment.employeesAccuracy) return s.employees;
    return Math.max(1, Math.round(s.employees * (this.draw(s, "enrich-err") < 0.5 ? 0.6 : 1.7)));
  }
}
