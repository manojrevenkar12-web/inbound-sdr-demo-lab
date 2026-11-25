// Code decides whether personal data may be asked for or stored. The model never does.
// Company-level enrichment (reverse IP to company) is separate and may run without consent
// when the policy allows it, because it identifies a business, not a person.

import { privacyRegion, type PrivacyRegion } from "../geo.ts";

export type CmpState = "granted" | "denied" | "unset";
export type InChatConsent = "granted" | "denied" | "not_asked";

export interface ConsentPolicy {
  optInRegions: string[];
  companyLevelEnrichmentWithoutConsent: boolean;
}

export interface ConsentInput {
  /** Country from reverse IP or stated by the visitor; null when unknown. */
  country: string | null;
  cmpMarketing: CmpState;
  inChat: InChatConsent;
}

export interface ConsentDecision {
  region: PrivacyRegion;
  mayCollectPersonalData: boolean;
  askInChat: boolean;
  basis: "cmp_consent" | "in_chat_consent" | "not_required" | null;
  reason: string;
}

export function decideConsent(input: ConsentInput, policy: ConsentPolicy): ConsentDecision {
  const region = privacyRegion(input.country);
  // An unknown country is treated as an opt-in region: the safe side.
  const optIn = input.country === null || policy.optInRegions.includes(region);
  if (!optIn) return { region, mayCollectPersonalData: true, askInChat: false, basis: "not_required", reason: `${region}: opt-in not required by policy` };
  if (input.cmpMarketing === "granted") return { region, mayCollectPersonalData: true, askInChat: false, basis: "cmp_consent", reason: "consent banner: marketing granted" };
  if (input.inChat === "granted") return { region, mayCollectPersonalData: true, askInChat: false, basis: "in_chat_consent", reason: "visitor agreed in chat" };
  if (input.inChat === "denied") return { region, mayCollectPersonalData: false, askInChat: false, basis: null, reason: "visitor declined in chat; do not ask again" };
  return { region, mayCollectPersonalData: false, askInChat: true, basis: null, reason: `${input.country === null ? "unknown country" : region}: ask for consent before personal data` };
}

export function mayEnrichCompany(policy: ConsentPolicy): boolean {
  return policy.companyLevelEnrichmentWithoutConsent;
}
