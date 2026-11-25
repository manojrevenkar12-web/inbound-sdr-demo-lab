# 0002. Import the Salesforce assignment rules instead of re-typing them

Status: accepted

## Context
Routing set up in a separate tool drifts from the CRM. A public G2 review of Qualified names exactly this: routing rules
have to be set up inside the tool rather than reusing what is configured in Salesforce. In the lab, a hand-typed copy
with five realistic drifts (a dropped formula, a lost booleanFilter, a missing country, an old threshold, a dropped
regex entry) and no account data agreed with Salesforce on 69% of replayed leads.

## Decision
Read the Metadata API export (`Lead.assignmentRules`) directly. Support the criteria operations, booleanFilter and a
formula subset (AND, OR, NOT, ISBLANK, ISPICKVAL, comparisons, REGEX without Java-only features) exactly. Anything else is
refused per criterion. Evaluation is three-valued: an entry with an unknown criterion still misses when another
criterion is false, and a lead whose first possible match is unknown goes to human review. Rules of engagement
(customers and open opportunities stay with the account owner) run first, matching accounts by work-email domain or,
for free-mail addresses, by the company domain from reverse IP.

## Consequences
98% agreement with an independent reference on auto-routed leads, 1.6% sent to review. Each refused or partial entry
becomes a concrete question for the customer's admin during technical discovery.
