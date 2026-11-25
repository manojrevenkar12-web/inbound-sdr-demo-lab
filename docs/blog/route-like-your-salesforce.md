# Your AI SDR should route like your Salesforce does

*A technical note for RevOps and marketing ops teams rolling out an inbound AI SDR in Europe.*

The first week with an AI SDR on the website is exciting: conversations at 2 a.m., meetings booked in the chat. The
second week is when an account executive asks why a meeting with her biggest open opportunity landed with someone in the
Nordics. The agent did not misunderstand anyone. It routed with a copy of the rules, and the copy was wrong.

## Where the copy goes wrong

Lead routing usually lives in the CRM as an assignment rule: an ordered list of entries, first match wins. Re-typing it
into another tool loses things in predictable ways. In this project I replayed 12 months of simulated leads through a
hand-typed copy of a realistic rule with five common slips:

- a formula entry for partner referrals that the tool could not express, so it was left out;
- a `booleanFilter` (`1 AND (2 OR 3)`) that became "all criteria must match", so the public-sector entry never fired;
- a country list copied without Switzerland;
- an employee threshold left at last year's 250 instead of 200;
- a REGEX entry for free-mail addresses that was dropped.

The copy also had no account data, so customers and open opportunities were not kept with their account owners. It
agreed with Salesforce on 69% of leads.

## Read the export instead

Salesforce already describes the rule precisely in the Metadata API export, `Lead.assignmentRules`. Reading it directly
and evaluating it with Salesforce's semantics took agreement to 98% of auto-routed leads, measured against an
independent reimplementation. The semantics that matter:

- comma lists mean "any of", and text compares without case;
- a blank field fails every comparison except `notEqual` and `notContain`;
- entries are evaluated in order and the first match wins;
- `booleanFilter` refers to criteria by position.

## Refuse instead of guessing

Some criteria cannot be evaluated outside Salesforce: a multi-select `includes`, a cross-object field, a formula
function with no exact equivalent. The tempting shortcut is to skip that entry. That is the dangerous choice, because a
skipped entry silently sends leads to the next one.

Evaluation here is three-valued. An entry with an unknown criterion still counts as a miss when another of its criteria
is clearly false. A German healthcare lead, however, might match the entry that needs `Products_Interested__c includes
Payroll`. That lead goes to a person, with the reason attached. In the replay this sent 1.6% of leads to review. Each
refused criterion became one question for the admin, which is exactly what a technical discovery call is for.

## Before go-live

1. Retrieve the assignment rule and an Account export.
2. Replay last year's leads and compare owners. Group mismatches by reason.
3. Resolve every refused entry with the admin, or accept review for the leads it touches.
4. Keep customers and open opportunities with their owners. Match free-mail visitors by the company domain from reverse
   IP rather than by the email.

The code, the replay and the numbers are in this repository. The numbers come from a simulation with stated
assumptions, not from a customer deployment.
