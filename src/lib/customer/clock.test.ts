import { describe, expect, it } from "vitest";
import { clockNow } from "./clock";
import { DAY } from "./reminders";
describe("simulated customer clock", () => {
  it("advances exactly one day per ten seconds", () => { expect(clockNow({ real: 1000, virtual: 5000 }, 11000)).toBe(5000 + DAY); });
  it("uses real time when simulation is off", () => { expect(clockNow(null, 11000)).toBe(11000); });
});