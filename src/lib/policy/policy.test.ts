import { describe, expect, it } from "vitest";
import { createPolicyStore, demoDraft, mockPreview, POLICY_V1, toDraft, withLimit, FIELDS, type MockCase } from "./mock";
import { describeDiff } from "./text";

const R = "routine_processing", I = "request_information", H = "human_review";
const spec: [string, string, (string | undefined)?, string?][] = [
  ["DEV-001", R], ["DEV-002", I], ["DEV-003", I], ["DEV-004", H], ["DEV-005", H], ["DEV-006", H], ["DEV-007", H], ["DEV-008", H], ["DEV-009", H],
  ["DEV-010", R], ["DEV-011", R, "ev"], ["DEV-012", H], ["DEV-013", I], ["DEV-014", H], ["PRA-001", R], ["PRA-002", R], ["PRA-003", R], ["PRA-004", R],
  ["PRA-005", R, "ev"], ["PRA-006", I, "ev"], ["PRA-007", H], ["PRA-008", H], ["PRA-009", R, undefined, "closed"], ["PRA-010", R, "ev", "closed"], ["PRA-011", H], ["PRA-012", I],
];
const CASES: MockCase[] = spec.map(([id, rec, ev, st]) => ({ case_id: id, recommendation: rec, case_status: st ?? "open", claim_summary: id, repair_type: ev ? "ev_high_voltage_battery" : "standard" }));
const changedIds = (limit: number) => mockPreview(withLimit(demoDraft(), limit), CASES, "v1").rows.filter((r) => r.changed).map((r) => r.case_id);

describe("policy mock preview", () => {
  it("demo change: 24 open, 2 closed, 6 changed with the canned moves", () => {
    const p = mockPreview(demoDraft(), CASES, "v1");
    expect([p.open_claims, p.closed_untouched, p.changed]).toEqual([24, 2, 6]);
    expect(p.moves).toEqual({ "routine_processing -> human_review": 5, "request_information -> human_review": 1 });
    expect(p.rows.find((r) => r.case_id === "DEV-011")?.rule_to).toBe("v2:R1.ev_battery");
    expect(p.rows.find((r) => r.case_id === "DEV-010")?.rule_to).toBe("v2:R1.quote_over_limit");
    expect(p.rows.filter((r) => r.retained).map((r) => r.case_id)).toEqual(["PRA-009", "PRA-010"]);
    expect(p.draft_quality.changed_cases.cases.map((c) => c.case_id)).toEqual(["DEV-010", "DEV-011"]);
  });
  it("sweep at €1,500 changes only the EV cases", () => expect(changedIds(1500)).toEqual(["DEV-011", "PRA-005", "PRA-006"]));
  it("sweep at €1,800 sends DEV-004 to routine", () => {
    const p = mockPreview(withLimit(demoDraft(), 1800), CASES, "v1");
    expect(p.rows.find((r) => r.case_id === "DEV-004")).toMatchObject({ to: R, changed: true });
  });
  it("sweep rounds to the nearest 100", () => expect(changedIds(1249)).toEqual(changedIds(1200)));
  it("v1 unchanged previews with no changes", () => expect(mockPreview(toDraft(POLICY_V1), CASES, "v1").changed).toBe(0));
  it("any other draft needs the live engine", () => {
    const d = demoDraft(); d.rules.splice(0, 1);
    expect(() => mockPreview(d, CASES, "v1")).toThrow("Preview needs the live engine.");
  });
});

describe("policy mock publish", () => {
  it("approver must differ from author", async () => {
    const s = createPolicyStore(async () => CASES);
    await expect(s.publish({ draft: demoDraft(), published_by: "Jury", approved_by: "jury", note: "x" })).rejects.toThrow("someone else");
  });
  it("publish marks v2 live with duration 0 in demo mode", async () => {
    const s = createPolicyStore(async () => CASES);
    await s.preview(demoDraft());
    const r = await s.publish({ draft: demoDraft(), published_by: "Jury", approved_by: "Maxi", note: "Lower limit, EV review." });
    expect(r).toMatchObject({ version: "v2", note: "demo mode", change_timing: { duration_minutes: 0, open_claims_rechecked: 6 } });
    expect((await s.get()).latest).toBe("v2");
  });
});

it("describeDiff summarises the demo change", () => {
  expect(describeDiff(toDraft(POLICY_V1), demoDraft(), "v2", FIELDS)).toBe("v2 lowers the review limit from €1,500 to €1,200 and adds: EV battery work goes to review.");
});
