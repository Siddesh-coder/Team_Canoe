<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Questions live in `src/config/<vertical>.json`; the renderer in `src/components/canoe` is generic — add verticals as config, not code.
- All intake rules (next question, mappings, insurer mock, CSV) are pure functions in `src/lib/intake/logic.ts` with tests beside them; UI must not re-implement them.
- Writes to `claim_rows`/`fact_log` go only through server functions in `src/lib/claims.functions.ts` (admin client, row built server-side); the browser only reads.
- Decision columns on claim_rows (recommendation, rule, policy_version, explanation, missing_fields) come from the external rules engine; the app never computes them. Missing-mode updates patch only the listed CSV columns (patchMissingColumns). Why: the engine is the single source of decisions.
- The reviewer page (/review) has no decision logic: all data goes through `src/lib/review/api.ts` (http when VITE_API_URL is set, else an in-memory mock built from claim_rows). Why: the Python backend owns decisions; the mock only mirrors its write behaviour.
- Recommendation presentation uses the shared RecommendationLabel component, with existing page-specific information colours; this keeps status typography consistent without changing data or decisions.
- PencilBackdrop renders PapercutSea using decoded, once-rasterized SVG layers at DPR ≤1.5 and a shared visibility-aware animation clock; tunables and sailTo stay in papercut.ts. Why: keeps the existing artwork while avoiding repeated SVG effects and off-screen animation.
- The policy page (/policy) has no decision logic: all data goes through `src/lib/policy/api.ts` (http when VITE_API_URL is set, else an in-memory mock with canned previews in `src/lib/policy/mock.ts`). Why: the Python engine owns rule evaluation; the mock only replays known demo results.
- Policy document transport lives in `src/lib/policy/documents.ts`; successful engine drafts feed the existing PolicyPage state unchanged, and parse errors never update it. Why: document conversion and add/replace semantics belong exclusively to the backend.
- The policy Simulate scene (LocksScene) is a wiring diagram built only from preview rows: v1 and v2 wire paths share one segment structure so they can morph. Why: smooth "what changed" view without any decision logic.
- Landing WiringDiagram is an independent pure-SVG reference illustration with CSS flow/pulse animation and fixed demo counts, not the live LocksScene. Why: preserve live policy logic while matching the landing reference.
- TodaySlide and LandingSteps own once-only scroll entrances with reduced-motion fallbacks; the hero accent uses PapercutSea's arrival callback. Why: synchronize animation without decision logic.
- ScrollWaves is root-mounted decoration placed between the [data-waves-start] and #waves-end anchors, hidden without them. Why: stays tied to its section without changing layout.
- The pencil lake backdrop renders only on customer pages: the intake (/claim, fixed) and the landing hero + closing (contained per section); internal pages stay on plain paper. Why: it overlapped cards and text.
- Business reporting reads the live impact, quality, claims and audit API through src/lib/business/api.ts; a labelled snapshot is used only with no API URL. All financial arithmetic and published-data shaping are pure functions in src/lib/business/logic.ts, never policy evaluation. Why: separates draft work from measured reporting without duplicating engine decisions.
- BusinessVisuals uses labelled calculateScenario arithmetic and policyDistribution projections; existing measured assumptions/results stay separate. Why: illustrative investor inputs are not measured savings or locally evaluated policy decisions.
- LocksScene supports a published read-only mode with no quote editing; original rule IDs for changed cases come from engine decision history. Why: the same wiring visual can display published changes accurately.
- Ask Canoe uses server-only role instructions and Gateway calls; customer tracking allows only fixed synthetic IDs or signed HttpOnly browser grants issued on CLM submission. Why: prevent customer-data disclosure by guessed references.
- Customer `getCustomerStatus(claim, now)` and `fetchCustomerStatus(caseId)` live in `src/lib/customer/status.ts`; the agent answers only from this, never decides or explains internal rules. Server handlers share `readCustomerClaim`, never call RPC stubs from another handler. Why: keep one safe presentation of live engine decisions.
- Live intake POST payloads use `buildApiPayload` in intake logic; customer request writes patch only engine-requested fields. The Cloud submission/update functions remain fallback-only. Why: the live insurer and rules engine own system facts and decisions.
- Customer/reviewer reminders share `src/lib/customer/reminders.ts`; schedules and demo time are simulated, and reviewer send/pause state is panel-local, not actual email/SMS dispatch. Why: no delivery/reminder endpoint exists in the current API contract.
- Customer status reads pass through the explicit projection in `src/lib/customer/projection.ts`; an answered request awaiting a newer engine decision is shown as checking, never evaluated locally. Why: protect private fields and preserve engine authority when request_status is omitted.
- Demo workspace roles use the shared client-only DemoSession provider, role matrix and root presentation gate; they are not backend authorization. Never transmit or persist mock passwords; customer routes bypass the gate, and internal writes use the session name. Why: simulate jury roles without changing live API security or Ask Canoe.
- Batch transport and returned-output counts live in src/lib/batch/api.ts; the public /batch page sends raw CSV to the configured engine without a mock or local decisions. Why: preserve the backend's exact batch contract and authority.
- Demo session and site tools context objects live in context-only modules, separate from provider/UI exports. Why: preserve shared context identity during live preview refreshes and prevent false missing-provider crashes.
