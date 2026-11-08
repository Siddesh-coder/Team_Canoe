import type { Fact, Question } from "@/lib/intake/types";

export function displayValue(q: Question, f?: Fact): string {
  if (!f) return "";
  if (f.status === "dont_know") return "Not sure";
  if (f.value == null) return "";
  const v = String(f.value);
  if (q.type === "tri_state") {
    const opt = q.options?.find((o) => o.value === v);
    return opt?.label ?? (v === "yes" ? "Yes" : v === "no" ? "No" : v);
  }
  if (q.type === "choice") return q.options?.find((o) => o.value === v)?.label ?? v;
  if (q.type === "number") return `€${Number(v).toLocaleString("en-IE")}`;
  if (q.type === "date") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return v.length > 60 ? v.slice(0, 57) + "…" : v;
}
