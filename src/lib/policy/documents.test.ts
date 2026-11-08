import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsPolicyDocument, createPolicyDocumentApi, parsedDocumentDraft, type DocumentParseResult } from "./documents";

const draft: NonNullable<DocumentParseResult["draft"]> = {
  title: "Uploaded policy",
  rules: [{ id: "engine-rule-7", outcome: "request_information", reason: "Missing report", when: [{ field: "incident_report_present", op: "is_false" }, { field: "quote_eur", op: "gt", value: 1200 }], blank_counts_as_match: true }],
  default: { id: "engine-default", outcome: "routine_processing", reason: "No match" },
};
const result: DocumentParseResult = { mode: "replace", lines: [{ n: 1, text: "rule", status: "ok", detail: "Read" }], warnings: [], notes: [], has_errors: false, draft };
const file = (name: string, bytes = new Uint8Array([0, 255, 12, 42]).buffer) => ({ name, arrayBuffer: vi.fn().mockResolvedValue(bytes) }) as unknown as File;
afterEach(() => vi.unstubAllGlobals());

describe("policy document transport", () => {
  it.each(["policy.txt", "policy.md", "policy.docx", "POLICY.DOCX"])("accepts %s", (name) => expect(acceptsPolicyDocument(name)).toBe(true));
  it.each(["policy.pdf", "policy.doc", "policy.txt.exe", "policy"])("rejects %s", (name) => expect(acceptsPolicyDocument(name)).toBe(false));
  it.each(["replace", "add"] as const)("sends raw bytes in %s mode without JSON or FormData", async (mode) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...result, mode })));
    vi.stubGlobal("fetch", fetcher);
    const bytes = new Uint8Array([0, 255, 12, 42]).buffer;
    const api = createPolicyDocumentApi("https://engine.example/", "test-token");
    const received = await api.parse(file("policy.docx", bytes), mode);
    expect(fetcher).toHaveBeenCalledWith(`https://engine.example/api/policy/parse?mode=${mode}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream", Authorization: "Bearer test-token" }, body: bytes,
    });
    expect(received.draft).toEqual(draft);
    expect(api.templateUrl).toBe("https://engine.example/policy_template.txt");
  });
  it("does not attempt to parse unsupported files", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(createPolicyDocumentApi("https://engine.example").parse(file("policy.pdf"), "replace")).rejects.toThrow(".txt, .md or .docx");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("has no local parsing fallback when the service is unset", async () => {
    const api = createPolicyDocumentApi();
    expect(api.templateUrl).toBeNull();
    await expect(api.parse(file("policy.txt"), "replace")).rejects.toThrow("live policy service");
  });
  it("surfaces the backend error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "The document is empty." }), { status: 400 })));
    await expect(createPolicyDocumentApi("https://engine.example").parse(file("policy.txt"), "replace")).rejects.toThrow("The document is empty.");
  });
  it("leaves the draft untouched for line errors even if the response includes a draft", () => {
    expect(parsedDocumentDraft({ ...result, has_errors: true, draft })).toBeNull();
  });
  it("passes the exact returned draft and all rule fields to the editor", () => {
    expect(parsedDocumentDraft(result)).toBe(draft);
    expect(parsedDocumentDraft(result)?.rules[0]).toEqual({ id: "engine-rule-7", outcome: "request_information", reason: "Missing report", when: [{ field: "incident_report_present", op: "is_false" }, { field: "quote_eur", op: "gt", value: 1200 }], blank_counts_as_match: true });
  });
});