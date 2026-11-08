export type QuestionType = "tri_state" | "choice" | "number" | "text" | "date" | "upload";
export type TriValue = "yes" | "no" | "not_sure";
export type DocKind = "quote" | "police_report";

export interface QuestionOption { value: string; label: string; hint?: string }
export interface ShowIf { q: string; eq?: string; in?: string[] }

export interface Question {
  id: string;
  vertical: string;
  section: string;
  label: string;
  short?: string;
  help: string;
  type: QuestionType;
  options?: QuestionOption[];
  field?: string;
  /** CSV fields this question feeds without mapping to them directly (asked in missing mode). */
  also_for?: string[];
  mapping?: "identity" | "round" | "repair_type" | Record<string, string>;
  source: "customer" | "system";
  show_if?: ShowIf;
  extractable_from?: DocKind;
  upload_on_yes?: DocKind;
}

export interface FormConfig {
  vertical: string;
  form_version: string;
  sections: string[];
  questions: Question[];
}

export type FactStatus = "unknown" | "known" | "dont_know" | "pending_confirm" | "system";
export type FactSource = "customer" | "upload" | "system";

export interface Fact {
  value: string | number | null;
  status: FactStatus;
  source: FactSource;
  timestamp: string;
}

export interface UploadEvidence { amount?: number; itemized?: boolean; sampleId?: string }

export interface IntakeState {
  facts: Record<string, Fact>;
  uploads: Partial<Record<DocKind, UploadEvidence>>;
}

export type Mode = { kind: "intake" } | { kind: "missing"; missing: string[] };

export const POLICY_VERSION = "v1";

export const CSV_COLUMNS = [
  "case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type",
  "repair_type", "quote_eur", "incident_report_present", "itemized_quote_present",
  "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type ClaimRow = Record<CsvColumn, string>;
