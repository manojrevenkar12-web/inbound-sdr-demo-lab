// Shapes of the generated files the console reads: web/public/kits/*.json and web/public/data/results.json.

import type { AccountRow } from "@core/salesforce/accounts.ts";
import type { AssignmentRule, Owner } from "@core/salesforce/types.ts";

export interface Verdict { text: string; citation: string | null; reason: string }

export interface DemoTurn {
  visitor: string;
  recordedDraft: boolean;
  reply: string;
  shown: Verdict[];
  removed: Verdict[];
  decision: string;
  decisionReasons: string[];
  consent: { region: string; mayCollect: boolean; reason: string };
  routing: { owner: string; via: string; explanation: string[] } | null;
  next: string;
}

export interface Kit {
  prospect: string;
  company: string;
  tagline: string;
  brand: { primary: string; accent: string };
  org: string;
  accounts: number;
  passages: number;
  evidenceItems: number;
  routingPlan: { rule: string; entries: { order: number; owner: string; when: string; status: "imported" | "partial" | "refused"; note: string }[]; warnings: string[]; inactiveRules: string[] };
  router: {
    rule: AssignmentRule;
    accounts: AccountRow[];
    defaultOwner: Owner;
    reviewQueue: string;
    routeToAccountOwnerWhen: ("Customer" | "OpenOpportunity")[];
    users: Record<string, { name: string; role: string }>;
    queues: Record<string, string[]>;
    leadSource: string;
    sampleDomains: { domain: string; name: string; type: string; openOpportunity: boolean }[];
  };
  conversations: { id: string; title: string; country: string; cmp: string; turns: DemoTurn[] }[];
  questionnaire: { question: string; questionId: string; status: "auto" | "owner"; answer: string | null; citations: string[]; routeTo: string | null; reasons: string[] }[];
  voiceOfCustomer: { themes: { theme: string; deals: number; pipelineEur: number; quotes: string[] }[]; rejected: { theme: string }[] };
}

export interface KitIndexEntry { prospect: string; company: string; tagline: string }

export interface DesignMetrics {
  design: string;
  label: string;
  qualifiedMeetingsPer1k: number;
  pipelineEurPer1k: number;
  junkMeetingShare: number;
  wrongOwnerShare: number;
  unsupportedClaimsPer1kAnswers: number;
  consentViolationsPer1kOptIn: number;
  medianMinutesToFirstResponse: number | null;
  readyBuyersMissedShare: number;
}

export interface ResultsFile {
  dev: { seeds: number[]; sessions: number; conversations: Record<string, DesignMetrics>; parity: Record<string, { parityOfAutoRouted: number; reviewShare: number; leads: number }>; questionnaire: Record<string, { design: string; wrongAnswersPer100: number; seMinutesPer100: number; autoAnsweredShare: number }> };
  heldout: { seeds: number[]; sessions: number; conversations: Record<string, DesignMetrics> } | null;
  gates: { dev: { id: string; text: string; pass: boolean }[]; heldout: { id: string; text: string; pass: boolean }[] | null };
  headline: { label: string; value: string; note: string }[];
}
