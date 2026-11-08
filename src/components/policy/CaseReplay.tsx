import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { RecommendationLabel } from "@/components/canoe/RecommendationLabel";
import { PADDLE } from "@/components/canoe/motion";
import { getReviewApi, type ClaimDetail, type ClaimListItem, type Rec } from "@/lib/review/api";
import { REASON, RULE_FIELD, euro, formatValue } from "@/lib/review/labels";
import type { Draft, PolicyDoc, Preview, PreviewRow, Rule } from "@/lib/policy/types";
import { cn } from "@/lib/utils";

/* Decision replay for one case. Presentation only: the winning rule and terminal always come
   from the recorded decision (or the preview row); trace results are shown as recorded. */

const W = 1200, H = 400, SPINE = 150, X0 = 48, GX0 = 150, GX1 = 940, TERM_X = 1040, R = 16;
const RAIL: Record<Rec, number> = { routine_processing: SPINE, human_review: 280, request_information: 345 };
const TERM_LABEL: Record<Rec, string> = { routine_processing: "ROUTINE", human_review: "REVIEW", request_information: "INFO NEEDED" };
const TERM_CLS: Record<Rec, string> = { routine_processing: "fill-reed", human_review: "fill-ink", request_information: "fill-ochre" };
const strip = (id: string) => id.replace(/^v\d+:/, "");
const clamp = (v: number) => Math.min(1, Math.max(0, v));

type Eval = "passed" | "triggered" | "unknown" | "not_recorded";
interface Node { id: string; outcome: string; fields: string[]; reason: string; evalState: Eval; winner: boolean; afterWinner: boolean }
interface Route { nodes: Node[]; winnerIdx: number; to: Rec; version: string; ruleId: string; inconsistent: string | null; source: "recorded" | "proposed" }

function normResult(r: unknown): Eval {
  if (r === true || r === "true") return "triggered";
  if (r === false || r === "false") return "passed";
  if (r === "unknown") return "unknown";
  return "not_recorded";
}

function rulesOf(doc: PolicyDoc, version: string): Rule[] { return doc.versions.find((v) => v.version === version)?.rules ?? []; }

function recordedRoute(c: ClaimDetail, doc: PolicyDoc): Route {
  const d = c.latest_decision;
  const ruleId = strip(d.rule_id);
  const policyRules = rulesOf(doc, d.policy_version);
  const trace = (d.detail?.trace ?? []) as (ClaimDetail["latest_decision"]["detail"]["trace"][number] & { fields?: string[] })[];
  const base = trace.length
    ? trace.map((s) => ({ id: strip(s.rule), outcome: s.outcome, fields: s.fields, evalState: normResult(s.result) }))
    : policyRules.map((r) => ({ id: r.id, outcome: r.outcome as string, fields: undefined as string[] | undefined, evalState: "not_recorded" as Eval }));
  let winnerIdx = base.findIndex((n) => n.id === ruleId);
  const firstTrue = base.findIndex((n) => n.evalState === "triggered");
  let inconsistent: string | null = null;
  if (winnerIdx >= 0 && firstTrue >= 0 && firstTrue !== winnerIdx) inconsistent = `The trace shows ${base[firstTrue]!.id} matching first; the decision record names ${ruleId}. The record is shown as decided.`;
  if (winnerIdx < 0 && d.recommendation !== "routine_processing") winnerIdx = -2; // decided outside listed checks
  const nodes: Node[] = base.map((n, i) => {
    const pr = policyRules.find((r) => r.id === n.id);
    return {
      id: n.id, outcome: n.outcome,
      fields: n.fields ?? (pr ? pr.when.map((w) => w.field) : RULE_FIELD[n.id] ? [RULE_FIELD[n.id]!] : []),
      reason: i === winnerIdx ? d.detail?.reason || d.explanation : pr?.reason ?? "",
      evalState: n.evalState, winner: i === winnerIdx, afterWinner: winnerIdx >= 0 && i > winnerIdx,
    };
  });
  return { nodes, winnerIdx, to: d.recommendation, version: d.policy_version, ruleId: d.rule_id, inconsistent, source: "recorded" };
}

function proposedRoute(row: PreviewRow, draft: Draft, version: string): Route {
  const ruleId = strip(row.rule_to);
  const nodes: Node[] = draft.rules.map((r) => ({ id: r.id, outcome: r.outcome, fields: r.when.map((w) => w.field), reason: r.reason,
    evalState: r.id === ruleId ? "triggered" : "not_recorded", winner: r.id === ruleId, afterWinner: false }));
  let winnerIdx = nodes.findIndex((n) => n.winner);
  nodes.forEach((n, i) => { n.afterWinner = winnerIdx >= 0 && i > winnerIdx; });
  if (winnerIdx < 0 && row.to !== "routine_processing") winnerIdx = -2;
  return { nodes, winnerIdx, to: row.to, version, ruleId: row.rule_to, inconsistent: null, source: "proposed" };
}

/* ---------------- picker ---------------- */

type Filter = "all" | "open" | "closed";
function Picker({ list, err, retry, selected, onSelect }: { list: ClaimListItem[] | null; err: string | null; retry: () => void; selected: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState(""); const [f, setF] = useState<Filter>("all");
  const shown = (list ?? []).filter((c) => (f === "all" || (f === "open") === (c.case_status === "open"))
    && (!q || `${c.case_id} ${c.summary}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id or summary" aria-label="Search cases"
        className="w-full rounded-lg border border-stone/30 bg-paper px-3 py-2 text-sm outline-none focus:border-ink" />
      <div role="radiogroup" aria-label="Filter cases" className="flex gap-1 font-mono text-[11px]">
        {(["all", "open", "closed"] as Filter[]).map((k) => (
          <button key={k} role="radio" aria-checked={f === k} onClick={() => setF(k)}
            className={cn("rounded-full border px-2.5 py-0.5 uppercase tracking-[0.08em]", f === k ? "border-ink text-ink" : "border-stone/30 text-stone hover:text-ink")}>{k}</button>
        ))}
      </div>
      <div role="listbox" aria-label="Cases" className="max-h-56 overflow-y-auto md:max-h-[380px]">
        {err ? <div className="p-3 text-sm text-stone">{err} <button className="underline hover:text-ink" onClick={retry}>Retry</button></div>
          : !list ? [0, 1, 2, 3].map((i) => <div key={i} className="my-2 h-9 animate-pulse rounded bg-mist/60" />)
          : shown.length === 0 ? <p className="p-3 text-sm text-stone">No cases match.</p>
          : shown.map((c) => {
            const closed = c.case_status !== "open", on = c.case_id === selected;
            return (
              <button key={c.case_id} role="option" aria-selected={on} onClick={() => onSelect(c.case_id)}
                className={cn("relative block w-full border-b border-stone/15 px-3 py-2 text-left hover:bg-mist/40", on && "bg-mist/50")}>
                {on && <span className="absolute inset-y-0 left-0 w-[2px] bg-cedar" />}
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-ink">{c.case_id}{closed && <span className="ml-1.5 text-stone">· closed</span>}</span>
                  <RecommendationLabel recommendation={c.recommendation_latest} />
                </span>
                <span className="block truncate text-xs text-stone">{c.summary || "-"}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

/* ---------------- diagram ---------------- */

function Lock({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} fill="none" className="stroke-stone" strokeWidth={1.2}><rect x={0} y={4} width={10} height={8} rx={1} /><path d="M2 4V2a3 3 0 0 1 6 0v2" /></g>;
}

function Diagram({ route, fieldValue, runKey, paused, sel, setSel, closed }: {
  route: Route; fieldValue: (f: string) => string; runKey: string; paused: boolean; sel: number | null; setSel: (i: number | null) => void; closed: boolean;
}) {
  const reduce = !!useReducedMotion();
  const n = route.nodes.length;
  const gx = (i: number) => (n <= 1 ? (GX0 + GX1) / 2 : GX0 + (i * (GX1 - GX0)) / (n - 1));
  const exitX = route.winnerIdx >= 0 ? gx(route.winnerIdx) : route.winnerIdx === -2 ? GX1 + 40 : null;
  const ry = RAIL[route.to];
  const d = exitX == null || route.to === "routine_processing"
    ? `M${X0} ${SPINE} L${TERM_X} ${SPINE}`
    : `M${X0} ${SPINE} L${exitX - R} ${SPINE} Q${exitX} ${SPINE} ${exitX} ${SPINE + R} L${exitX} ${ry - R} Q${exitX} ${ry} ${exitX + R} ${ry} L${TERM_X} ${ry}`;

  const pathRef = useRef<SVGPathElement>(null);
  const [p, setP] = useState(1);
  const acc = useRef(0); const raf = useRef(0);
  const DUR = 3200;
  useEffect(() => { acc.current = 0; setP(reduce ? 1 : 0); }, [runKey, reduce]);
  useEffect(() => {
    if (reduce || paused) return;
    let last = performance.now();
    const loop = (now: number) => { acc.current += now - last; last = now; const v = clamp(acc.current / DUR); setP(v); if (v < 1) raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [runKey, paused, reduce]);

  const [len, setLen] = useState(0);
  useLayoutEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, [d]);
  const ep = 1 - (1 - p) ** 2.2;
  const pt = len && pathRef.current ? pathRef.current.getPointAtLength(ep * len) : { x: X0, y: SPINE };
  const reached = (i: number) => p >= 1 || (pt.x >= gx(i) - 2 && (route.winnerIdx < 0 || i <= route.winnerIdx));
  const done = p >= 1;
  const toneOf = (o: string) => (o === "request_information" ? "ochre" : "ink");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[760px] select-none" role="img"
      aria-label={`Decision path: ${n} policy checks, ending at ${TERM_LABEL[route.to]}`}>
      <defs>
        <pattern id="rgrid" width={24} height={24} patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" className="stroke-stone" strokeOpacity={0.06} /></pattern>
        <filter id="rglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width={W} height={H} className="fill-paper" /><rect width={W} height={H} fill="url(#rgrid)" />

      <g className="font-mono" fontSize={11} letterSpacing="0.08em">
        <text x={X0} y={30} className="fill-ink">{route.source === "proposed" ? `PROPOSED ${route.version.toUpperCase()} · PREVIEW ONLY` : `RECORDED · POLICY ${route.version.toUpperCase()}`}</text>
        {closed && <><Lock x={X0} y={40} /><text x={X0 + 16} y={50} className="fill-stone">CLOSED · ORIGINAL DECISION PRESERVED · NOT RE-RUN</text></>}
        <line x1={X0} x2={TERM_X} y1={SPINE} y2={SPINE} className="stroke-stone" strokeOpacity={0.3} strokeDasharray="2 4" />
        <line x1={GX0} x2={TERM_X} y1={RAIL.human_review} y2={RAIL.human_review} className="stroke-ink" strokeOpacity={0.16} strokeDasharray="2 4" />
        <line x1={GX0} x2={TERM_X} y1={RAIL.request_information} y2={RAIL.request_information} className="stroke-ochre" strokeOpacity={0.3} strokeDasharray="2 4" />
        <text x={GX0 - 10} y={RAIL.human_review + 3} textAnchor="end" className="fill-stone">REVIEW RAIL</text>
        <text x={GX0 - 10} y={RAIL.request_information + 3} textAnchor="end" className="fill-stone">INFO RAIL</text>
      </g>

      {/* claim start */}
      <circle cx={X0} cy={SPINE} r={5} className="fill-ink" />

      {/* traced path */}
      <path ref={pathRef} d={d} fill="none" stroke="none" />
      <motion.path key={`base${runKey}`} d={d} fill="none" className="stroke-ink" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="1 3" />
      <path d={d} fill="none" className={route.source === "proposed" ? "stroke-cedar" : "stroke-ink"} strokeWidth={1.8} strokeLinecap="round"
        strokeDasharray={len ? `${ep * len} ${len}` : undefined} style={{ opacity: len ? 1 : 0 }} />

      {/* gates */}
      {route.nodes.map((g, i) => {
        const x = gx(i), up = i % 2 === 0, lit = reached(i), tone = toneOf(g.outcome);
        const ly = up ? SPINE - 30 : SPINE + 36;
        const label = REASON[g.id] ?? g.id.replace(/^R\d\./, "").replace(/_/g, " ");
        const words = label.split(" "); const half = Math.ceil(words.length / 2);
        const l1 = words.length > 2 ? words.slice(0, half).join(" ") : label, l2 = words.length > 2 ? words.slice(half).join(" ") : "";
        const dim = g.afterWinner || !lit;
        const glyph = g.winner ? "!" : g.evalState === "passed" ? "" : g.evalState === "unknown" ? "?" : "·";
        return (
          <motion.g key={`${g.id}${runKey}`} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.05, duration: 0.35, ease: PADDLE }}
            role="button" tabIndex={0} aria-label={`Check ${i + 1}: ${g.id}, ${g.winner ? "triggered, decided this case" : g.evalState.replace("_", " ")}`}
            aria-pressed={sel === i} onClick={() => setSel(sel === i ? null : i)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(sel === i ? null : i); } }}
            style={{ cursor: "pointer", outline: "none" }} opacity={dim && !g.winner ? 0.42 : 1}>
            <rect x={x - 40} y={SPINE - 56} width={80} height={130} fill="transparent" />
            {g.winner && lit && !reduce && <circle cx={x} cy={SPINE} r={15} className="fill-cedar" opacity={0.28} filter="url(#rglow)" />}
            <circle cx={x} cy={SPINE} r={11} className={cn("fill-paper", g.winner && lit ? "stroke-cedar" : tone === "ochre" ? "stroke-ochre" : "stroke-ink")}
              strokeWidth={g.winner && lit ? 1.8 : 1} strokeDasharray={g.evalState === "unknown" || g.evalState === "not_recorded" ? "2 2" : undefined} />
            {sel === i && <circle cx={x} cy={SPINE} r={16} fill="none" className="stroke-cedar" strokeWidth={1} />}
            {g.evalState === "passed" && !g.winner && lit
              ? <path d={`M${x - 4.5} ${SPINE + 0.5} q2 1.5 3 3.5 q2.5 -5 6.5 -8`} fill="none" className="stroke-reed" strokeWidth={1.6} strokeLinecap="round" />
              : <text x={x} y={SPINE + 4} textAnchor="middle" fontSize={11} className={cn("font-mono", g.winner ? "fill-cedar" : "fill-stone")}>{lit ? glyph : ""}</text>}
            <text x={x} y={up ? ly - 26 : ly} textAnchor="middle" fontSize={11} className="fill-stone font-mono">{String(i + 1).padStart(2, "0")} · {g.id.split(".")[0]}</text>
            <text x={x} y={up ? ly - 12 : ly + 14} textAnchor="middle" fontSize={13.5} className={g.winner && lit ? "fill-cedar" : tone === "ochre" ? "fill-ochre" : "fill-ink"}>{l1}</text>
            {l2 && <text x={x} y={up ? ly + 2 : ly + 28} textAnchor="middle" fontSize={13.5} className={g.winner && lit ? "fill-cedar" : tone === "ochre" ? "fill-ochre" : "fill-ink"}>{l2}</text>}
          </motion.g>
        );
      })}

      {/* token */}
      {len > 0 && (
        <g transform={`translate(${pt.x} ${pt.y})`} aria-hidden>
          {!done && !reduce && <circle r={10} className="fill-cedar" opacity={0.18} />}
          <circle r={4.5} className="fill-cedar" />
        </g>
      )}

      {/* terminals */}
      {(["routine_processing", "human_review", "request_information"] as Rec[]).map((rec) => {
        const on = rec === route.to, y = RAIL[rec];
        return (
          <g key={rec} opacity={on ? 1 : 0.35}>
            <line x1={TERM_X + 4} x2={TERM_X + 4} y1={y - 14} y2={y + 14} className="stroke-ink" strokeWidth={2} />
            <text x={TERM_X + 16} y={y - 2} fontSize={11} letterSpacing="0.08em" className={`font-mono ${TERM_CLS[rec]}`} fontWeight={on ? 600 : 400}>{TERM_LABEL[rec]}</text>
            {on && <motion.text key={`t${runKey}`} x={TERM_X + 16} y={y + 14} fontSize={10} className="fill-stone font-mono"
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: done ? 1 : 0 }} transition={{ duration: 0.4 }}>
              {route.source === "proposed" ? "proposed" : closed ? "original" : "recorded"}</motion.text>}
            {on && done && <motion.circle key={`r${runKey}`} cx={TERM_X + 4} cy={y} r={6} fill="none" className="stroke-cedar"
              initial={reduce ? false : { r: 4, opacity: 0.7 }} animate={{ r: 18, opacity: 0 }} transition={{ duration: 1, ease: PADDLE }} />}
          </g>
        );
      })}
      {route.winnerIdx === -2 && (
        <text x={GX1 + 46} y={SPINE - 14} fontSize={10} className="fill-stone font-mono">{strip(route.ruleId)}</text>
      )}
    </svg>
  );
}

/* ---------------- main ---------------- */

const EVAL_TEXT: Record<Eval, string> = { passed: "Passed check - not triggered", triggered: "Triggered", unknown: "Unknown - a fact was blank", not_recorded: "Not recorded" };

export function CaseReplay({ doc, draft, draftVersion, preview, fresh }: { doc: PolicyDoc; draft: Draft; draftVersion: string; preview: Preview | null; fresh: boolean }) {
  const api = getReviewApi();
  const reduce = !!useReducedMotion();
  const [list, setList] = useState<ClaimListItem[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [claimErr, setClaimErr] = useState<string | null>(null);
  const [which, setWhich] = useState<"recorded" | "proposed">("recorded");
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  const loadList = () => {
    setListErr(null); setList(null);
    api.listClaims().then((r) => setList(r.claims)).catch((e: Error) => setListErr(e.message || "We couldn't load the cases."));
  };
  useEffect(loadList, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preselect a helpful real case: an open case the preview changes, else an open non-routine case, else the first.
  useEffect(() => {
    if (!list || id || !list.length) return;
    const changed = fresh ? preview?.rows.find((r) => r.changed && !r.retained)?.case_id : undefined;
    const pick = (changed && list.find((c) => c.case_id === changed)) || list.find((c) => c.case_status === "open" && c.recommendation_latest !== "routine_processing") || list[0]!;
    setId(pick.case_id);
  }, [list, id, preview, fresh]);

  useEffect(() => {
    if (!id) return;
    let live = true; setClaim(null); setClaimErr(null); setSel(null); setPaused(false);
    api.getClaim(id).then((c) => { if (live) setClaim(c); }).catch((e: Error) => { if (live) setClaimErr(e.message || "We couldn't load this case."); });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isClosed = !!claim && claim.case_status !== "open";
  const row = claim && preview ? preview.rows.find((r) => r.case_id === claim.case_id) : undefined;
  const canPropose = !!row && fresh && !isClosed && !row.retained;
  useEffect(() => { if (!canPropose) setWhich("recorded"); }, [canPropose]);

  const route = useMemo(() => {
    if (!claim) return null;
    if (which === "proposed" && canPropose && row) return proposedRoute(row, draft, draftVersion);
    return recordedRoute(claim, doc);
  }, [claim, which, canPropose, row, draft, draftVersion, doc]);

  const fieldValue = (f: string) => {
    const fl = claim?.fields.find((x) => x.field === f);
    if (!fl) return "not in the claim file";
    if (fl.status === "blank") return "not provided";
    if (fl.status === "unreadable") return "unreadable";
    return formatValue(f, fl.value) || "not provided";
  };
  const fieldLabel = (f: string) => claim?.fields.find((x) => x.field === f)?.label ?? doc.fields[f] ?? f;
  const runKey = `${id}|${which}|${replay}`;
  const node = route && sel != null ? route.nodes[sel] : null;

  return (
    <div className="grid gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
      <Picker list={list} err={listErr} retry={loadList} selected={id} onSelect={setId} />
      <div className="min-w-0">
        {claimErr ? <p className="py-16 text-center text-sm text-stone">{claimErr} <button className="underline hover:text-ink" onClick={() => { const c = id; setId(null); setTimeout(() => setId(c), 0); }}>Retry</button></p>
          : !claim || !route ? <div className="h-72 animate-pulse rounded-lg bg-mist/40" aria-label="Loading case" />
          : (
            <motion.div key={claim.case_id} initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: PADDLE }}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="eyebrow">{claim.case_id} · {isClosed ? "Closed" : "Open"} · policy {claim.latest_decision.policy_version}</p>
                  <p className="mt-1 font-display text-xl leading-tight">{claim.summary || "-"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canPropose && (
                    <div role="radiogroup" aria-label="Which route" className="flex rounded-full border border-stone/30 p-0.5 font-mono text-[11px]">
                      {(["recorded", "proposed"] as const).map((k) => (
                        <button key={k} role="radio" aria-checked={which === k} onClick={() => { setWhich(k); setSel(null); }}
                          className={cn("rounded-full px-2.5 py-0.5", which === k ? "bg-ink text-paper" : "text-stone hover:text-ink")}>
                          {k === "recorded" ? `Current ${claim.latest_decision.policy_version}` : `Proposed ${draftVersion}`}</button>
                      ))}
                    </div>
                  )}
                  <button className="btn-quiet px-3 py-1 text-xs" onClick={() => { setReplay((r) => r + 1); setPaused(false); }}>Replay</button>
                  {!reduce && <button className="btn-quiet px-3 py-1 text-xs" aria-pressed={paused} onClick={() => setPaused((x) => !x)}>{paused ? "Play" : "Pause"}</button>}
                </div>
              </div>

              <div className="-mx-1 mt-3 overflow-x-auto px-1"><Diagram route={route} fieldValue={fieldValue} runKey={runKey} paused={paused} sel={sel} setSel={setSel} closed={isClosed} /></div>

              {route.inconsistent && <p className="mt-2 font-mono text-[11px] text-cedar">{route.inconsistent}</p>}
              {route.source === "recorded" && route.nodes.every((x) => x.evalState === "not_recorded") && <p className="mt-2 font-mono text-[11px] text-stone">No rule trace was recorded for this decision. The outcome is shown as recorded.</p>}
              {route.source === "recorded" && api.mode === "mock" && <p className="mt-2 font-mono text-[11px] text-stone">Demo trace - simplified from the claim file, not a live engine run.</p>}
              {route.source === "proposed" && <p className="mt-2 font-mono text-[11px] text-stone">Proposed, preview only - not published. The preview gives the deciding rule only; other checks are not recorded.</p>}
              {preview && !fresh && !isClosed && <p className="mt-2 font-mono text-[11px] text-stone">The draft changed since the last simulation. Simulate again to compare.</p>}

              {node && (
                <div className="mt-3 rounded-lg border border-stone/30 bg-paper p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono text-xs text-ink">{String((sel ?? 0) + 1).padStart(2, "0")} · {node.id}</p>
                    <button className="text-xs text-stone hover:text-ink" onClick={() => setSel(null)}>Close</button>
                  </div>
                  <p className="mt-1">{REASON[node.id] ?? node.id}{node.reason && <span className="text-stone"> - {node.reason}</span>}</p>
                  <p className={cn("mt-1 font-mono text-[11px]", node.winner ? "text-cedar" : "text-stone")}>
                    {node.winner ? `Triggered - decided this case (sends to ${TERM_LABEL[node.outcome as Rec] ?? node.outcome})` : EVAL_TEXT[node.evalState]}
                    {node.afterWinner && " · after the deciding rule, did not change the outcome"}
                  </p>
                  {node.fields.length > 0 && <ul className="mt-2 space-y-0.5 font-mono text-[11px]">
                    {node.fields.map((f) => <li key={f}><span className="text-stone">{fieldLabel(f)}:</span> <span className="text-ink">{fieldValue(f)}</span></li>)}
                  </ul>}
                  {node.evalState === "passed" && !node.winner && <p className="mt-1 text-xs text-stone">Passing a check is not an approval.</p>}
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-stone/25 p-3">
                  <p className="eyebrow">{isClosed ? "Original decision" : "Recorded recommendation"}</p>
                  <p className="mt-1"><RecommendationLabel recommendation={claim.latest_decision.recommendation} large /></p>
                  <p className="mt-1 font-mono text-[11px] text-stone">rule {claim.latest_decision.rule_id} · policy {claim.latest_decision.policy_version}</p>
                  {route.source === "proposed" && row && <p className="mt-2 font-mono text-[11px] text-cedar">Proposed {draftVersion}: <RecommendationLabel recommendation={row.to} /> · rule {row.rule_to}{!row.changed && " · unchanged"}</p>}
                </div>
                <div className="rounded-lg border border-stone/25 p-3">
                  <p className="eyebrow">Final settlement</p>
                  {claim.settlement ? (
                    <>
                      <p className="mt-1 font-display text-xl">{claim.settlement.decision === "approve" ? "Approved" : "Declined"}</p>
                      <p className="font-mono text-[11px] text-stone">by {claim.settlement.reviewer} · policy {claim.settlement.policy_version}{claim.settlement.reason && ` - “${claim.settlement.reason}”`}</p>
                    </>
                  ) : <p className="mt-1 text-sm text-stone">{isClosed ? "Closed before this system. Recorded triage recommendation only." : "Not settled. Recorded triage recommendation only."}</p>}
                  {claim.outcomes.length > 0 && <p className="mt-1 font-mono text-[11px] text-stone">Later outcome: {claim.outcomes[claim.outcomes.length - 1]!.final_outcome}</p>}
                  {(() => { const q = claim.fields.find((f) => f.field === "quote_eur"); return q && typeof q.value === "number" ? <p className="mt-1 font-mono text-[11px] text-stone">quote {euro(q.value)}</p> : null; })()}
                </div>
              </div>
              <p className="mt-3 text-xs text-stone">Click a numbered check to see the facts it read. <Link to="/review/$caseId" params={{ caseId: claim.case_id }} className="underline hover:text-ink">Open in review</Link></p>
            </motion.div>
          )}
      </div>
    </div>
  );
}
