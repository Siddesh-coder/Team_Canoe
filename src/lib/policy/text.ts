/** Wording helpers for the policy page. Text only - no decisions are made here. */
import type { Cond, Draft, Op, Rule, RuleOutcome } from "./types";

export const BOOL_FIELDS = ["policy_active_on_incident", "incident_report_present", "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"];
export const SELECT_OPTIONS: Record<string, string[]> = { claim_type: ["motor_own_damage", "theft", "other"], repair_type: ["standard", "ev_high_voltage_battery"] };
export const OP_WORDS: Record<Op, string> = { is_true: "is yes", is_false: "is no", eq: "is", neq: "is not", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", in: "is one of", not_in: "is not one of" };
const OP_SYM: Partial<Record<Op, string>> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", neq: "≠" };
const VALUE_WORDS: Record<string, string> = { ev_high_voltage_battery: "EV battery work", motor_own_damage: "own damage", theft: "theft", other: "other", standard: "standard repair" };
const GATE: Record<string, string> = {
  "R1.policy_inactive": "Policy inactive", "R1.claim_type": "Not own-damage", "R1.injury": "Injury", "R1.liability_disputed": "Fault disputed",
  "R1.duplicate": "Duplicate", "R1.evidence_conflict": "Evidence conflict", "R1.ev_battery": "EV battery",
  "R2.incident_report_missing": "Incident report…", "R2.itemized_quote_missing": "Itemized quote…",
};

export const euro = (n: number) => `€${n.toLocaleString("en-IE")}`;
export function opsFor(field: string): Op[] {
  if (BOOL_FIELDS.includes(field)) return ["is_true", "is_false"];
  if (field === "quote_eur") return ["gt", "gte", "lt", "lte", "eq", "neq"];
  if (SELECT_OPTIONS[field]) return ["eq", "neq", "in", "not_in"];
  return ["eq", "neq"];
}
export function defaultCond(field: string): Cond {
  if (BOOL_FIELDS.includes(field)) return { field, op: "is_true" };
  if (field === "quote_eur") return { field, op: "gt", value: 1500 };
  return { field, op: "eq", value: SELECT_OPTIONS[field]?.[0] ?? "" };
}
export function valueText(c: Cond): string {
  if (c.value == null) return "";
  if (Array.isArray(c.value)) return c.value.join(", ");
  return c.field === "quote_eur" ? euro(Number(c.value)) : String(c.value);
}
export const quoteLimitOf = (rules: Rule[]): number | null => {
  const c = rules.find((r) => r.id === "R1.quote_over_limit")?.when.find((x) => x.field === "quote_eur");
  return c && typeof c.value === "number" ? c.value : null;
};
export function gateLabel(r: Rule, fields: Record<string, string>): string {
  const q = r.when.find((c) => c.field === "quote_eur");
  if (q) return `Quote ${OP_SYM[q.op] ?? ""} ${valueText(q)}`;
  return GATE[r.id] ?? fields[r.when[0]?.field ?? ""] ?? r.id;
}
const outcomeWord = (o: RuleOutcome) => (o === "human_review" ? "review" : "info");
function condPhrase(c: Cond, fields: Record<string, string>): string {
  const label = fields[c.field] ?? c.field;
  if (c.op === "is_true") return label;
  if (c.op === "eq" && typeof c.value === "string") { const w = VALUE_WORDS[c.value]; if (w) return w; }
  return `${label} ${OP_WORDS[c.op]} ${valueText(c)}`.trim();
}

/** One sentence summarising how the draft differs from the live policy. */
export function describeDiff(live: Draft, draft: Draft, version: string, fields: Record<string, string>): string {
  const changes: string[] = [];
  const liveById = new Map(live.rules.map((r) => [r.id, r]));
  const draftIds = new Set(draft.rules.map((r) => r.id));
  const adds = draft.rules.filter((r) => !liveById.has(r.id)).map((r) => `${r.when.map((c) => condPhrase(c, fields)).join(" and ")} goes to ${outcomeWord(r.outcome)}`);
  for (const r of draft.rules) {
    const old = liveById.get(r.id); if (!old) continue;
    r.when.forEach((c, i) => {
      const o = old.when[i];
      if (!o || JSON.stringify(o) === JSON.stringify(c)) return;
      if (c.field === "quote_eur" && o.field === "quote_eur" && o.op === c.op && typeof c.value === "number" && typeof o.value === "number")
        changes.push(`${c.value < o.value ? "lowers" : "raises"} the review limit from ${euro(o.value)} to ${euro(c.value)}`);
      else changes.push(`changes ${r.id} to "${condPhrase(c, fields)}"`);
    });
    if (old.when.length !== r.when.length) changes.push(`changes the conditions of ${r.id}`);
    if (old.outcome !== r.outcome) changes.push(`sends ${r.id} to ${outcomeWord(r.outcome)}`);
    if (!!old.blank_counts_as_match !== !!r.blank_counts_as_match) changes.push(`changes how ${r.id} treats a blank`);
  }
  const removed = live.rules.filter((r) => !draftIds.has(r.id)).map((r) => r.id);
  if (removed.length) changes.push(`removes ${removed.join(", ")}`);
  const common = draft.rules.filter((r) => liveById.has(r.id)).map((r) => r.id);
  const liveOrder = live.rules.filter((r) => draftIds.has(r.id)).map((r) => r.id);
  if (common.join() !== liveOrder.join()) changes.push("reorders the rules");
  if (!changes.length && !adds.length) return "The draft matches the live policy.";
  let s = `${version} ${changes.join(", ")}`;
  if (adds.length) s += `${changes.length ? " and adds" : "adds"}: ${adds.join("; ")}`;
  return s.replace(/\s+/g, " ").trim() + ".";
}
