import { describe, expect, it } from "vitest";
import { loadKit, loadPlatformConfig } from "../src/core/kit.ts";
import { RoundRobin, routeLead, type RoutingContext } from "../src/core/routing/router.ts";
import { AccountIndex } from "../src/core/salesforce/accounts.ts";
import { World } from "../src/lab/world/world.ts";

const kit = loadKit("northwind");
const cfg = loadPlatformConfig();
const ctx = (accounts = kit.accounts): RoutingContext => ({
  rule: kit.rule,
  accounts,
  defaultOwner: kit.org.defaultLeadOwner,
  reviewQueue: cfg.routing.reviewQueue,
  routeToAccountOwnerWhen: kit.playbook.rulesOfEngagement.routeToAccountOwnerWhen,
});
const lead = (over: Record<string, unknown>) => ({ LeadSource: "Web Chat", Email: "x@newco.example", Partner_Referral__c: false, ...over }) as Record<string, string | number | boolean | null>;

describe("router", () => {
  it("first matching entry wins, in Salesforce order", () => {
    // A 1,500-person German university matches Strategic (entry 2) before Public Sector (entry 3).
    const d = routeLead(lead({ Country: "Germany", NumberOfEmployees: 1500, Industry: "Education" }), null, ctx());
    expect(d).toMatchObject({ via: "rule_entry", entryOrder: 2, owner: { id: "Strategic_DACH" } });
    const p = routeLead(lead({ Country: "Austria", NumberOfEmployees: 300, Industry: "Government" }), null, ctx());
    expect(p.owner).toEqual({ type: "User", id: "markus.weber@northwind.example" });
  });

  it("customers and open opportunities stay with the account owner", () => {
    const d = routeLead(lead({ Country: "United Kingdom", NumberOfEmployees: 711 }), "j@ulmtal-systems.co.uk", ctx());
    expect(d).toMatchObject({ via: "account_owner", owner: { id: "emma.hale@northwind.example" } });
    const ignored = routeLead(lead({ Country: "United Kingdom", NumberOfEmployees: 711 }), "j@ulmtal-systems.co.uk", ctx(new AccountIndex([])));
    expect(ignored.owner.id).toBe("UKI");
  });

  it("sends a lead to review when an entry it cannot evaluate might have matched first", () => {
    const d = routeLead(lead({ Country: "Germany", NumberOfEmployees: 80, Industry: "Healthcare" }), null, ctx());
    expect(d.via).toBe("review");
    expect(d.explanation.join(" ")).toMatch(/entry 5/);
  });

  it("routes free-mail leads with the REGEX entry", () => {
    const d = routeLead(lead({ Country: "France", NumberOfEmployees: 40, Email: "someone@gmail.com" }), null, ctx());
    expect(d.owner.id).toBe("Freemail_Hold");
  });

  it("round robin spreads a queue and keeps named users", () => {
    const rr = new RoundRobin(kit.org.queues);
    const q = { type: "Queue" as const, id: "Midmarket_DACH" };
    expect(new Set([rr.assignee(q), rr.assignee(q), rr.assignee(q)]).size).toBe(3);
    expect(rr.assignee({ type: "User", id: "u@x" })).toBe("u@x");
  });
});

describe("core routing agrees with the world's independent Salesforce reference", () => {
  it("on every lead it does not send to review", () => {
    const world = new World();
    let compared = 0;
    for (let i = 0; i < 3000; i++) {
      const h = world.historicalLead(4242, i);
      const d = routeLead(h.lead, h.lead.Email as string, ctx(new AccountIndex([])));
      if (d.via === "review") continue;
      compared++;
      const ref = world.trueOwnerOf(h.lead, null);
      expect(d.owner, `lead ${i}`).toEqual(ref);
    }
    expect(compared).toBeGreaterThan(2800);
  });
});
