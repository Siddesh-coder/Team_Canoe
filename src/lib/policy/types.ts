import type { Rec } from "@/lib/review/types";
export type { Rec };
export type RuleOutcome = "human_review" | "request_information";
export type Op = "is_true" | "is_false" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in";
export type CondValue = string | number | string[];
export interface Cond { field: string; op: Op; value?: CondValue }
export interface Rule { id: string; outcome: RuleOutcome; reason: string; when: Cond[]; blank_counts_as_match?: boolean }
export interface DefaultRule { id: string; outcome: "routine_processing"; reason: string }
export interface Draft { title: string; rules: Rule[]; default: DefaultRule }
export interface PolicyVersion extends Draft { version: string; meta: { published_by: string; approved_by: string; note: string; created_at: string } }
export interface PolicyDoc { versions: PolicyVersion[]; latest: string; fields: Record<string, string> }
export interface PreviewRow { case_id: string; status: string; from: Rec; to: Rec; rule_from: string; rule_to: string; changed: boolean; retained: boolean; summary: string }
export interface QualityVersion { n?: number; correct?: number; accuracy?: number; incorrect_routine?: number; unnecessary_human_review?: number; labelled_cases?: number; note?: string }
export interface ChangedCase { case_id: string; from: Rec; to: Rec; rule_before: string; rule_after: string; label_before: string | null; label_after: string | null; correct_before: boolean | null; correct_after: boolean | null }
export interface Preview {
  from_version: string; to_version: string; open_claims: number; closed_untouched: number; changed: number;
  moves: Record<string, number>; warnings: string[]; rows: PreviewRow[];
  draft_quality: { versions: Record<string, QualityVersion>; changed_cases: { count: number; cases: ChangedCase[]; regressions: string[]; fixed: string[] } };
}
export interface PublishBody { draft: Draft; published_by: string; approved_by: string; note: string }
export interface PublishResult {
  version: string; applied: { open_changed: number; open_unchanged: number; closed_untouched: number };
  change_timing: { duration_minutes: number; first_preview_at: string | null; published_at: string; open_claims_rechecked: number }; note?: string;
}
export interface PolicyApi {
  mode: "mock" | "http";
  getPolicy(): Promise<PolicyDoc>;
  preview(draft: Draft): Promise<Preview>;
  publish(body: PublishBody): Promise<PublishResult>;
}
