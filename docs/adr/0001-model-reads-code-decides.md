# 0001. The model reads; code decides

Status: accepted

## Context
An inbound AI SDR makes four decisions that carry business or legal weight: what it claims about the product, whether
it may ask for personal data, whether a visitor gets a meeting, and which rep owns the lead. In the lab, a model making
those decisions on its own (`model_alone`) booked 26% of its meetings outside the ICP, sent 22% to the wrong owner,
showed 151 unsupported claims per 1,000 answers and took personal data without consent in 55 of 1,000 opt-in sessions.

## Decision
The model does three things: extract facts the visitor stated, draft sentences that cite approved passages, and nothing
else. Code owns the claim check, the consent gate, qualification against the playbook, and routing. The prompt says so,
and the reader's output is validated field by field; anything malformed is dropped, not repaired.

## Consequences
The model can be swapped (Claude, the keyword reader, a future model) without changing any decision. The cost is
recall: the claim check removes some correct-but-paraphrased sentences, and the platform answers 69% of questions
against 83% for the model alone.
