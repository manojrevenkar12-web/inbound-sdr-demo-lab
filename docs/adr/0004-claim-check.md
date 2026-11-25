# 0004. A lexical claim check against cited approved content

Status: accepted

## Context
Prospects ask about integrations, hosting, certifications and prices. A confident wrong answer ("SAP Business One is
supported", "data never leaves Germany", "49 euros per user") costs trust and can create contractual exposure.

## Decision
Every drafted sentence must cite an approved passage. It is shown only if every number, every capitalised name and every
absolute word (only, never, all, free, guarantee and so on) in it also appears in that passage, and at least 80% of its
other content words do. Otherwise it is removed; if nothing is left, a fixed fallback offers a specialist.

## Consequences
The check caught 23 of 25 tempting wrong answers in the truth catalogue and none of the correct ones were removed. It is
lexical: it misses a dropped negation ("we use no subprocessors") and a narrowed range ("usually takes 6 weeks" against
"6 to 10 weeks"). Both slips are kept in the lab on purpose and show up as the 6 unsupported claims per 1,000 answers.
