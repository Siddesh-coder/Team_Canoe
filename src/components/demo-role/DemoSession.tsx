import { useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Wordmark } from "@/components/canoe/brand";
import { Button } from "@/components/ui/button";
import { canView, DEMO_NAME, ROLE_LABEL, pageRole, parseSession, type DemoRole, type DemoSession } from "@/lib/demo-role/logic";
import { DemoSessionContext as Context } from "./session-context";
const KEY = "canoe-demo-session";
export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => { try { setSession(parseSession(JSON.parse(localStorage.getItem(KEY) ?? "null"))); } catch { setSession(null); } };
    read(); setReady(true); window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  const signIn = (role: DemoRole, name = DEMO_NAME[role]) => { const next = { role, name }; setSession(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* tab-local demo still works */ } };
  const signOut = () => { setSession(null); try { localStorage.removeItem(KEY); } catch { /* optional storage */ } };
  return <Context.Provider value={{ session, ready, signIn, signOut }}>{children}</Context.Provider>;
}
export function useDemoSession() { const ctx = useContext(Context); if (!ctx) throw new Error("Demo session provider missing"); return ctx; }
export function SessionHeader() {
  const { session, signOut } = useDemoSession();
  const location = useLocation();
  if (!session) return null;
  return <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-stone"><span>Signed in as {session.name}</span><Button asChild variant="link" className="h-auto p-0 text-xs text-ink"><Link to="/sign-in" search={{ role: session.role, next: location.pathname }}>Switch role</Link></Button><Button variant="link" className="h-auto p-0 text-xs text-ink" onClick={signOut}>Sign out</Button></div>;
}
export function DemoGate({ children }: { children: ReactNode }) {
  const { session, ready, signIn } = useDemoSession();
  const location = useLocation();
  const navigate = useNavigate();
  const role = pageRole(location.pathname);
  const shortcut = new URLSearchParams(location.searchStr).get("demo") === "1";
  useEffect(() => {
    if (!ready || !role || !shortcut) return;
    signIn(role);
    // Consume the shortcut so signing out does not immediately sign back in.
    const params = new URLSearchParams(location.searchStr); params.delete("demo");
    void navigate({ href: `${location.pathname}${params.size ? `?${params}` : ""}`, replace: true });
  }, [ready, role, shortcut, location.pathname, location.searchStr]);
  if (!role) return children;
  if (!ready || shortcut) return <div className="mx-auto max-w-xl px-5 py-8"><Wordmark /><p className="mt-10 text-sm text-stone">Opening the demo workspace…</p></div>;
  if (canView(session?.role, location.pathname)) return children;
  const audience = role === "policy_owner" ? "policy owners" : role === "reviewer" ? "claims reviewers" : "operations";
  return <div className="mx-auto max-w-xl px-5 py-8"><Wordmark /><section className="card-calm mt-12 space-y-5 p-6"><p className="eyebrow">Workspace</p><h1 className="font-display text-3xl">This area is for {audience}</h1><Button className="h-auto whitespace-normal py-3" onClick={() => signIn(role)}>Continue as demo {ROLE_LABEL[role].toLowerCase()} - no password</Button><p><Link to="/sign-in" search={{ role, next: location.pathname }} className="text-sm underline underline-offset-4">Sign in</Link></p><p className="text-xs text-stone">Demo sign-in. No real accounts or passwords - this prototype has no authentication.</p></section></div>;
}