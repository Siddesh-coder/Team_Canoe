import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { Accent, Wordmark } from "@/components/canoe/brand";
import { Button } from "@/components/ui/button";
import { useDemoSession } from "@/components/demo-role/DemoSession";
import { DEMO_NAME, ROLE_LABEL, ROLES, isRole, safeNext } from "@/lib/demo-role/logic";
export const Route = createFileRoute("/sign-in")({
  validateSearch: (s: Record<string, unknown>): { role?: string; next?: string } => ({ ...(typeof s['role'] === "string" ? { role: s['role'] } : {}), ...(typeof s['next'] === "string" ? { next: s['next'] } : {}) }),
  head: () => ({ meta: [{ title: "Demo sign-in - Canoe" }, { name: "description", content: "Choose a demo workspace role for Canoe. No real accounts or authentication." }, { property: "og:title", content: "Demo sign-in - Canoe" }, { property: "og:description", content: "Enter the Canoe reviewer, policy owner or operations demo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: SignInPage,
});
function SignInPage() {
  const search = Route.useSearch();
  const role = isRole(search.role) ? search.role : "reviewer";
  const navigate = useNavigate();
  const { signIn } = useDemoSession();
  const password = useRef<HTMLInputElement>(null);
  const enter = () => { if (password.current) password.current.value = ""; signIn(role, DEMO_NAME[role]); void navigate({ href: safeNext(search.next, role) }); };
  return <div className="mx-auto max-w-[1120px] px-5 py-6 md:px-8"><Wordmark /><main className="max-w-xl pb-24 pt-16"><p className="eyebrow mb-5">Canoe / demo workspace</p><h1 className="question-title">Sign in as <Accent>{ROLE_LABEL[role].toLowerCase()}</Accent></h1><div role="group" aria-label="Choose demo role" className="mt-6 flex flex-wrap gap-2">{ROLES.map((r) => <Button key={r} variant="outline" size="sm" aria-pressed={role === r} onClick={() => navigate({ to: "/sign-in", search: { role: r, next: safeNext(search.next, r) }, replace: true })}>{ROLE_LABEL[r]}</Button>)}</div><Button className="mt-8 h-auto w-full whitespace-normal py-4" onClick={enter}>Continue as demo {ROLE_LABEL[role].toLowerCase()} - no password</Button><p className="mt-4 text-sm text-stone">Demo sign-in. No real accounts or passwords - this prototype has no authentication.</p><form className="mt-8 space-y-5 border-t border-stone/25 pt-6" autoComplete="off" onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const email = form.querySelector<HTMLInputElement>("[data-email]"); if (!email?.value.trim() || !password.current?.value.trim()) return; form.reset(); enter(); }}><label className="block text-sm">Email<input data-email required type="text" inputMode="email" autoComplete="off" maxLength={254} className="field-input mt-2 w-full px-4 py-3" /></label><label className="block text-sm">Password<input ref={password} required type="password" autoComplete="off" maxLength={256} className="field-input mt-2 w-full px-4 py-3" /></label><Button type="submit">Sign in</Button></form></main></div>;
}