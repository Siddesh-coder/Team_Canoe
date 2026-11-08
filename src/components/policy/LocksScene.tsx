import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { RecommendationLabel } from "@/components/canoe/RecommendationLabel";
import { PADDLE } from "@/components/canoe/motion";
import { euro, gateLabel, quoteLimitOf } from "@/lib/policy/text";
import type { Draft, Preview, PreviewRow, Rec, Rule } from "@/lib/policy/types";

/* Wiring diagram: one wire per open claim, rules as gate cards on the bus. Presentation only. */
const W = 1200, H = 520, BUS_Y = 150, X0 = 40, GX0 = 230, GX1 = 990, TERM_X = 1070, R = 14, PITCH = 2.5;
const RAIL: Record<Rec, number> = { routine_processing: BUS_Y, human_review: 330, request_information: 410 };
const CARD_H = 52, ROW = 34;
const cy = (i: number) => BUS_Y + (i % 2 ? ROW : -ROW);

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => { let lo = 0, hi = 1; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (cx(m, x1, x2) < x) lo = m; else hi = m; } return cx((lo + hi) / 2, y1, y2); };
}
const ease = bezier(...(PADDLE as unknown as [number, number, number, number]));
const strip = (id: string) => id.replace(/^v\d+:/, "");
const clamp = (v: number) => Math.min(1, Math.max(0, v));

interface Gate { rule: Rule; old: Rule | null; isNew: boolean; removed: boolean }
interface Exit { gate: number | null; to: Rec }
interface Wire { row: PreviewRow; bus: number; d: { v1: string; v2: string }; exit: { v1: Exit; v2: Exit }; arriveX: { v1: number; v2: number } }

export interface LocksSceneProps {
  draft: Draft; live: Draft; preview: Preview | null; stale: boolean; runId: number; skipToken: number; glide: number;
  showGhosts: boolean; highlight: string | null; liveLimit: number | null; escalations: number; onLimit: (v: number) => void;
  view?: "v1" | "v2";
  published?: boolean;
}

export function LocksScene(p: LocksSceneProps) {
  const reduce = !!useReducedMotion();
  const navigate = useNavigate();
  const view = p.view ?? "v2";

  // Gate list: draft order, removed live rules kept at their old position.
  const gates = useMemo<Gate[]>(() => {
    const liveById = new Map(p.live.rules.map((r) => [r.id, r]));
    const ids = new Set(p.draft.rules.map((r) => r.id));
    const out: Gate[] = p.draft.rules.map((r) => ({ rule: r, old: liveById.get(r.id) ?? null, isNew: !liveById.has(r.id), removed: false }));
    p.live.rules.forEach((r, i) => { if (!ids.has(r.id)) out.splice(Math.min(i, out.length), 0, { rule: r, old: r, isNew: false, removed: true }); });
    return out;
  }, [p.draft, p.live]);
  const n = gates.length;
  const spacing = n <= 1 ? 0 : (GX1 - GX0) / (n - 1);
  const cardW = Math.min(124, n <= 2 ? 124 : 2 * spacing - 12);
  const gx = (i: number) => (n <= 1 ? (GX0 + GX1) / 2 : GX0 + i * spacing);

  const exitOf = (ruleId: string, to: Rec): Exit => {
    if (to === "routine_processing") return { gate: null, to };
    const id = strip(ruleId);
    let gi = gates.findIndex((g) => strip(g.rule.id) === id);
    if (gi < 0) gi = gates.findIndex((g) => g.rule.outcome === to && !g.removed);
    return { gate: gi >= 0 ? gi : 0, to };
  };

  const open = useMemo(() => p.preview?.rows.filter((r) => !r.retained) ?? [], [p.preview]);
  const closed = p.preview?.rows.filter((r) => r.retained) ?? [];

  const wires = useMemo<Wire[]>(() => {
    const ex = open.map((row) => ({ row, v1: exitOf(row.rule_from, row.from), v2: exitOf(row.rule_to, row.to) }));
    // Stable bus order (v1 exit): earlier exits sit lower on the bus so drops don't cross.
    const rank = (e: Exit) => (e.gate == null ? -1 : e.gate);
    const order = [...ex].sort((a, b) => rank(a.v1) - rank(b.v1) || a.row.case_id.localeCompare(b.row.case_id));
    const m = order.length, top = BUS_Y - ((m - 1) * PITCH) / 2;
    const busIdx = new Map(order.map((e, i) => [e.row.case_id, i]));
    const build = (key: "v1" | "v2") => {
      const res = new Map<string, { d: string; ax: number }>();
      const groups = new Map<string, typeof ex>();
      ex.forEach((e) => { const g = `${e[key].gate}|${e[key].to}`; groups.set(g, [...(groups.get(g) ?? []), e]); });
      const railMembers: Record<string, typeof ex> = { human_review: [], request_information: [] };
      ex.forEach((e) => { if (e[key].to !== "routine_processing") railMembers[e[key].to]!.push(e); });
      const railY = new Map<string, number>();
      Object.entries(railMembers).forEach(([to, list]) => {
        const s = [...list].sort((a, b) => (b[key].gate! - a[key].gate!) || busIdx.get(a.row.case_id)! - busIdx.get(b.row.case_id)!);
        const base = RAIL[to as Rec] - ((s.length - 1) * PITCH) / 2;
        s.forEach((e, k) => railY.set(e.row.case_id, base + k * PITCH));
      });
      ex.forEach((e) => {
        const y = top + busIdx.get(e.row.case_id)! * PITCH, x = e[key];
        if (x.gate == null) {
          res.set(e.row.case_id, { d: `M${X0} ${y} L${TERM_X - 40} ${y} Q${TERM_X - 26} ${y} ${TERM_X - 26} ${y} L${TERM_X - 26} ${y} Q${TERM_X - 26} ${y} ${TERM_X - 12} ${y} L${TERM_X} ${y}`, ax: TERM_X });
          return;
        }
        const grp = groups.get(`${x.gate}|${x.to}`)!.sort((a, b) => busIdx.get(a.row.case_id)! - busIdx.get(b.row.case_id)!);
        const k = grp.indexOf(e), dx = gx(x.gate) + (k - (grp.length - 1) / 2) * PITCH, ry = railY.get(e.row.case_id)!;
        res.set(e.row.case_id, { d: `M${X0} ${y} L${dx - R} ${y} Q${dx} ${y} ${dx} ${y + R} L${dx} ${ry - R} Q${dx} ${ry} ${dx + R} ${ry} L${TERM_X} ${ry}`, ax: gx(x.gate) });
      });
      return res;
    };
    const a = build("v1"), b = build("v2");
    return ex.map((e) => ({ row: e.row, bus: busIdx.get(e.row.case_id)!, exit: { v1: e.v1, v2: e.v2 },
      d: { v1: a.get(e.row.case_id)!.d, v2: b.get(e.row.case_id)!.d }, arriveX: { v1: a.get(e.row.case_id)!.ax, v2: b.get(e.row.case_id)!.ax } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gates, cardW]);

  /* ---------- timeline ---------- */
  const [t, setT] = useState(99);
  const raf = useRef(0);
  useEffect(() => {
    if (!p.preview || p.runId === 0) return;
    cancelAnimationFrame(raf.current);
    if (reduce) { setT(99); return; }
    const t0 = performance.now();
    const loop = () => { const s = (performance.now() - t0) / 1000; setT(s); if (s < 4) raf.current = requestAnimationFrame(loop); };
    setT(0); raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.runId]);
  useEffect(() => { if (p.skipToken) { cancelAnimationFrame(raf.current); setT(99); } }, [p.skipToken]);
  const ran = !!p.preview && p.runId > 0;
  const dropT = ran ? clamp(t / 0.6) : 0;
  const scanP = ran ? ease(clamp((t - 0.6) / 2.4)) : 0;
  const scanX = X0 + scanP * (TERM_X + 20 - X0);
  const done = ran && t >= 3;

  /* ---------- counts ---------- */
  const catches = (gi: number, key: "v1" | "v2") => wires.filter((w) => w.exit[key].gate === gi && w.exit[key].to !== "routine_processing");
  const totals = (key: "v1" | "v2") => { const c: Record<Rec, number> = { routine_processing: 0, human_review: 0, request_information: 0 }; wires.forEach((w) => c[w.exit[key].to]++); return c; };
  const tot = totals(view), tot1 = totals("v1");
  const arrived = (to: Rec) => wires.filter((w) => w.exit[view].to === to && w.arriveX[view] <= scanX).length;

  /* ---------- highlight ---------- */
  const [hoverGate, setHoverGate] = useState<number | null>(null);
  const [hoverWire, setHoverWire] = useState<{ id: string; x: number; y: number } | null>(null);
  const [term, setTerm] = useState<Rec | null>(null);
  const [dam, setDam] = useState(false);
  useEffect(() => { setTerm(null); }, [p.highlight]);
  const active: Set<string> | null = hoverWire ? new Set([hoverWire.id])
    : hoverGate != null ? new Set(catches(hoverGate, view).map((w) => w.row.case_id))
    : term ? new Set(wires.filter((w) => w.exit[view].to === term).map((w) => w.row.case_id))
    : p.highlight ? new Set(wires.filter((w) => w.row.changed && `${w.row.from} -> ${w.row.to}` === p.highlight).map((w) => w.row.case_id))
    : null;

  const limit = quoteLimitOf(p.draft.rules);
    const qi = gates.findIndex((g) => strip(g.rule.id) === "R1.quote_over_limit" && !g.removed);
  const toSvgPct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

  return (
    <div className="relative">
      <div className={p.stale ? "opacity-40 grayscale transition-opacity duration-300" : "transition-opacity duration-300"}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label="Wiring diagram: each claim is a wire that exits at the rule that catches it">
          <defs>
            <pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" className="stroke-stone" strokeOpacity={0.06} strokeWidth={1} /></pattern>
            <clipPath id="scan"><rect x={0} y={0} width={done ? W : scanX} height={H} /></clipPath>
          </defs>
          <rect width={W} height={H} className="fill-paper" />
          <rect width={W} height={H} fill="url(#grid)" />

          {/* rails */}
          <g className="font-mono" fontSize={10} letterSpacing="0.08em">
            <text x={X0 - 20} y={BUS_Y - 40} className="fill-ink">{ran ? `${wires.length} open claims` : "open claims"}</text>
            <line x1={X0} x2={TERM_X} y1={BUS_Y} y2={BUS_Y} className="stroke-stone" strokeOpacity={0.25} strokeDasharray="2 4" />
            <line x1={GX0} x2={TERM_X} y1={RAIL.human_review} y2={RAIL.human_review} className="stroke-ink" strokeOpacity={0.18} strokeDasharray="2 4" />
            <line x1={GX0} x2={TERM_X} y1={RAIL.request_information} y2={RAIL.request_information} className="stroke-ochre" strokeOpacity={0.3} strokeDasharray="2 4" />
            <text x={GX0 - 8} y={RAIL.human_review + 3} textAnchor="end" className="fill-stone">REVIEW RAIL</text>
            <text x={GX0 - 8} y={RAIL.request_information + 3} textAnchor="end" className="fill-stone">INFO RAIL</text>
          </g>

          {/* ghosts */}
          {p.showGhosts && done && view === "v2" && wires.filter((w) => w.row.changed).map((w) => (
            <motion.path key={`g${w.row.case_id}`} d={w.d.v1} fill="none" className="stroke-cedar" strokeWidth={1.2} strokeDasharray="3 4"
              initial={{ opacity: 0 }} animate={{ opacity: active && !active.has(w.row.case_id) ? 0.05 : 0.3 }} transition={{ duration: 0.5 }} />
          ))}

          {/* wires */}
          <g clipPath="url(#scan)">
            {wires.map((w) => {
              const dim = active && !active.has(w.row.case_id);
              const on = active?.has(w.row.case_id);
              return (
                <g key={w.row.case_id}>
                  {w.row.changed && done && !reduce && (
                    <motion.path d={w.d[view]} fill="none" className="stroke-cedar" strokeWidth={5} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.35, 0] }} transition={{ duration: 1.1, ease: PADDLE }} style={{ filter: "blur(2px)" }} />
                  )}
                  <motion.path initial={false} animate={{ d: w.d[view] }} transition={{ duration: reduce ? 0 : 0.8, ease: PADDLE }}
                    fill="none" className={w.row.changed ? "stroke-cedar" : "stroke-ink"} strokeWidth={on ? 2.2 : w.row.changed ? 1.6 : 1}
                    strokeOpacity={dim ? 0.15 : w.row.changed || on ? 1 : 0.45} strokeLinecap="round" />
                  <motion.path initial={false} animate={{ d: w.d[view] }} transition={{ duration: reduce ? 0 : 0.8, ease: PADDLE }}
                    fill="none" stroke="transparent" strokeWidth={4} style={{ cursor: "pointer" }}
                    onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHoverWire({ id: w.row.case_id, x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }); }}
                    onMouseLeave={() => setHoverWire(null)}
                    onClick={() => navigate({ to: "/review/$caseId", params: { caseId: w.row.case_id } })} />
                </g>
              );
            })}
          </g>
          {ran && !done && <line x1={scanX} x2={scanX} y1={60} y2={440} className="stroke-cedar" strokeOpacity={0.5} strokeWidth={1} />}

          {/* gates */}
          {gates.map((g, i) => {
            const x = gx(i), Y = cy(i), info = g.rule.outcome === "request_information";
            const c2 = catches(i, "v2").length, c1 = catches(i, "v1").length;
            const lift = g.isNew ? (1 - ease(dropT)) * -78 : 0;
            const oldQ = g.old?.when.find((c) => c.field === "quote_eur")?.value, newQ = g.rule.when.find((c) => c.field === "quote_eur")?.value;
            const flip = ease(dropT);
            const oldLabel = g.old ? gateLabel(g.old, {}) : null, newLabel = gateLabel(g.rule, {});
            const changedVal = !g.isNew && !g.removed && oldLabel !== newLabel;
            const counter = !ran ? "" : g.removed ? `catches ${c1} (removed)` : g.isNew ? `catches ${c2} (new)` : c1 !== c2 ? `catches ${c1} → ${c2}` : `catches ${view === "v1" ? c1 : c2}`;
            const tone = g.removed ? "text-stone" : info ? "text-ochre" : "text-ink";
            return (
              <g key={g.rule.id} onMouseEnter={() => setHoverGate(i)} onMouseLeave={() => setHoverGate(null)}
                onClick={!p.published && i === qi ? () => setDam((d) => !d) : undefined} style={{ cursor: !p.published && i === qi ? "pointer" : "default" }}>
                {g.isNew && lift < -1 && <rect x={x - cardW / 2} y={Y - CARD_H / 2} width={cardW} height={CARD_H} rx={4} fill="none" className="stroke-cedar" strokeOpacity={0.4} strokeDasharray="1 3" />}
                <g transform={`translate(0 ${lift})`} className={tone}>
                  <rect x={x - cardW / 2} y={Y - CARD_H / 2} width={cardW} height={CARD_H} rx={4} className={cn2(g)} strokeWidth={1} strokeDasharray={g.isNew ? "4 3" : undefined} />
                  <text x={x - cardW / 2 + 8} y={Y - 10} fontSize={9.5} className="font-mono" fill="currentColor" textDecoration={g.removed ? "line-through" : undefined}>{fit(g.rule.id, Math.floor((cardW - (g.isNew || g.removed ? 50 : 16)) / 5.8))}</text>
                  {changedVal && typeof oldQ === "number" && typeof newQ === "number" ? (
                    <text x={x - cardW / 2 + 8} y={Y + 6} fontSize={10.5} fill="currentColor">Quote &gt; <tspan className="fill-stone" textDecoration="line-through">{euro(oldQ)}</tspan> <tspan className="fill-cedar" opacity={ran ? flip : 0.35}>{euro(newQ)}</tspan></text>
                  ) : changedVal ? (
                    <text x={x - cardW / 2 + 8} y={Y + 6} fontSize={10.5} fill="currentColor"><tspan className="fill-stone" textDecoration="line-through">{oldLabel}</tspan> <tspan className="fill-cedar">{newLabel}</tspan></text>
                  ) : (
                    <text x={x - cardW / 2 + 8} y={Y + 6} fontSize={13} fill="currentColor" textDecoration={g.removed ? "line-through" : undefined}>{newLabel}</text>
                  )}
                  <text x={x - cardW / 2 + 8} y={Y + 20} fontSize={9.5} className="fill-stone font-mono">{counter}</text>
                  {g.isNew && <text x={x + cardW / 2 - 6} y={Y - 10} textAnchor="end" fontSize={9} className="fill-cedar font-mono" textDecoration="underline">new</text>}
                  {g.removed && <text x={x + cardW / 2 - 6} y={Y - 10} textAnchor="end" fontSize={9} className="fill-stone font-mono" textDecoration="underline">removed</text>}
                </g>
              </g>
            );
          })}

          {/* terminals */}
          {(["routine_processing", "human_review", "request_information"] as Rec[]).map((rec) => {
            const y = RAIL[rec], count = done || !ran ? tot[rec] : arrived(rec), delta = tot[rec] - tot1[rec];
            const label = rec === "routine_processing" ? "ROUTINE" : rec === "human_review" ? "REVIEW" : "INFO NEEDED";
            const cls = rec === "routine_processing" ? "fill-reed" : rec === "human_review" ? "fill-ink" : "fill-ochre";
            return (
              <g key={rec} style={{ cursor: "pointer" }} onClick={() => setTerm((t0) => (t0 === rec ? null : rec))} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTerm(t0 => t0 === rec ? null : rec); } }} aria-label={`Highlight ${label}`}>
                <rect x={TERM_X} y={y - 22} width={W - TERM_X - 6} height={44} fill="transparent" />
                <line x1={TERM_X} x2={TERM_X} y1={y - 14} y2={y + 14} className="stroke-ink" strokeWidth={2} />
                <text x={TERM_X + 10} y={y - 6} fontSize={10} letterSpacing="0.08em" className={`font-mono ${cls}`} textDecoration={term === rec ? "underline" : undefined}>{label}</text>
                <text x={TERM_X + 10} y={y + 16} fontSize={24} fontWeight={600} className="font-display fill-ink">{ran ? count : "-"}</text>
                {ran && view === "v2" && <text x={TERM_X + 52} y={y + 14} fontSize={11} className={`font-mono ${delta ? "fill-cedar" : "fill-stone"}`}>{delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0"}</text>}
              </g>
            );
          })}

          {/* closed strip */}
          <line x1={0} x2={W} y1={458} y2={458} className="stroke-stone" strokeOpacity={0.2} />
          {closed.map((r, i) => { const y = 478 + i * 8; return (
            <g key={r.case_id} style={{ cursor: "pointer" }} onClick={() => navigate({ to: "/review/$caseId", params: { caseId: r.case_id } })}>
              <line x1={X0} x2={X0 + 60} y1={y} y2={y} className="stroke-stone" strokeWidth={1} />
            </g>); })}
          {closed.length > 0 && (
            <g className="stroke-stone" fill="none" strokeWidth={1}>
              <rect x={X0 + 64} y={478} width={10} height={8} rx={1} />
              <path d={`M${X0 + 66} 478 V474 a3 3 0 0 1 6 0 V478`} />
              <text x={X0 + 84} y={486} fontSize={11} className="fill-stone stroke-none font-mono">{closed.map((r) => r.case_id).join(" · ")} - closed, not re-run, kept as decided.</text>
            </g>
          )}
          <text x={W - 20} y={H - 14} textAnchor="end" fontSize={10} className="fill-stone font-mono">{ran ? `showing ${view}` : ""}</text>
        </svg>
        {!p.preview && <p className="pointer-events-none absolute inset-x-0 top-[50%] text-center font-display text-xl text-stone">Change a rule, then simulate.</p>}
      </div>
      {p.stale && <p className="absolute inset-x-0 top-[50%] text-center font-display text-xl text-ink">You changed the draft. Simulate again.</p>}

      {hoverWire && (() => {
        const w = wires.find((x) => x.row.case_id === hoverWire.id); if (!w) return null;
        const rule = view === "v1" ? w.row.rule_from : w.row.rule_to;
        return (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-lg border bg-paper px-2.5 py-1.5 font-mono text-[11px] shadow-sm" style={toSvgPct(hoverWire.x, hoverWire.y)}>
            <span className="text-ink">{w.row.case_id}</span> · <RecommendationLabel recommendation={w.row.from} /> → <RecommendationLabel recommendation={w.row.to} /> · <span className="text-stone">{rule}</span>
          </div>
        );
      })()}
      {hoverGate != null && ran && !hoverWire && (() => {
        const ids = catches(hoverGate, view).map((w) => w.row.case_id);
        return (
          <div className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 rounded-lg border bg-paper px-2.5 py-1.5 font-mono text-[11px] shadow-sm" style={toSvgPct(gx(hoverGate), hoverGate % 2 ? cy(hoverGate) + CARD_H / 2 + 8 : cy(hoverGate) - CARD_H / 2 - 30)}>
            {ids.length ? ids.join(" · ") : <span className="text-stone">catches none</span>}
          </div>
        );
      })()}

      {dam && qi >= 0 && limit != null && (
        <div className="absolute z-20 w-72 -translate-x-1/2 rounded-xl border bg-paper p-4 shadow-md" style={toSvgPct(Math.min(W - 180, Math.max(180, gx(qi))), cy(qi) + CARD_H / 2 + 14)}>
          <div className="flex items-baseline justify-between"><p className="eyebrow">Quote limit</p><button className="text-xs text-stone hover:text-ink" onClick={() => setDam(false)}>Close</button></div>
          <p className="mt-1 font-display text-2xl">Quote &gt; {euro(limit)}</p>
          {p.liveLimit != null && p.liveLimit !== limit && <p className="font-mono text-[11px] text-stone">live: {euro(p.liveLimit)}</p>}
          <input type="range" min={800} max={2000} step={100} value={limit} onChange={(e) => p.onLimit(Number(e.target.value))} className="mt-3 w-full accent-[var(--cedar)]" aria-label="Quote limit" />
          <div className="flex justify-between font-mono text-[10px] text-stone"><span>€800</span><span>€2,000</span></div>
          <p className="mt-3 font-mono text-[11px] text-ink">Escalations {p.escalations} · review time ≈ {p.escalations} × 9 min = {p.escalations * 9} min</p>
          <p className="mt-1 text-xs text-stone">This edits the draft only.</p>
        </div>
      )}
    </div>
  );
}

function cn2(g: Gate) {
  if (g.removed) return "fill-paper stroke-stone";
  if (g.isNew) return "fill-paper stroke-cedar";
  return "fill-paper stroke-current";
}

const fit = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(3, n - 1)) + "…" : s);
