import { supabase } from "@/integrations/supabase/client";
import { ApiError } from "@/lib/review/types";
import { createPolicyStore, type MockCase } from "./mock";
import type { PolicyApi } from "./types";

export * from "./types";

function httpApi(base: string, token?: string): PolicyApi {
  const call = async (path: string, body?: unknown) => {
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch { throw new ApiError("We can't reach the policy service.", 0); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(json?.error ?? `Something went wrong (${res.status}).`, res.status);
    return json;
  };
  return {
    mode: "http",
    getPolicy: () => call("/api/policy"),
    preview: (draft) => call("/api/policy/preview", { draft }),
    publish: (b) => call("/api/policy/publish", b),
  };
}

function mockApi(): PolicyApi {
  const store = createPolicyStore(async () => {
    const { data, error } = await supabase.from("claim_rows").select("case_id,case_status,recommendation,claim_summary,repair_type")
      .or("case_id.like.DEV-%,case_id.like.PRA-%").order("case_id");
    if (error) throw new ApiError("We couldn't load the cases.", 500);
    return data as unknown as MockCase[];
  });
  return { mode: "mock", getPolicy: store.get, preview: store.preview, publish: store.publish };
}

let instance: PolicyApi | null = null;
/** `http` when VITE_API_URL is set, otherwise an in-memory `mock`. */
export function getPolicyApi(): PolicyApi {
  if (instance) return instance;
  const url = import.meta.env['VITE_API_URL'] as string | undefined;
  instance = url ? httpApi(url, import.meta.env['VITE_API_TOKEN'] as string | undefined) : mockApi();
  return instance;
}
