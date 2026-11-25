# 0006. Security questionnaires answered only from in-date, approved evidence

Status: accepted

## Context
Solution engineers answer security questionnaires as part of most enterprise deals. A model answering alone sent a wrong
answer for 26 of 100 questions in the lab, mostly by citing expired evidence or inventing facts where no evidence exists.

## Decision
The model drafts an answer and names its evidence. Code sends it only if every cited item exists, is approved for
customers, is in date, and supports every sentence. Everything else goes to the item's owner with the reason.

## Consequences
0.9 wrong answers per 100 questions (by hand: 1.3) and about half of the SE's time saved, because 63% of answers need only
a one-minute review. Expired evidence becomes visible as a task for the security team instead of a stale answer.
