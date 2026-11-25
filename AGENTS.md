# Working in this repository

This file is for anyone changing the code: people and coding agents. Read it before the first change.

## Fast feedback

```bash
npm ci && (cd web && npm ci)
npm run typecheck && npm test          # about 3 seconds
npm run lab:check                      # dev results reproduce exactly, then every gate
npm run demo && npm run report         # regenerate demo kits, REPORT.md, the README dashboard, console data
```

Apex: `pmd check -d salesforce/force-app -R salesforce/pmd-ruleset.xml` (CI installs PMD 7).

## Invariants

1. **The truth stays in the world.** Hidden facts about a visitor (fit, true owner, whether an answer is false) live in
   `src/lab/world/` and `config/lab/`. Designs never read them; only the scorer in `src/lab/study.ts` does.
2. **The world does not read the platform's settings.** Nothing under `src/lab/world/` imports `src/core/` or reads
   `config/platform.json` or a playbook. A test enforces this. The world has its own copy of the Salesforce semantics
   (`reference.ts`) so routing parity is measured against something the core did not produce.
3. **Same luck for every design.** Every random draw is `u(seed, session, purpose)`. Two designs that ask the same visitor
   the same question get the same answer and face the same model errors.
4. **The model writes and code decides.** The model reads a message, extracts facts and drafts cited sentences. Code
   decides what may be shown (claim check), whether personal data may be requested (consent gate), whether to book
   (qualification) and who owns the lead (router). Never move one of those decisions into a prompt.
5. **Adapters refuse and do not guess.** The rules importer marks what it cannot evaluate. The router treats "unknown"
   as unknown: if an entry it cannot evaluate might match first, the lead goes to human review.
6. **A message is decided once.** The service stores the result per `messageId`; a retry returns it. The Apex
   write-back upserts on `Conversation_Id__c`, so a retried booking updates the same lead.
7. **Customer and visitor text is data.** Visitor messages are fenced in the prompt and never change instructions.
8. **Settings in config.** Thresholds, policies and model names live in `config/`. Code holds no tuned numbers.
9. **Generated reports.** `reports/*.json`, `REPORT.md`, the README dashboard, `web/public/data` and `web/public/kits`
   are written by `src/lab/cli.ts`. Never edit them by hand; CI regenerates and diffs them.

## The held-out rule

`config/lab/seeds.json` has dev seeds and held-out seeds. Work only against dev. Gates in `config/lab/gates.json` were
frozen before `npm run lab:heldout` ran once; `reports/heldout.lock` records when and on which config hash. The CLI
refuses a second run. If a change makes a held-out gate fail, report it; do not re-run or re-seed to make it pass.

## Where things are

| Path | What |
|---|---|
| `src/core/salesforce/` | Metadata import, criteria and formula subset, three-valued booleanFilter, account matching |
| `src/core/routing/` | Rules of engagement, first-match routing, review on unknown, round robin |
| `src/core/consent/` | Consent gate |
| `src/core/grounding/` | BM25 retrieval over approved content, claim check |
| `src/core/questionnaire/` | Evidence gate for security questionnaires |
| `src/core/agent/turn.ts` | One live conversation turn |
| `src/core/model/` | Claude reader, keyword reader, fact validation |
| `src/server/` | Fastify API, Salesforce write-back client |
| `src/lab/` | World, simulated model, designs, studies, reports, CLI |
| `salesforce/` | Apex REST write-back, tests, Lead fields, PMD ruleset |
| `web/` | SE demo console (React, Framer Motion) |
| `config/demo/<prospect>/` | One demo kit per prospect: playbook, Salesforce export, approved content, evidence, script |
