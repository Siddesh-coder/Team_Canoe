import { getReminders } from "./reminders";
import { getCustomerClaim } from "./customer.functions";
export const CUSTOMER_FIELDS: Record<string, string> = {
  incident_report_present: "incident report", itemized_quote_present: "itemized repair quote", quote_eur: "repair amount", claim_type: "what happened", repair_type: "repair type", injury_reported: "injury information", liability_disputed: "other party information",
};
export interface CustomerClaim {
  case_id: string; case_status: string; created_at: string; effective_recommendation?: string;
  settlement?: { decision: string; created_at: string } | null; closed_at?: string | null;
  info_requests: { status: string; created_at: string; ask_fields: string[]; answered_at?: string | null }[];
  request_status?: string | null;
  specialist_at?: string | null;
}
export function getCustomerStatus(claim: CustomerClaim, now: number | Date) {
  const caseId = claim.case_id;
  const events = [{ at: claim.created_at, text: "Claim received" }];
  const label = (f: string) => CUSTOMER_FIELDS[f] ?? "additional information";
  for (const r of claim.info_requests) {
    events.push({ at: r.created_at, text: `We asked for ${r.ask_fields.map(label).join(" · ")}` });
    if (r.answered_at) events.push({ at: r.answered_at, text: `You sent ${r.ask_fields.map(label).join(" · ")}` });
  }
  let station: 1 | 2 | 3 | 4 = 1;
  let kind: "received" | "checking" | "need_info" | "specialist" | "decided" = "received";
  let headline = "Your claim is received.";
  let next = "We'll be in touch.";
  let needInfo: { fields: string[]; labels: string[]; reminder: ReturnType<typeof getReminders> } | undefined;
  if (claim.case_status === "closed") {
    station = 4; kind = "decided";
    headline = claim.settlement?.decision === "approve" ? "Approved for normal processing." : claim.settlement?.decision === "decline" ? "Closed - we've written to you." : "Closed.";
    events.push({ at: claim.settlement?.created_at ?? claim.closed_at ?? claim.created_at, text: "Decided" });
  } else if (claim.effective_recommendation === "routine_processing" || claim.request_status === "answered_awaiting_recheck") {
    station = 2; kind = "checking";
    headline = claim.request_status === "answered_awaiting_recheck" ? "Your update is being checked." : "Everything is complete. It's moving to normal handling.";
    next = "No payment is approved yet - your insurer will be in touch.";
  } else if (claim.effective_recommendation === "request_information") {
    station = 2; kind = "need_info"; headline = "We need one thing from you"; next = "Add it now";
    const r = claim.info_requests.filter((r) => r.status === "open").at(-1);
    if (r) {
      const reminder = getReminders(r.created_at, now);
      needInfo = { fields: r.ask_fields, labels: r.ask_fields.map(label), reminder };
      reminder.sentAt.slice(1).forEach((at, i) => events.push({ at, text: `Reminder ${i + 2} sent (simulated)${i === 1 ? " · SMS" : ""}` }));
      if (reminder.overdue) events.push({ at: reminder.handoverAt, text: "Reviewer call handover due (simulated)" });
    }
  } else if (claim.effective_recommendation === "human_review") {
    station = 3; kind = "specialist"; headline = "A specialist is looking at your claim. We'll contact you.";
    if (claim.specialist_at) events.push({ at: claim.specialist_at, text: "A specialist picked it up" });
  }
  return { caseId, station, kind, headline, next, needInfo, events: events.sort((a, b) => a.at.localeCompare(b.at)) };
}
export async function fetchCustomerStatus(caseId: string) { return getCustomerStatus(await getCustomerClaim({ data: { caseId } }), Date.now()); }