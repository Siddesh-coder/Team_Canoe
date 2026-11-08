import { describe, expect, it } from "vitest";
import { DAY, getReminders } from "./reminders";
const start = "2026-11-08T00:00:00Z";
const at = (days: number) => Date.parse(start) + days * DAY;
describe("simulated request schedule", () => {
  it("request starts on day zero", () => { const r = getReminders(start, at(0)); expect(r.stage).toBe(1); expect(r.sentAt).toEqual(["2026-11-08T00:00:00.000Z"]); expect(r.nextAt).toBe("2026-11-11T00:00:00.000Z"); });
  it("reminder begins exactly on day three", () => { expect(getReminders(start, at(3)-1).stage).toBe(1); const r = getReminders(start, at(3)); expect(r.stage).toBe(2); expect(r.sentAt.length).toBe(2); expect(r.nextAt).toBe("2026-11-15T00:00:00.000Z"); });
  it("final reminder and SMS begin on day seven", () => { expect(getReminders(start, at(7)-1).stage).toBe(2); const r = getReminders(start, at(7)); expect(r.stage).toBe(3); expect(r.sentAt.length).toBe(3); expect(r.handoverAt).toBe("2026-11-18T00:00:00.000Z"); });
  it("reviewer call handover begins on day ten", () => { expect(getReminders(start, at(10)-1).overdue).toBe(false); const r = getReminders(start, at(10)); expect(r.stage).toBe(4); expect(r.overdue).toBe(true); expect(r.nextAt).toBeNull(); });
});
