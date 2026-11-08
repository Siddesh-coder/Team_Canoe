import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { motorConfig } from "@/lib/intake/config";
import { CASE_ID_RE, buildRow, factLogEntries, parseMissing, patchMissingColumns } from "@/lib/intake/logic";
import { POLICY_VERSION, type ClaimRow, type IntakeState } from "@/lib/intake/types";

const factSchema = z.object({
  value: z.union([z.string().max(4000), z.number(), z.null()]),
  status: z.enum(["unknown", "known", "dont_know", "pending_confirm", "system"]),
  source: z.enum(["customer", "upload", "system"]),
  timestamp: z.string().max(40),
});
const evidence = z.object({ amount: z.number().optional(), itemized: z.boolean().optional(), sampleId: z.string().max(40).optional() });
const stateSchema = z.object({
  facts: z.record(z.string().max(60), factSchema),
  uploads: z.object({ quote: evidence.optional(), police_report: evidence.optional() }),
});

async function writeFacts(caseId: string, state: IntakeState) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = factLogEntries(state, motorConfig).map((e) => ({
    case_id: caseId, ...e, form_version: motorConfig.form_version, policy_version: POLICY_VERSION,
  }));
  const { error } = await supabaseAdmin.from("fact_log").insert(rows);
  if (error) throw new Error(error.message);
}

export const submitClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ state: stateSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: id, error: idErr } = await supabaseAdmin.rpc("next_case_id");
    if (idErr || !id) throw new Error(idErr?.message ?? "No case id");
    const row = buildRow(id as string, data.state as IntakeState, motorConfig);
    const { error } = await supabaseAdmin.from("claim_rows").insert(row);
    if (error) throw new Error(error.message);
    await writeFacts(row.case_id, data.state as IntakeState);
    return { caseId: row.case_id };
  });

export const updateClaim = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    caseId: z.string().regex(CASE_ID_RE),
    state: stateSchema,
    missing: z.array(z.string().max(60)).max(20).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const state = data.state as IntakeState;
    const { data: stored, error: e1 } = await supabaseAdmin.from("claim_rows").select("case_id,missing_fields").eq("case_id", data.caseId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!stored) throw new Error("Unknown case");
    const fromCase = parseMissing(stored.missing_fields);
    const missing = data.missing?.length ? data.missing : fromCase;
    const now = new Date().toISOString();
    let update: Partial<ClaimRow> & { request_status?: string; updated_at: string };
    if (missing.length) {
      // Patch only the missing columns; recommendation/rule stay for the rules engine to re-run.
      update = { ...patchMissingColumns(state, motorConfig, missing), request_status: "answered_awaiting_recheck", updated_at: now };
    } else {
      const { case_id: _id, ...rest } = buildRow(data.caseId, state, motorConfig);
      update = { ...rest, updated_at: now };
    }
    const { error } = await supabaseAdmin.from("claim_rows").update(update).eq("case_id", data.caseId);
    if (error) throw new Error(error.message);
    await writeFacts(data.caseId, state);
    return { caseId: data.caseId };
  });

export const markRequested = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ caseId: z.string().regex(CASE_ID_RE) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("claim_rows")
      .update({ request_status: "requested", updated_at: new Date().toISOString() })
      .eq("case_id", data.caseId).eq("recommendation", "request_information")
      .select("case_id,missing_fields").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not a request-information case");
    return { caseId: row.case_id, missing: parseMissing(row.missing_fields) };
  });
