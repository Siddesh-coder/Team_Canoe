/** Test data shaping for the mock adapter only. The live engine owns all decisions. */
export const RULE_ORDER: [string, string][] = [
  ["R1.policy_inactive", "policy_active_on_incident"], ["R1.claim_type", "claim_type"], ["R1.injury", "injury_reported"],
  ["R1.liability_disputed", "liability_disputed"], ["R1.duplicate", "duplicate_flag"], ["R1.evidence_conflict", "evidence_conflict"],
  ["R1.quote_over_limit", "quote_eur"], ["R2.incident_report_missing", "incident_report_present"], ["R2.itemized_quote_missing", "itemized_quote_present"],
];
const ROUTINE = "No rule for review or for missing information applies. The claim may enter normal downstream processing. This is not a payment approval.";
const TABLE = `DEV-001|R3.routine|${ROUTINE}|||
DEV-002|R2.incident_report_missing|The incident report is missing.|incident_report_present||
DEV-003|R2.itemized_quote_missing|The itemized quote is missing.|itemized_quote_present||
DEV-004|R1.quote_over_limit|The repair quote is above the routine limit of EUR 1,500.|||
DEV-005|R1.policy_inactive|The policy was not active on the incident date.|||
DEV-006|R1.injury|An injury was reported.|||
DEV-007|R1.liability_disputed|Liability is disputed.|||
DEV-008|R1.duplicate|The claim is flagged as a duplicate.|||
DEV-009|R1.evidence_conflict|The evidence contains a conflict.|||
DEV-010|R3.routine|${ROUTINE}|||
DEV-011|R3.routine|${ROUTINE}|||
DEV-012|R1.claim_type|The claim type is not motor_own_damage.|||
DEV-013|R0.absent_fact|A fact the policy needs is absent, so the claim cannot be treated as routine.|quote_eur||quote_eur=blank
DEV-014|R1.injury|An injury was reported.||R2.incident_report_missing|incident_report_present=blank
PRA-001|R3.routine|${ROUTINE}|||
PRA-002|R3.routine|${ROUTINE}|||
PRA-003|R3.routine|${ROUTINE}|||
PRA-004|R3.routine|${ROUTINE}|||
PRA-005|R3.routine|${ROUTINE}|||
PRA-006|R2.itemized_quote_missing|The itemized quote is missing.|itemized_quote_present||
PRA-007|R1.injury|An injury was reported.||R2.incident_report_missing|
PRA-008|R1.policy_inactive|The policy was not active on the incident date.|||
PRA-009|R3.routine|${ROUTINE}|||
PRA-010|R3.routine|${ROUTINE}|||
PRA-011|R1.evidence_conflict|The evidence contains a conflict.|||
PRA-012|R2.incident_report_missing|The incident report is missing.|incident_report_present,itemized_quote_present|R2.itemized_quote_missing|`;

export interface MockRule { rule_id: string; reason: string; ask_fields: string[]; also_applies: string[]; statuses: Record<string, "blank" | "unreadable"> }
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
export const MOCK_RULES: Record<string, MockRule> = Object.fromEntries(TABLE.split("\n").map((line) => {
  const [id, rule_id, reason, ask, also, st] = line.split("|");
  const statuses = Object.fromEntries(list(st ?? "").map((p) => p.split("="))) as MockRule["statuses"];
  return [id, { rule_id, reason, ask_fields: list(ask ?? ""), also_applies: list(also ?? ""), statuses }];
}));
