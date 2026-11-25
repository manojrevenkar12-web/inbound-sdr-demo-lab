// Turns result files into REPORT.md, the README dashboard and the console's data file. Never edit those by hand.

import type { DesignMetrics, ParityResult, QuestionnaireMetrics } from "./study.ts";

export interface Results {
  run: "dev" | "heldout";
  seeds: number[];
  sessions: number;
  configHash: string;
  conversations: Record<string, DesignMetrics>;
  parity: Record<string, ParityResult>;
  questionnaire: Record<string, QuestionnaireMetrics>;
  import: { entries: number; refused: { order: number; reason: string }[]; partial: { order: number; reason: string }[]; warnings: string[] };
}

export interface Gate { id: string; text: string; left: string; op: ">=" | "<=" | "=="; right: number | string; factor?: number; plus?: number }
export interface GateResult { id: string; text: string; pass: boolean; left: number; right: number; op: string }

function lookup(r: Results, path: string): number {
  const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r);
  if (typeof v !== "number") throw new Error(`gate path ${path} is not a number`);
  return v;
}

export function evaluateGates(r: Results, gates: Gate[]): GateResult[] {
  return gates.map((g) => {
    const left = lookup(r, g.left);
    const base = typeof g.right === "number" ? g.right : lookup(r, g.right);
    const right = Math.round((base * (g.factor ?? 1) + (g.plus ?? 0)) * 1000) / 1000;
    const pass = g.op === ">=" ? left >= right : g.op === "<=" ? left <= right : left === right;
    return { id: g.id, text: g.text, pass, left, right, op: g.op };
  });
}

const pct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`;
const eur = (x: number): string => `€${Math.round(x / 1000).toLocaleString("en-US")}k`;
const num = (x: number | null, d = 1): string => (x === null ? "–" : Number.isInteger(x) ? x.toLocaleString("en-US") : x.toFixed(d));
const mins = (x: number | null): string => (x === null ? "–" : x < 1 ? "instant" : x < 120 ? `${x} min` : `${(x / 60).toFixed(1)} h`);

function conversationTable(r: Results, designs: string[]): string {
  const rows = designs.map((d) => r.conversations[d]).filter((m): m is DesignMetrics => !!m);
  const head = "| Design | Qualified meetings / 1k | Pipeline / 1k sessions | Junk meetings | Wrong owner | Unsupported claims / 1k answers | Consent violations / 1k | First response | Ready buyers missed |";
  const sep = "|---|--:|--:|--:|--:|--:|--:|--:|--:|";
  const body = rows.map((m) =>
    `| ${m.label} | ${num(m.qualifiedMeetingsPer1k)} | ${eur(m.pipelineEurPer1k)} | ${pct(m.junkMeetingShare)} | ${pct(m.wrongOwnerShare)} | ${num(m.unsupportedClaimsPer1kAnswers)} | ${num(m.consentViolationsPer1kOptIn)} | ${mins(m.medianMinutesToFirstResponse)} | ${pct(m.readyBuyersMissedShare, 0)} |`);
  return [head, sep, ...body].join("\n");
}

function parityTable(r: Results): string {
  const rows = Object.values(r.parity).map((p) =>
    `| ${p.variant === "imported_from_salesforce" ? "Imported from the Salesforce metadata export" : "Re-typed by hand into a chat tool"} | ${p.leads.toLocaleString("en-US")} | ${pct(p.parityOfAutoRouted)} | ${pct(p.reviewShare)} | ${p.mismatches[0] ? `${p.mismatches[0].reason} (${p.mismatches[0].count})` : "none"} |`);
  return ["| Routing source | Leads replayed | Same owner as Salesforce | Sent to review | Largest mismatch |", "|---|--:|--:|--:|---|", ...rows].join("\n");
}

function questionnaireTable(r: Results): string {
  const label: Record<string, string> = { se_by_hand: "SE answers by hand", model_alone: "Model answers alone", evidence_gated: "Model drafts, evidence gate decides" };
  const rows = Object.values(r.questionnaire).map((q) =>
    `| ${label[q.design] ?? q.design} | ${num(q.wrongAnswersPer100)} | ${pct(q.autoAnsweredShare, 0)} | ${pct(q.routedToOwnerShare, 0)} | ${(q.seMinutesPer100 / 60).toFixed(1)} h |`);
  return ["| Security questionnaire | Wrong answers / 100 | Sent without SE edit | Sent to evidence owner | SE time / 100 questions |", "|---|--:|--:|--:|--:|", ...rows].join("\n");
}

function gateTable(dev: GateResult[], held: GateResult[] | null): string {
  const rows = dev.map((g) => {
    const h = held?.find((x) => x.id === g.id);
    const show = (x: GateResult): string => `${x.pass ? "pass" : "FAIL"} (${num(x.left, 3)} ${x.op} ${num(x.right, 3)})`;
    return `| ${g.text} | ${show(g)} | ${h ? show(h) : "not run"} |`;
  });
  return ["| Gate | Dev seeds | Held-out seeds |", "|---|---|---|", ...rows].join("\n");
}

export function headline(r: Results): { label: string; value: string; note: string }[] {
  const p = r.conversations.platform as DesignMetrics;
  const f = r.conversations.form_and_wait as DesignMetrics;
  const m = r.conversations.model_alone as DesignMetrics;
  const imp = r.parity.imported_from_salesforce as ParityResult;
  const hand = r.parity.re_typed_by_hand as ParityResult;
  const qg = r.questionnaire.evidence_gated as QuestionnaireMetrics;
  const qh = r.questionnaire.se_by_hand as QuestionnaireMetrics;
  return [
    { label: "Qualified meetings vs contact form", value: `${(p.qualifiedMeetingsPer1k / f.qualifiedMeetingsPer1k).toFixed(1)}×`, note: `${num(f.qualifiedMeetingsPer1k)} → ${num(p.qualifiedMeetingsPer1k)} per 1,000 engaged sessions` },
    { label: "Unsupported claims vs model alone", value: `${num(m.unsupportedClaimsPer1kAnswers)} → ${num(p.unsupportedClaimsPer1kAnswers)}`, note: "per 1,000 answers shown to visitors" },
    { label: "Routing matches Salesforce", value: pct(imp.parityOfAutoRouted), note: `hand-typed rules: ${pct(hand.parityOfAutoRouted)}` },
    { label: "Consent violations", value: num(p.consentViolationsPer1kOptIn), note: `model alone: ${num(m.consentViolationsPer1kOptIn)} per 1,000 opt-in sessions` },
    { label: "SE time on questionnaires", value: `−${Math.round((1 - qg.seMinutesPer100 / qh.seMinutesPer100) * 100)}%`, note: `${num(qg.wrongAnswersPer100)} wrong answers per 100 (model alone ${num((r.questionnaire.model_alone as QuestionnaireMetrics).wrongAnswersPer100)})` },
    { label: "Ready buyers missed", value: `${pct(f.readyBuyersMissedShare, 0)} → ${pct(p.readyBuyersMissedShare, 0)}`, note: "fit buyers ready to talk who left without a meeting" },
  ];
}

export function dashboard(dev: Results, held: Results | null, devGates: GateResult[], heldGates: GateResult[] | null): string {
  const designs = Object.keys(dev.conversations);
  const main = ["form_and_wait", "rules_chatbot", "model_alone", "platform"];
  const tiles = headline(dev);
  const out: string[] = [];
  out.push(`Dev seeds ${dev.seeds.join(", ")}: ${dev.sessions.toLocaleString("en-US")} engaged website sessions per design, the same visitors and the same luck for every design.`);
  out.push("");
  out.push("| | | |");
  out.push("|---|---|---|");
  for (let i = 0; i < tiles.length; i += 3) {
    out.push("| " + tiles.slice(i, i + 3).map((t) => `**${t.value}**<br>${t.label}<br><sub>${t.note}</sub>`).join(" | ") + " |");
  }
  out.push("");
  out.push("### Conversations");
  out.push("");
  out.push(conversationTable(dev, main));
  out.push("");
  out.push("<details><summary>Ablations: the platform with one safeguard removed</summary>");
  out.push("");
  out.push(conversationTable(dev, ["platform", ...designs.filter((d) => d.startsWith("platform_"))]));
  out.push("");
  out.push("</details>");
  out.push("");
  out.push("### Routing parity: 12 months of leads replayed against Salesforce");
  out.push("");
  out.push(parityTable(dev));
  out.push("");
  out.push(`Import of \`Lead.assignmentRules\`: ${dev.import.entries} entries in the active rule, ${dev.import.refused.length} refused, ${dev.import.partial.length} partly evaluable (${dev.import.partial.map((p) => `entry ${p.order}: ${p.reason}`).join("; ") || "none"}).`);
  out.push("");
  out.push("### Security questionnaires");
  out.push("");
  out.push(questionnaireTable(dev));
  out.push("");
  out.push("### Gates");
  out.push("");
  out.push(gateTable(devGates, heldGates));
  if (held) {
    out.push("");
    out.push(`Held-out seeds ${held.seeds.join(", ")} (${held.sessions.toLocaleString("en-US")} sessions per design) were run once, after the gates were frozen; see \`reports/heldout.lock\`.`);
    out.push("");
    out.push(conversationTable(held, main));
  }
  return out.join("\n");
}

export function fullReport(dev: Results, held: Results | null, devGates: GateResult[], heldGates: GateResult[] | null): string {
  const lines = ["# Results", "", "Generated by `npm run report` from `reports/dev.json` and `reports/heldout.json`. Do not edit.", "", dashboard(dev, held, devGates, heldGates), ""];
  lines.push("## All metrics, dev seeds", "");
  const keys = Object.keys(dev.conversations.platform as DesignMetrics).filter((k) => k !== "design" && k !== "label");
  lines.push(`| Design | ${keys.join(" | ")} |`);
  lines.push(`|---|${keys.map(() => "--:").join("|")}|`);
  for (const m of Object.values(dev.conversations)) {
    lines.push(`| ${m.design} | ${keys.map((k) => String((m as unknown as Record<string, unknown>)[k] ?? "–")).join(" | ")} |`);
  }
  lines.push("", "## Routing mismatches, dev seeds", "");
  for (const p of Object.values(dev.parity)) {
    lines.push(`**${p.variant}**`, "");
    for (const x of p.mismatches) lines.push(`- ${x.reason}: ${x.count}`);
    if (p.mismatches.length === 0) lines.push("- none");
    lines.push("");
  }
  return lines.join("\n");
}
