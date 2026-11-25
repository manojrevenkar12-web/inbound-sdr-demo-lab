// Code decides who owns a lead: the customer's rules of engagement first, then the imported
// Salesforce assignment rule in order, first match wins. A refused entry that sits before the
// first match sends the lead to review, because Salesforce might have matched it.

import type { AccountIndex, AccountRow } from "../salesforce/accounts.ts";
import { entryMatches } from "../salesforce/evaluate.ts";
import type { AssignmentRule, LeadRecord, Owner } from "../salesforce/types.ts";

export interface RoutingContext {
  rule: AssignmentRule;
  accounts: AccountIndex;
  defaultOwner: Owner;
  reviewQueue: string;
  routeToAccountOwnerWhen: ("Customer" | "OpenOpportunity")[];
}

export interface RoutingDecision {
  owner: Owner;
  via: "account_owner" | "rule_entry" | "default_owner" | "review";
  entryOrder?: number;
  account?: Pick<AccountRow, "id" | "name" | "type" | "openOpportunity">;
  explanation: string[];
}

export function ownedAccount(account: AccountRow | null, when: RoutingContext["routeToAccountOwnerWhen"]): boolean {
  if (!account || !account.ownerId) return false;
  if (when.includes("Customer") && account.type === "Customer") return true;
  if (when.includes("OpenOpportunity") && account.openOpportunity) return true;
  return false;
}

export function routeLead(lead: LeadRecord, domain: string | null, ctx: RoutingContext): RoutingDecision {
  const explanation: string[] = [];
  const account = ctx.accounts.match(domain);
  if (account) explanation.push(`matched account ${account.name} (${account.type}${account.openOpportunity ? ", open opportunity" : ""})`);
  if (ownedAccount(account, ctx.routeToAccountOwnerWhen) && account) {
    explanation.push(`rules of engagement: ${account.type === "Customer" ? "customer" : "open opportunity"} stays with account owner`);
    return {
      owner: { type: "User", id: account.ownerId },
      via: "account_owner",
      account: { id: account.id, name: account.name, type: account.type, openOpportunity: account.openOpportunity },
      explanation,
    };
  }

  const unknown: number[] = [];
  for (const entry of ctx.rule.entries) {
    const m = entryMatches(entry, lead);
    if (m === null) {
      unknown.push(entry.order);
      continue;
    }
    if (m) {
      if (unknown.length > 0) {
        explanation.push(`entry ${entry.order} matches, but entr${unknown.length > 1 ? "ies" : "y"} ${unknown.join(", ")} before it could not be evaluated`);
        return { owner: { type: "Queue", id: ctx.reviewQueue }, via: "review", entryOrder: entry.order, explanation };
      }
      explanation.push(`${ctx.rule.name} entry ${entry.order} matched -> ${entry.assignedTo.type} ${entry.assignedTo.id}`);
      return { owner: entry.assignedTo, via: "rule_entry", entryOrder: entry.order, explanation };
    }
  }
  if (unknown.length > 0) {
    explanation.push(`no entry matched and entr${unknown.length > 1 ? "ies" : "y"} ${unknown.join(", ")} could not be evaluated`);
    return { owner: { type: "Queue", id: ctx.reviewQueue }, via: "review", explanation };
  }
  explanation.push("no entry matched -> default lead owner");
  return { owner: ctx.defaultOwner, via: "default_owner", explanation };
}

/** Picks the member of a queue who has waited longest since their last meeting. */
export class RoundRobin {
  private readonly last = new Map<string, number>();
  private tick = 0;
  private readonly queues: Record<string, string[]>;
  constructor(queues: Record<string, string[]>) { this.queues = queues; }

  assignee(owner: Owner): string {
    if (owner.type === "User") return owner.id;
    const members = this.queues[owner.id] ?? [];
    if (members.length === 0) return owner.id;
    let best = members[0] as string;
    let bestAt = Number.POSITIVE_INFINITY;
    for (const m of members) {
      const at = this.last.get(m) ?? -1;
      if (at < bestAt) { best = m; bestAt = at; }
    }
    this.last.set(best, this.tick++);
    return best;
  }
}
