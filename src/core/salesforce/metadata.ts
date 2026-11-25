// Imports a Metadata API AssignmentRules export (Lead.assignmentRules).
// Adapters refuse and do not guess: an entry the core cannot evaluate exactly is kept, marked refused,
// and the router stops at it instead of skipping it.

import { XMLParser } from "fast-xml-parser";
import { parseFormula } from "./formula.ts";
import { parseBooleanFilter } from "./booleanFilter.ts";
import {
  SUPPORTED_OPERATIONS,
  type AssignmentRule,
  type Criterion,
  type ImportReport,
  type Operation,
  type RuleEntry,
} from "./types.ts";

function list<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/** Salesforce stores multi-value criteria as one comma separated string. */
export function splitValues(raw: string): string[] {
  if (raw === "") return [""];
  return raw.split(",").map((s) => s.trim());
}

export function importAssignmentRules(xml: string): ImportReport {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  const doc = parser.parse(xml) as { AssignmentRules?: { assignmentRule?: unknown } };
  if (!doc.AssignmentRules) throw new Error("not an AssignmentRules metadata file");

  const refused: ImportReport["refused"] = [];
  const partialList: ImportReport["partial"] = [];
  const warnings: string[] = [];
  const rules: AssignmentRule[] = [];

  for (const raw of list(doc.AssignmentRules.assignmentRule as Record<string, unknown> | Record<string, unknown>[])) {
    const name = text(raw.fullName);
    const active = text(raw.active).toLowerCase() === "true";
    const entries: RuleEntry[] = [];
    list(raw.ruleEntry as Record<string, unknown> | Record<string, unknown>[]).forEach((e, i) => {
      const order = i + 1;
      const typeRaw = text(e.assignedToType);
      const entry: RuleEntry = {
        order,
        assignedTo: { type: typeRaw === "User" ? "User" : "Queue", id: text(e.assignedTo) },
        criteria: [],
      };
      const reasons: string[] = [];
      if (typeRaw !== "User" && typeRaw !== "Queue") reasons.push(`assignedToType '${typeRaw}' is not supported`);
      if (!entry.assignedTo.id) reasons.push("entry has no assignee");

      const items = list(e.criteriaItems as Record<string, unknown> | Record<string, unknown>[]);
      const partial: string[] = [];
      items.forEach((c, j) => {
        const fieldRaw = text(c.field);
        const op = text(c.operation) as Operation;
        const criterion: Criterion = { index: j + 1, field: fieldRaw.replace(/^Lead\./, ""), operation: op, values: splitValues(text(c.value)) };
        if (!fieldRaw.startsWith("Lead.")) criterion.unsupported = `criterion ${j + 1} reads ${fieldRaw}, a field outside the lead`;
        else if (!SUPPORTED_OPERATIONS.includes(op)) criterion.unsupported = `criterion ${j + 1} uses operation '${op}'`;
        if (criterion.unsupported) partial.push(criterion.unsupported);
        entry.criteria.push(criterion);
      });
      if (partial.length > 0) entry.partial = partial;

      const bf = text(e.booleanFilter);
      if (bf) {
        try {
          parseBooleanFilter(bf, items.length);
          entry.booleanFilter = bf;
        } catch (err) {
          reasons.push(`booleanFilter '${bf}': ${(err as Error).message}`);
        }
      }

      const formula = text(e.formula);
      if (formula) {
        entry.formulaSource = formula;
        if (items.length > 0) reasons.push("entry mixes a formula with criteria items");
        try {
          entry.formula = parseFormula(formula);
        } catch (err) {
          reasons.push(`formula: ${(err as Error).message}`);
        }
      }
      if (!formula && items.length === 0) warnings.push(`${name} entry ${order} has no criteria and matches every lead`);

      if (reasons.length > 0) {
        entry.refusal = reasons.join("; ");
        refused.push({ rule: name, order, reason: entry.refusal });
      } else if (entry.partial) {
        partialList.push({ rule: name, order, reason: entry.partial.join("; ") });
      }
      entries.push(entry);
    });
    rules.push({ name, active, entries });
  }

  const activeCount = rules.filter((r) => r.active).length;
  if (activeCount > 1) warnings.push(`${activeCount} active lead assignment rules; Salesforce allows one`);
  return { rules, refused, partial: partialList, warnings };
}

export function activeRule(report: ImportReport, name?: string): AssignmentRule {
  const rule = name ? report.rules.find((r) => r.name === name) : report.rules.find((r) => r.active);
  if (!rule) throw new Error(name ? `assignment rule '${name}' not found` : "no active assignment rule");
  return rule;
}
