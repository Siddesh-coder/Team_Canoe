import { isPublicDemoId } from "@/lib/chat/logic";
import { projectCustomerClaim } from "./projection";
import type { CustomerClaim } from "./status";
export async function readCustomerClaim(caseId: string, secret?: string, base?: string, token?: string): Promise<CustomerClaim> {
  const { hasClaimAccess } = await import("./access.server");
  if (!isPublicDemoId(caseId) && (!secret || !await hasClaimAccess(caseId, secret))) throw new Error("We can't find that claim number. Check your confirmation email.");
  if (!base) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("claim_rows").select("case_id,case_status,recommendation,missing_fields,request_status,updated_at").eq("case_id", caseId).maybeSingle();
    if (!row) throw new Error("We can't find that claim number. Check your confirmation email.");
    return { case_id: row.case_id, case_status: row.case_status, created_at: row.updated_at, effective_recommendation: row.recommendation ?? undefined, request_status: row.request_status, info_requests: row.request_status === "requested" ? [{ status: "open", created_at: row.updated_at, ask_fields: (row.missing_fields ?? "").split(";").filter(Boolean) }] : [] };
  }
  const response = await fetch(`${base.replace(/\/$/, "")}/api/claims/${encodeURIComponent(caseId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 404 ? "We can't find that claim number. Check your confirmation email." : "Claim status is unavailable. Please try again.");
  const c = await response.json();
  if (c.case_id !== caseId) throw new Error("Claim status is unavailable. Please try again.");
  // Explicit projection: no personal facts, notes, rules, versions, or internal explanations.
  return projectCustomerClaim({ ...c, info_requests: c.info_requests ?? [] });
}
