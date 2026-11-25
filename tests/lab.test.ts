import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadKit, loadPlatformConfig, ROOT } from "../src/core/kit.ts";
import { importAssignmentRules, activeRule } from "../src/core/salesforce/metadata.ts";
import { makeContext, runDesign, type DesignSpec } from "../src/lab/designs.ts";
import { evaluateGates, type Results } from "../src/lab/report.ts";
import { u } from "../src/lab/rng.ts";
import { runConversations } from "../src/lab/study.ts";
import { World } from "../src/lab/world/world.ts";

const world = new World();
const kit = loadKit("northwind");
const cfg = loadPlatformConfig();

describe("the world", () => {
  it("does not read the platform's settings or the playbook", () => {
    for (const f of ["src/lab/world/world.ts", "src/lab/world/reference.ts", "src/lab/world/drift.ts"]) {
      const src = readFileSync(`${ROOT}${f}`, "utf8");
      expect(src, f).not.toMatch(/platform\.json|playbook|from "\.\.\/\.\.\/core/);
    }
  });

  it("is deterministic per seed and session", () => {
    expect(world.session(7, 3)).toEqual(world.session(7, 3));
    expect(world.session(7, 3)).not.toEqual(world.session(8, 3));
    expect(u("a", 1)).toBe(u("a", 1));
  });

  it("produces the hand-typed rules with exactly the configured drifts", () => {
    const hand = activeRule(importAssignmentRules(world.handXml), "Inbound EMEA");
    expect(hand.entries).toHaveLength(6);
    expect(hand.entries.some((e) => e.booleanFilter)).toBe(false);
    expect(hand.entries.find((e) => e.assignedTo.id === "Midmarket_DACH")?.criteria[0]?.values).toEqual(["Germany", "Austria"]);
  });
});

describe("same luck for every design", () => {
  it("gives every design the same visitor and the same visitor reactions", () => {
    const s = world.session(101, 17);
    expect(world.consentReply(s)).toBe(world.consentReply(world.session(101, 17)));
    const ctxA = makeContext(world, kit, cfg);
    const ctxB = makeContext(world, kit, cfg);
    const platform: DesignSpec = { name: "platform", kind: "platform", label: "" };
    for (let i = 0; i < 200; i++) {
      const v = world.session(101, i);
      expect(runDesign(platform, v, ctxA)).toEqual(runDesign(platform, v, ctxB));
    }
  });

  it("the claim check is the only difference between platform and its ablation on answers", () => {
    const ctx = makeContext(world, kit, cfg);
    const a: DesignSpec = { name: "p", kind: "platform", label: "" };
    const b: DesignSpec = { name: "q", kind: "platform", label: "", ablate: ["claim_check"] };
    for (let i = 0; i < 300; i++) {
      const v = world.session(102, i);
      const oa = runDesign(a, v, ctx);
      const ob = runDesign(b, v, ctx);
      oa.answers.forEach((x, k) => {
        const y = ob.answers[k];
        if (!y) return;
        expect([...x.shownText, ...x.removedText].sort()).toEqual([...y.shownText].sort());
      });
    }
  });
});

describe("study", () => {
  it("the platform beats the form on meetings and the model alone on claims, on a small run", () => {
    const designs = (JSON.parse(readFileSync(`${ROOT}config/lab/designs.json`, "utf8")) as { designs: DesignSpec[] }).designs.filter((d) => ["form_and_wait", "model_alone", "platform"].includes(d.name));
    const m = Object.fromEntries(runConversations(world, kit, cfg, designs, [55], 1500).map((x) => [x.design, x]));
    expect(m.platform?.qualifiedMeetingsPer1k).toBeGreaterThan((m.form_and_wait?.qualifiedMeetingsPer1k ?? 0) * 2);
    expect(m.platform?.unsupportedClaimsPer1kAnswers).toBeLessThan((m.model_alone?.unsupportedClaimsPer1kAnswers ?? 0) / 5);
    expect(m.platform?.consentViolationsPer1kOptIn).toBe(0);
  });

  it("gates compare against numbers and against other metrics", () => {
    const r = { conversations: { a: { x: 10 }, b: { x: 3 } } } as unknown as Results;
    const g = evaluateGates(r, [
      { id: "1", text: "", left: "conversations.a.x", op: ">=", right: "conversations.b.x", factor: 3 },
      { id: "2", text: "", left: "conversations.b.x", op: "<=", right: 2 },
      { id: "3", text: "", left: "conversations.a.x", op: ">=", right: "conversations.b.x", factor: 1, plus: 8 },
    ]);
    expect(g.map((x) => x.pass)).toEqual([true, false, false]);
  });
});
