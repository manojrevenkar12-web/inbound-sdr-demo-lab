# 0005. Measure designs in a world with hidden truth, same luck, and held-out seeds

Status: accepted

## Context
Without a customer's traffic, claims about an AI SDR are anecdotes. A simulation is only useful if the designs cannot see
the answers and cannot benefit from different random draws.

## Decision
The world (`src/lab/world/`) holds each visitor's truth and its own independent model of Salesforce routing; it never
imports the core. Every random draw is keyed by seed, session and purpose, so every design meets the same visitors with
the same reactions and the same model errors. Gates were frozen before two held-out seeds ran once behind a lock.

## Consequences
Numbers are comparable across designs and reproducible bit for bit (CI checks this). They are still simulation results:
behaviour rates in `config/lab/world.json` are assumptions, stated in the README's limits.
