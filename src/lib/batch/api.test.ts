import { afterEach, describe, expect, it, vi } from "vitest";
import { runBatch, summarizeBatch, validateCsv } from "./api";

const response = { columns: ["case_id", "recommendation_v2", "needs_recheck"], results: [
  { case_id: "B-1", recommendation_v2: "human_review", needs_recheck: "True" },
  { case_id: "B-2", recommendation_v2: "routine_processing", needs_recheck: "False" },
  { case_id: "B-3", recommendation_v2: "human_review", needs_recheck: true },
], csv: "exact,returned\r\nCSV", saved: null, policy_versions: ["v1", "v2"] };
afterEach(() => vi.unstubAllGlobals());
describe("Batch transport and summaries", () => {
  it("posts raw CSV with text/csv to the existing base", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetcher);
    const text = "case_id,injury\r\nB-1,True\r\n";
    expect(await runBatch(text, false, "https://example.test/")).toEqual(response);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/batch", expect.objectContaining({ method: "POST", body: text, headers: expect.objectContaining({ "Content-Type": "text/csv" }) }));
  });
  it("requests register saving only with save=1", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...response, saved: { count: 3 } })));
    vi.stubGlobal("fetch", fetcher);
    expect((await runBatch("raw,csv", true, "https://example.test")).saved).toEqual({ count: 3 });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://example.test/api/batch?save=1");
  });
  it("counts only literal True and returned v2 outcomes", () => {
    expect(summarizeBatch(response)).toEqual({ triaged: 3, recheck: 1, outcomes: [["human_review", 2], ["routine_processing", 1]] });
  });
  it("rejects non-CSV files", () => { expect(() => validateCsv("claims.txt", "data")).toThrow(".csv"); });
  it("rejects empty CSV files", () => { expect(() => validateCsv("claims.csv", " \r\n")).toThrow("empty"); });
  it("accepts uppercase CSV extensions without modifying text", () => { expect(() => validateCsv("CLAIMS.CSV", "raw,csv")).not.toThrow(); });
  it("preserves the server error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Missing case_id column" }), { status: 400 })));
    await expect(runBatch("raw,csv", false, "https://example.test")).rejects.toThrow("Missing case_id column");
  });
});