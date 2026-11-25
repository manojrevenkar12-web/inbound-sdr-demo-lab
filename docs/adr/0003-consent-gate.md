# 0003. A consent gate before any personal data

Status: accepted

## Context
Most visitors in the target market are in the EU, the EEA, the UK or Switzerland. An agent that asks for a work email
because the conversation is going well collects personal data without a lawful basis when the consent banner was not
accepted. Qualified itself reads the consent flag from the customer's consent management platform.

## Decision
Code decides, per turn: personal data may be requested only if the banner granted marketing consent, the visitor agreed
in chat, or the visitor is outside the configured opt-in regions. An unknown country is treated as opt-in. A "no" in chat
is final for the conversation. The visitor's yes or no is read by fixed rules, not by the model. Company-level enrichment
(reverse IP to company) is configured separately, because it identifies a business rather than a person.

## Consequences
Zero consent violations in the lab, at a measured price: removing the gate would book about 15% more qualified meetings
(68.2 against 59.5 per 1,000 sessions). That trade-off is shown, not hidden. This is not legal advice; the policy is
configuration so each customer's counsel can set it.
