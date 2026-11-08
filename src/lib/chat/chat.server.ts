import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { POLICY_V1 } from "@/lib/policy/mock";
import motor from "@/config/motor.json";
import { agentInstructions } from "./agent-config.server";
import { askReference, explainStatus, extractCaseId, isPublicDemoId, privacyReply, trackingIntent, unknownReply } from "./logic";
import type { AgentRole, ChatLocale, ChatReply, ChatTurn, TrackingStatus } from "./types";
import { getCustomerStatus } from "@/lib/customer/status";

const rec = z.enum(["routine_processing", "human_review", "request_information"]);
const liveStatus = z.object({
  case_id: z.string(), case_status: z.string().max(40),
  latest_decision: z.object({ recommendation: rec, policy_version: z.string().max(40) }),
  request_status: z.string().max(80).nullable().optional(), updated_at: z.string().max(80).nullable().optional(),
  rechecks: z.array(z.object({ status: z.string().max(80) })).optional(),
});
const policySchema = z.object({ latest: z.string().max(40), versions: z.array(z.object({
  version: z.string().max(40), title: z.string().max(500),
  rules: z.array(z.object({ id: z.string().max(120), outcome: rec, reason: z.string().max(1000),
    when: z.array(z.object({ field: z.string().max(100), op: z.string().max(30), value: z.union([z.string().max(500), z.number(), z.array(z.string().max(100))]).optional() })),
    blank_counts_as_match: z.boolean().optional(),
  })).max(50), default: z.object({ id: z.string(), outcome: rec, reason: z.string().max(1000) }),
})).max(30) });

async function engineRead(path: string): Promise<unknown | null> {
  // Configuration is read only within server execution. Never import the browser API adapters.
  const base = process.env['CANOE_API_URL'] || import.meta.env['VITE_API_URL'];
  if (!base) return null;
  const token = process.env['CANOE_API_TOKEN'];
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Policy service unavailable");
  return response.json();
}

export async function lookupDemo(id: string): Promise<TrackingStatus | null> {
  // Authorization MUST precede the privileged import and all external calls.
  if (!isPublicDemoId(id)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin.from("claim_rows")
    .select("case_id,case_status,recommendation,request_status,policy_version,updated_at")
    .eq("case_id", id).limit(1).maybeSingle();
  if (error) throw new Error("Claim record unavailable");
  const liveRaw = await engineRead(`/api/claims/${encodeURIComponent(id)}`);
  const live = liveRaw === null ? null : liveStatus.parse(liveRaw);
  if (live && live.case_id !== id) throw new Error("Reference mismatch");
  if (!row && !live) return null;
  // Live engine owns triage/closure; claim_rows owns intake-request updates.
  // Never select missing_fields, rules, personal facts, summary or settlement notes.
  return {
    case_id: id, case_status: live?.case_status ?? row?.case_status ?? "not recorded",
    recommendation: live?.latest_decision.recommendation ?? (rec.safeParse(row?.recommendation).success ? rec.parse(row?.recommendation) : null),
    request_status: row?.request_status ?? live?.request_status ?? null,
    updated_at: row?.updated_at ?? live?.updated_at ?? null,
    policy_version: live?.latest_decision.policy_version ?? row?.policy_version ?? null,
    recheck_pending: live?.rechecks?.some((r) => r.status === "pending") ?? false,
    source: live ? "live engine + claim record" : "claim record",
  };
}

export async function respond(input: { locale: ChatLocale; role: AgentRole; messages: ChatTurn[] }): Promise<ChatReply> {
  const { locale, role, messages } = input;
  const current = messages.at(-1)?.content ?? "";
  const history = messages.slice(0, -1);
  if (trackingIntent(current, history)) {
    const id = extractCaseId(current);
    if (!id) return { text: askReference(locale), awaitingId: true };
    if (isPublicDemoId(id) || /^CLM-\d{4,8}$/.test(id)) {
      try {
        const { readCustomerClaim } = await import("@/lib/customer/read.server");
        const claim = await readCustomerClaim(id, process.env['CUSTOMER_TRACKING_SECRET'], process.env['CANOE_API_URL'] || import.meta.env['VITE_API_URL'], process.env['CANOE_API_TOKEN']);
        const customerStatus = getCustomerStatus(claim, Date.now());
        return { text: locale === "de" ? "Den aktuellen Stand und den nächsten Schritt finden Sie auf Ihrer Tracking-Seite." : `${customerStatus.headline} ${customerStatus.next}`, customerStatus };
      } catch { return { text: /^CLM-/.test(id) ? privacyReply(locale) : unknownReply(locale) }; }
    }
    if (!isPublicDemoId(id)) return { text: /^FORM-/.test(id) ? privacyReply(locale) : unknownReply(locale) };
    try {
      const status = await lookupDemo(id);
      return status ? { text: explainStatus(status, locale), status } : { text: unknownReply(locale) };
    } catch {
      return { text: locale === "de" ? "Der aktuelle Schadenstatus ist gerade nicht erreichbar. Bitte versuchen Sie es erneut." : "The current claim status is unavailable right now. Please try again.", error: true };
    }
  }
  try {
    const rawPolicy = await engineRead("/api/policy");
    let policyContext: string;
    if (rawPolicy === null) {
      if (process.env['CANOE_API_URL'] || import.meta.env['VITE_API_URL']) throw new Error("Published policy missing");
      policyContext = JSON.stringify({ source: "v1 demo fixture, no live service configured", ...POLICY_V1 });
    } else {
      const doc = policySchema.parse(rawPolicy);
      const active = doc.versions.find((v) => v.version === doc.latest);
      if (!active) throw new Error("Published policy missing");
      policyContext = JSON.stringify({ source: "live published policy", ...active });
    }
    const intakeContext = JSON.stringify(motor.questions.map((q) => ({ question: q.label, help: q.help })));
    const response = await generateResponse({
      model: "openai/gpt-6-astra", instructions: agentInstructions(role, locale, policyContext, intakeContext),
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: 700,
    });
    const text = response.output.flatMap((item) => item.type === "message"
      ? item.content.map((part) => part.type === "output_text" ? part.text : part.refusal) : []).join("\n").trim();
    if (!text) throw new Error("Empty response");
    return { text };
  } catch (error) {
    // Log correlation only; never log input, case records, keys or raw provider messages.
    if (error instanceof GatewayError) console.warn("Ask Canoe gateway failure", { code: error.code, ids: error.ids });
    return { text: locale === "de"
      ? "Die KI-Policy-Hilfe ist gerade nicht verfügbar. Bitte versuchen Sie es erneut. Die Referenzprüfung bleibt separat verfügbar."
      : "AI policy guidance is unavailable right now. Please try again. Reference tracking remains available separately.", error: true };
  }
}