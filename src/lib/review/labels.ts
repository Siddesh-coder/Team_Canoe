import type { ClaimListItem, FieldValue, Rec } from "./types";
import { RULE_ORDER } from "./mock-rules";

export const REC_LABEL: Record<Rec, string> = { routine_processing: "Routine processing", request_information: "Request information", human_review: "Human review" };
export const REC_SHORT: Record<Rec, string> = { routine_processing: "Routine", request_information: "Request info", human_review: "Human review" };
export const REASON: Record<string, string> = {
  "R1.policy_inactive": "Policy not active on the date", "R1.claim_type": "Not own-damage", "R1.injury": "Injury reported",
  "R1.liability_disputed": "Fault disputed", "R1.duplicate": "Possible duplicate", "R1.evidence_conflict": "Evidence conflicts",
  "R1.quote_over_limit": "Quote over the routine limit", "R2.incident_report_missing": "Incident report missing",
  "R2.itemized_quote_missing": "No itemized quote", "R0.absent_fact": "Missing information", "R3.routine": "All checks passed",
};
/** Field each rule reads - used only to highlight the triggered fact. */
export const RULE_FIELD: Record<string, string> = Object.fromEntries(RULE_ORDER);
export const FIELD_GROUPS: [string, string[]][] = [
  ["Cover", ["policy_active_on_incident", "claim_type"]],
  ["Damage", ["repair_type", "quote_eur", "itemized_quote_present", "incident_report_present"]],
  ["Flags", ["injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"]],
];

export type Tab = "needs" | "waiting" | "ready" | "closed";
export const isOpen = (c: { case_status: string }) => c.case_status === "open";
export function inTab(c: ClaimListItem, tab: Tab): boolean {
  if (tab === "closed") return !isOpen(c);
  if (!isOpen(c)) return false;
  if (tab === "needs") return c.effective_recommendation === "human_review";
  if (tab === "waiting") return c.effective_recommendation === "request_information";
  return c.effective_recommendation === "routine_processing";
}
export function sortQueue(list: ClaimListItem[]): ClaimListItem[] {
  return [...list].sort((a, b) => Number(b.recheck_pending) - Number(a.recheck_pending) || a.created_at.localeCompare(b.created_at) || a.case_id.localeCompare(b.case_id));
}
export function formatValue(field: string, v: FieldValue): string {
  if (v === null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field === "quote_eur" && typeof v === "number") return `€${v.toLocaleString("en-IE")}`;
  return String(v).replace(/_/g, " ");
}
export const euro = (n: number | null) => (n == null ? "-" : `€${n.toLocaleString("en-IE")}`);
