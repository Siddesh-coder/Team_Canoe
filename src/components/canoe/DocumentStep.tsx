import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Check, FileText, Upload } from "lucide-react";
import { SAMPLES, eur, withTotal, type SampleDoc } from "./samples";
import { useCalmMotion } from "./motion";
import { cn } from "@/lib/utils";

export interface ConfirmedDoc {
  kind: "quote" | "police_report";
  extracted: { amount?: number; itemized?: boolean; sampleId: string };
  edited?: { amount?: number } | undefined;
}

function DocThumb({ doc, phase }: { doc: SampleDoc; phase: "scan" | "highlight" | "confirm" }) {
  const { reduce } = useCalmMotion();
  const box = phase !== "scan";
  return (
    <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-lg border border-stone/30 bg-paper p-5 text-[11px] leading-relaxed text-ink">
      <p className="font-display text-sm">{doc.issuer}</p>
      <p className="text-stone">{doc.title}</p>
      <div className="my-3 h-px bg-stone/25" />
      {doc.kind === "quote" ? (
        <>
          <div className={cn("relative -mx-1 rounded px-1 py-0.5 font-mono transition-all duration-300", box && "ring-1 ring-cedar/70")}>
            {doc.items.length === 0 && <div className="text-stone">Repair, all inclusive</div>}
            {doc.items.map((i) => (
              <div key={i.label} className="flex justify-between"><span>{i.label}</span><span>{eur(i.eur)}</span></div>
            ))}
          </div>
          <div className="my-2 h-px bg-stone/25" />
          <div className={cn("-mx-1 flex justify-between rounded px-1 py-0.5 font-mono font-semibold transition-all duration-300", box && "bg-cedar/10 ring-1 ring-cedar")}>
            <span>Total</span><span>{eur(doc.total)}</span>
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className={cn("-mx-1 rounded px-1 py-0.5 transition-all", box && "bg-cedar/10 ring-1 ring-cedar")}>Report no. {doc.reference}</div>
          <div>Date of incident: {doc.date}</div>
          <div className="mt-2 space-y-1">{[80, 92, 70, 85].map((w) => <div key={w} className="h-1.5 rounded bg-stone/20" style={{ width: `${w}%` }} />)}</div>
        </div>
      )}
      {phase === "scan" && !reduce && (
        <motion.div
          className="absolute inset-x-0 top-0 h-0.5 bg-cedar"
          initial={{ top: "0%" }}
          animate={{ top: "100%" }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </div>
  );
}

function Processor({ doc, onConfirm, onDiscard }: { doc: SampleDoc; onConfirm: (c: ConfirmedDoc) => void; onDiscard: () => void }) {
  const [phase, setPhase] = useState<"scan" | "highlight" | "confirm">("scan");
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(doc.kind === "quote" ? String(doc.total) : "");
  const { t } = useCalmMotion();
  useEffect(() => {
    const a = setTimeout(() => setPhase("highlight"), 1250);
    const b = setTimeout(() => setPhase("confirm"), 1900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const confirm = () => {
    if (doc.kind === "quote") {
      const n = Number(amount);
      const edited = editing && Number.isFinite(n) && n !== doc.total ? { amount: n } : undefined;
      onConfirm({ kind: "quote", extracted: { amount: doc.total, itemized: doc.itemized !== false, sampleId: doc.id }, edited });
    } else onConfirm({ kind: "police_report", extracted: { sampleId: doc.id }, });
  };
  return (
    <div className="card-calm space-y-4 p-5">
      <DocThumb doc={doc} phase={phase} />
      <AnimatePresence mode="wait">
        {phase === "confirm" ? (
          <motion.div key="c" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={t(240)} className="space-y-3">
            <p className="text-sm">
              <span className="text-stone">We found: </span>
              {doc.kind === "quote" ? <>total {eur(doc.total)} · {doc.itemized === false ? "no line items" : <>itemized quote <Check className="inline size-3.5 text-reed" /></>}</> : <>police report {doc.reference} <Check className="inline size-3.5 text-reed" /></>}
            </p>
            {editing && doc.kind === "quote" && (
              <label className="block text-sm">
                <span className="text-stone">The total on your quote (€)</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} className="field-input mt-1 w-full px-3 py-2" autoFocus />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={confirm} className="btn-cedar px-5 py-2 text-sm">{editing ? "Save" : "Looks right"}</button>
              {doc.kind === "quote" && !editing && <button onClick={() => setEditing(true)} className="btn-quiet px-5 py-2 text-sm">Edit</button>}
              <button onClick={onDiscard} className="px-3 py-2 text-sm text-stone hover:text-ink">Not this one</button>
            </div>
          </motion.div>
        ) : (
          <motion.p key="r" exit={{ opacity: 0 }} className="text-center text-sm text-stone">Reading your document…</motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DocumentPicker({ only, confirmedIds, onConfirm, quoteTotal }: { only?: "quote" | "police_report"; confirmedIds: string[]; onConfirm: (c: ConfirmedDoc) => void; quoteTotal?: number | undefined }) {
  const [active, setActive] = useState<SampleDoc | null>(null);
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const samples = SAMPLES.filter((s) => !only || s.kind === only).map((s) => withTotal(s, quoteTotal));
  const onFiles = (files: FileList | null) => {
    if (files?.[0]) { setUnreadable(files[0].name.slice(0, 80)); setActive(null); }
  };
  if (active) return <Processor key={active.id} doc={active} onDiscard={() => setActive(null)} onConfirm={(c) => { setActive(null); onConfirm(c); }} />;
  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={cn("card-calm flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-8 text-center transition-colors", drag && "border-cedar")}
      >
        <Upload className="size-5 text-stone" />
        <p className="text-sm">Drop a file here, or <span className="underline underline-offset-4">choose one</span></p>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
      {unreadable && <p className="text-sm text-stone">We couldn't read this one - we'll ask you instead. <span className="opacity-70">({unreadable})</span></p>}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-stone">Use a sample</p>
        <div className="grid gap-2">
          {samples.map((s) => {
            const done = confirmedIds.includes(s.id);
            return (
              <button key={s.id} disabled={done} onClick={() => { setUnreadable(null); setActive(s); }} className="answer-btn flex items-center gap-3 px-4 py-3 text-left text-sm disabled:opacity-60">
                <FileText className="size-4 shrink-0 text-stone" />
                <span className="flex-1">{s.kind === "quote" ? (s.itemized === false ? "Workshop quote - total only, no line items" : `Workshop quote - itemized, total ${eur(s.total)}`) : "Police / incident report"}</span>
                {done && <Check className="size-4 text-reed" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
