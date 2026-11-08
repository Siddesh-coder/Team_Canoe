import { describe, expect, it } from "vitest";
import { motorConfig as c } from "./config";
import { answer, applyDocument, buildRow, emptyState, insurerLookup, nextQuestion, openMissing, progress, toCsv, upcoming } from "./logic";
import { CSV_COLUMNS, type IntakeState } from "./types";

const a = (s: IntakeState, pairs: [string, string | number][]) => pairs.reduce((acc, [k, v]) => answer(acc, k, v), s);
const base = () => a(emptyState(), [["what_happened", "motor_own_damage"], ["description", "Scrape"], ["incident_date", "2026-11-01"], ["policy_number", "MX-1"]]);

describe("question flow", () => {
  it("starts with what_happened", () => expect(nextQuestion(emptyState(), c)?.id).toBe("what_happened"));
  it("never asks a fact filled by an upload", () => {
    const s = applyDocument(base(), "quote", { amount: 1240, itemized: true });
    const ids = upcoming(s, c).map((q) => q.id);
    expect(ids).not.toContain("quote_amount");
    expect(ids).not.toContain("has_quote");
  });
  it("asks other_party_agrees only when another party was involved", () => {
    expect(upcoming(a(base(), [["other_party", "no"]]), c).map((q) => q.id)).not.toContain("other_party_agrees");
    expect(nextQuestion(a(base(), [["other_party", "yes"]]), c)?.id).toBe("other_party_agrees");
  });
  it("keeps hidden answers but ignores them in the row", () => {
    let s = a(base(), [["is_electric", "yes"], ["battery_affected", "yes"]]);
    s = answer(s, "what_happened", "theft");
    expect(s.facts["battery_affected"]?.value).toBe("yes");
    expect(buildRow("X", s, c).repair_type).toBe("");
  });
  it("missing mode asks only listed fields", () => {
    const s = openMissing(a(base(), [["has_report", "no"]]), c, ["incident_report_present"]);
    expect(upcoming(s, c, { kind: "missing", missing: ["incident_report_present"] }).map((q) => q.id)).toEqual(["has_report"]);
  });
  it("progress counts not-sure as done", () => {
    const p = progress(a(base(), [["other_party", "not_sure"]]), c);
    expect(p.done).toBe(5);
  });
});

describe("mappings", () => {
  it("inverts liability: agrees yes → False, no → True, not sure → blank", () => {
    const s = a(base(), [["other_party", "yes"]]);
    expect(buildRow("X", answer(s, "other_party_agrees", "yes"), c).liability_disputed).toBe("False");
    expect(buildRow("X", answer(s, "other_party_agrees", "no"), c).liability_disputed).toBe("True");
    expect(buildRow("X", answer(s, "other_party_agrees", "not_sure"), c).liability_disputed).toBe("");
  });
  it("repair_type rules", () => {
    expect(buildRow("X", a(base(), [["is_electric", "no"]]), c).repair_type).toBe("standard");
    expect(buildRow("X", a(base(), [["is_electric", "yes"], ["battery_affected", "yes"]]), c).repair_type).toBe("ev_high_voltage_battery");
    expect(buildRow("X", a(base(), [["is_electric", "yes"], ["battery_affected", "no"]]), c).repair_type).toBe("standard");
    expect(buildRow("X", a(base(), [["is_electric", "yes"], ["battery_affected", "not_sure"]]), c).repair_type).toBe("");
    expect(buildRow("X", a(base(), [["is_electric", "not_sure"]]), c).repair_type).toBe("");
  });
  it("'Not yet' for a quote means False; not sure stays blank", () => {
    expect(buildRow("X", a(base(), [["has_quote", "no"]]), c).itemized_quote_present).toBe("False");
    expect(buildRow("X", a(base(), [["has_quote", "not_sure"]]), c).itemized_quote_present).toBe("");
  });
  it("quote_eur is a whole number", () => {
    expect(buildRow("X", a(base(), [["quote_amount", 1240.6]]), c).quote_eur).toBe("1241");
  });
});

describe("liability_disputed", () => {
  const ld = (s: IntakeState) => buildRow("X", s, c).liability_disputed;
  it("nobody else involved → False", () => expect(ld(a(base(), [["other_party", "no"]]))).toBe("False"));
  it("other party, they agree → False", () => expect(ld(a(base(), [["other_party", "yes"], ["other_party_agrees", "yes"]]))).toBe("False"));
  it("other party, they disagree → True", () => expect(ld(a(base(), [["other_party", "yes"], ["other_party_agrees", "no"]]))).toBe("True"));
  it("other party, agreement unsure → blank", () => expect(ld(a(base(), [["other_party", "yes"], ["other_party_agrees", "not_sure"]]))).toBe(""));
  it("other party, agreement unanswered → blank", () => expect(ld(a(base(), [["other_party", "yes"]]))).toBe(""));
  it("other party unsure → blank", () => expect(ld(a(base(), [["other_party", "not_sure"]]))).toBe(""));
  it("other party unanswered → blank", () => expect(ld(base())).toBe(""));
  it("missing mode for liability_disputed asks other_party first, then agreement if yes", () => {
    const mode = { kind: "missing" as const, missing: ["liability_disputed"] };
    let s = openMissing(a(base(), [["other_party", "not_sure"], ["injury", "no"]]), c, mode.missing);
    expect(upcoming(s, c, mode).map((q) => q.id)).toEqual(["other_party"]);
    s = answer(s, "other_party", "yes");
    expect(upcoming(s, c, mode).map((q) => q.id)).toEqual(["other_party_agrees"]);
    expect(upcoming(answer(s, "other_party", "no"), c, mode)).toEqual([]);
  });
});

describe("insurer lookup", () => {
  it("EXP policy is inactive, empty is blank, other is active", () => {
    expect(insurerLookup(answer(emptyState(), "policy_number", "EXP-9")).policy_active_on_incident).toBe("False");
    expect(insurerLookup(emptyState()).policy_active_on_incident).toBe("");
    expect(insurerLookup(answer(emptyState(), "policy_number", "MX-1")).policy_active_on_incident).toBe("True");
  });
  it("DUP policy flags duplicate", () => {
    expect(insurerLookup(answer(emptyState(), "policy_number", "DUP-1")).duplicate_flag).toBe("True");
    expect(insurerLookup(answer(emptyState(), "policy_number", "MX-1")).duplicate_flag).toBe("False");
  });
  it("evidence conflict only when typed amount differs from upload by more than 5%", () => {
    const up = applyDocument(base(), "quote", { amount: 1000, itemized: true });
    expect(insurerLookup(up).evidence_conflict).toBe("False");
    expect(insurerLookup(answer(up, "quote_amount", 1050)).evidence_conflict).toBe("False");
    expect(insurerLookup(answer(up, "quote_amount", 1060)).evidence_conflict).toBe("True");
  });
});

describe("csv", () => {
  it("has the exact column order and capitalised booleans", () => {
    const row = buildRow("FORM-0001", a(base(), [["injury", "no"]]), c);
    const csv = toCsv([row]).split("\n");
    expect(csv[0]).toBe(CSV_COLUMNS.join(","));
    expect(csv[0]).toBe("case_id,case_status,claim_summary,policy_active_on_incident,claim_type,repair_type,quote_eur,incident_report_present,itemized_quote_present,injury_reported,liability_disputed,duplicate_flag,evidence_conflict");
    expect(csv[1]).toBe("FORM-0001,open,Scrape,True,motor_own_damage,,,,,False,,False,False");
    expect(toCsv([buildRow("F", a(base(), [["other_party", "no"]]), c)]).split("\n")[1]).toBe("F,open,Scrape,True,motor_own_damage,,,,,,False,False,False");
  });
});

describe("missing mode on imported cases", () => {
  it("accepts DEV, PRA and FORM ids", async () => {
    const { CASE_ID_RE } = await import("./logic");
    expect(["DEV-002", "PRA-012", "FORM-0001"].every((i) => CASE_ID_RE.test(i))).toBe(true);
    expect(CASE_ID_RE.test("XYZ-1")).toBe(false);
  });
  it("parses ; and , lists", async () => {
    const { parseMissing } = await import("./logic");
    expect(parseMissing("incident_report_present;itemized_quote_present")).toEqual(["incident_report_present", "itemized_quote_present"]);
    expect(parseMissing("quote_eur")).toEqual(["quote_eur"]);
  });
  it("patches only the missing column", async () => {
    const { patchMissingColumns, stateFromStoredRow } = await import("./logic");
    let s = openMissing(stateFromStoredRow({ claim_type: "motor_own_damage" }), c, ["incident_report_present"]);
    s = answer(s, "has_report", "yes");
    expect(patchMissingColumns(s, c, ["incident_report_present"])).toEqual({ incident_report_present: "True" });
  });
  it("patches quote_eur from a typed amount on an imported case", async () => {
    const { patchMissingColumns, stateFromStoredRow } = await import("./logic");
    expect(nextQuestion(openMissing(stateFromStoredRow({ claim_type: "motor_own_damage" }), c, ["quote_eur"]), c, { kind: "missing", missing: ["quote_eur"] })?.id).toBe("quote_amount");
    const s = answer(stateFromStoredRow({ claim_type: "motor_own_damage" }), "quote_amount", 640);
    expect(patchMissingColumns(s, c, ["quote_eur"])).toEqual({ quote_eur: "640" });
  });
  it("total-only quote sets itemized False", async () => {
    const { patchMissingColumns } = await import("./logic");
    const s = applyDocument(emptyState(), "quote", { amount: 890, itemized: false, sampleId: "quote-t" });
    expect(patchMissingColumns(s, c, ["itemized_quote_present"])).toEqual({ itemized_quote_present: "False" });
  });
});
