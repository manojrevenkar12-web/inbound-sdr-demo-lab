import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkAnswer, checkSentence } from "../src/core/grounding/claims.ts";
import { PassageIndex } from "../src/core/grounding/retrieve.ts";
import { loadKit, loadPlatformConfig, ROOT } from "../src/core/kit.ts";
import { gateAnswer } from "../src/core/questionnaire/gate.ts";
import { summarizeThemes } from "../src/core/feedback/voc.ts";

const kit = loadKit("northwind");
const cfg = loadPlatformConfig();
const look = (id: string) => kit.passages.find((p) => p.id === id)?.text;
const check = (text: string, citation: string | null) => checkSentence({ text, citation }, look, cfg.claims, kit.playbook.brandTerms);

describe("claim check", () => {
  it("keeps a faithful paraphrase", () => {
    expect(check("Yes, a certified connector syncs journal entries, vendors and cost centers with SAP S/4HANA every 15 minutes.", "int-sap").supported).toBe(true);
  });

  it("rejects a changed number, an absolute word, a new name and thin overlap", () => {
    expect(check("The SAP connector syncs every 5 minutes.", "int-sap").reason).toMatch(/number 5/);
    expect(check("All customer data is hosted only in Frankfurt.", "res-hosting").reason).toMatch(/absolute word/);
    expect(check("Northwind Ledger connects to SAP Business One.", "int-sap").reason).toMatch(/Business/);
    expect(check("Northwind Ledger syncs with DATEV in real time including payroll.", "int-datev").supported).toBe(false);
  });

  it("rejects sentences without a citation or with one outside the approved content", () => {
    expect(check("We are ISO 27001 certified.", null).reason).toBe("no citation");
    expect(check("We are ISO 27001 certified.", "blog-post-7").reason).toMatch(/not approved/);
  });

  it("replaces an answer with nothing left by the fallback sentence", () => {
    const a = checkAnswer([{ text: "Pricing starts at 49 euros per user.", citation: "pricing" }], look, cfg.claims, kit.playbook.brandTerms);
    expect(a.usedFallback).toBe(true);
    expect(a.reply).toBe(cfg.claims.fallbackSentence);
  });

  it("catches most tempting wrong answers in the truth catalogue, and lets no correct answer go", () => {
    const truth = JSON.parse(readFileSync(`${ROOT}config/lab/northwind-truth.json`, "utf8")) as { questions: { correct: { text: string; citation: string } | null; falsehood: { text: string; citation: string } }[] };
    const caught = truth.questions.filter((q) => !check(q.falsehood.text, q.falsehood.citation).supported).length;
    expect(caught / truth.questions.length).toBeGreaterThanOrEqual(0.9);
    for (const q of truth.questions) if (q.correct) expect(check(q.correct.text, q.correct.citation).supported, q.correct.text).toBe(true);
  });
});

describe("retrieval", () => {
  it("finds the approved passage for a question", () => {
    const idx = new PassageIndex(kit.passages);
    expect(idx.search("Can you handle XRechnung e-invoices?", 3)[0]?.passage.id).toBe("einv");
    expect(idx.search("zzz qqq", 3)).toEqual([]);
  });
});

describe("security questionnaire gate", () => {
  const gate = (answer: string | null, evidenceIds: string[]) =>
    gateAnswer({ questionId: "q", answer, evidenceIds }, kit.evidence, cfg.questionnaire.today, cfg.claims, "security@x", kit.playbook.brandTerms);

  it("sends a supported, in-date answer", () => {
    expect(gate("The recovery time objective is 8 hours and the recovery point objective is 24 hours.", ["ev-backup"]).status).toBe("auto");
  });
  it("routes expired, unapproved, unknown and unsupported evidence to the owner", () => {
    expect(gate("An independent penetration test was completed in June 2025.", ["ev-pentest"]).reasons[0]).toMatch(/expired/);
    expect(gate("Customer data is deleted within 30 days after contract end.", ["ev-retention-draft"]).reasons[0]).toMatch(/not approved/);
    expect(gate("We hold BSI C5.", ["ev-c5"]).reasons[0]).toMatch(/not in the evidence library/);
    const g = gate("The recovery time objective is 4 hours.", ["ev-backup"]);
    expect(g.status).toBe("owner");
    expect(g.routeTo).toBe("security@northwind.example");
  });
  it("routes an empty draft", () => {
    expect(gate(null, []).status).toBe("owner");
  });
});

describe("voice of the customer", () => {
  it("counts each deal once per theme, ranks by blocked pipeline and rejects unknown themes", () => {
    const { themes, rejected } = summarizeThemes([
      { dealId: "A", theme: "x", pipelineEur: 10, quote: "1" },
      { dealId: "A", theme: "x", pipelineEur: 30, quote: "2" },
      { dealId: "B", theme: "y", pipelineEur: 20, quote: "3" },
      { dealId: "C", theme: "nope", pipelineEur: 99, quote: "4" },
    ], ["x", "y"]);
    expect(themes.map((t) => [t.theme, t.deals, t.pipelineEur])).toEqual([["x", 1, 30], ["y", 1, 20]]);
    expect(rejected).toHaveLength(1);
  });
});
