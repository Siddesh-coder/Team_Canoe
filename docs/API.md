# Canoe API contract

Base URL: wherever the server runs, for example `https://your-name.onrender.com`. All bodies are JSON unless noted. If `CANOE_API_TOKEN` is set on the server, send `Authorization: Bearer <token>` (or `X-API-Key: <token>`) on every `/api` call except `/api/health`. CORS is open, so a Lovable site can call it from the browser. For production, put the token in a server-side function, not in browser code.

Errors: `{ "error": "plain-language message" }` with status 400, 401, 404, 409.

## Claims

| Call | Purpose |
|---|---|
| `GET /api/health` | `{status, policy_version}` |
| `POST /api/claims` | Submit a claim. Body: the ten fact fields as strings (`"True"`, `"False"`, `""` for not known, `quote_eur` as text), plus `claim_summary`, `claimant_name`, `claimant_email`. Returns the full claim. Optional for claimant forms: policy_number, incident_date (YYYY-MM-DD), stated_quote_eur (what the claimant typed), document_quote_eur (amount read from the uploaded quote). The three facts a claimant cannot know (policy_active_on_incident, duplicate_flag, evidence_conflict) are then filled by a demo insurer-systems step, marked with source insurer_system_demo and explained in insurer_checks[]. A check that cannot run leaves the fact blank. CSV and batch input are never enriched. Demo policies: POL-1001 (2025-01-01..2026-12-31), POL-1002 (2026), POL-1003 (2024-07..2027-06), POL-2001 (ended 2026-06-30). |
| `GET /api/claims?status=open` | History list: `claims[]` with `recommendation_v1`, `recommendation_latest`, `effective_recommendation`, `effective_source` (`system`, `reviewer`, `reviewer_confirmed`), `rule`, `policy_version`, `recheck_pending`. |
| `GET /api/claims/{id}` | One claim: `fields[]` (value, status `known/blank/unreadable`, source), `latest_decision` (`recommendation`, `rule_id`, `policy_version`, `explanation`, `detail.trace`), `decisions[]`, `overrides[]`, `fact_edits[]`, `rechecks[]`, `info_requests[]`, `outcomes[]`, `editable`. |
| `POST /api/claims/{id}/info-response` | Claimant answers a request: `{values: {field: "True"}, name}`. Only requested fields are accepted. |

## Reviewer

| Call | Body |
|---|---|
| `POST /api/claims/{id}/override` | `{corrected_recommendation, reason, reviewer}`. Same outcome as the system means "confirm" (reason optional). Stores reviewer, reason and the policy version. 409 for closed claims. |
| `POST /api/claims/{id}/settle` | `{decision: "approve"\|"decline", reason, reviewer}`. Closes the claim for good with the reviewer's final decision. Reason required for decline, and for approve when the recommendation is not routine. 409 afterwards for any change. The engine itself never declines. |
| `POST /api/claims/{id}/facts` | `{changes: {field: value}, reason, reviewer}`. Logs each change, re-runs the policy. |
| `POST /api/claims/{id}/outcome` | `{final_outcome, source, note, recorded_by}`. Late ground truth, kept apart from recommendations. |

## Policy owner

| Call | Body |
|---|---|
| `GET /api/policy` | Versions with rules, plus the field list. |
| `POST /api/policy/parse?mode=replace\|add` | Body: the raw bytes of a `.txt`, `.md` or `.docx` policy written in plain sentences (see `docs/policy_template.txt`). Returns `{draft, lines[], warnings[], notes[], has_errors}`. `draft` is null if any line could not be read (nothing is guessed). `mode=replace` treats the file as the whole policy; `mode=add` inserts its rules into the current ones, review rules ahead of missing-document rules. Writes nothing; pass `draft` to preview/publish. |
| `POST /api/policy/preview` | `{draft: {title, rules, default}}`. Dry run: counts, moves, per-claim rows. Writes nothing. |
| `POST /api/policy/publish` | `{draft, published_by, approved_by, note}`. Writes the next version, re-decides open claims, flags rechecks, leaves closed claims alone. The response includes `version`, `applied` and `change_timing` (how long the change took from first preview to release). |

A rule: `{id, outcome: "human_review"|"request_information", reason, when: [{field, op, value}], blank_counts_as_match?}`. Operators: `is_true, is_false, eq, neq, gt, gte, lt, lte, in, not_in`. Conditions in `when` must all hold. Order matters; the first match decides.

## Measurement and business

| Call | Returns |
|---|---|
| `GET /api/quality` | Per-version metrics (correct, incorrect routine, unnecessary review), changed cases, failures, blank-field handling, monitoring counts. |
| `GET /api/impact` | What the newest policy did to existing claims. Fields: `latest_version`, `versions[]`, `open_claims`, `closed_claims`, `closed_changed` (always 0: closed claims are never re-decided), `recheck_total`, `recheck_pending`, `moves` (e.g. `{"routine_processing -> human_review": 5}`), `rechecks[]` (each: `case_id`, `from_version`, `to_version`, `from_recommendation`, `to_recommendation`, `has_override`, `status` = `pending` or `resolved`), `policy_changes[]`, `settled`. This is where the v1 to v2 comparison comes from. With only one policy version, `rechecks` is empty. You can also build the comparison from `GET /api/claims`: for each claim, compare `recommendation_v1` with `recommendation_latest` (only open claims can differ; closed claims always match). If the comparison looks empty, check that the server is running the latest deploy by opening `/api/impact` in a browser and looking at `recheck_total`. |
| `GET /api/audit` | One feed of overrides, fact edits and policy publications. |
| `GET /api/outbox` | Drafted emails to claimants. |
| `POST /api/batch?save=1&format=csv` | Body: claims CSV as raw text (`Content-Type: text/csv`). Returns `{columns, results[], csv}`; with `format=csv` returns the file. `save=1` also adds claims to the register. |
| `POST /api/labelled-import` | Body: CSV text with `expected_v1` / `expected_v2` columns. |

## Rules for any frontend

* The frontend never makes or changes a decision. It only shows what the API returns.
* Send a "not known" answer as an empty string `""`, never as `"False"`. A blank leads to request_information; "False" can wrongly lead to routine_processing.
* Closed claims are read-only.
