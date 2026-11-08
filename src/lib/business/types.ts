import type { ClaimListItem, Rec } from '@/lib/review/types';
import type { ChangedCase, PolicyDoc, QualityVersion } from '@/lib/policy/types';
export interface BusinessClaim extends ClaimListItem { recommendation_v1?: Rec; rule_v1?: string }
export interface Recheck { case_id: string; from_version: string; to_version: string; from_recommendation: Rec; to_recommendation: Rec; status: string; created_at: string }
export interface PolicyChange { version: string; duration_minutes: number; first_preview_at: string | null; published_at: string; open_claims_rechecked: number }
export interface Impact { latest_version: string; versions: string[]; open_claims: number; closed_claims: number; recheck_total: number; recheck_pending: number; moves: Record<string, number>; rechecks: Recheck[]; policy_changes: PolicyChange[]; settled: { approve: number; decline: number } }
export interface QualityMetric extends QualityVersion { policy_version?: string; incorrect_routine_rate?: number; unnecessary_human_review_rate?: number; failures?: unknown[] }
export interface Quality {
  versions: Record<string, QualityMetric>;
  changed_cases: { from_version: string; to_version: string; count: number; cases: ChangedCase[]; labelled: number; correct_after: number; wrong_after: number; regressions: string[]; fixed: string[] };
  blank_fields: { case_id: string; absent_fields: string[]; unreadable_fields: string[]; recommendation: Rec; rule: string; label: string | null; correct: boolean | null }[];
  notes: string[];
  monitoring: { claims_with_reviewer_action: number; overrides_recorded: number; confirmations_recorded: number; overrides_by_rule: Record<string, unknown>; override_rate: number | null; final_outcomes_recorded: number; outcome_agreement: number; outcome_disagreement: number; routine_recommendations_contradicted_by_outcome: unknown[]; pending_rechecks: number };
}
export interface AuditEvent { at: string; type: string; case_id: string; by: string; detail: string; policy_version: string }
export interface BusinessData { impact: Impact; quality: Quality; claims: BusinessClaim[]; audit: AuditEvent[]; policy: PolicyDoc; mode: 'http' | 'mock' }