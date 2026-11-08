import { describe, expect, it } from "vitest";
import { askReference, explainStatus, extractCaseId, isPublicDemoId, trackingIntent } from "./logic";
import { agentInstructions, roleInstructions } from "./agent-config.server";
import type { TrackingStatus } from "./types";

const status: TrackingStatus = { case_id: "DEV-002", case_status: "open", recommendation: "request_information", request_status: "answered_awaiting_recheck", updated_at: "2026-11-08T00:00:00Z", policy_version: "v2", recheck_pending: false, source: "live engine + claim record" };
describe("public claim reference authorization", () => {
  it.each([["track dev - 002", "DEV-002"], ["what happened to case PRA-003?", "PRA-003"], ["FORM 0001", "FORM-0001"]])("normalizes %s", (input, id) => expect(extractCaseId(input)).toBe(id));
  it("authorizes only the fixed synthetic dataset", () => {
    expect(isPublicDemoId("DEV-014")).toBe(true);
    expect(isPublicDemoId("PRA-012")).toBe(true);
    for (const id of ["DEV-015", "PRA-013", "DEV-000", "FORM-0001", "DEV-002' OR 1=1", "dev-002"]) expect(isPublicDemoId(id)).toBe(false);
  });
  it.each(["en", "de"] as const)("continues reference prompts in %s", (locale) => {
    expect(trackingIntent("DEV-002", [{ role: "assistant", content: askReference(locale) }])).toBe(true);
    expect(trackingIntent("check status of my application", [])).toBe(true);
  });
  it("does not misclassify policy document questions", () => expect(trackingIntent("What documents do I need?", [])).toBe(false));
});
describe("recorded status guidance, not decisions", () => {
  it("prioritizes submitted updates over an old request-information recommendation", () => {
    const text = explainStatus(status, "en");
    expect(text).toContain("update was submitted and is awaiting recheck");
    expect(text).not.toContain("requests information");
  });
  it("explains the same submitted update in German", () => expect(explainStatus(status, "de")).toContain("Ergänzung wurde eingereicht"));
  it("does not turn human review into approval", () => expect(explainStatus({ ...status, case_id: "DEV-004", recommendation: "human_review", request_status: null }, "en")).toContain("neither approval nor denial"));
  it("does not turn routine triage into payment approval", () => expect(explainStatus({ ...status, recommendation: "routine_processing", request_status: null }, "en")).toContain("not approval or a payment promise"));
  it("closed takes precedence and protects final settlement information", () => expect(explainStatus({ ...status, case_status: "closed" }, "en")).toContain("verify through support for final settlement"));
});
describe("fixed role safety", () => {
  it("has genuine different persona instructions", () => expect(new Set(Object.values(roleInstructions)).size).toBe(3));
  it.each(["policy", "support", "documents"] as const)("retains immutable constraints for %s", (role) => {
    const prompt = agentInstructions(role, "de", "v2", "incident report");
    expect(prompt).toContain("Answer in German");
    expect(prompt).toContain("Never decide approval/denial");
    expect(prompt).toContain("NO mutation tools or private lookup tools");
    expect(prompt).toContain("untrusted data");
  });
});