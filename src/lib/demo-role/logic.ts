export const ROLES = ["reviewer", "policy_owner", "operations"] as const;
export type DemoRole = typeof ROLES[number];
export type DemoSession = { role: DemoRole; name: string };
export const ROLE_LABEL: Record<DemoRole, string> = { reviewer: "Reviewer", policy_owner: "Policy owner", operations: "Operations" };
export const ROLE_PAGE: Record<DemoRole, "/review" | "/policy" | "/business"> = { reviewer: "/review", policy_owner: "/policy", operations: "/business" };
export const DEMO_NAME: Record<DemoRole, string> = { reviewer: "Jury reviewer", policy_owner: "Jury policy owner", operations: "Jury operations" };
export function isRole(value: unknown): value is DemoRole { return ROLES.some((r) => r === value); }
export function pageRole(path: string): DemoRole | null {
  if (path === "/review" || path.startsWith("/review/")) return "reviewer";
  if (path === "/policy") return "policy_owner";
  if (path === "/business") return "operations";
  return null;
}
export function canView(role: DemoRole | undefined, path: string) {
  const required = pageRole(path);
  return !required || (required === "reviewer" ? !!role : role === required);
}
export function canAct(role: DemoRole | undefined, area: "review" | "policy" | "business") {
  return area === "review" ? role === "reviewer" : area === "policy" ? role === "policy_owner" : false;
}
export function safeNext(value: unknown, role: DemoRole) {
  if (typeof value !== "string") return ROLE_PAGE[role];
  // Only local, known internal destinations; preserve validated Business filters.
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return ROLE_PAGE[role];
  const path = value.split(/[?#]/)[0] ?? "";
  return pageRole(path) && canView(role, path) ? value : ROLE_PAGE[role];
}
export function parseSession(value: unknown): DemoSession | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  return isRole(s['role']) && typeof s['name'] === "string" && s['name'].trim() && s['name'].length <= 100 ? { role: s['role'], name: s['name'].trim() } : null;
}