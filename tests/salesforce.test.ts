import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importAssignmentRules, activeRule } from "../src/core/salesforce/metadata.ts";
import { evalCriterion, entryMatches } from "../src/core/salesforce/evaluate.ts";
import { parseFormula, evalFormula, safePattern } from "../src/core/salesforce/formula.ts";
import { parseBooleanFilter } from "../src/core/salesforce/booleanFilter.ts";
import { AccountIndex, isFreemail, matchDomain, normalizeDomain, parseAccounts, rootDomain } from "../src/core/salesforce/accounts.ts";
import { ROOT } from "../src/core/kit.ts";

const xml = readFileSync(`${ROOT}config/demo/northwind/salesforce/Lead.assignmentRules`, "utf8");

const wrap = (entries: string): string => `<?xml version="1.0"?><AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
<assignmentRule><fullName>T</fullName><active>true</active>${entries}</assignmentRule></AssignmentRules>`;

describe("assignment rule import", () => {
  const report = importAssignmentRules(xml);
  const rule = activeRule(report, "Inbound EMEA");

  it("reads every entry of the active rule in order and keeps the inactive one", () => {
    expect(rule.entries).toHaveLength(9);
    expect(rule.entries.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(report.rules.find((r) => r.name === "Legacy Trade Shows 2023")?.active).toBe(false);
  });

  it("splits comma lists and strips the Lead. prefix", () => {
    const e = rule.entries[1];
    expect(e?.assignedTo).toEqual({ type: "Queue", id: "Strategic_DACH" });
    expect(e?.criteria[0]).toMatchObject({ field: "Country", operation: "equals", values: ["Germany", "Austria", "Switzerland"] });
  });

  it("imports the supported formula subset, REGEX included", () => {
    expect(rule.entries[0]?.formula).toBeDefined();
    expect(rule.entries[7]?.formula?.kind).toBe("regex");
    expect(report.refused).toEqual([]);
  });

  it("marks a criterion it cannot evaluate as partial, not the whole entry", () => {
    expect(report.partial).toEqual([{ rule: "Inbound EMEA", order: 5, reason: "criterion 3 uses operation 'includes'" }]);
    expect(rule.entries[4]?.refusal).toBeUndefined();
  });

  it("refuses formulas outside the subset instead of approximating them", () => {
    const r = importAssignmentRules(wrap(`<ruleEntry><assignedTo>Q</assignedTo><assignedToType>Queue</assignedToType><formula>CONTAINS(TEXT(Rating), "Hot")</formula></ruleEntry>`));
    expect(r.refused[0]?.reason).toMatch(/outside the supported formula subset/);
  });

  it("refuses a booleanFilter that refers to a criterion that does not exist", () => {
    const r = importAssignmentRules(wrap(`<ruleEntry><assignedTo>Q</assignedTo><assignedToType>Queue</assignedToType><booleanFilter>1 OR 3</booleanFilter>
      <criteriaItems><field>Lead.Country</field><operation>equals</operation><value>Germany</value></criteriaItems></ruleEntry>`));
    expect(r.refused[0]?.reason).toMatch(/criterion 3/);
  });

  it("warns about catch-all entries and rejects files that are not assignment rules", () => {
    const r = importAssignmentRules(wrap(`<ruleEntry><assignedTo>Q</assignedTo><assignedToType>Queue</assignedToType></ruleEntry>`));
    expect(r.warnings[0]).toMatch(/matches every lead/);
    expect(() => importAssignmentRules("<Flow></Flow>")).toThrow(/not an AssignmentRules/);
  });
});

describe("criteria semantics", () => {
  const c = (operation: string, values: string[], field = "Country") => ({ index: 1, field, operation: operation as "equals", values });

  it("equals is any-of and case-insensitive", () => {
    expect(evalCriterion(c("equals", ["Germany", "Austria"]), { Country: "germany" })).toBe(true);
    expect(evalCriterion(c("equals", ["Germany"]), { Country: "France" })).toBe(false);
  });

  it("a blank field fails comparisons but passes notEqual and notContain", () => {
    expect(evalCriterion(c("equals", ["Germany"]), { Country: null })).toBe(false);
    expect(evalCriterion(c("notEqual", ["Germany"]), { Country: "" })).toBe(true);
    expect(evalCriterion(c("notContain", ["x"]), {})).toBe(true);
    expect(evalCriterion(c("greaterOrEqual", ["200"], "NumberOfEmployees"), { NumberOfEmployees: null })).toBe(false);
  });

  it("compares numbers as numbers", () => {
    expect(evalCriterion(c("greaterOrEqual", ["200"], "NumberOfEmployees"), { NumberOfEmployees: 200 })).toBe(true);
    expect(evalCriterion(c("lessThan", ["200"], "NumberOfEmployees"), { NumberOfEmployees: 1999 })).toBe(false);
  });

  it("booleanFilter is three-valued", () => {
    const f = parseBooleanFilter("1 AND (2 OR 3)", 3);
    expect(f([true, false, true])).toBe(true);
    expect(f([false, null, null])).toBe(false);
    expect(f([true, null, false])).toBe(null);
    expect(f([true, null, true])).toBe(true);
  });

  it("an entry with an unknown criterion is still a miss when another criterion is false", () => {
    const rule = activeRule(importAssignmentRules(xml), "Inbound EMEA");
    const partial = rule.entries[4];
    if (!partial) throw new Error("entry 5 missing");
    expect(entryMatches(partial, { Country: "Sweden", Industry: "Healthcare" })).toBe(false);
    expect(entryMatches(partial, { Country: "Germany", Industry: "Healthcare" })).toBe(null);
  });
});

describe("formula subset", () => {
  it("evaluates AND, NOT, ISBLANK and checkboxes", () => {
    const f = parseFormula("AND(Partner_Referral__c, NOT(ISBLANK(Partner_Name__c)))");
    expect(evalFormula(f, { Partner_Referral__c: true, Partner_Name__c: "Taxpartner" })).toBe(true);
    expect(evalFormula(f, { Partner_Referral__c: true, Partner_Name__c: "" })).toBe(false);
  });

  it("REGEX matches the whole value, as Salesforce does", () => {
    const f = parseFormula('REGEX(Email, ".*@(gmail|web)\\\\.[a-z]+")');
    expect(evalFormula(f, { Email: "a@gmail.com" })).toBe(true);
    expect(evalFormula(f, { Email: "a@gmail.com.evil.io" })).toBe(false);
    expect(evalFormula(f, { Email: null })).toBe(false);
  });

  it("refuses regex features that differ between Java and JavaScript", () => {
    expect(() => safePattern("(?i)abc")).toThrow();
    expect(() => safePattern("(a)\\1")).toThrow();
    expect(() => safePattern("a++")).toThrow();
    expect(safePattern("[a-z]+@x\\.de")).toBe("[a-z]+@x\\.de");
  });
});

describe("accounts", () => {
  it("normalises domains and matches subdomains to the account", () => {
    expect(normalizeDomain("https://www.Acme.de/about")).toBe("acme.de");
    expect(rootDomain("eu.billing.acme.co.uk")).toBe("acme.co.uk");
    const idx = new AccountIndex(parseAccounts(readFileSync(`${ROOT}config/demo/northwind/salesforce/accounts.csv`, "utf8")));
    expect(idx.match("someone@www.ulmtal-systems.co.uk")?.name).toBe("Ulmtal Systems Ltd");
    expect(idx.match(null)).toBeNull();
  });

  it("falls back to the company domain for free-mail addresses", () => {
    expect(isFreemail("x@gmx.de")).toBe(true);
    expect(matchDomain("x@gmail.com", "acme.de")).toBe("acme.de");
    expect(matchDomain("x@acme.de", "other.de")).toBe("x@acme.de");
  });
});
