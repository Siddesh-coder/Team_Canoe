import { ApiError } from "@/lib/review/types";
import type { Draft } from "./types";

export type DocumentMode = "replace" | "add";
export interface DocumentParseResult {
  mode: DocumentMode;
  lines: { n: number; text: string; status: "ok" | "error" | "ignored"; detail: string }[];
  warnings: string[];
  notes: string[];
  has_errors: boolean;
  draft: Draft | null;
}

export function acceptsPolicyDocument(name: string): boolean {
  return /\.(txt|md|docx)$/i.test(name);
}

/** Only backend-approved drafts may replace the editor; never transform rules here. */
export function parsedDocumentDraft(result: DocumentParseResult): Draft | null {
  return result.has_errors ? null : result.draft;
}

export function createPolicyDocumentApi(base?: string, token?: string) {
  const url = base?.replace(/\/$/, "");
  return {
    templateUrl: url ? `${url}/policy_template.txt` : null,
    async parse(file: File, mode: DocumentMode): Promise<DocumentParseResult> {
      if (!acceptsPolicyDocument(file.name)) throw new ApiError("Choose a .txt, .md or .docx file.", 400);
      if (!url) throw new ApiError("Document upload needs the live policy service.", 0);
      const bytes = await file.arrayBuffer();
      let response: Response;
      try {
        response = await fetch(`${url}/api/policy/parse?mode=${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: bytes,
        });
      } catch { throw new ApiError("We can't reach the policy service. Try uploading again.", 0); }
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(json?.error ?? `Something went wrong (${response.status}).`, response.status);
      if (!json || !Array.isArray(json.lines) || !Array.isArray(json.notes) || !Array.isArray(json.warnings) || typeof json.has_errors !== "boolean" || (!json.has_errors && !Array.isArray(json.draft?.rules))) {
        throw new ApiError("The policy service returned an unreadable response. Try uploading again.", response.status);
      }
      return json as DocumentParseResult;
    },
  };
}

export const policyDocumentApi = createPolicyDocumentApi(import.meta.env['VITE_API_URL'], import.meta.env['VITE_API_TOKEN']);