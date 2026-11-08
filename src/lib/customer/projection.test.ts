import { describe, expect, it } from "vitest";
import { projectCustomerClaim } from "./projection";
const base = { case_id: "CLM-0012", case_status: "open", created_at: "2026-11-08T00:00:00Z", effective_recommendation: "request_information", info_requests: [{ status: "answered", created_at: "2026-11-08T00:00:00Z", answered_at: "2026-11-08T01:00:00Z", ask_fields: ["incident_report_present", "policy_number", "duplicate_flag"] }] };
describe("customer projection", () => {
  it("recognizes an update awaiting the engine recheck", () => { expect(projectCustomerClaim(base).request_status).toBe("answered_awaiting_recheck"); });
  it("does not infer awaiting recheck after a newer engine decision", () => { expect(projectCustomerClaim({ ...base, decisions: [{ created_at: "2026-11-08T02:00:00Z" }] }).request_status).toBeNull(); });
  it("removes private facts, rules, versions and settlement notes", () => {
    const claim = projectCustomerClaim({ ...base, ...{ policy_number: "private", rule_id: "internal", policy_version: "v2", facts: { name: "private" } }, settlement: { decision: "approve", created_at: base.created_at, ...{ reason: "private" } } });
    expect(Object.keys(claim).sort()).toEqual(["case_id", "case_status", "closed_at", "created_at", "effective_recommendation", "info_requests", "request_status", "settlement"].sort());
    expect(claim.settlement).toEqual({ decision: "approve", created_at: base.created_at });
    expect(claim.info_requests[0]?.ask_fields).toEqual(["incident_report_present"]);
  });
});