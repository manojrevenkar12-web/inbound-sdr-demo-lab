import { useMemo, useState } from "react";
import { routeLead, type RoutingDecision } from "@core/routing/router.ts";
import { AccountIndex, matchDomain } from "@core/salesforce/accounts.ts";
import { entryMatches } from "@core/salesforce/evaluate.ts";
import type { LeadRecord } from "@core/salesforce/types.ts";
import type { Kit } from "../../shared/types.ts";
import { LeadForm, type LeadInput } from "./LeadForm.tsx";
import { PatchPanel } from "./PatchPanel.tsx";
import "./routing.css";

export function RoutingView({ kit }: { kit: Kit }) {
  const r = kit.router;
  const accounts = useMemo(() => new AccountIndex(r.accounts), [r.accounts]);
  const [input, setInput] = useState<LeadInput>({
    country: r.rule.entries.flatMap((e) => e.criteria).find((c) => c.field === "Country")?.values[0] ?? "Germany",
    employees: 640,
    industry: "Manufacturing",
    email: `buyer@new-company.example`,
    companyDomain: "",
    partner: false,
  });

  const lead: LeadRecord = {
    Country: input.country,
    NumberOfEmployees: input.employees,
    Industry: input.industry,
    Email: input.email,
    LeadSource: r.leadSource,
    Partner_Referral__c: input.partner,
    Partner_Name__c: input.partner ? "Referring partner" : null,
    Products_Interested__c: null,
  };

  const decision: RoutingDecision = routeLead(lead, matchDomain(input.email, input.companyDomain || null), {
    rule: r.rule,
    accounts,
    defaultOwner: r.defaultOwner,
    reviewQueue: r.reviewQueue,
    routeToAccountOwnerWhen: r.routeToAccountOwnerWhen,
  });
  const perEntry = r.rule.entries.map((e) => entryMatches(e, lead));

  return (
    <section>
      <div className="view-head">
        <h1>Routing that matches {kit.company}'s Salesforce</h1>
        <p>
          The assignment rule below was imported from the org's metadata export, not re-typed. Change the lead and the real routing
          core, the same code the service and the lab run, decides who gets it. An entry the importer cannot evaluate is never
          treated as a miss: if it might have matched first, the lead goes to a person.
        </p>
      </div>
      {kit.routingPlan.entries.length === 0 ? (
        <p className="ledger-muted">This export has no rule entries.</p>
      ) : (
        <div className="routing-layout">
          <LeadForm kit={kit} value={input} onChange={setInput} />
          <PatchPanel kit={kit} decision={decision} perEntry={perEntry} />
        </div>
      )}
      {kit.routingPlan.inactiveRules.length > 0 && (
        <p className="routing-foot">Inactive rules in the export, ignored: {kit.routingPlan.inactiveRules.join(", ")}.</p>
      )}
    </section>
  );
}
