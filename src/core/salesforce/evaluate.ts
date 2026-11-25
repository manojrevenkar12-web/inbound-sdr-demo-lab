// Evaluates one rule entry against a lead the way Salesforce criteria behave:
// comma lists mean "any of", text compares case-insensitively, a blank field
// never satisfies a comparison except notEqual / notContain.

import { parseBooleanFilter, type Tri } from "./booleanFilter.ts";
import { evalFormula } from "./formula.ts";
import type { Criterion, LeadRecord, RuleEntry } from "./types.ts";

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

const norm = (v: unknown): string => String(v).trim().toLowerCase();

export function evalCriterion(c: Criterion, lead: LeadRecord): boolean {
  const v = lead[c.field];
  const isBlank = blank(v);
  switch (c.operation) {
    case "equals":
      if (isBlank) return c.values.includes("");
      if (typeof v === "boolean") return c.values.some((x) => norm(x) === String(v));
      if (typeof v === "number") return c.values.some((x) => asNumber(x) === v);
      return c.values.some((x) => norm(x) === norm(v));
    case "notEqual":
      if (isBlank) return !c.values.includes("");
      if (typeof v === "number") return c.values.every((x) => asNumber(x) !== v);
      return c.values.every((x) => norm(x) !== norm(v));
    case "greaterThan":
    case "greaterOrEqual":
    case "lessThan":
    case "lessOrEqual": {
      const n = asNumber(v);
      const t = asNumber(c.values[0]);
      if (n === null || t === null) return false;
      if (c.operation === "greaterThan") return n > t;
      if (c.operation === "greaterOrEqual") return n >= t;
      if (c.operation === "lessThan") return n < t;
      return n <= t;
    }
    case "contains":
      if (isBlank) return false;
      return c.values.some((x) => x !== "" && norm(v).includes(norm(x)));
    case "notContain":
      if (isBlank) return true;
      return c.values.every((x) => x === "" || !norm(v).includes(norm(x)));
    case "startsWith":
      if (isBlank) return false;
      return c.values.some((x) => norm(v).startsWith(norm(x)));
  }
}

/**
 * true or false when the core knows; null when it cannot say (a refused entry, or an unsupported
 * criterion that decides the outcome). The router never treats null as a miss.
 */
export function entryMatches(entry: RuleEntry, lead: LeadRecord): boolean | null {
  if (entry.refusal) return null;
  if (entry.formula) return evalFormula(entry.formula, lead);
  const results: Tri[] = entry.criteria.map((c) => (c.unsupported ? null : evalCriterion(c, lead)));
  if (entry.booleanFilter) return parseBooleanFilter(entry.booleanFilter, entry.criteria.length)(results);
  if (results.includes(false)) return false;
  return results.includes(null) ? null : true;
}
