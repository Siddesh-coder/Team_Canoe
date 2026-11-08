import { describe, expect, it } from "vitest";
import { canAct, canView, pageRole, safeNext, parseSession, DEMO_NAME } from "./logic";
describe("demo role matrix (presentation only)", () => {
  it.each(["/", "/claim", "/continue/CLM-0012", "/track", "/track/CLM-0012"])("keeps customer %s public", (path) => { expect(pageRole(path)).toBeNull(); expect(canView(undefined, path)).toBe(true); });
  it.each(["/review", "/review/DEV-004", "/policy", "/business"])("gates signed-out %s", (path) => expect(canView(undefined, path)).toBe(false));
  it("reviewer reads and acts on Review only", () => { expect(canView("reviewer", "/review/DEV-004")).toBe(true); expect(canAct("reviewer", "review")).toBe(true); expect(canView("reviewer", "/policy")).toBe(false); expect(canAct("reviewer", "policy")).toBe(false); expect(canView("reviewer", "/business")).toBe(false); });
  it("policy owner reads Review and acts only on Policy", () => { expect(canView("policy_owner", "/review")).toBe(true); expect(canAct("policy_owner", "review")).toBe(false); expect(canView("policy_owner", "/policy")).toBe(true); expect(canAct("policy_owner", "policy")).toBe(true); });
  it("operations reads Business and Review without actions", () => { expect(canView("operations", "/business")).toBe(true); expect(canView("operations", "/review")).toBe(true); expect(canView("operations", "/policy")).toBe(false); expect(canAct("operations", "review")).toBe(false); expect(canAct("operations", "business")).toBe(false); });
  it("uses the requested demo identities", () => expect(DEMO_NAME).toEqual({ reviewer: "Jury reviewer", policy_owner: "Jury policy owner", operations: "Jury operations" }));
  it("rejects external or unsuitable next pages", () => { expect(safeNext("//evil.test", "reviewer")).toBe("/review"); expect(safeNext("/policy", "operations")).toBe("/business"); expect(safeNext("/review/DEV-004", "policy_owner")).toBe("/review/DEV-004"); });
  it("stores only role and name, never a password", () => expect(parseSession({ role: "reviewer", name: "Jury reviewer", password: "discard" })).toEqual({ role: "reviewer", name: "Jury reviewer" }));
});