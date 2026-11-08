import { motorConfig } from "@/lib/intake/config";
import type { CustomerClaim } from "./status";

/** Project only customer-safe status data from the engine record. */
export function projectCustomerClaim(c: CustomerClaim & { decisions?: { created_at: string }[] }): CustomerClaim {
  const infoRequests = c.info_requests.map((r) => ({ status: r.status, created_at: r.created_at, ask_fields: r.ask_fields.filter((f) => motorConfig.questions.some((q) => q.source === "customer" && (q.field === f || q.also_for?.includes(f)))), answered_at: r.answered_at ?? null }));
  const last = infoRequests.at(-1);
  const awaiting = last?.status === "answered" && c.effective_recommendation === "request_information" && !(c.decisions ?? []).some((d) => last.answered_at && Date.parse(d.created_at) > Date.parse(last.answered_at));
  return { case_id: c.case_id, case_status: c.case_status, created_at: c.created_at, ...(c.effective_recommendation ? { effective_recommendation: c.effective_recommendation } : {}), closed_at: c.closed_at ?? null, settlement: c.settlement ? { decision: c.settlement.decision, created_at: c.settlement.created_at } : null, request_status: c.request_status ?? (awaiting ? "answered_awaiting_recheck" : null), info_requests: infoRequests };
}