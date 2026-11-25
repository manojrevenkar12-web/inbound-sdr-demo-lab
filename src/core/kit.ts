// Loads one prospect's demo kit: playbook, Salesforce export, approved content and evidence library.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaimPolicy } from "./grounding/claims.ts";
import type { Passage } from "./grounding/retrieve.ts";
import type { EvidenceItem } from "./questionnaire/gate.ts";
import type { QualificationCriteria } from "./qualify/qualify.ts";
import { AccountIndex, parseAccounts } from "./salesforce/accounts.ts";
import { activeRule, importAssignmentRules } from "./salesforce/metadata.ts";
import type { AssignmentRule, ImportReport, Owner } from "./salesforce/types.ts";
import type { ConsentPolicy } from "./consent/gate.ts";

export const ROOT = new URL("../../", import.meta.url).pathname;

export interface Playbook {
  prospect: string;
  company: string;
  tagline: string;
  domain: string;
  brandTerms: string[];
  brand: { primary: string; accent: string };
  qualification: QualificationCriteria;
  rulesOfEngagement: {
    routeToAccountOwnerWhen: ("Customer" | "OpenOpportunity")[];
    existingCustomerSupportTo: string;
    neverDiscuss: string[];
  };
  consent: { prompt: string; fallback: string };
  salesforce: { assignmentRules: string; org: string; accounts: string; activeRule: string; leadSource: string };
  content: string;
  evidence: string;
}

export interface OrgExport {
  orgName: string;
  defaultLeadOwner: Owner;
  users: Record<string, { name: string; role: string }>;
  queues: Record<string, string[]>;
}

export interface PlatformConfig {
  consent: ConsentPolicy & { acceptCmpCategory: string; personalFields: string[] };
  claims: ClaimPolicy;
  retrieval: { topK: number; k1: number; b: number };
  routing: { reviewQueue: string; onRefusedEntry: "review"; roundRobin: "least_recent" };
  questionnaire: { today: string; minutesPerManualAnswer: number; minutesPerReviewedAnswer: number };
  model: { provider: "anthropic"; model: string; maxTokens: number; timeoutMs: number };
  service: { port: number; apiKeys: string; eventLog: string };
}

export interface Kit {
  playbook: Playbook;
  org: OrgExport;
  rulesXml: string;
  rules: ImportReport;
  rule: AssignmentRule;
  accounts: AccountIndex;
  passages: Passage[];
  evidence: EvidenceItem[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export function loadPlatformConfig(root = ROOT): PlatformConfig {
  return readJson<PlatformConfig>(join(root, "config/platform.json"));
}

export function loadKit(prospect: string, root = ROOT): Kit {
  const dir = join(root, "config/demo", prospect);
  const playbook = readJson<Playbook>(join(dir, "playbook.json"));
  const rulesXml = readFileSync(join(dir, playbook.salesforce.assignmentRules), "utf8");
  const rules = importAssignmentRules(rulesXml);
  return {
    playbook,
    org: readJson<OrgExport>(join(dir, playbook.salesforce.org)),
    rulesXml,
    rules,
    rule: activeRule(rules, playbook.salesforce.activeRule),
    accounts: new AccountIndex(parseAccounts(readFileSync(join(dir, playbook.salesforce.accounts), "utf8"))),
    passages: readJson<{ passages: Passage[] }>(join(dir, playbook.content)).passages,
    evidence: readJson<{ items: EvidenceItem[] }>(join(dir, playbook.evidence)).items,
  };
}
