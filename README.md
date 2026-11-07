# Canoe: trustworthy claims triage

Thinc! Munich hackathon, Taktile case. Canoe reads a fictional motor claim, recommends **routine_processing**, **request_information** or **human_review**, and shows the facts, the rule and the policy version behind the answer. It never approves or pays a claim.

**Python standard library only.** Nothing to install. Python 3.10 or newer.

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
| Measurement | Quality by policy version, changed cases on their own, failures, blank-input handling, monitoring plan. |
| Business case | Full claim history, policy impact, the measured error rates for the business model, activity log. |

Demo sign-in has no passwords. The name you enter is stored with every override, edit and publish.

## Saturday runbook: the policy change (v2)

1. Open **Policy changes**. Edit the rules (or use *Edit as JSON*). Click **Preview impact**: it lists every open claim that would move and confirms closed claims stay put.
2. Click **Publish v2** with an author and an approver. This writes `policies/v2.json`, re-decides all **open** claims, flags the changed ones for recheck, and leaves **closed** claims exactly as they were.
3. **Commit `policies/v2.json` to the repository.** The judges' batch run reads it from there. On a free host the file system is wiped on restart, so the committed file is the source of truth.
4. For the quality report, add an `expected_v2` column to a labelled CSV and import it on the **Measurement** page. Changed cases are reported separately and show what the change fixed or made worse.

You can also skip the website: copy `policies/v1.json` to `policies/v2.json`, edit it, and run the batch script.

## Tests

```
python -m unittest discover -s tests -v
```

22 tests cover the 14 labelled cases, the 1,500 boundary, every blank field, unreadable values, closed-claim protection, override recording, policy publishing and the batch columns.

## Measured results on the supplied labelled cases (policy v1)

14 of 14 correct. Wrong routine recommendations: 0. Unnecessary escalations: 0. That says the rules match the written policy on these examples. It does not prove coverage of real claims, and 14 cases is too few to quote a risk rate.

## Deploying so a Lovable site can call it

See `docs/API.md`. The server needs no build step. Start command: `python -m canoe.api`. Set `CANOE_API_TOKEN` to require a token. `render.yaml` is included.

## Limits to be honest about

* SQLite on a free host is wiped on restart. Fine for a demo; use a hosted database for real use. Policy files should live in the repository.
* Sign-in is a demo. There is no real authentication or role enforcement beyond the optional API token.
* Evidence documents are not uploaded; a claimant states a document is attached, and the record marks it as stated, not verified.
* Emails are drafted and logged to an outbox, not sent.
