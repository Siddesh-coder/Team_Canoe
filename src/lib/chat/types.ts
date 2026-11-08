export type ChatLocale = "en" | "de";
export type AgentRole = "policy" | "support" | "documents";
export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface TrackingStatus {
  case_id: string; case_status: string;
  recommendation: "routine_processing" | "human_review" | "request_information" | null;
  request_status: string | null; updated_at: string | null; policy_version: string | null;
  recheck_pending: boolean; source: "live engine + claim record" | "claim record";
}
export interface ChatReply { text: string; status?: TrackingStatus; customerStatus?: ReturnType<typeof import("@/lib/customer/status").getCustomerStatus>; awaitingId?: boolean; error?: boolean }