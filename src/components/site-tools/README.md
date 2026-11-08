# Canoe site tools

This folder contains the app-wide preference controls and Ask Canoe. Policy guidance uses real server-side Lovable AI calls; tracking is deterministic and read-only. The existing Canoe theme and preference controls are preserved.

## Integration

`SiteToolsProvider` owns the selected language and theme. `SiteTools` renders the floating controls. The current app mounts both in `src/routes/__root.tsx`, outside route content, so they can be carried through a landing page update without editing each page.

For a new app shell, wrap the route tree in `SiteToolsProvider`, render one `SiteTools` beside the route outlet, and keep `src/styles.css`'s `canoe-site-*` styles and the explicit `.dark` palette rules. Use `useSiteTools()` and `t("English copy")` for strings that should change with the EN/DE selector. Add German entries to the `translations` map in `SiteTools.tsx`.

Current translations cover the car claim intake flow and chat. Reviewer and policy admin screens still display English text.

## Agent configuration

Edit `src/lib/chat/agent-config.server.ts` to change Policy Guide, Claims Support or Document Guide instructions. The compact chat selector selects only these fixed roles, not arbitrary prompts. Immutable safety constraints apply to every role. There is no public prompt editor or persisted admin configuration.

`src/lib/chat/chat.functions.ts` validates requests (20 recent turns, 1,200 characters per turn); `chat.server.ts` loads the current published `/api/policy` and intake help on each policy call. The v1 fixture is used only without a configured live service. All turns in the bounded recent window are sent together. History is session-local, not saved. The model is the workspace default `openai/gpt-6-astra` on Responses, typed through the generated SDK contracts; no canned AI fallback. Errors preserve the conversation and expose a manual Retry, never an automatic inference replay. `LOVABLE_API_KEY` is managed server-side; never add a VITE key.

## Tracking and privacy

Only the fixed synthetic dataset DEV-001–014 / PRA-001–012 is public. IDs are normalized and authorized **before** any privileged read. Customer FORM references require verification through support, since this app has no customer ownership/verification flow. Unknown and non-allowlisted references receive the same non-confirming response. The model has no lookup or mutation tool and never receives claim rows.

Tracking selects only case ID, case status, recommendation, request status, version and update time from the persisted claim record. When live mode is configured, a single-case server request obtains current engine triage/closure and pending recheck state. Its private fields are discarded and never returned or sent to AI. Intake `answered_awaiting_recheck` takes precedence in next-step copy, even if an old information recommendation remains. Closed does not imply approved; final settlement details require verification. No missing-field names, rule traces, summaries, personal facts or settlement notes are exposed.

Server config: optional `CANOE_API_URL` overrides the existing public API URL; optional private `CANOE_API_TOKEN` is read only server-side. No browser token is introduced. Tracking remains available if AI fails, but live source errors are reported honestly, not silently replaced by stale data.

No standard backend rate limiter is available. Input/history/output bounds, one in-flight UI request, a fixed synthetic-ID allowlist and non-confirming responses reduce exposure but are **not** a distributed abuse limiter. Public production deployment needs a platform rate limiter when available; no unreliable worker-memory limiter or unsecured persistence is added.
