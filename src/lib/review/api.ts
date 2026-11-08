import { supabase } from "@/integrations/supabase/client";
import { mockApi, type StoredRow } from "./mock";
import { ApiError, type ReviewApi } from "./types";

export * from "./types";

function httpApi(base: string, token?: string): ReviewApi {
  const call = async (path: string, init?: { method: string; body: unknown }) => {
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: init ? JSON.stringify(init.body) : null,
      });
    } catch { throw new ApiError("We can't reach the review service.", 0); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(json?.error ?? `Something went wrong (${res.status}).`, res.status);
    return json;
  };
  const enc = encodeURIComponent;
  return {
    mode: "http",
    listClaims: () => call("/api/claims"),
    getClaim: (id) => call(`/api/claims/${enc(id)}`),
    override: (id, body) => call(`/api/claims/${enc(id)}/override`, { method: "POST", body }),
    settle: (id, body) => call(`/api/claims/${enc(id)}/settle`, { method: "POST", body }),
    facts: (id, body) => call(`/api/claims/${enc(id)}/facts`, { method: "POST", body }),
    outcome: (id, body) => call(`/api/claims/${enc(id)}/outcome`, { method: "POST", body }),
  };
}

let instance: ReviewApi | null = null;
/** `http` when VITE_API_URL is set, otherwise the in-memory `mock` built from claim_rows. */
export function getReviewApi(): ReviewApi {
  if (instance) return instance;
  const url = import.meta.env['VITE_API_URL'] as string | undefined;
  instance = url
    ? httpApi(url, import.meta.env['VITE_API_TOKEN'] as string | undefined)
    : mockApi(async () => {
        const { data, error } = await supabase.from("claim_rows").select("*").or("case_id.like.DEV-%,case_id.like.PRA-%").order("case_id");
        if (error) throw new ApiError("We couldn't load the cases.", 500);
        return data as unknown as StoredRow[];
      });
  return instance;
}
