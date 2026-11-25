# Repeatable tasks

## Add a prospect demo kit
1. Copy `config/demo/kestrel/` to `config/demo/<prospect>/`.
2. Replace `salesforce/Lead.assignmentRules` with the prospect's export
   (`sf project retrieve start --metadata AssignmentRules:Lead`), `org.json` with queues and users, and `accounts.csv`
   with an Account export (Id, Name, Website, OwnerId, Type, Open_Opportunity__c, NumberOfEmployees, BillingCountry, Industry).
3. Fill `content.json` only with text the prospect approved, and `evidence.json` with their trust documents and expiry dates.
4. Write `playbook.json` (ICP, rules of engagement, consent wording) and `script.json` (visitors to replay, questionnaire).
5. `npm run demo <prospect>`; open the console and check the Routing view for refused or partial entries. Each one is a
   discovery question for the prospect's admin.

## Answer "will it route like our Salesforce?"
1. Import the export: `POST /v1/routing/import` with the XML, or `npm run demo`.
2. Replay last year's leads: `POST /v1/routing/replay` with lead records; compare owners with Salesforce's actual owners.
3. Bring the mismatches, grouped by reason, to the technical discovery call.

## Change a policy or threshold
Edit `config/platform.json` or a playbook, then `npm run lab:dev && npm run report`. Commit the regenerated files.
Gates must still pass on dev; held-out is not re-run.

## Change how the world behaves
Edit `config/lab/world.json` or the truth catalogue. Record why in the commit. Never change the world to make a design
look better; change it when it was unrealistic, and say what evidence made you change it.

## Deploy the Apex write-back to a scratch org
```bash
cd salesforce
sf org create scratch -f config/project-scratch-def.json -a sdr
sf project deploy start -o sdr
sf apex run test -o sdr -l RunLocalTests -w 10
```
Then set `SF_INSTANCE_URL` and `SF_ACCESS_TOKEN` for `npm run serve`.

## Refresh the screenshots
`cd web && npm run build && npm run preview`, then `python scripts/screenshots.py`.
