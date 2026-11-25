// Writes a booked conversation back to Salesforce through the Apex REST resource in salesforce/.
// The payload carries the conversation id, so a retry upserts the same lead instead of creating a second one.

import type { Facts } from "../core/qualify/qualify.ts";
import type { RoutingDecision } from "../core/routing/router.ts";

export interface WritebackPayload {
  conversationId: string;
  company: string | null;
  email: string;
  country: string | null;
  employees: number | null;
  industry: string | null;
  ownerId: string;
  ownerType: "Queue" | "User";
  routedVia: RoutingDecision["via"];
  consentBasis: string | null;
  summary: string;
}

export function writebackPayload(conversationId: string, facts: Facts, routing: RoutingDecision, assignee: string, consentBasis: string | null, transcript: string[]): WritebackPayload {
  return {
    conversationId,
    company: facts.company ?? null,
    email: facts.email ?? "",
    country: facts.country ?? null,
    employees: facts.employees ?? null,
    industry: facts.industry ?? null,
    ownerId: routing.owner.type === "User" ? routing.owner.id : assignee,
    ownerType: routing.owner.type,
    routedVia: routing.via,
    consentBasis,
    summary: transcript.slice(-6).join("\n").slice(0, 4000),
  };
}

export interface SalesforceTarget {
  instanceUrl: string;
  accessToken: string;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export async function sendWriteback(target: SalesforceTarget, payload: WritebackPayload, fetchImpl: Fetch): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetchImpl(`${target.instanceUrl.replace(/\/$/, "")}/services/apexrest/sdr/v1/conversation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${target.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}
