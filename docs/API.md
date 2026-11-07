# Canoe API contract

Base URL: wherever the server runs, for example `https://your-name.onrender.com`. All bodies are JSON unless noted. If `CANOE_API_TOKEN` is set on the server, send `Authorization: Bearer <token>` (or `X-API-Key: <token>`) on every `/api` call except `/api/health`. CORS is open, so a Lovable site can call it from the browser. For production, put the token in a server-side function, not in browser code.

Errors: `{ "error": "plain-language message" }` with status 400, 401, 404, 409.

## Claims

| Call | Purpose |
|---|---|
| `GET /api/health` | `{status, policy_version}` |
| `POST /api/claims` | Submit a claim. Body: the ten fact fields as strings (`"True"`, `"False"`, `""` for not known, `quote_eur` as text), plus `claim_summary`, `claimant_name`, `claimant_email`. Returns the full claim. |
| `GET /api/claims?status=open` | History list: `claims[]` with `recommendation_v1`, `recommendation_latest`, `effective_recommendation`, `effective_source` (`system`, `reviewer`, `reviewer_confirmed`), `rule`, `policy_version`, `recheck_pending`. |
| `GET /api/claims/{id}` | One claim: `fields[]` (value, status `known/blank/unreadable`, source), `latest_decision` (`recommendation`, `rule_id`, `policy_version`, `explanation`, `detail.trace`), `decisions[]`, `overrides[]`, `fact_edits[]`, `rechecks[]`, `info_requests[]`, `outcomes[]`, `editable`. |
| `POST /api/claims/{id}/info-response` | Claimant answers a request: `{values: {field: "True"}, name}`. Only requested fields are accepted. |

## Reviewer

| Call | Body |
|---|---|
| `POST /api/claims/{id}/override` | `{corrected_recommendation, reason, reviewer}`. Same outcome as the system means "confirm" (reason optional). Stores reviewer, reason and the policy version. 409 for closed claims. |
| `POST /api/claims/{id}/facts` | `{changes: {field: value}, reason, reviewer}`. Logs each change, re-runs the policy. |
| `POST /api/claims/{id}/outcome` | `{final_outcome, source, note, recorded_by}`. Late ground truth, kept apart from recommendations. |

## Policy owner

| Call | Body |
|---|---|
| `GET /api/policy` | Versions with rules, plus the field list. |
| `POST /api/policy/preview` | `{draft: {title, rules, default}}`. Dry run: counts, moves, per-claim rows. Writes nothing. |
| `POST /api/policy/publish` | `{draft, published_by, approved_by, note}`. Writes the next version, re-decides open claims, flags rechecks, leaves closed claims alone. |

A rule: `{id, outcome: "human_review"|"request_information", reason, when: [{field, op, value}], blank_counts_as_match?}`. Operators: `is_true, is_false, eq, neq, gt, gte, lt, lte, in, not_in`. Conditions in `when` must all hold. Order matters; the first match decides.

## Measurement and business

| Call | Returns |
|---|---|
| `GET /api/quality` | Per-version metrics (correct, incorrect routine, unnecessary review), changed cases, failures, blank-field handling, monitoring counts. |
| `GET /api/impact` | What the newest policy did: rechecks, moves, closed claims untouched. |
| `GET /api/audit` | One feed of overrides, fact edits and policy publications. |
| `GET /api/outbox` | Drafted emails to claimants. |
| `POST /api/batch?save=1&format=csv` | Body: claims CSV as raw text (`Content-Type: text/csv`). Returns `{columns, results[], csv}`; with `format=csv` returns the file. `save=1` also adds claims to the register. |
| `POST /api/labelled-import` | Body: CSV text with `expected_v1` / `expected_v2` columns. |

## Rules for any frontend

* The frontend never makes or changes a decision. It only shows what the API returns.
* Send a "not known" answer as an empty string `""`, never as `"False"`. A blank leads to request_information; "False" can wrongly lead to routine_processing.
* Closed claims are read-only.
