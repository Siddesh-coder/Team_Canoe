import { z } from "zod";

const responseSchema = z.object({
  columns: z.array(z.string()),
  results: z.array(z.record(z.unknown())),
  csv: z.string(),
  saved: z.record(z.unknown()).nullable(),
  policy_versions: z.array(z.string()),
});
export type BatchResponse = z.infer<typeof responseSchema>;

export function validateCsv(name: string, text: string): void {
  if (!name.toLowerCase().endsWith(".csv")) throw new Error("Please choose a .csv file.");
  if (!text.trim()) throw new Error("This CSV file is empty. Please choose a file with claims.");
}

/** Counts returned outcomes only; never evaluates facts or policy rules. */
export function summarizeBatch(response: BatchResponse) {
  const outcomes = new Map<string, number>();
  for (const row of response.results) {
    const outcome = String(row['recommendation_v2'] ?? "");
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  }
  return {
    triaged: response.results.length,
    recheck: response.results.filter((row) => row['needs_recheck'] === "True").length,
    outcomes: Array.from(outcomes.entries()),
  };
}

export async function runBatch(text: string, save: boolean, base = import.meta.env['VITE_API_URL'] as string | undefined): Promise<BatchResponse> {
  if (!base) throw new Error("The batch service is not configured. Please try again when it is available.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 100_000);
  try {
    const token = import.meta.env['VITE_API_TOKEN'] as string | undefined;
    const response = await fetch(`${base.replace(/\/$/, "")}/api/batch${save ? "?save=1" : ""}`, {
      method: "POST",
      headers: { "Content-Type": "text/csv", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: text,
      signal: controller.signal,
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(json);
      throw new Error(error.success ? error.data.error : `The batch could not run (${response.status}). Please try again.`);
    }
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) throw new Error("The batch service returned an unreadable result. Please try again.");
    return parsed.data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The server is taking longer than expected. Please try again.");
    if (error instanceof TypeError) throw new Error("We couldn't reach the batch service. Please try again.");
    throw error;
  } finally { clearTimeout(timeout); }
}