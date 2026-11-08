import { describe, expect, it } from "vitest";
import { createMockStore, toListItem, type StoredRow } from "./mock";
import { inTab, sortQueue } from "./labels";

const row = (id: string, rec: string, extra: Partial<StoredRow> = {}): StoredRow => ({
  case_id: id, case_status: "open", claim_summary: "s", recommendation: rec, created_at: "2026-11-01T00:00:00Z",
  policy_active_on_incident: "True", claim_type: "motor_own_damage", repair_type: "body", quote_eur: "900",
  itemized_quote_present: "True", incident_report_present: "True", injury_reported: "False", liability_disputed: "False",
  duplicate_flag: "False", evidence_conflict: "False", ...extra,
});

describe("mock adapter", () => {
  it("marks DEV-013 quote blank and its trace unknown", () => {
    const s = createMockStore([row("DEV-013", "request_information")]);
    const c = s.get("DEV-013");
    expect(c.fields.find((f) => f.field === "quote_eur")?.status).toBe("blank");
    expect(c.latest_decision.detail.trace.find((t) => t.rule === "R1.quote_over_limit")?.result).toBe("unknown");
    expect(c.info_requests[0]?.ask_fields).toEqual(["quote_eur"]);
  });
  it("matched rule is true, others false", () => {
    const t = createMockStore([row("DEV-004", "human_review", { quote_eur: "2400" })]).get("DEV-004").latest_decision.detail.trace;
    expect(t.filter((x) => x.result === true).map((x) => x.rule)).toEqual(["R1.quote_over_limit"]);
  });
  it("same recommendation counts as confirm", () => {
    const s = createMockStore([row("DEV-004", "human_review")]);
    expect(s.override("DEV-004", { corrected_recommendation: "human_review", reason: "x", reviewer: "Jury" }).effective_source).toBe("reviewer_confirmed");
    expect(s.override("DEV-004", { corrected_recommendation: "routine_processing", reason: "x", reviewer: "Jury" }).effective_source).toBe("reviewer");
  });
  it("settle closes for good", () => {
    const s = createMockStore([row("DEV-001", "routine_processing")]);
    expect(s.settle("DEV-001", { decision: "approve", reason: "", reviewer: "Jury" }).case_status).toBe("closed");
    expect(() => s.settle("DEV-001", { decision: "decline", reason: "x", reviewer: "Jury" })).toThrow(/closed/);
  });
  it("decline needs a reason", () => {
    const s = createMockStore([row("DEV-006", "human_review")]);
    expect(() => s.settle("DEV-006", { decision: "decline", reason: " ", reviewer: "Jury" })).toThrow(/reason/);
  });
  it("fact edit does not recompute the recommendation", () => {
    const s = createMockStore([row("DEV-002", "request_information", { incident_report_present: "False" })]);
    const c = s.facts("DEV-002", { changes: { incident_report_present: true }, reason: "found it", reviewer: "Jury" });
    expect(c.effective_recommendation).toBe("request_information");
    expect(c.fact_edits[0]?.old_value).toBe(false);
  });
});

describe("queue tabs", () => {
  const s = createMockStore([row("A", "routine_processing"), row("B", "request_information"), row("C", "human_review"), row("D", "routine_processing", { case_status: "closed" })]);
  const items = () => s.list().claims;
  const ids = (t: Parameters<typeof inTab>[1]) => items().filter((c) => inTab(c, t)).map((c) => c.case_id);
  it("splits by tab", () => {
    expect(ids("needs")).toEqual(["C"]);
    expect(ids("waiting")).toEqual(["B"]);
    expect(ids("ready")).toEqual(["A"]);
    expect(ids("closed")).toEqual(["D"]);
  });
  it("a reviewer-changed routine case moves to Ready", () => {
    s.override("A", { corrected_recommendation: "routine_processing", reason: "ok", reviewer: "Jury" });
    expect(ids("needs")).not.toContain("A");
    expect(ids("ready")).toContain("A");
  });
  it("re-evaluated first, then oldest", () => {
    const base = toListItem(s.get("C"));
    const out = sortQueue([{ ...base, case_id: "x", created_at: "2026-01-02" }, { ...base, case_id: "y", created_at: "2026-01-01" }, { ...base, case_id: "z", created_at: "2026-01-03", recheck_pending: true }]);
    expect(out.map((c) => c.case_id)).toEqual(["z", "y", "x"]);
  });
});
