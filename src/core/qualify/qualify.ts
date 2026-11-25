// Code decides what happens to a visitor from the facts the model read, using the customer's playbook.

export type Role = "decision_maker" | "influencer" | "practitioner" | "student" | "job_seeker" | "vendor";
export type Stage = "researching" | "evaluating" | "ready";
export type Intent = "sales" | "support" | "other";

export interface Facts {
  intent?: Intent;
  country?: string | null;
  employees?: number | null;
  role?: Role;
  stage?: Stage;
  company?: string | null;
  industry?: string | null;
  email?: string | null;
  partnerReferral?: boolean;
  partnerName?: string | null;
  wantsMeeting?: boolean;
}

export interface QualificationCriteria {
  minEmployees: number;
  servedCountries: string[];
  buyingRoles: Role[];
  bookFromStage: Stage;
}

export type Decision =
  | { action: "book"; reasons: string[] }
  | { action: "ask"; field: "employees" | "country" | "role"; reasons: string[] }
  | { action: "nurture"; reasons: string[] }
  | { action: "support"; reasons: string[] }
  | { action: "disqualify"; reasons: string[] };

const STAGES: Stage[] = ["researching", "evaluating", "ready"];

export function qualify(f: Facts, c: QualificationCriteria, isCustomer: boolean): Decision {
  if (f.intent === "support" || (isCustomer && f.intent !== "sales")) {
    return { action: "support", reasons: [isCustomer ? "existing customer with a support question" : "support request"] };
  }
  if (f.intent === "other" || f.role === "student" || f.role === "job_seeker" || f.role === "vendor") {
    return { action: "disqualify", reasons: ["not a buyer"] };
  }
  if (f.country === undefined || f.country === null) return { action: "ask", field: "country", reasons: ["country unknown"] };
  if (!c.servedCountries.includes(f.country)) return { action: "nurture", reasons: [`${f.country} is not a served market`] };
  if (f.employees === undefined || f.employees === null) return { action: "ask", field: "employees", reasons: ["company size unknown"] };
  if (f.employees < c.minEmployees) return { action: "nurture", reasons: [`${f.employees} employees is below ${c.minEmployees}`] };
  if (f.role === undefined) return { action: "ask", field: "role", reasons: ["role unknown"] };
  if (!c.buyingRoles.includes(f.role)) return { action: "nurture", reasons: [`${f.role} is not a buying role`] };
  const stage = f.stage ?? "researching";
  if (STAGES.indexOf(stage) < STAGES.indexOf(c.bookFromStage) && !f.wantsMeeting) {
    return { action: "nurture", reasons: [`stage ${stage} is before ${c.bookFromStage}`] };
  }
  return { action: "book", reasons: [`${f.country}, ${f.employees} employees, ${f.role}, ${stage}`] };
}
