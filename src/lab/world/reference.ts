// The world's own model of what Salesforce does with a lead. Written independently of the core
// importer (regex over the XML, its own criteria and formula semantics, REGEX included) so that
// routing parity is measured against something the core did not produce.

export type RefLead = Record<string, string | number | boolean | null>;
export interface RefOwner { type: "Queue" | "User"; id: string }

interface RefCriterion { field: string; op: string; value: string }
interface RefEntry { assignedTo: RefOwner; criteria: RefCriterion[]; filter: string | null; formula: string | null }
export interface RefRule { name: string; active: boolean; entries: RefEntry[] }

const tag = (src: string, name: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1] as string);
  return out;
};
const one = (src: string, name: string): string | null => {
  const v = tag(src, name)[0];
  return v === undefined ? null : decode(v.trim());
};
const decode = (s: string): string => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function parseRules(xml: string): RefRule[] {
  return tag(xml, "assignmentRule").map((r) => ({
    name: one(r, "fullName") ?? "",
    active: one(r, "active") === "true",
    entries: tag(r, "ruleEntry").map((e) => ({
      assignedTo: { type: one(e, "assignedToType") === "User" ? "User" : "Queue", id: one(e, "assignedTo") ?? "" },
      criteria: tag(e, "criteriaItems").map((c) => ({
        field: (one(c, "field") ?? "").replace(/^Lead\./, ""),
        op: one(c, "operation") ?? "",
        value: one(c, "value") ?? "",
      })),
      filter: one(e, "booleanFilter"),
      formula: one(e, "formula"),
    })),
  }));
}

function criterion(c: RefCriterion, lead: RefLead): boolean {
  const raw = lead[c.field];
  const empty = raw === null || raw === undefined || raw === "";
  const opts = c.value.split(",").map((x) => x.trim().toLowerCase());
  const s = empty ? "" : String(raw).toLowerCase();
  const n = typeof raw === "number" ? raw : Number(raw);
  const t = Number(c.value);
  switch (c.op) {
    case "equals": return empty ? opts.includes("") : opts.includes(s) || (typeof raw === "number" && opts.map(Number).includes(raw));
    case "notEqual": return empty ? !opts.includes("") : !opts.includes(s);
    case "greaterOrEqual": return !empty && !Number.isNaN(n) && n >= t;
    case "greaterThan": return !empty && !Number.isNaN(n) && n > t;
    case "lessOrEqual": return !empty && !Number.isNaN(n) && n <= t;
    case "lessThan": return !empty && !Number.isNaN(n) && n < t;
    case "contains": return !empty && opts.some((o) => o !== "" && s.includes(o));
    case "notContain": return empty || opts.every((o) => o === "" || !s.includes(o));
    case "startsWith": return !empty && opts.some((o) => s.startsWith(o));
    case "includes": return !empty && s.split(";").map((x) => x.trim()).some((x) => opts.includes(x));
    default: throw new Error(`reference: operation ${c.op}`);
  }
}

function filter(expr: string, results: boolean[]): boolean {
  // Rewrite "1 AND (2 OR 3)" into a JS boolean expression over known results only.
  const js = expr.toUpperCase().replace(/\bAND\b/g, "&&").replace(/\bOR\b/g, "||").replace(/\bNOT\b/g, "!")
    .replace(/\d+/g, (d) => String(results[Number(d) - 1] === true));
  if (!/^[\s()!&|truefals]*$/.test(js)) throw new Error(`reference: bad filter ${expr}`);
  return Function(`"use strict"; return (${js});`)() as boolean;
}

/** The two formulas the demo org uses, evaluated the way Salesforce would. */
function formula(src: string, lead: RefLead): boolean {
  const f = src.replace(/\s+/g, "");
  if (f === "AND(Partner_Referral__c,NOT(ISBLANK(Partner_Name__c)))") {
    return lead.Partner_Referral__c === true && lead.Partner_Name__c !== null && lead.Partner_Name__c !== "";
  }
  const rx = /^REGEX\(Email,"(.*)"\)$/.exec(f);
  if (rx) {
    const email = lead.Email;
    if (typeof email !== "string" || email === "") return false;
    const pattern = (rx[1] as string).replace(/\\\\/g, "\\");
    return new RegExp(`^(?:${pattern})$`).test(email);
  }
  throw new Error(`reference: unknown formula ${src}`);
}

export function salesforceOwner(rule: RefRule, lead: RefLead, defaultOwner: RefOwner): RefOwner {
  for (const e of rule.entries) {
    let hit: boolean;
    if (e.formula) hit = formula(e.formula, lead);
    else {
      const results = e.criteria.map((c) => criterion(c, lead));
      hit = e.filter ? filter(e.filter, results) : results.every(Boolean);
    }
    if (hit) return e.assignedTo;
  }
  return defaultOwner;
}

/** Which kind of entry decides this lead: used to simulate how well a model reads the rules as text. */
export function decidingEntryKind(rule: RefRule, lead: RefLead): "simple" | "booleanFilter" | "formula" | "default" {
  for (const e of rule.entries) {
    let hit: boolean;
    if (e.formula) hit = formula(e.formula, lead);
    else {
      const results = e.criteria.map((c) => criterion(c, lead));
      hit = e.filter ? filter(e.filter, results) : results.every(Boolean);
    }
    if (hit) return e.formula ? "formula" : e.filter ? "booleanFilter" : "simple";
  }
  return "default";
}
