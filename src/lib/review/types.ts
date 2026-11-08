export type Rec = "routine_processing" | "request_information" | "human_review";
export type EffSource = "system" | "reviewer" | "reviewer_confirmed";
export type FieldValue = string | number | boolean | null;

export interface ClaimListItem {
  case_id: string; case_status: string; summary: string; quote_eur: number | null; created_at: string;
  recommendation_latest: Rec; policy_version: string; rule: string;
  effective_recommendation: Rec; effective_source: EffSource; recheck_pending: boolean;
  settled_decision: null | "approve" | "decline";
}
export interface Field { field: string; label: string; value: FieldValue; status: "known" | "blank" | "unreadable"; source: string }
export interface TraceStep { rule: string; outcome: string; result: true | false | "unknown"; counted_as: string }
export interface Decision {
  id: string; policy_version: string; recommendation: Rec; rule_id: string; explanation: string; trigger: string; created_at: string;
  detail: { reason: string; ask_fields: string[]; also_applies: string[]; trace: TraceStep[] };
}
export interface Override { kind: "override" | "confirm"; original_recommendation: Rec; corrected_recommendation: Rec; reason: string; reviewer: string; policy_version: string; created_at: string }
export interface FactEdit { field: string; old_value: FieldValue; new_value: FieldValue; reason: string; editor: string; role: string; created_at: string }
export interface Recheck { from_version: string; to_version: string; from_recommendation: Rec; to_recommendation: Rec; status: string; created_at: string }
export interface InfoRequest { ask_fields: string[]; status: string; created_at: string; subject: string }
export interface Outcome { final_outcome: string; source: string; note: string; recorded_by: string; created_at: string }
export interface Settlement { decision: "approve" | "decline"; reason: string; reviewer: string; policy_version: string; system_recommendation: Rec; created_at: string }

export interface ClaimDetail {
  case_id: string; case_status: string; summary: string; created_at: string;
  fields: Field[]; latest_decision: Decision; decisions: Decision[];
  effective_recommendation: Rec; effective_source: EffSource;
  overrides: Override[]; fact_edits: FactEdit[]; rechecks: Recheck[]; info_requests: InfoRequest[]; outcomes: Outcome[];
  editable: boolean; closed_at: string | null; settlement: Settlement | null;
}

export interface ReviewApi {
  mode: "mock" | "http";
  listClaims(): Promise<{ claims: ClaimListItem[] }>;
  getClaim(id: string): Promise<ClaimDetail>;
  override(id: string, body: { corrected_recommendation: Rec; reason: string; reviewer: string }): Promise<ClaimDetail>;
  settle(id: string, body: { decision: "approve" | "decline"; reason: string; reviewer: string }): Promise<ClaimDetail>;
  facts(id: string, body: { changes: Record<string, FieldValue>; reason: string; reviewer: string }): Promise<ClaimDetail>;
  outcome(id: string, body: { final_outcome: string; source: string; note: string; recorded_by: string }): Promise<ClaimDetail>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
