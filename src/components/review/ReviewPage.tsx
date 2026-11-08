import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Anchor, Building2, FileText, Menu, User, X } from "lucide-react";
import { Wordmark, CanoeMark, Accent } from "@/components/canoe/brand";
import { useCalmMotion } from "@/components/canoe/motion";
import { getReviewApi, ApiError, type ClaimDetail, type ClaimListItem, type Field, type FieldValue, type Rec } from "@/lib/review/api";
import { FIELD_GROUPS, REASON, REC_LABEL, REC_SHORT, RULE_FIELD, euro, formatValue, inTab, isOpen, sortQueue, type Tab } from "@/lib/review/labels";
import { cn } from "@/lib/utils";
import { RecommendationLabel } from "@/components/canoe/RecommendationLabel";
import { ReviewReminders, QueueReminder } from "@/components/customer/ReviewReminders";
import { SessionHeader, useDemoSession } from "@/components/demo-role/DemoSession";
import { canAct } from "@/lib/demo-role/logic";

const RECS: Rec[] = ["routine_processing", "request_information", "human_review"];
const CATEGORIES = ["Evidence contradicts data", "Fact captured wrong", "Rule doesn't fit this case", "New information received", "Other"];
const STATIONS = ["Received", "Decided", "Reviewed", "Closed"];
const TABS: [Tab, string][] = [["needs", "Needs you"], ["waiting", "Waiting on customer"], ["ready", "Ready"], ["closed", "Closed"]];
const msg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const reasonText = (rule: string) => REASON[rule] ?? null;

function Italic({ children }: { children: ReactNode }) { return <Accent>{children}</Accent>; }


type Ui = { changing: boolean; armed: "approve" | "decline" | null; editing: string | null };
const UI0: Ui = { changing: false, armed: null, editing: null };

export function ReviewPage({ caseId }: { caseId?: string }) {
  const api = useMemo(() => getReviewApi(), []);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { session } = useDemoSession();
  const reviewer = session?.name ?? "";
  const writable = canAct(session?.role, "review");
  const [tab, setTab] = useState<Tab>("needs");
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [ui, setUi] = useState<Ui>(UI0);
  const [saved, setSaved] = useState<string | null>(null);
  const [rerun, setRerun] = useState<{ before: Rec; after: Rec; mock: boolean } | null>(null);
  const [anchored, setAnchored] = useState(false);

  const list = useQuery({ queryKey: ["review", "claims"], queryFn: () => api.listClaims() });
  const claims = list.data?.claims ?? [];
  const term = q.trim().toLowerCase();
  const matches = (c: ClaimListItem) => !term || c.case_id.toLowerCase().includes(term) || c.summary.toLowerCase().includes(term);
  const visible = sortQueue(claims.filter((c) => inTab(c, tab) && matches(c)));
  const activeId = caseId ?? visible[0]?.case_id;
  const detail = useQuery({ queryKey: ["review", "claim", activeId], queryFn: () => { if (!activeId) throw new Error("Choose a claim"); return api.getClaim(activeId); }, enabled: !!activeId });
  const c = detail.data;

  useEffect(() => { setUi(UI0); setRerun(null); setSaved(null); setAnchored(false); }, [activeId]);

  const go = (id: string | undefined) => { if (id) { setDrawer(false); navigate({ to: "/review/$caseId", params: { caseId: id } }); } };
  const step = (d: number) => { const i = visible.findIndex((x) => x.case_id === activeId); go(visible[Math.max(0, Math.min(visible.length - 1, i + d))]?.case_id); };

  const apply = (updated: ClaimDetail, key: string) => {
    qc.setQueryData(["review", "claim", updated.case_id], updated);
    setSaved(key);
    void qc.invalidateQueries({ queryKey: ["review", "claims"] });
  };

  const onClosed = (updated: ClaimDetail) => {
    const rest = visible.filter((x) => x.case_id !== updated.case_id);
    const i = visible.findIndex((x) => x.case_id === updated.case_id);
    const next = rest[Math.min(Math.max(i, 0), rest.length - 1)]?.case_id;
    qc.setQueryData(["review", "claim", updated.case_id], updated);
    setAnchored(true);
    setTimeout(() => { void qc.invalidateQueries({ queryKey: ["review", "claims"] }); if (next) go(next); }, 1100);
  };

  // Keyboard: J/K, A, D, C, E, Esc
  const uiRef = useRef({ step, c, setUi, writable });
  uiRef.current = { step, c, setUi, writable };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape") { uiRef.current.setUi(UI0); setDrawer(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      const k = e.key.toLowerCase();
      const cur = uiRef.current.c;
      if (k === "j") uiRef.current.step(1);
      else if (k === "k") uiRef.current.step(-1);
      else if (!uiRef.current.writable || !cur || !isOpen(cur)) return;
      else if (k === "a" && cur.effective_recommendation !== "request_information") document.querySelector<HTMLButtonElement>('[data-settle="approve"]')?.click();
      else if (k === "d" && cur.effective_recommendation === "human_review") document.querySelector<HTMLButtonElement>('[data-settle="decline"]')?.click();
      else if (k === "c") uiRef.current.setUi((u) => ({ ...u, changing: true }));
      else if (k === "e" && cur.editable) uiRef.current.setUi((u) => ({ ...u, editing: FIELD_GROUPS[0]?.[1][0] ?? null }));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = Object.fromEntries(TABS.map(([t]) => [t, claims.filter((x) => inTab(x, t)).length]));

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-5 pt-5 md:px-8">
        <div className="flex items-center gap-4">
          <button className="btn-quiet p-2 min-[1200px]:hidden" aria-label="Open queue" onClick={() => setDrawer(true)}><Menu className="size-4" /></button>
          <Wordmark />
          <nav className="hidden gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-stone sm:flex">
            <Link to="/review" className="text-ink">Review</Link>
            <Link to="/policy">Policy</Link>
            <Link to="/business">Business</Link>
          </nav>
        </div>
        <SessionHeader />
      </header>

      <div className="mx-auto max-w-[1680px] px-5 pt-6 md:px-8">
        <p className="eyebrow">Review</p>
        <div className="mt-1 flex items-baseline gap-3">
          <h1 className="font-display text-4xl md:text-5xl">What needs <Italic>you</Italic></h1>
          {c && <span className="rounded-full border border-stone/40 px-2 py-0.5 font-mono text-[11px] uppercase text-stone">policy {c.latest_decision.policy_version}</span>}
        </div>
      </div>

      <div className="mx-auto flex max-w-[1680px] gap-6 px-5 pb-[48vh] pt-6 md:px-8 min-[1200px]:pb-12">
        {drawer && <div className="fixed inset-0 z-40 bg-ink/20 min-[1200px]:hidden" onClick={() => setDrawer(false)} />}
        <aside className={cn("fixed inset-y-0 left-0 z-50 w-[300px] shrink-0 overflow-y-auto bg-paper p-4 transition-transform duration-300 min-[1200px]:static min-[1200px]:z-auto min-[1200px]:translate-x-0 min-[1200px]:bg-transparent min-[1200px]:p-0", drawer ? "translate-x-0" : "-translate-x-full")}>
          <div className="mb-3 flex justify-end min-[1200px]:hidden"><button className="btn-quiet p-1.5" aria-label="Close queue" onClick={() => setDrawer(false)}><X className="size-4" /></button></div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id or summary" className="field-input w-full px-3 py-2 text-sm" aria-label="Search cases" />
          <div role="tablist" className="mt-3 flex flex-wrap gap-1">
            {TABS.map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cn("rounded-full px-2.5 py-1 text-xs", tab === t ? "bg-ink text-paper" : "text-stone hover:text-ink")}>
                {label} <span className="font-mono opacity-70">{counts[t] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {list.isPending ? [0, 1, 2].map((i) => <div key={i} className="card-calm h-[68px] animate-pulse opacity-60" />)
              : list.isError ? (
                <p className="text-sm text-stone">We couldn't load the queue. <button className="underline text-cedar" onClick={() => list.refetch()}>Retry</button></p>
              ) : visible.length === 0 ? (
                <p className="font-display py-6 text-xl">Nothing needs you. <Italic>Good water.</Italic></p>
              ) : (
                <AnimatePresence initial={false}>
                  {visible.map((r) => <QueueRow key={r.case_id} r={r} active={r.case_id === activeId} onOpen={() => go(r.case_id)} />)}
                </AnimatePresence>
              )}
          </div>
          <p className="mt-4 font-mono text-[10px] text-stone" title="J/K next/previous · A approve · D decline · C change recommendation · E edit first fact · Esc cancel">{"\n"}</p>
        </aside>

        <main className="min-w-0 flex-1">
          {!activeId ? (list.isPending ? null : <p className="font-display text-2xl">Nothing needs you. <Italic>Good water.</Italic></p>)
            : detail.isError ? <p className="text-sm text-stone">{msg(detail.error)} <button className="underline text-cedar" onClick={() => detail.refetch()}>Retry</button></p>
            : !c ? <div className="card-calm h-64 animate-pulse opacity-60" />
            : (
              <AnimatePresence mode="wait">
                <CaseView key={c.case_id} c={c} ui={ui} setUi={setUi} saved={saved} rerun={rerun} anchored={anchored} mock={api.mode === "mock"} writable={writable}
                  onSaveFact={async (field, value, reason) => {
                    if (!writable) return;
                    const before = c.effective_recommendation;
                    const u = await api.facts(c.case_id, { changes: { [field]: value }, reason, reviewer });
                    setRerun({ before, after: u.effective_recommendation, mock: api.mode === "mock" });
                    apply(u, `edit-${u.fact_edits.length}`);
                    setUi(UI0);
                  }} />
              </AnimatePresence>
            )}
        </main>

        {c && (
          <aside className="fixed inset-x-0 bottom-0 z-30 max-h-[45vh] overflow-y-auto border-t border-stone/25 bg-paper p-4 min-[1200px]:sticky min-[1200px]:top-6 min-[1200px]:z-auto min-[1200px]:max-h-none min-[1200px]:w-[340px] min-[1200px]:shrink-0 min-[1200px]:self-start min-[1200px]:border-0 min-[1200px]:bg-transparent min-[1200px]:p-0">
            <Rail key={c.case_id} c={c} ui={ui} setUi={setUi} reviewer={reviewer} writable={writable}
              override={async (rec, reason) => { if (!writable) return; const u = await api.override(c.case_id, { corrected_recommendation: rec, reason, reviewer }); apply(u, `ov-${u.overrides.length}`); setUi(UI0); }}
              settle={async (decision, reason) => { if (!writable) return; const u = await api.settle(c.case_id, { decision, reason, reviewer }); setSaved("settle"); onClosed(u); }}
              outcome={async (final_outcome, note) => { if (!writable) return; const u = await api.outcome(c.case_id, { final_outcome, note, source: "reviewer", recorded_by: reviewer }); apply(u, `out-${u.outcomes.length}`); }} />
          </aside>
        )}
      </div>
    </div>
  );
}

function QueueRow({ r, active, onOpen }: { r: ClaimListItem; active: boolean; onOpen: () => void }) {
  const { t } = useCalmMotion();
  const closed = !isOpen(r);
  const reason = reasonText(r.rule);
  return (
    <motion.div layout initial={false} exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={t(320)} className="overflow-hidden">
      <button onClick={onOpen} className={cn("answer-btn relative block w-full overflow-hidden px-3 py-2.5 text-left", active && "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-cedar")} data-selected={active}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{r.case_id}</span>
          <span className="font-mono text-xs text-stone">{euro(r.quote_eur)}</span>
          <RecommendationLabel recommendation={r.effective_recommendation} closed={closed} className="ml-auto" />
        </div>
        <p className="mt-1 truncate text-[13px]">{reason ?? <span className="font-mono text-xs">{r.rule}</span>}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {!closed && r.effective_source !== "system" && <Tag>decided, not closed</Tag>}
          {r.recheck_pending && <Tag>re-evaluated</Tag>}
          {r.settled_decision && <Tag>{r.settled_decision === "approve" ? "approved" : "declined"}</Tag>}
          {!closed && r.effective_recommendation === "request_information" && <QueueReminder caseId={r.case_id} />}
        </div>
      </button>
    </motion.div>
  );
}
function Tag({ children }: { children: ReactNode }) { return <span className="border-b border-stone font-mono text-[10px] lowercase text-stone">{children}</span>; }

function Stations({ at, anchored }: { at: number; anchored: boolean }) {
  const { t, reduce } = useCalmMotion();
  const pct = (at / (STATIONS.length - 1)) * 100;
  return (
    <div className="mt-4 max-w-md">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-px bg-stone/40" />
        <motion.div className="absolute left-0 top-1/2 h-px bg-cedar" initial={false} animate={{ width: `${pct}%` }} transition={t(600)} />
        {STATIONS.map((s, i) => <span key={s} className={cn("absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2", i <= at ? "bg-cedar" : "bg-stone/50")} style={{ left: `${(i / 3) * 100}%` }} />)}
        <motion.div className="absolute top-1/2 -translate-x-1/2 -translate-y-[70%]" initial={false} animate={{ left: `${pct}%` }} transition={t(700)}>
          <CanoeMark size={24} />
          <AnimatePresence>{anchored && (
            <motion.span className="absolute left-1/2 top-5 -translate-x-1/2 text-cedar" initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...t(500), delay: 0.5 }}>
              <Anchor className="size-3.5" />
            </motion.span>
          )}</AnimatePresence>
        </motion.div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-stone">
        {STATIONS.map((s, i) => <span key={s} className={i === at ? "text-ink" : ""}>{s}</span>)}
      </div>
    </div>
  );
}

function SourceIcon({ source }: { source: string }) {
  const s = source.toLowerCase();
  const Icon = s.includes("review") || s.includes("customer") ? User : s.includes("insurer") || s.includes("system") ? Building2 : FileText;
  return <span title={`Source: ${source}`} className="text-stone"><Icon className="size-3.5" /></span>;
}

function CaseView({ c, ui, setUi, saved, rerun, anchored, mock, onSaveFact, writable }: {
  c: ClaimDetail; ui: Ui; setUi: (f: (u: Ui) => Ui) => void; saved: string | null; rerun: { before: Rec; after: Rec; mock: boolean } | null;
  anchored: boolean; mock: boolean; writable: boolean; onSaveFact: (field: string, value: FieldValue, reason: string) => Promise<void>;
}) {
  const { advance, t } = useCalmMotion();
  const d = c.latest_decision;
  const closed = !isOpen(c);
  const station = closed ? 3 : c.overrides.length ? 2 : 1;
  const lastOv = [...c.overrides].reverse()[0];
  const triggered = RULE_FIELD[d.rule_id];
  const recheck = c.rechecks[c.rechecks.length - 1];
  const [showTrace, setShowTrace] = useState(false);
  return (
    <motion.article {...advance}>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-stone">{c.case_id} · {closed ? "closed" : "open"} · {d.policy_version}</p>
      <h2 className="font-display mt-2 text-3xl leading-tight md:text-[34px]">{c.summary}</h2>
      <Stations at={station} anchored={anchored} />

      <section className="card-calm mt-6 p-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={c.effective_recommendation + c.effective_source} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t(240)}>
            <div className="flex items-center gap-3">
              <p className="font-display text-2xl">
                {c.effective_source === "reviewer" && <s className="mr-2 text-stone"><RecommendationLabel recommendation={d.recommendation} large className="text-stone" /></s>}
                <RecommendationLabel recommendation={c.effective_recommendation} closed={closed} large />
              </p>
            </div>
            <p className="mt-2 text-[15px]">{d.detail.reason}</p>
            {d.detail.also_applies.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-sm text-stone">
                {d.detail.also_applies.map((r) => <li key={r}>Also: {reasonText(r) ?? <span className="font-mono">{r}</span>}</li>)}
              </ul>
            )}
            <p className="mt-3 font-mono text-[11px] text-stone">rule {d.rule_id} · policy {d.policy_version}</p>
            {c.effective_source === "reviewer" && lastOv && <p className="mt-2 text-sm">Changed to {REC_SHORT[lastOv.corrected_recommendation]} by {lastOv.reviewer}: “{lastOv.reason}”</p>}
            {c.effective_source === "reviewer_confirmed" && lastOv && <p className="mt-2 text-sm">Confirmed by {lastOv.reviewer}: “{lastOv.reason}”</p>}
            {recheck && <p className="mt-2 text-sm text-stone">Re-evaluated under {recheck.to_version} - was {REC_SHORT[recheck.from_recommendation]}.</p>}
            {rerun && (
              <p className="mt-3 border-t border-stone/20 pt-3 text-sm">
                {rerun.mock ? <span className="text-stone">Fact saved. Re-run needs the live engine.</span>
                  : <><span className="font-mono text-xs text-stone">Re-run · </span>{REC_LABEL[rerun.before]} → {REC_LABEL[rerun.after]}</>}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <section className="mt-6 space-y-5">
        {FIELD_GROUPS.map(([group, ids]) => (
          <div key={group}>
            <h3 className="font-display text-xl">{group}</h3>
            <div className="mt-2 space-y-1">
              {ids.map((id) => {
                const f = c.fields.find((x) => x.field === id);
                if (!f) return null;
                const edit = [...c.fact_edits].reverse().find((e) => e.field === id);
                return <FactRow key={id} f={f} triggered={triggered === id} edit={edit ? formatValue(id, edit.old_value) || "not provided" : null}
                  editable={c.editable && writable} editing={writable && ui.editing === id} mock={mock}
                  onEdit={() => setUi((u) => ({ ...u, editing: id }))} onCancel={() => setUi((u) => ({ ...u, editing: null }))} onSave={onSaveFact} />;
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <button className="eyebrow hover:text-ink" onClick={() => setShowTrace((s) => !s)} aria-expanded={showTrace}>{showTrace ? "Hide" : "Show"} all rules checked</button>
        <AnimatePresence initial={false}>{showTrace && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t(240)} className="mt-2 space-y-1 overflow-hidden">
            {d.detail.trace.map((s) => (
              <li key={s.rule} className={cn("flex items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-xs", s.result === "unknown" && "border border-dashed border-stone/50")}>
                <span className={cn("w-10", s.result === true ? "text-cedar" : "text-stone")}>{s.result === true ? "✓" : s.result === false ? "✗" : "? blank"}</span>
                <span className={s.result === true ? "text-cedar" : ""}>{s.rule}</span>
                <span className="ml-auto text-stone">{reasonText(s.rule)}</span>
              </li>
            ))}
          </motion.ol>
        )}</AnimatePresence>
      </section>

      <History c={c} saved={saved} />
    </motion.article>
  );
}

function FactRow({ f, triggered, edit, editable, editing, mock, onEdit, onCancel, onSave }: {
  f: Field; triggered: boolean; edit: string | null; editable: boolean; editing: boolean; mock: boolean;
  onEdit: () => void; onCancel: () => void; onSave: (field: string, value: FieldValue, reason: string) => Promise<void>;
}) {
  const shown = formatValue(f.field, f.value);
  const kind = typeof f.value === "boolean" || /_present$|_reported$|_disputed$|_flag$|_conflict$|_incident$/.test(f.field) ? "bool" : f.field === "quote_eur" ? "num" : "text";
  const [val, setVal] = useState(f.value === null ? "" : String(f.value));
  const [why, setWhy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (editing) { setVal(f.value === null ? "" : String(f.value)); setWhy(""); setErr(null); } }, [editing, f.value]);
  const blank = f.status !== "known";
  const save = async () => {
    if (!why.trim()) { setErr("Say why you're changing it."); return; }
    const v: FieldValue = val === "" ? null : kind === "bool" ? val === "true" : kind === "num" ? Number(val) : val;
    if (kind === "num" && v !== null && !Number.isFinite(v)) { setErr("Use a number."); return; }
    setBusy(true); setErr(null);
    try { await onSave(f.field, v, why.trim()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  if (editing) return (
    <div className="card-calm space-y-2 p-3">
      <p className="text-sm">{f.label}</p>
      {kind === "bool" ? (
        <select value={val} onChange={(e) => setVal(e.target.value)} className="field-input px-3 py-1.5 text-sm" autoFocus>
          <option value="">Not provided</option><option value="true">Yes</option><option value="false">No</option>
        </select>
      ) : <input autoFocus type={kind === "num" ? "number" : "text"} value={val} onChange={(e) => setVal(e.target.value)} className="field-input w-full px-3 py-1.5 text-sm" />}
      <p className="text-xs text-stone">Was: {shown || "not provided"}</p>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why?" aria-label="Why?" className="field-input w-full px-3 py-1.5 text-sm" />
      {err && <p className="text-xs text-cedar">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={save} className="btn-cedar px-4 py-1.5 text-xs">{mock ? "Save" : "Save & re-run"}</button>
        <button onClick={onCancel} className="btn-quiet px-4 py-1.5 text-xs">Cancel</button>
      </div>
    </div>
  );
  return (
    <button type="button" disabled={!editable} onClick={onEdit}
      className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors", editable && "hover:bg-mist", blank && "border border-dashed border-stone/50", triggered && "border-l-2 border-l-cedar")}>
      <span className="flex-1 text-stone">{f.label}</span>
      {edit !== null && <span title={`Was: ${edit}`}><Tag>edited</Tag></span>}
      <span className={cn("font-mono text-xs", triggered && "text-cedar", blank && "text-stone")}>
        {f.status === "unreadable" ? <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" />unreadable</span>
          : blank ? <span title="Not provided. We never fill this in.">not provided</span> : shown}
      </span>
      <SourceIcon source={f.source} />
    </button>
  );
}

type Entry = { key: string; at: string; title: string; body?: string | undefined; anchor?: boolean };
function History({ c, saved }: { c: ClaimDetail; saved: string | null }) {
  const { reduce } = useCalmMotion();
  const [all, setAll] = useState(false);
  const entries: Entry[] = [
    ...c.decisions.map((d) => ({ key: `dec-${d.id}`, at: d.created_at, title: `Decided · ${d.policy_version}`, body: `${d.rule_id} · ${d.trigger}` })),
    ...c.overrides.map((o, i) => ({ key: `ov-${i + 1}`, at: o.created_at, title: o.kind === "confirm" ? `Confirmed by ${o.reviewer}` : `Changed to ${REC_SHORT[o.corrected_recommendation]} by ${o.reviewer}`, body: `“${o.reason}” · ${o.policy_version}` })),
    ...c.fact_edits.map((e, i) => ({ key: `edit-${i + 1}`, at: e.created_at, title: `${e.field}: ${formatValue(e.field, e.old_value) || "blank"} → ${formatValue(e.field, e.new_value) || "blank"}`, body: `${e.editor}: “${e.reason}”` })),
    ...c.info_requests.map((r, i) => ({ key: `req-${i}`, at: r.created_at, title: `Asked the customer · ${r.status}`, body: r.ask_fields.join(", ") })),
    ...c.rechecks.map((r, i) => ({ key: `rc-${i}`, at: r.created_at, title: `Re-evaluated ${r.from_version} → ${r.to_version}`, body: `${REC_SHORT[r.from_recommendation]} → ${REC_SHORT[r.to_recommendation]}` })),
    ...(c.settlement ? [{ key: "settle", at: c.settlement.created_at, title: `${c.settlement.decision === "approve" ? "Approved" : "Declined"} by ${c.settlement.reviewer}`, body: c.settlement.reason ? `“${c.settlement.reason}”` : undefined, anchor: true }] : []),
    ...c.outcomes.map((o, i) => ({ key: `out-${i + 1}`, at: o.created_at, title: `Outcome: ${o.final_outcome}`, body: o.note ? `${o.recorded_by}: ${o.note}` : o.recorded_by })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const shown = all ? entries : entries.slice(0, 3);
  return (
    <section className="mt-8">
      <p className="eyebrow">History</p>
      <ol className="relative mt-3 border-l border-stone/35 pl-5">
        {shown.map((e) => (
          <li key={e.key} className="relative pb-4">
            <span className="absolute -left-[25px] top-1.5 flex size-2.5 items-center justify-center">
              {e.anchor ? <Anchor className="size-3.5 text-cedar" /> : <span className="h-px w-2 bg-stone/60" />}
              {saved === e.key && !reduce && <motion.span className="absolute size-2 rounded-full border border-cedar" initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 4, opacity: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />}
            </span>
            <p className="text-sm">{e.title}</p>
            {e.body && <p className="text-xs text-stone">{e.body}</p>}
            <p className="font-mono text-[10px] text-stone">{time(e.at)}</p>
          </li>
        ))}
      </ol>
      {entries.length > 3 && <button className="eyebrow hover:text-ink" onClick={() => setAll((s) => !s)}>{all ? "Show less" : `Show all ${entries.length}`}</button>}
    </section>
  );
}

function Rail({ c, ui, setUi, reviewer, override, settle, outcome, writable }: {
  c: ClaimDetail; ui: Ui; setUi: (f: (u: Ui) => Ui) => void; reviewer: string; writable: boolean;
  override: (rec: Rec, reason: string) => Promise<void>; settle: (d: "approve" | "decline", reason: string) => Promise<void>; outcome: (o: string, note: string) => Promise<void>;
}) {
  const eff = c.effective_recommendation;
  const pv = c.latest_decision.policy_version;
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!ui.armed) return;
    const id = setTimeout(() => setUi((u) => ({ ...u, armed: null })), 4000);
    return () => clearTimeout(id);
  }, [ui.armed, reason, setUi]);

  const needsReason = ui.armed === "decline" || (ui.armed === "approve" && eff !== "routine_processing");
  const click = async (d: "approve" | "decline") => {
    if (ui.armed !== d) { setErr(null); setUi((u) => ({ ...u, armed: d, changing: false })); return; }
    if (needsReason && !reason.trim()) { setErr("Add a reason first."); return; }
    setBusy(true); setErr(null);
    try { await settle(d, reason.trim()); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const SettleBtn = ({ d, label, primary }: { d: "approve" | "decline"; label: string; primary?: boolean }) => (
    <button data-settle={d} disabled={busy} onClick={() => click(d)} className={cn("flex-1 px-4 py-2.5 text-sm", primary || ui.armed === d ? "btn-cedar" : "btn-quiet")}>
      {ui.armed === d ? "Click again to close for good" : label}
    </button>
  );
  const footer = <p className="mt-5 border-t border-stone/20 pt-3 text-xs text-stone">{"\n"}</p>;

  if (!isOpen(c)) {
    const s = c.settlement;
    return (
      <div className="card-calm p-5">
        <p className="eyebrow">Settled</p>
        {s ? <p className="mt-2 text-sm">{s.decision === "approve" ? "Approved" : "Declined"} by {s.reviewer} · policy {s.policy_version} · {time(s.created_at)}{s.reason && <> - “{s.reason}”</>}</p>
          : <p className="mt-2 text-sm">Closed before this system.</p>}
        <p className="font-display mt-2 text-lg"><Italic>This decision stays as it is.</Italic></p>
        {writable && <OutcomeForm onSave={outcome} />}
        {footer}
      </div>
    );
  }

  const changed = c.effective_source !== "system";
  const req = c.info_requests.find((r) => r.status === "open") ?? c.info_requests[0];
  if (!writable) return <div className="card-calm p-5"><p className="eyebrow">Decision · read-only</p><p className="mt-3"><RecommendationLabel recommendation={eff} /></p><p className="mt-3 text-sm text-stone" title="Reviewers only">Reviewers only</p>{req?.status === "open" && <p className="mt-3 text-xs text-stone">Waiting on customer since {hhmm(req.created_at)}</p>}</div>;
  return (
    <div className="card-calm p-5">
      <p className="eyebrow">Decision</p>
      {ui.changing ? <ChangeRec current={eff} reviewer={reviewer} pv={pv} onCancel={() => setUi((u) => ({ ...u, changing: false }))} onRecord={override} /> : (
        <div className="mt-3 space-y-3">
          {eff === "request_information" && !changed ? (
            <div className="rounded-xl border border-stone/30 p-3 text-sm">
              <p title={req ? time(req.created_at) : ""}>Waiting on customer{req ? ` since ${hhmm(req.created_at)}` : ""} - asked for: <span className="font-mono text-xs">{req?.ask_fields.join(", ") || "-"}</span></p>
              <button className="btn-cedar mt-3 w-full px-4 py-2 text-sm" onClick={async () => {
                const link = `${window.location.origin}/continue/${c.case_id}`;
                try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(true); }
              }}>{copied ? "Link copied" : "Copy customer link"}</button>
              {copied && <p className="mt-2 select-all break-all font-mono text-[10px] text-stone">{`${typeof window === "undefined" ? "" : window.location.origin}/continue/${c.case_id}`}</p>}
              {req?.status === "open" && <ReviewReminders createdAt={req.created_at} />}
            </div>
          ) : changed && eff === "routine_processing" ? (
            <div className="flex"><SettleBtn d="approve" label="Close with this decision" primary /></div>
          ) : eff === "routine_processing" ? (
            <div className="flex"><SettleBtn d="approve" label="Approve & close" primary /></div>
          ) : (
            <>{changed && <p className="text-xs text-stone">Close with this decision:</p>}
              <div className="flex gap-2"><SettleBtn d="approve" label="Approve & close" /><SettleBtn d="decline" label="Decline & close" /></div></>
          )}
          <AnimatePresence initial={false}>{ui.armed && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={needsReason ? "Reason (required)" : "Reason (optional)"} aria-label="Reason" className="field-input w-full px-3 py-2 text-sm" />
            </motion.div>
          )}</AnimatePresence>
          {err && <p className="text-xs text-cedar">{err}</p>}
          <div className="flex flex-col items-start gap-1 pt-1 text-sm">
            {eff === "request_information" && !changed && <button className="text-stone underline-offset-4 hover:text-ink hover:underline" onClick={() => setUi((u) => ({ ...u, editing: c.fields[0]?.field ?? null }))}>Correct a fact instead</button>}
            <button className="text-stone underline-offset-4 hover:text-ink hover:underline" onClick={() => setUi((u) => ({ ...u, changing: true, armed: null }))}>Change recommendation</button>
          </div>
        </div>
      )}
      {footer}
    </div>
  );
}

function ChangeRec({ current, reviewer, pv, onCancel, onRecord }: { current: Rec; reviewer: string; pv: string; onCancel: () => void; onRecord: (r: Rec, reason: string) => Promise<void> }) {
  const [rec, setRec] = useState<Rec>(current);
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 space-y-3">
      <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-full border border-stone/30 p-1">
        {RECS.map((r) => (
          <button key={r} role="radio" aria-checked={rec === r} onClick={() => setRec(r)} className={cn("rounded-full px-2 py-1.5 text-xs", rec === r ? "bg-ink text-paper" : "text-stone")}>
            <span className={r === current ? "underline decoration-1 underline-offset-4" : ""}>{REC_SHORT[r]}</span>
          </button>
        ))}
      </div>
      <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Reason category" className="field-input w-full px-3 py-2 text-sm">
        {CATEGORIES.map((x) => <option key={x}>{x}</option>)}
      </select>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="What did you see? (required)" aria-label="Reason" className="field-input w-full px-3 py-2 text-sm" />
      <p className="font-mono text-[11px] text-stone">{REC_SHORT[current]} → {REC_SHORT[rec]} · as {reviewer || "-"} · policy {pv}</p>
      {err && <p className="text-xs text-cedar">{err}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-cedar px-5 py-2 text-sm" onClick={async () => {
          if (!text.trim()) { setErr("Add a reason first."); return; }
          setBusy(true); setErr(null);
          try { await onRecord(rec, `${cat} - ${text.trim()}`); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
        }}>Record</button>
        <button className="btn-quiet px-4 py-2 text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function OutcomeForm({ onSave }: { onSave: (o: string, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [o, setO] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button className="eyebrow hover:text-ink" onClick={() => setOpen((s) => !s)} aria-expanded={open}>Record later outcome</button>
      {open && (
        <div className="mt-2 space-y-2">
          <input value={o} onChange={(e) => setO(e.target.value)} placeholder="Final outcome" aria-label="Final outcome" className="field-input w-full px-3 py-1.5 text-sm" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note" className="field-input w-full px-3 py-1.5 text-sm" />
          {err && <p className="text-xs text-cedar">{err}</p>}
          <button className="btn-quiet px-4 py-1.5 text-xs" onClick={async () => {
            if (!o.trim()) { setErr("Add the outcome first."); return; }
            try { await onSave(o.trim(), note.trim()); setO(""); setNote(""); setOpen(false); setErr(null); } catch (e) { setErr(msg(e)); }
          }}>Save outcome</button>
        </div>
      )}
    </div>
  );
}
