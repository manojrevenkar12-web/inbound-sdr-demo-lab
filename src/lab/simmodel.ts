// The simulated model. It reads the visitor's real question against the real retrieval results and
// drafts sentences, and it pulls facts out of what the visitor says, making errors at the rates in
// world.json. Every design that uses "the model" gets exactly the same errors for the same visitor.

import type { DraftSentence } from "../core/grounding/claims.ts";
import type { Hit } from "../core/grounding/retrieve.ts";
import { u } from "./rng.ts";
import type { Role, Session, Stage, TruthQuestion, TruthSecurityQuestion, World } from "./world/world.ts";

const ROLES: Role[] = ["decision_maker", "influencer", "practitioner", "student", "job_seeker", "vendor"];
const STAGES: Stage[] = ["researching", "evaluating", "ready"];

export class SimModel {
  private readonly world: World;
  private readonly r: Record<string, number>;
  calls = 0;

  constructor(world: World) {
    this.world = world;
    this.r = world.cfg.reader;
  }

  private p(key: string): number {
    const v = this.r[key];
    if (v === undefined) throw new Error(`reader rate ${key} missing`);
    return v;
  }

  private d(s: Session, ...purpose: (string | number)[]): number { return u("model", s.seed, s.id, ...purpose); }

  answer(s: Session, q: TruthQuestion, hits: Hit[]): DraftSentence[] {
    this.calls++;
    const ids = hits.map((h) => h.passage.id);
    const top = ids[0] ?? q.falsehood.citation;
    if (q.correct && ids.includes(q.correct.citation) && this.d(s, q.id, "use") < this.p("retrievalUsesTruePassage")) {
      if (this.d(s, q.id, "slip") < this.p("hallucinateWhenSupported")) return [{ text: q.falsehood.text, citation: q.falsehood.citation }];
      return [{ text: q.correct.text, citation: q.correct.citation }];
    }
    if (this.d(s, q.id, "invent") < this.p("hallucinateWhenUnsupported")) {
      return [{ text: q.falsehood.text, citation: ids.includes(q.falsehood.citation) ? q.falsehood.citation : top }];
    }
    return [];
  }

  country(s: Session): string {
    if (this.d(s, "country") < this.p("extractCountry")) return s.country;
    const others = this.world.cfg.truth.servedCountries.filter((c) => c !== s.country);
    return others[Math.floor(this.d(s, "country-alt") * others.length)] as string;
  }

  employees(s: Session): number {
    if (this.d(s, "employees") < this.p("extractEmployees")) return s.employees;
    return Math.max(1, Math.round(s.employees * (this.d(s, "employees-alt") < 0.5 ? 0.1 : 10)));
  }

  role(s: Session): Role {
    if (this.d(s, "role") < this.p("extractRole")) return s.role;
    const i = ROLES.indexOf(s.role);
    return ROLES[(i + (this.d(s, "role-alt") < 0.5 ? 1 : ROLES.length - 1)) % ROLES.length] as Role;
  }

  intent(s: Session): Session["intent"] {
    if (this.d(s, "intent") < this.p("extractIntent")) return s.intent;
    return s.intent === "sales" ? (s.account ? "support" : "other") : "sales";
  }

  stage(s: Session): Stage {
    if (s.wantsMeeting && s.stage === "researching") return "evaluating";
    if (this.d(s, "stage") < this.p("extractIntent")) return s.stage;
    const i = STAGES.indexOf(s.stage);
    return STAGES[Math.min(2, Math.max(0, i + (this.d(s, "stage-alt") < 0.5 ? -1 : 1)))] as Stage;
  }

  // ---- behaviour only the "model alone" design relies on: the model deciding ----

  aloneFlipsQualification(s: Session): boolean { return this.d(s, "alone-qual") < this.p("aloneQualificationFlip"); }
  aloneAsksEmailWithoutConsent(s: Session): boolean { return this.d(s, "alone-consent") < this.p("aloneAsksEmailWithoutConsent"); }
  aloneChecksAccountOwner(s: Session): boolean { return this.d(s, "alone-acct") < this.p("aloneChecksAccountOwner"); }
  /** The model reading the rules as text gets an entry right with a probability that falls with complexity. */
  aloneRoutesRight(s: Session, kind: "simple" | "booleanFilter" | "formula"): boolean {
    const key = kind === "simple" ? "aloneRoutesSimpleEntry" : kind === "booleanFilter" ? "aloneRoutesBooleanFilterEntry" : "aloneRoutesFormulaEntry";
    return this.d(s, "alone-route") < this.p(key);
  }
  aloneWrongQueue(s: Session, queues: string[], right: string): string {
    const others = queues.filter((q) => q !== right);
    return others[Math.floor(this.d(s, "alone-route-alt") * others.length)] as string;
  }

  // ---- security questionnaires ----

  questionnaire(seed: number, n: number, q: TruthSecurityQuestion): { answer: string | null; evidenceIds: string[] } {
    this.calls++;
    const r = this.world.cfg.questionnaire.reader;
    const d = (k: string): number => u("model-sq", seed, n, q.id, k);
    if (q.evidence.length > 0 && !q.expired && !q.unapproved) {
      if (d("use") < r.usesCorrectEvidence) {
        return { answer: d("wrong") < r.wrongWhenEvidence ? q.falsehood : (q.correct as string), evidenceIds: q.evidence };
      }
      return { answer: q.falsehood, evidenceIds: q.evidence };
    }
    if (q.evidence.length > 0) {
      return d("cite") < r.citesExpiredAnyway ? { answer: q.falsehood, evidenceIds: q.evidence } : { answer: null, evidenceIds: [] };
    }
    return d("invent") < r.hallucinateWhenNoEvidence ? { answer: q.falsehood, evidenceIds: ["ev-iso"] } : { answer: null, evidenceIds: [] };
  }
}
