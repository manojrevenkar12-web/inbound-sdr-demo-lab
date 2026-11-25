// Validates whatever a model returned as facts. Unknown keys and bad values are dropped, not repaired.

import { canonicalCountry } from "../geo.ts";
import type { Facts, Intent, Role, Stage } from "../qualify/qualify.ts";

const ROLES: Role[] = ["decision_maker", "influencer", "practitioner", "student", "job_seeker", "vendor"];
const STAGES: Stage[] = ["researching", "evaluating", "ready"];
const INTENTS: Intent[] = ["sales", "support", "other"];

export function validateFacts(raw: unknown): Facts {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const f: Facts = {};
  if (typeof r.intent === "string" && INTENTS.includes(r.intent as Intent)) f.intent = r.intent as Intent;
  if (typeof r.role === "string" && ROLES.includes(r.role as Role)) f.role = r.role as Role;
  if (typeof r.stage === "string" && STAGES.includes(r.stage as Stage)) f.stage = r.stage as Stage;
  if (typeof r.country === "string") {
    const c = canonicalCountry(r.country);
    if (c) f.country = c;
  }
  if (typeof r.employees === "number" && Number.isInteger(r.employees) && r.employees > 0 && r.employees < 5_000_000) f.employees = r.employees;
  if (typeof r.company === "string" && r.company.trim().length > 0 && r.company.length < 120) f.company = r.company.trim();
  if (typeof r.industry === "string" && r.industry.trim().length > 0 && r.industry.length < 60) f.industry = r.industry.trim();
  if (typeof r.email === "string" && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(r.email.trim())) f.email = r.email.trim().toLowerCase();
  if (typeof r.partnerReferral === "boolean") f.partnerReferral = r.partnerReferral;
  if (typeof r.partnerName === "string" && r.partnerName.trim()) f.partnerName = r.partnerName.trim();
  if (typeof r.wantsMeeting === "boolean") f.wantsMeeting = r.wantsMeeting;
  return f;
}

export function mergeFacts(known: Facts, fresh: Facts): Facts {
  const out: Facts = { ...known };
  for (const [k, v] of Object.entries(fresh)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}
