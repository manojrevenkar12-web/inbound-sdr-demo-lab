# inbound-sdr-demo-lab

<!-- results:start -->
Dev seeds 101, 102, 103: 18,000 engaged website sessions per design, the same visitors and the same luck for every design.

| | | |
|---|---|---|
| **4.1×**<br>Qualified meetings vs contact form<br><sub>14.4 → 59.5 per 1,000 engaged sessions</sub> | **151 → 6.2**<br>Unsupported claims vs model alone<br><sub>per 1,000 answers shown to visitors</sub> | **98.1%**<br>Routing matches Salesforce<br><sub>hand-typed rules: 69.2%</sub> |
| **0**<br>Consent violations<br><sub>model alone: 54.6 per 1,000 opt-in sessions</sub> | **−53%**<br>SE time on questionnaires<br><sub>0.9 wrong answers per 100 (model alone 25.9)</sub> | **81% → 42%**<br>Ready buyers missed<br><sub>fit buyers ready to talk who left without a meeting</sub> |

### Conversations

| Design | Qualified meetings / 1k | Pipeline / 1k sessions | Junk meetings | Wrong owner | Unsupported claims / 1k answers | Consent violations / 1k | First response | Ready buyers missed |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Contact form, SDR calls back (today) | 14.4 | €126k | 13.1% | 0.0% | 0 | 0 | 6.5 h | 81% |
| Decision-tree chatbot, rules re-typed by hand | 55.8 | €538k | 69.4% | 62.5% | 0 | 119.6 | instant | 54% |
| LLM agent deciding on its own | 61.4 | €587k | 26.1% | 21.6% | 151 | 54.6 | instant | 45% |
| Model reads, code decides | 59.5 | €564k | 3.5% | 4.0% | 6.2 | 0 | instant | 42% |

<details><summary>Ablations: the platform with one safeguard removed</summary>

| Design | Qualified meetings / 1k | Pipeline / 1k sessions | Junk meetings | Wrong owner | Unsupported claims / 1k answers | Consent violations / 1k | First response | Ready buyers missed |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Model reads, code decides | 59.5 | €564k | 3.5% | 4.0% | 6.2 | 0 | instant | 42% |
| Platform with rules re-typed by hand | 59.6 | €565k | 3.5% | 18.5% | 6.2 | 0 | instant | 42% |
| Platform without the claim check | 61.8 | €588k | 3.4% | 3.9% | 151 | 0 | instant | 41% |
| Platform without the consent gate | 68.2 | €651k | 4.0% | 3.8% | 6.2 | 51.6 | instant | 38% |
| Platform without company enrichment | 57 | €541k | 3.8% | 9.7% | 6.2 | 0 | instant | 44% |
| Platform ignoring account ownership | 59.5 | €564k | 3.5% | 16.8% | 6.2 | 0 | instant | 42% |

</details>

### Routing parity: 12 months of leads replayed against Salesforce

| Routing source | Leads replayed | Same owner as Salesforce | Sent to review | Largest mismatch |
|---|--:|--:|--:|---|
| Imported from the Salesforce metadata export | 7,500 | 98.1% | 1.6% | free-mail address, so the owning account cannot be matched (138) |
| Re-typed by hand into a chat tool | 7,500 | 69.2% | 0.0% | account owner ignored (1012) |

Import of `Lead.assignmentRules`: 9 entries in the active rule, 0 refused, 1 partly evaluable (entry 5: criterion 3 uses operation 'includes').

### Security questionnaires

| Security questionnaire | Wrong answers / 100 | Sent without SE edit | Sent to evidence owner | SE time / 100 questions |
|---|--:|--:|--:|--:|
| SE answers by hand | 1.3 | 0% | 28% | 10.0 h |
| Model answers alone | 25.9 | 88% | 12% | 1.2 h |
| Model drafts, evidence gate decides | 0.9 | 63% | 37% | 4.8 h |

### Gates

| Gate | Dev seeds | Held-out seeds |
|---|---|---|
| Qualified meetings at least 3x the contact form | pass (59.500 >= 43.200) | pass (60.300 >= 47.400) |
| Under 8% of booked meetings are with visitors outside the ICP | pass (0.035 <= 0.080) | pass (0.036 <= 0.080) |
| Under 6% of meetings land with the wrong owner | pass (0.040 <= 0.060) | pass (0.025 <= 0.060) |
| At most 10 unsupported claims per 1,000 answers | pass (6.200 <= 10) | pass (6 <= 10) |
| Unsupported claims at most a tenth of the model acting alone | pass (6.200 <= 15.100) | pass (6 <= 15.660) |
| No personal data taken without consent in opt-in countries | pass (0 == 0) | pass (0 == 0) |
| First response within a minute | pass (0 <= 1) | pass (0 <= 1) |
| Imported routing matches Salesforce on at least 97% of auto-routed leads | pass (0.981 >= 0.970) | pass (0.978 >= 0.970) |
| Imported routing beats hand-typed rules by 20 points | pass (0.981 >= 0.892) | pass (0.978 >= 0.888) |
| At most 3% of leads sent to human review | pass (0.016 <= 0.030) | pass (0.014 <= 0.030) |
| At most 2.5 wrong security answers per 100 questions | pass (0.900 <= 2.500) | pass (0.600 <= 2.500) |
| SE time on questionnaires at most 60% of answering by hand | pass (285 <= 360) | pass (292 <= 360) |

Held-out seeds 9101, 9102 (12,000 sessions per design) were run once, after the gates were frozen; see `reports/heldout.lock`.

| Design | Qualified meetings / 1k | Pipeline / 1k sessions | Junk meetings | Wrong owner | Unsupported claims / 1k answers | Consent violations / 1k | First response | Ready buyers missed |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Contact form, SDR calls back (today) | 15.8 | €138k | 7.8% | 0.0% | 0 | 0 | 6.8 h | 80% |
| Decision-tree chatbot, rules re-typed by hand | 56.7 | €534k | 69.7% | 61.7% | 0 | 115.9 | instant | 55% |
| LLM agent deciding on its own | 62.2 | €587k | 27.5% | 23.8% | 156.6 | 53.2 | instant | 45% |
| Model reads, code decides | 60.3 | €568k | 3.6% | 2.5% | 6 | 0 | instant | 47% |
<!-- results:end -->
