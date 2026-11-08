import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Check, ChevronUp, FileText, User } from "lucide-react";
import type { FormConfig, IntakeState } from "@/lib/intake/types";
import { isSettled, isVisible, orderedQuestions, progress } from "@/lib/intake/logic";
import { displayValue } from "./display";
import { useCalmMotion } from "./motion";
import { HorizonLine } from "./brand";

function Chip({ label, value, source }: { label: string; value: string; source: string }) {
  const { reduce, t } = useCalmMotion();
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={t(300)} className="flex items-start gap-3 py-2">
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center text-reed">
        {!reduce && [0, 1].map((i) => (
          <motion.span key={i} className="absolute inset-0 rounded-full border border-cedar/20 bg-cedar/20"
            initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        <Check className="relative size-3" strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] text-stone">{label}</span>
        <span className="block truncate text-sm">{value}</span>
      </span>
      {source === "upload" ? <FileText className="mt-1 size-3.5 text-stone" aria-label="From your document" /> : <User className="mt-1 size-3.5 text-stone" aria-label="You told us" />}
    </motion.li>
  );
}

function FileBody({ state, config }: { state: IntakeState; config: FormConfig }) {
  const items = orderedQuestions(config).filter((q) => isVisible(q, state, config) && isSettled(state.facts[q.id]));
  return (
    <ul className="divide-y divide-stone/15">
      <AnimatePresence initial={false}>
        {items.map((q) => (
          <Chip key={q.id} label={q.short ?? q.label} value={displayValue(q, state.facts[q.id])} source={state.facts[q.id]!.source} />
        ))}
      </AnimatePresence>
      {items.length === 0 && <li className="py-3 text-sm text-stone">Details appear here as you go.</li>}
    </ul>
  );
}

export function ClaimFilePanel({ state, config }: { state: IntakeState; config: FormConfig }) {
  return (
    <aside className="card-calm sticky top-8 hidden max-h-[calc(100vh-4rem)] overflow-auto p-6 lg:block">
      <p className="font-display text-lg">Claim file</p>
      <HorizonLine className="my-2" />
      <FileBody state={state} config={config} />
    </aside>
  );
}

export function ClaimFilePill({ state, config }: { state: IntakeState; config: FormConfig }) {
  const [open, setOpen] = useState(false);
  const { t } = useCalmMotion();
  const p = progress(state, config);
  return (
    <div className="lg:hidden">
      <button onClick={() => setOpen(true)} className="card-calm inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm">
        {p.done} of {p.total} details <ChevronUp className="size-3.5 text-stone" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-auto rounded-t-2xl border-t border-stone/25 bg-paper p-6"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={t(300)}>
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone/30" />
              <p className="font-display text-lg">Claim file</p>
              <HorizonLine className="my-2" />
              <FileBody state={state} config={config} />
              <button onClick={() => setOpen(false)} className="btn-quiet mt-4 w-full py-2 text-sm">Close</button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
