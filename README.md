# Canoe: trustworthy claims triage

Thinc! Munich hackathon, Taktile case. Canoe reads a fictional motor claim, recommends **routine_processing**, **request_information** or **human_review**, and shows the facts, the rule and the policy version behind the answer. It never approves or pays a claim.

**Python standard library only.** Nothing to install. Python 3.10 or newer.

The webapp is under: https://canoe-claim-river.lovable.app !!!!!

https://canoe-claim-river.lovable.app




* This is the **API base URL**. All endpoints start with `/api`, for example `https://canoe-rc49.onrender.com/api/claims`. Use it without a trailing slash.
* Health check: `https://canoe-rc49.onrender.com/api/health` should return `{"status": "ok", ...}`.
* The same address also serves the built-in Canoe test website at `/`.
* No access token is set, so no authentication header is needed.
* The free tier falls asleep when idle. The first request can take 30 to 60 seconds, so open `/api/health` a few minutes before a demo.
* Data saved on the live server (claims, overrides, policies published through the site) is lost when it restarts. Policy files in `policies/` are safe because they are in this repo.
* Building the website elsewhere (for example Lovable)? Read `docs/FRONTEND_BRIEF.md` and `docs/API.md`.

## The one design decision that matters

The written policy decides, in code, with no language model in the decision path. The policy is a versioned JSON file (`policies/v1.json`) that the engine executes in order. Reasons:

* The policy has exact boundaries (a quote of exactly 1,500 is still routine; 1,501 is not). A model can drift on those. A rule engine cannot.
* The judges score the batch output with a script. A deterministic engine gives the same answer every run.
* A blank field is an absent fact. The engine uses three-valued logic (true, false, unknown), so an unknown never turns into a routine approval.

A language model may later extract facts from free text, draft explanations or turn a policy owner's plain-language change into a rule for review. It would only ever propose; the engine decides.

## Run the batch path (what the judges run)

```
python batch.py claims.csv results.csv
```

Output columns, exactly: `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`.

* `recommendation_v1` always comes from v1.
* `recommendation_v2` comes from the newest file in `policies/`. With only v1 present it repeats v1.
* Closed claims: `recommendation_v2` repeats the retained v1 decision, `rule_v2` repeats `rule_v1`, `needs_recheck` is `False`.
* Open claims: `needs_recheck` is `True` when the newest version changes the recommendation.
* Rule ids carry their version, for example `v2:R1.ev_battery`, so you can see which policy produced an answer.
* A row that cannot be processed becomes `human_review`, never routine.

## Run the app (website and API)

```
python -m canoe.api
```

Open http://localhost:8000. The first start loads the supplied development and practice claims. Pages:

| Page | What it does |
|---|---|
| Triage | One claim through a form, or a CSV through the **Batch version** tab. Three example buttons. |
| Claim page | The claimant sees status and answers a missing-information request. |
| Reviewers | Queue, facts, rule trace, history. Correct a fact, override or confirm, with reason, reviewer and policy version recorded. Record a late final outcome. |
| Policy changes | Edit rules, preview which open claims move (closed ones are shown as untouched), publish with an approver. |
| Business case | Full claim history, policy impact, the measured error rates for the business model (and label import), activity log. |

Demo sign-in has no passwords. The name you enter is stored with every override, edit and publish.

## Writing a policy as a document

The policy owner can upload a `.txt`, `.md` or `.docx` on the **Policy changes** page instead of using the rule editor. One rule per sentence, for example `Send to human_review if quote_eur is greater than 1200`. The template is `docs/policy_template.txt` (it is policy v2 written out). No AI is involved: the same text always gives the same rules, and any line that cannot be read stops the upload and is named, so a rule is never silently dropped. The result is a draft; it is previewed and published with an approver like any other change, and saved as `policies/vN.json`.

## Policy v2 (official change notice)

`policies/v2.json` applies the notice: the quote limit falls to EUR 1,200 (exactly 1,200 stays routine) and `repair_type = ev_high_voltage_battery` always goes to human review, ahead of the missing-document rules. `data/labelled_development_cases_v2.csv` holds the dev cases with hand-derived `expected_v2` labels.

## Saturday runbook: the policy change (v2) (already applied; kept as the general procedure)

1. Open **Policy changes**. Edit the rules (or use *Edit as JSON*). Click **Preview impact**: it lists every open claim that would move and confirms closed claims stay put.
2. Click **Publish v2** with an author and an approver. This writes `policies/v2.json`, re-decides all **open** claims, flags the changed ones for recheck, and leaves **closed** claims exactly as they were.
3. **Commit `policies/v2.json` to the repository.** The judges' batch run reads it from there. On a free host the file system is wiped on restart, so the committed file is the source of truth.
4. For the quality report, add an `expected_v2` column to a labelled CSV and import it on the **Business case** page, **Error rates** tab. The full quality report (changed cases reported separately, failures, blank-input handling) is available from `GET /api/quality`.

You can also skip the website: copy `policies/v1.json` to `policies/v2.json`, edit it, and run the batch script.

## Tests

```
python -m unittest discover -s tests -v
```

32 tests cover the 14 labelled cases, the 1,500 boundary, every blank field, unreadable values, closed-claim protection, override recording, policy publishing and the batch columns.

## Measured results on the supplied labelled cases (policy v1)

14 of 14 correct. Wrong routine recommendations: 0. Unnecessary escalations: 0. That says the rules match the written policy on these examples. It does not prove coverage of real claims, and 14 cases is too few to quote a risk rate.

## Deploying so a Lovable site can call it

See `docs/API.md`. The server needs no build step. Start command: `python -m canoe.api`. Set `CANOE_API_TOKEN` to require a token. `render.yaml` is included.

## Limits to be honest about

* SQLite on a free host is wiped on restart. Fine for a demo; use a hosted database for real use. Policy files should live in the repository.
* Sign-in is a demo. There is no real authentication or role enforcement beyond the optional API token.
* Evidence documents are not uploaded; a claimant states a document is attached, and the record marks it as stated, not verified.
* Emails are drafted and logged to an outbox, not sent.
