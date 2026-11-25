// Builds the Salesforce lead record from what the visitor stated and what enrichment returned.

import type { Facts } from "../qualify/qualify.ts";
import type { LeadRecord } from "../salesforce/types.ts";

export function buildLead(f: Facts, leadSource: string): LeadRecord {
  return {
    Company: f.company ?? null,
    Country: f.country ?? null,
    NumberOfEmployees: f.employees ?? null,
    Industry: f.industry ?? null,
    LeadSource: leadSource,
    Email: f.email ?? null,
    Partner_Referral__c: f.partnerReferral ?? false,
    Partner_Name__c: f.partnerName ?? null,
  };
}
