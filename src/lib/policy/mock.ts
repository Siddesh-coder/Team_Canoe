/** Test data shaping for the policy mock only. The live engine owns all decisions. */
import { MOCK_RULES } from "@/lib/review/mock-rules";
import { ApiError } from "@/lib/review/types";
import type { Draft, PolicyDoc, PolicyVersion, Preview, PreviewRow, PublishBody, PublishResult, Rec, Rule } from "./types";

const rule = (id: string, outcome: Rule["outcome"], reason: string, field: string, op: Rule["when"][number]["op"], value?: number | string, blank?: boolean): Rule =>
  ({ id, outcome, reason, when: [{ field, op, ...(value !== undefined ? { value } : {}) }], ...(blank ? { blank_counts_as_match: true } : {}) });

export const POLICY_V1: PolicyVersion = {
  version: "v1", title: "Fictional motor claims triage, policy v1",
  rules: [
    rule("R1.policy_inactive", "human_review", "The policy was not active on the incident date.", "policy_active_on_incident", "is_false"),
    rule("R1.claim_type", "human_review", "The claim type is not motor_own_damage.", "claim_type", "neq", "motor_own_damage"),
    rule("R1.injury", "human_review", "An injury was reported.", "injury_reported", "is_true"),
    rule("R1.liability_disputed", "human_review", "Liability is disputed.", "liability_disputed", "is_true"),
    rule("R1.duplicate", "human_review", "The claim is flagged as a duplicate.", "duplicate_flag", "is_true"),
    rule("R1.evidence_conflict", "human_review", "The evidence contains a conflict.", "evidence_conflict", "is_true"),
    rule("R1.quote_over_limit", "human_review", "The repair quote is above the routine limit of EUR 1,500.", "quote_eur", "gt", 1500),
    rule("R2.incident_report_missing", "request_information", "The incident report is missing.", "incident_report_present", "is_false", undefined, true),
    rule("R2.itemized_quote_missing", "request_information", "The itemized quote is missing.", "itemized_quote_present", "is_false", undefined, true),
  ],
  default: { id: "R3.routine", outcome: "routine_processing", reason: "No rule for review or for missing information applies. The claim may enter normal downstream processing. This is not a payment approval." },
  meta: { published_by: "system", approved_by: "system", note: "Imported baseline.", created_at: "2026-01-01T00:00:00.000Z" },
};
export const FIELDS: Record<string, string> = {
  policy_active_on_incident: "Policy active on incident date", claim_type: "Claim type", repair_type: "Repair type", quote_eur: "Quote (EUR)",
  incident_report_present: "Incident report present", itemized_quote_present: "Itemized quote present", injury_reported: "Injury reported",
  liability_disputed: "Liability disputed", duplicate_flag: "Duplicate flag", evidence_conflict: "Evidence conflict",
};
export const EV_RULE: Rule = rule("R1.ev_battery", "human_review", "EV battery work needs review.", "repair_type", "eq", "ev_high_voltage_battery");
export const DEMO_TITLE = "Demo change (replace with the official v2)";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export function toDraft(v: PolicyVersion): Draft { return clone({ title: v.title, rules: v.rules, default: v.default }); }
export function withLimit(d: Draft, limit: number): Draft {
  const c = clone(d);
  const q = c.rules.find((r) => r.id === "R1.quote_over_limit")?.when.find((w) => w.field === "quote_eur");
  if (q) q.value = limit;
  return c;
}
export function demoDraft(limit = 1200): Draft {
  const d = withLimit(toDraft(POLICY_V1), limit);
  d.title = DEMO_TITLE; d.rules.splice(7, 0, clone(EV_RULE));
  return d;
}

const SWEEP: [number, number, string][] = [
  [800, 800, "DEV-003>H DEV-010>H DEV-011>H PRA-002>H PRA-003>H PRA-004>H PRA-005>H PRA-006>H"],
  [900, 1100, "DEV-010>H DEV-011>H PRA-002>H PRA-003>H PRA-004>H PRA-005>H PRA-006>H"],
  [1200, 1200, "DEV-010>H DEV-011>H PRA-003>H PRA-004>H PRA-005>H PRA-006>H"],
  [1300, 1400, "DEV-010>H DEV-011>H PRA-004>H PRA-005>H PRA-006>H"],
  [1500, 1700, "DEV-011>H PRA-005>H PRA-006>H"],
  [1800, 2000, "DEV-004>R DEV-011>H PRA-005>H PRA-006>H"],
];
export function sweepFor(limit: number): Record<string, "H" | "R"> {
  const l = Math.min(2000, Math.max(800, Math.round(limit / 100) * 100));
  const row = SWEEP.find(([a, b]) => l >= a && l <= b)!;
  return Object.fromEntries(row[2].split(" ").map((p) => p.split(">") as [string, "H" | "R"]));
}

/** Shape of a draft that matters to the engine (ignores titles and reason text). */
const shape = (d: Draft) => JSON.stringify({ r: d.rules.map((r) => [r.id, r.outcome, r.when.map((c) => [c.field, c.op, c.value ?? null]), !!r.blank_counts_as_match]), d: d.default.outcome });

export interface MockCase { case_id: string; case_status: string; recommendation: string; claim_summary: string; repair_type: string | null }
export const NEEDS_ENGINE = "Preview needs the live engine.";

export function mockPreview(draft: Draft, cases: MockCase[], liveVersion: string): Preview {
  if (liveVersion !== "v1") throw new ApiError(NEEDS_ENGINE, 422);
  let changes: Record<string, "H" | "R">;
  if (shape(draft) === shape(POLICY_V1)) changes = {};
  else {
    const q = draft.rules.find((r) => r.id === "R1.quote_over_limit")?.when[0]?.value;
    if (typeof q !== "number" || shape(withLimit(draft, 1200)) !== shape(demoDraft(1200))) throw new ApiError(NEEDS_ENGINE, 422);
    changes = sweepFor(q);
  }
  const rows: PreviewRow[] = cases.map((c) => {
    const from = c.recommendation as Rec;
    const v1rule = MOCK_RULES[c.case_id]?.rule_id ?? "R3.routine";
    const closed = c.case_status !== "open";
    const ch = closed ? undefined : changes[c.case_id];
    const to: Rec = ch === "H" ? "human_review" : ch === "R" ? "routine_processing" : from;
    const rule_to = ch === "H" ? (c.repair_type === "ev_high_voltage_battery" ? "v2:R1.ev_battery" : "v2:R1.quote_over_limit") : ch === "R" ? "v2:R3.routine" : `v2:${v1rule}`;
    return { case_id: c.case_id, status: c.case_status, from, to, rule_from: `v1:${v1rule}`, rule_to: closed ? `v1:${v1rule}` : rule_to, changed: !!ch && to !== from, retained: closed, summary: c.claim_summary };
  });
  const open = rows.filter((r) => !r.retained);
  const changed = open.filter((r) => r.changed);
  const moves: Record<string, number> = {};
  for (const r of changed) { const k = `${r.from} -> ${r.to}`; moves[k] = (moves[k] ?? 0) + 1; }
  const labelled = changed.filter((r) => r.case_id.startsWith("DEV-"));
  return {
    from_version: "v1", to_version: "v2", open_claims: open.length, closed_untouched: rows.length - open.length, changed: changed.length, moves, warnings: [], rows,
    draft_quality: {
      versions: {
        v1: { n: 14, correct: 14, accuracy: 1, incorrect_routine: 0, unnecessary_human_review: 0 },
        v2: { labelled_cases: 0, note: "No expected labels for v2. Add an expected_v2 column to measure it." },
      },
      changed_cases: {
        count: labelled.length, regressions: [], fixed: [],
        cases: labelled.map((r) => ({ case_id: r.case_id, from: r.from, to: r.to, rule_before: r.rule_from, rule_after: r.rule_to, label_before: r.from, label_after: null, correct_before: true, correct_after: null })),
      },
    },
  };
}

/** In-memory policy store that mirrors the API's write behaviour. */
export function createPolicyStore(loadCases: () => Promise<MockCase[]>) {
  const doc: PolicyDoc = { versions: [clone(POLICY_V1)], latest: "v1", fields: FIELDS };
  let firstPreviewAt: string | null = null;
  let cases: MockCase[] | null = null;
  return {
    get: async () => clone(doc),
    async preview(draft: Draft) {
      cases ??= await loadCases();
      const p = mockPreview(draft, cases, doc.latest);
      firstPreviewAt ??= new Date().toISOString();
      return p;
    },
    async publish(b: PublishBody): Promise<PublishResult> {
      if (!b.published_by?.trim()) throw new ApiError("An author is required.", 400);
      if (!b.approved_by?.trim()) throw new ApiError("An approver is required.", 400);
      if (b.approved_by.trim().toLowerCase() === b.published_by.trim().toLowerCase()) throw new ApiError("The approver must be someone else.", 400);
      if (!b.note?.trim()) throw new ApiError("Say what changed and why.", 400);
      cases ??= await loadCases();
      const p = mockPreview(b.draft, cases, doc.latest);
      const version = `v${Number(doc.latest.slice(1)) + 1}`;
      const published_at = new Date().toISOString();
      doc.versions.push({ ...clone(b.draft), version, meta: { published_by: b.published_by, approved_by: b.approved_by, note: b.note, created_at: published_at } });
      doc.latest = version;
      return {
        version, note: "demo mode",
        applied: { open_changed: p.changed, open_unchanged: p.open_claims - p.changed, closed_untouched: p.closed_untouched },
        change_timing: { duration_minutes: 0, first_preview_at: firstPreviewAt, published_at, open_claims_rechecked: p.changed },
      };
    },
  };
}
