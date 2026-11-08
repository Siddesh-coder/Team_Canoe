import { MOCK_RULES, RULE_ORDER } from "./mock-rules";
import { ApiError, type ClaimDetail, type ClaimListItem, type FieldValue, type Rec, type ReviewApi } from "./types";

export const FIELD_LABELS: Record<string, string> = {
  policy_active_on_incident: "Policy active on the date", claim_type: "Claim type", repair_type: "Repair type", quote_eur: "Repair quote",
  itemized_quote_present: "Itemized quote", incident_report_present: "Incident report", injury_reported: "Injury reported",
  liability_disputed: "Fault disputed", duplicate_flag: "Possible duplicate", evidence_conflict: "Evidence conflict",
};
export type StoredRow = Record<string, string | null> & { case_id: string; case_status: string; claim_summary: string; recommendation: string; created_at: string };

function parse(field: string, raw: string): FieldValue {
  if (raw === "True") return true;
  if (raw === "False") return false;
  if (field === "quote_eur") { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
  return raw;
}

/** Shapes one imported row as the API would return it. Test data only - no decisions made here. */
export function buildMockClaim(row: StoredRow): ClaimDetail {
  const r = MOCK_RULES[row.case_id] ?? { rule_id: row['rule'] ?? "", reason: row['explanation'] ?? "", ask_fields: [], also_applies: [], statuses: {} };
  const fields = Object.keys(FIELD_LABELS).map((f) => {
    const raw = (row[f] ?? "").trim();
    const status = r.statuses[f] ?? (raw === "" ? "blank" : "known");
    return { field: f, label: FIELD_LABELS[f], value: status === "known" ? parse(f, raw) : null, status, source: "claim file" } as ClaimDetail["fields"][number];
  });
  const blank = new Set(fields.filter((f) => f.status !== "known").map((f) => f.field));
  const trace = RULE_ORDER.map(([rule, field]) => {
    const result = blank.has(field) ? "unknown" as const : rule === r.rule_id;
    return { rule, outcome: result === "unknown" ? `${field} not provided` : result ? "matched" : "passed", result, counted_as: result === "unknown" ? "blank" : String(result) };
  });
  const rec = row.recommendation as Rec;
  const decision = {
    id: `${row.case_id}-d1`, policy_version: "v1", recommendation: rec, rule_id: r.rule_id, explanation: r.reason, trigger: "intake", created_at: row.created_at,
    detail: { reason: r.reason, ask_fields: r.ask_fields, also_applies: r.also_applies, trace },
  };
  return {
    case_id: row.case_id, case_status: row.case_status, summary: row.claim_summary, created_at: row.created_at, fields,
    latest_decision: decision, decisions: [decision], effective_recommendation: rec, effective_source: "system",
    overrides: [], fact_edits: [], rechecks: [],
    info_requests: rec === "request_information" ? [{ ask_fields: r.ask_fields, status: "open", created_at: row.created_at, subject: "Missing information" }] : [],
    outcomes: [], editable: row.case_status === "open", closed_at: row.case_status === "open" ? null : row.created_at, settlement: null,
  };
}

export function toListItem(c: ClaimDetail): ClaimListItem {
  const q = c.fields.find((f) => f.field === "quote_eur")?.value;
  return {
    case_id: c.case_id, case_status: c.case_status, summary: c.summary, quote_eur: typeof q === "number" ? q : null, created_at: c.created_at,
    recommendation_latest: c.latest_decision.recommendation, policy_version: c.latest_decision.policy_version, rule: c.latest_decision.rule_id,
    effective_recommendation: c.effective_recommendation, effective_source: c.effective_source,
    recheck_pending: c.rechecks.some((r) => r.status === "pending"), settled_decision: c.settlement?.decision ?? null,
  };
}

const now = () => new Date().toISOString();
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function need(s: string | undefined, what: string) { if (!s || !s.trim()) throw new ApiError(`${what} is required.`, 400); }

/** In-memory store that mirrors the API's write behaviour. */
export function createMockStore(rows: StoredRow[]) {
  const store = new Map(rows.map((r) => [r.case_id, buildMockClaim(r)]));
  const get = (id: string) => { const c = store.get(id); if (!c) throw new ApiError("We can't find this case.", 404); return c; };
  const open = (c: ClaimDetail) => { if (c.case_status !== "open") throw new ApiError("This case is closed. It stays as it is.", 409); };
  return {
    list: () => ({ claims: [...store.values()].map(toListItem) }),
    get: (id: string) => clone(get(id)),
    override(id: string, b: { corrected_recommendation: Rec; reason: string; reviewer: string }) {
      const c = get(id); open(c); need(b.reason, "A reason"); need(b.reviewer, "Your name");
      const kind = b.corrected_recommendation === c.effective_recommendation ? "confirm" : "override";
      c.overrides.push({ kind, original_recommendation: c.effective_recommendation, corrected_recommendation: b.corrected_recommendation, reason: b.reason, reviewer: b.reviewer, policy_version: c.latest_decision.policy_version, created_at: now() });
      c.effective_recommendation = b.corrected_recommendation;
      c.effective_source = kind === "confirm" ? "reviewer_confirmed" : "reviewer";
      return clone(c);
    },
    settle(id: string, b: { decision: "approve" | "decline"; reason: string; reviewer: string }) {
      const c = get(id); open(c); need(b.reviewer, "Your name");
      if (b.decision === "decline") need(b.reason, "A reason");
      const t = now();
      c.settlement = { decision: b.decision, reason: b.reason, reviewer: b.reviewer, policy_version: c.latest_decision.policy_version, system_recommendation: c.latest_decision.recommendation, created_at: t };
      c.case_status = "closed"; c.closed_at = t; c.editable = false;
      return clone(c);
    },
    facts(id: string, b: { changes: Record<string, FieldValue>; reason: string; reviewer: string }) {
      const c = get(id); open(c); need(b.reason, "A reason");
      for (const [field, value] of Object.entries(b.changes)) {
        const f = c.fields.find((x) => x.field === field);
        if (!f) throw new ApiError(`Unknown fact: ${field}.`, 400);
        c.fact_edits.push({ field, old_value: f.value, new_value: value, reason: b.reason, editor: b.reviewer, role: "reviewer", created_at: now() });
        f.value = value; f.status = value === null || value === "" ? "blank" : "known"; f.source = "reviewer";
      }
      // Mock mode: no engine, so the recommendation is NOT recomputed.
      return clone(c);
    },
    outcome(id: string, b: { final_outcome: string; source: string; note: string; recorded_by: string }) {
      const c = get(id); need(b.final_outcome, "An outcome");
      c.outcomes.push({ ...b, created_at: now() });
      return clone(c);
    },
  };
}

export function mockApi(load: () => Promise<StoredRow[]>): ReviewApi {
  let p: Promise<ReturnType<typeof createMockStore>> | null = null;
  const s = () => (p ??= load().then(createMockStore).catch((e) => { p = null; throw e; }));
  return {
    mode: "mock",
    listClaims: async () => (await s()).list(),
    getClaim: async (id) => (await s()).get(id),
    override: async (id, b) => (await s()).override(id, b),
    settle: async (id, b) => (await s()).settle(id, b),
    facts: async (id, b) => (await s()).facts(id, b),
    outcome: async (id, b) => (await s()).outcome(id, b),
  };
}
