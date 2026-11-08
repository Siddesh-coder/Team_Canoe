import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { Accent, Wordmark } from "@/components/canoe/brand";
import { RecommendationLabel } from "@/components/canoe/RecommendationLabel";
import { LocksScene } from "./LocksScene";
import { CaseReplay } from "./CaseReplay";
import { PolicyDocumentUpload } from "./PolicyDocumentUpload";
import { getPolicyApi, type Draft, type PolicyDoc, type PolicyVersion, type Preview, type PublishResult, type Rule, type Cond } from "@/lib/policy/api";
import { demoDraft, DEMO_TITLE, toDraft, withLimit } from "@/lib/policy/mock";
import { defaultCond, describeDiff, OP_WORDS, opsFor, quoteLimitOf, SELECT_OPTIONS, valueText } from "@/lib/policy/text";
import { cn } from "@/lib/utils";
import { isNewDraft } from "@/lib/business/logic";
import { Button } from "@/components/ui/button";
import { SessionHeader, useDemoSession } from "@/components/demo-role/DemoSession";

const key = (d: Draft) => JSON.stringify(d);
const two = (n: number) => String(n).padStart(2, "0");
const nextV = (v: string) => `v${Number(v.slice(1)) + 1}`;


function Step({ n, title, children, aside }: { n: number; title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-stone/25 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-4">{n !== 1 && <span className="font-mono text-sm text-stone">{n === 2 || n === 3 ? "\n" : two(n)}</span>}<span className="font-display text-3xl">{title}</span></h2>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function PolicyPage() {
  const api = getPolicyApi();
  const [doc, setDoc] = useState<PolicyDoc | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [simErr, setSimErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(0);
  const [skip, setSkip] = useState(0);
  const [ghosts, setGhosts] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [damPending, setDamPending] = useState(false);
  const [viewing, setViewing] = useState<PolicyVersion | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [glide, setGlide] = useState(0);
  const [view, setView] = useState<"v1" | "v2">("v2");
  const [simMode, setSimMode] = useState<"all" | "case">("all");
  const damTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = () => api.getPolicy().then((d) => { setDoc(d); setLoadErr(null); return d; }).catch((e) => { setLoadErr(e.message); return null; });
  useEffect(() => { load().then((d) => { const v = d?.versions.find((v) => v.version === d.latest); if (v) setDraft(toDraft(v)); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const liveV = doc?.versions.find((v) => v.version === doc.latest);
  const live = useMemo(() => (liveV ? toDraft(liveV) : null), [liveV]);
  if (loadErr) return <Shell><p className="mt-10 text-stone">{loadErr} <button className="underline" onClick={load}>Retry</button></p></Shell>;
  if (!doc || !draft || !live || !liveV) return <Shell><p className="mt-10 font-mono text-xs text-stone">Loading policy…</p></Shell>;

  const draftV = nextV(doc.latest);
  const drafting = isNewDraft(draft, live);
  const fresh = !!preview && previewKey === key(draft);
  const stale = !!preview && !fresh && !damPending;

  const runPreview = async (d: Draft, newRun: boolean) => {
    if (!isNewDraft(d, live)) return;
    setBusy(true); setSimErr(null);
    try {
      const p = await api.preview(d);
      setPreview(p); setPreviewKey(key(d)); setResult(null);
      if (newRun) { setRunId((r) => r + 1); setHighlight(null); setView("v2"); }
    } catch (e) { setSimErr((e as Error).message); }
    finally { setBusy(false); setDamPending(false); }
  };
  const onLimit = (v: number) => {
    const d = withLimit(draft, v); setDraft(d);
    if (!preview) return;
    if (api.mode === "mock") { runPreview(d, false); return; }
    setDamPending(true); clearTimeout(damTimer.current);
    damTimer.current = setTimeout(() => runPreview(d, false), 300);
  };
  const escalations = preview ? Object.entries(preview.moves).filter(([k]) => k.endsWith("-> human_review")).reduce((s, [, n]) => s + n, 0) : 0;

  return (
    <Shell>
      <div className="mt-8">
        <p className="eyebrow">Policy</p>
        <h1 className="mt-2 font-display text-5xl leading-[1.05] md:text-6xl">Rules <Accent>change</Accent>. Decisions hold.</h1>
        <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]">
          {doc.versions.map((v) => {
            const isLive = v.version === doc.latest;
            return (
              <button key={v.version} onClick={() => setViewing(isLive || viewing?.version === v.version ? null : v)}
                className={cn("rounded-full border px-3 py-1", isLive ? "border-ink text-ink" : "border-stone/40 text-stone hover:text-ink", viewing?.version === v.version && "border-cedar text-cedar")}>
                {v.version} · {isLive ? "live" : "earlier"} · by {v.meta.published_by}
              </button>
            );
          })}
          {drafting && <span className="rounded-full border border-dashed border-cedar px-3 py-1 text-cedar">{draftV} · draft</span>}
        </div>
        {viewing && <ReadOnly v={viewing} fields={doc.fields} onClose={() => setViewing(null)} />}
      </div>

      <div className="mt-12 space-y-14">
        <Step n={1} title="Change">
          <PolicyDocumentUpload onDraft={(parsed) => { setDraft(parsed); setResult(null); }} />
          <RuleEditor draft={draft} live={live} fields={doc.fields} setDraft={setDraft} version={draftV} liveVersion={doc.latest} mock={api.mode === "mock"} />
        </Step>

        <Step n={2} title="Simulate" aside={api.mode === "mock" && <span className="font-mono text-[11px] text-stone">demo data · 26 cases</span>}>
          {!drafting ? <p className="text-stone">Change a rule to simulate its effect. The last published change ({doc.versions.at(-2)?.version ?? "v1"} → {doc.latest}) is in <Link to="/business" search={{ tab: "impact" }} className="text-cedar underline underline-offset-2">Business → Policy impact.</Link></p> : <>
          <div role="radiogroup" aria-label="Simulation view" className="mb-3 inline-flex rounded-full border border-stone/30 p-0.5 font-mono text-[11px] uppercase tracking-[0.08em]">
            {(["all", "case"] as const).map((k) => (
              <button key={k} role="radio" aria-checked={simMode === k} onClick={() => setSimMode(k)}
                className={cn("rounded-full px-3 py-1", simMode === k ? "bg-ink text-paper" : "text-stone hover:text-ink")}>{k === "all" ? "All claims" : "Case replay"}</button>
            ))}
          </div>
          <div className="card-calm overflow-hidden p-3 md:p-5">
            {simMode === "all" ? (
              <LocksScene draft={draft} live={live} preview={preview} stale={stale} runId={runId} skipToken={skip} glide={glide}
                showGhosts={ghosts} highlight={highlight} liveLimit={quoteLimitOf(live.rules)} escalations={escalations} onLimit={onLimit} view={view} />
            ) : (
              <CaseReplay doc={doc} draft={draft} draftVersion={draftV} preview={preview} fresh={fresh} />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-cedar px-5 py-2 text-sm" disabled={busy || !drafting} onClick={() => runPreview(draft, true)}>{stale ? "Simulate again" : "Simulate"}</button>
            {simMode === "all" && <>
            <button className="btn-quiet px-4 py-2 font-mono text-sm" disabled={!fresh} aria-pressed={view === "v1"} onClick={() => setView((v) => (v === "v1" ? "v2" : "v1"))}>{view === "v1" ? "v1 ⇄ v2 · showing v1" : "v1 ⇄ v2"}</button>
            <button className="btn-quiet px-4 py-2 text-sm" disabled={!preview} onClick={() => setSkip((s) => s + 1)}>Skip animation</button>
            <label className="ml-1 flex items-center gap-2 text-sm text-stone"><input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} className="accent-[var(--cedar)]" /> Show v1 routes</label>
            <span className="text-xs text-stone">Click the quote gate to change the limit.</span>
            </>}
          </div>
          {simErr && <p className="mt-3 text-sm text-cedar">{simErr}</p>}
          {preview && <div className={cn("mt-6", stale && "opacity-40")}>
            <p className="font-display text-xl">{preview.changed} open claims would change. {preview.closed_untouched} closed claims stay as decided.</p>
            <div className="mt-3 grid grid-cols-3 gap-4 font-mono text-xs">
              <p><span className="block font-display text-3xl text-cedar">{preview.changed}</span>Changes</p>
              <p><span className="block font-display text-3xl">{preview.open_claims - preview.changed}</span>Unchanged</p>
              <p><span className="block font-display text-3xl">{preview.closed_untouched}</span>Closed protected</p>
            </div>
          </div>}
          <Link to="/business" search={{ tab: "impact" }} className="mt-4 inline-block text-sm text-cedar underline underline-offset-2">See the full impact in Business →</Link>
          </>}
        </Step>

        <Step n={3} title="Release">
          <Release draft={draft} version={draftV} fresh={fresh} drafting={drafting} preview={preview} result={result}
            onPublish={async (b) => {
              const r = await api.publish({ draft, ...b });
              setGlide((g) => g + 1);
              const d = await load();
              setResult(r);
              const latest = d?.versions.find((v) => v.version === d.latest);
              if (latest) { const nd = toDraft(latest); setDraft(nd); setPreview(null); setPreviewKey(""); }
              return r;
            }} />
        </Step>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen pb-32">
      <header className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 pt-5 md:px-8">
        <div className="flex items-center gap-4">
          <Wordmark />
          <nav className="hidden gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-stone sm:flex">
            <Link to="/review" className="hover:text-ink">Review</Link>
            <Link to="/policy" className="text-ink">Policy</Link>
            <Link to="/business" className="hover:text-ink">Business</Link>
          </nav>
        </div>
        <SessionHeader />
      </header>
      <main className="mx-auto max-w-[1280px] px-5 md:px-8">{children}</main>
    </div>
  );
}

function ruleSentence(r: Rule, fields: Record<string, string>) {
  return `If ${r.when.map((c) => `${fields[c.field] ?? c.field} ${OP_WORDS[c.op]}${c.value != null ? ` ${valueText(c)}` : ""}`).join(" and ")}`;
}
function ReadOnly({ v, fields, onClose }: { v: PolicyVersion; fields: Record<string, string>; onClose: () => void }) {
  return (
    <div className="card-calm mt-4 p-5">
      <div className="flex items-baseline justify-between"><p className="eyebrow">{v.version} · read-only · {v.meta.note}</p><button className="text-xs text-stone hover:text-ink" onClick={onClose}>Close</button></div>
      <ol className="mt-3 space-y-1.5 text-sm">
        {v.rules.map((r, i) => <li key={r.id} className="flex gap-3"><span className="font-mono text-xs text-stone">{two(i + 1)}</span>{ruleSentence(r, fields)} → <RecommendationLabel recommendation={r.outcome} /></li>)}
        <li className="flex gap-3"><span className="font-mono text-xs text-stone">··</span>Otherwise → <RecommendationLabel recommendation="routine_processing" /></li>
      </ol>
    </div>
  );
}

/* ---------------- 01 CHANGE ---------------- */
function RuleEditor({ draft, live, fields, setDraft, version, liveVersion, mock }: { draft: Draft; live: Draft; fields: Record<string, string>; setDraft: (d: Draft) => void; version: string; liveVersion: string; mock: boolean }) {
  const [json, setJson] = useState<string | null>(null);
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const drag = useRef<number | null>(null);
  const liveById = new Map(live.rules.map((r) => [r.id, r]));
  const removed = live.rules.filter((r) => !draft.rules.some((d) => d.id === r.id));
  const set = (rules: Rule[]) => setDraft({ ...draft, rules });
  const upd = (i: number, r: Rule) => set(draft.rules.map((x, j) => (j === i ? r : x)));
  const move = (i: number, j: number) => { if (j < 0 || j >= draft.rules.length) return; const rs = [...draft.rules]; const [x] = rs.splice(i, 1); if (x) rs.splice(j, 0, x); set(rs); };
  const addRule = () => { let n = 1; while (draft.rules.some((r) => r.id === `R1.custom_${n}`)) n++; set([...draft.rules, { id: `R1.custom_${n}`, outcome: "human_review", reason: "", when: [defaultCond("injury_reported")] }]); };

  return (
    <div>
      <p className="font-display text-xl text-ink">{describeDiff(live, draft, version, fields)}</p>
      {draft.title === DEMO_TITLE && <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-cedar">Demo change (replace with the official v2)</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {mock && <Button variant="outline" className="btn-quiet px-4 py-1.5 text-sm" onClick={() => setDraft(demoDraft())}>Load demo change</Button>}
        <button className="btn-quiet px-4 py-1.5 text-sm" onClick={() => setDraft(JSON.parse(JSON.stringify(live)))}>Reset to {liveVersion}</button>
        <button className="btn-quiet px-4 py-1.5 text-sm" onClick={() => { setJson(json == null ? JSON.stringify(draft, null, 2) : null); setJsonErr(null); }}>{json == null ? "Edit as JSON" : "Close JSON"}</button>
      </div>
      {json != null && (
        <div className="mt-3">
          <textarea value={json} onChange={(e) => setJson(e.target.value)} className="field-input h-72 w-full p-3 font-mono text-xs" spellCheck={false} aria-label="Draft as JSON" />
          <div className="mt-2 flex items-center gap-3">
            <button className="btn-cedar px-4 py-1.5 text-sm" onClick={() => {
              try { const d = JSON.parse(json) as Draft; if (!Array.isArray(d.rules) || !d.default) throw new Error(); setDraft({ title: d.title ?? draft.title, rules: d.rules, default: d.default }); setJsonErr(null); setJson(null); }
              catch { setJsonErr("That isn't a valid draft. It needs title, rules and default."); }
            }}>Apply JSON</button>
            {jsonErr && <span className="text-sm text-cedar">{jsonErr}</span>}
          </div>
        </div>
      )}

      <ol className="mt-6 divide-y divide-stone/20 border-y border-stone/20">
        {draft.rules.map((r, i) => {
          const old = liveById.get(r.id);
          return (
            <li key={r.id} draggable onDragStart={() => { drag.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current != null) move(drag.current, i); drag.current = null; }}
              className="group flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
              <span className="cursor-grab pt-1.5 text-stone" aria-hidden><GripVertical className="size-4" /></span>
              <span className="w-6 pt-1.5 font-mono text-xs text-stone">{two(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[15px]">
                  <span>If</span>
                  {r.when.map((c, ci) => <CondEditor key={ci} c={c} old={old?.when[ci]} fields={fields} onChange={(nc) => upd(i, { ...r, when: r.when.map((x, k) => (k === ci ? nc : x)) })} />)}
                  <span>→</span>
                  <div className="inline-flex overflow-hidden rounded-full border border-stone/35">
                    {(["human_review", "request_information"] as const).map((o) => (
                      <button key={o} onClick={() => upd(i, { ...r, outcome: o })} aria-pressed={r.outcome === o}
                        className={cn("px-2.5 py-1", r.outcome === o ? "bg-mist" : "opacity-50 hover:opacity-100")}><RecommendationLabel recommendation={o} /></button>
                    ))}
                  </div>
                  {old && old.outcome !== r.outcome && <span className="font-mono text-[11px] text-stone line-through">{old.outcome === "human_review" ? "REVIEW" : "INFO NEEDED"}</span>}
                  {!old && <span className="font-mono text-[11px] text-cedar underline">new</span>}
                  {r.outcome === "request_information" && (
                    <label className="flex items-center gap-1.5 text-xs text-stone"><input type="checkbox" checked={!!r.blank_counts_as_match} onChange={(e) => upd(i, { ...r, blank_counts_as_match: e.target.checked })} className="accent-[var(--cedar)]" />A blank counts as missing</label>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[11px] text-stone">{r.id}</span>
                  <input value={r.reason} onChange={(e) => upd(i, { ...r, reason: e.target.value })} placeholder="Reason, in one short sentence" className="min-w-0 flex-1 border-b border-transparent bg-transparent text-xs text-stone focus:border-cedar focus:outline-none" aria-label={`Reason for ${r.id}`} />
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                <button className="rounded p-1 hover:bg-mist" aria-label="Move up" onClick={() => move(i, i - 1)}><ArrowUp className="size-3.5" /></button>
                <button className="rounded p-1 hover:bg-mist" aria-label="Move down" onClick={() => move(i, i + 1)}><ArrowDown className="size-3.5" /></button>
                <button className="rounded p-1 hover:bg-mist" aria-label={`Delete ${r.id}`} onClick={() => set(draft.rules.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
              </div>
            </li>
          );
        })}
        {removed.map((r) => (
          <li key={`rm-${r.id}`} className="flex items-center gap-3 py-3 text-stone">
            <span className="w-4" /><span className="w-6 font-mono text-xs">-</span>
            <span className="flex-1 line-through">{ruleSentence(r, fields)} → {r.outcome === "human_review" ? "REVIEW" : "INFO NEEDED"}</span>
            <span className="font-mono text-[11px]">removed</span>
            <button className="text-xs underline hover:text-ink" onClick={() => { const idx = live.rules.findIndex((x) => x.id === r.id); const rs = [...draft.rules]; rs.splice(Math.min(idx, rs.length), 0, r); set(rs); }}>Undo</button>
          </li>
        ))}
        <li className="flex items-center gap-3 py-3">
          <span className="w-4" /><span className="w-6 font-mono text-xs text-stone">··</span>
          <span>Otherwise →</span><RecommendationLabel recommendation="routine_processing" />
        </li>
      </ol>
      <button className="btn-quiet mt-3 px-4 py-1.5 text-sm" onClick={addRule}>Add a rule</button>
    </div>
  );
}

function CondEditor({ c, old, fields, onChange }: { c: Cond; old?: Cond | undefined; fields: Record<string, string>; onChange: (c: Cond) => void }) {
  const ops = opsFor(c.field);
  const valChanged = old && old.field === c.field && JSON.stringify(old.value) !== JSON.stringify(c.value) && old.value != null;
  const sel = "field-input px-2 py-1 text-sm";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select value={c.field} onChange={(e) => onChange(defaultCond(e.target.value))} className={sel} aria-label="Field">
        {Object.entries(fields).map(([f, l]) => <option key={f} value={f}>{l}</option>)}
      </select>
      <select value={c.op} onChange={(e) => { const op = e.target.value as Cond["op"]; const multi = op === "in" || op === "not_in";
        const v = SELECT_OPTIONS[c.field] ? (multi ? (Array.isArray(c.value) ? c.value : [String(c.value ?? SELECT_OPTIONS[c.field]?.[0])]) : (Array.isArray(c.value) ? c.value[0] : c.value)) : c.value;
        onChange(v === undefined ? { field: c.field, op } : { ...c, op, value: v }); }} className={sel} aria-label="Operator">
        {ops.map((o) => <option key={o} value={o}>{OP_WORDS[o]}</option>)}
      </select>
      {valChanged && <span className="font-mono text-xs text-stone line-through">{old ? valueText(old) : ""}</span>}
      {valChanged && <span className="text-stone">→</span>}
      {c.field === "quote_eur" && (
        <span className={cn("inline-flex items-center rounded-xl border pl-2", valChanged ? "border-cedar" : "border-stone/30")}>
          <span className="text-sm text-stone">€</span>
          <input type="number" value={Number(c.value ?? 0)} onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} className="w-20 bg-transparent px-1 py-1 text-sm focus:outline-none" aria-label="Amount" />
        </span>
      )}
      {SELECT_OPTIONS[c.field] && (c.op === "in" || c.op === "not_in" ? (
        <span className="inline-flex gap-2">
          {SELECT_OPTIONS[c.field]?.map((o) => { const arr = Array.isArray(c.value) ? c.value : []; return (
            <label key={o} className="flex items-center gap-1 font-mono text-xs"><input type="checkbox" checked={arr.includes(o)} className="accent-[var(--cedar)]"
              onChange={(e) => onChange({ ...c, value: e.target.checked ? [...arr, o] : arr.filter((x) => x !== o) })} />{o}</label>); })}
        </span>
      ) : (
        <select value={String(c.value ?? "")} onChange={(e) => onChange({ ...c, value: e.target.value })} className={cn(sel, "font-mono text-xs", valChanged && "border-cedar")} aria-label="Value">
          {SELECT_OPTIONS[c.field]?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </span>
  );
}

/* ---------------- 04 RELEASE ---------------- */
function Release({ draft, version, fresh, drafting, preview, result, onPublish }: {
  draft: Draft; version: string; fresh: boolean; drafting: boolean; preview: Preview | null; result: PublishResult | null;
  onPublish: (b: { published_by: string; approved_by: string; note: string }) => Promise<PublishResult>;
}) {
  const { session } = useDemoSession();
  const author = session?.name ?? "";
  const [approver, setApprover] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const same = !!approver.trim() && approver.trim().toLowerCase() === author.trim().toLowerCase();
  const approved = fresh && !!approver.trim() && !same && !!note.trim();
  const stepIdx = result ? 3 : approved ? 2 : fresh && drafting ? 1 : 0;
  const steps = ["Draft", "Previewed", "Approved", "Live"];
  const canPublish = fresh && drafting && !!author.trim() && !!approver.trim() && !same && !!note.trim() && !busy;
  void draft;

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <ol className="flex flex-wrap items-baseline gap-3 font-mono text-[12px] uppercase tracking-[0.08em]">
          {steps.map((s, i) => <li key={s} className="flex items-baseline gap-3"><span className={i === stepIdx ? "text-ink" : i < stepIdx ? "text-stone" : "text-stone/50"}>{i === stepIdx ? <Accent>{s}</Accent> : s}</span>{i < 3 && <span className="text-stone/50">→</span>}</li>)}
        </ol>
      </div>
      {result ? (
        <div className="card-calm col-span-12 p-6 md:col-span-8">
          <p className="eyebrow">Released</p>
          <p className="mt-2 font-display text-3xl leading-[1.1]">{result.version} is <Accent>live</Accent> · {result.change_timing.duration_minutes} min from first preview to live · {result.change_timing.open_claims_rechecked} open claims sent to review</p>
          <p className="mt-2 text-sm text-stone">Large insurers report weeks to months for this.{result.note ? ` (${result.note})` : ""}</p>
          <Link to="/review" className="mt-4 inline-block text-cedar underline underline-offset-2">See them in Review</Link>
        </div>
      ) : (
        <form className="col-span-12 grid gap-4 md:col-span-8" onSubmit={async (e) => {
          e.preventDefault(); if (!canPublish) return; setBusy(true); setErr(null);
          try { await onPublish({ published_by: author.trim(), approved_by: approver.trim(), note: note.trim() }); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="eyebrow">Author</span><input value={author} readOnly className="field-input mt-1 w-full px-3 py-2" /></label>
            <label className="block"><span className="eyebrow">Approver</span><input value={approver} onChange={(e) => setApprover(e.target.value)} className="field-input mt-1 w-full px-3 py-2" placeholder="Someone else" />
              {same && <span className="mt-1 block text-sm text-cedar">The approver must be someone other than the author.</span>}</label>
          </div>
          <label className="block"><span className="eyebrow">What changed and why</span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1 h-24 w-full px-3 py-2" /></label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-cedar px-6 py-2.5" disabled={!canPublish}>{busy ? "Publishing…" : `Publish ${version}`}</button>
            {!drafting ? <span className="text-sm text-stone">Change a rule first.</span> : !preview ? <span className="text-sm text-stone">Simulate first.</span> : !fresh ? <span className="text-sm text-stone">You changed the draft. Simulate again.</span> : null}
          </div>
          {err && <p className="text-sm text-cedar">{err}</p>}
        </form>
      )}
    </div>
  );
}


