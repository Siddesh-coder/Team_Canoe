import { motion, useReducedMotion } from "framer-motion";
import { CanoeMark } from "@/components/canoe/brand";
import { useSiteTools } from "@/components/site-tools/SiteTools";
export function CustomerTrack({ station, needInfo = false, received = false }: { station: number; needInfo?: boolean; received?: boolean }) {
  const reduce = useReducedMotion();
  const { t } = useSiteTools();
  const labels = ["Received", needInfo ? "We need something" : "Being checked", "With a specialist", "Decided"];
  return <div className="relative mb-6 mt-8 overflow-hidden pt-10" aria-label={t(labels[station - 1] ?? "Received")}>
    <svg viewBox="0 0 600 12" preserveAspectRatio="none" className="absolute left-0 top-10 h-3 w-full text-stone/40" aria-hidden="true"><path d="M0 5 Q150 2 300 5 T600 5" stroke="currentColor" fill="none" /></svg>
    <motion.div className="pointer-events-none absolute inset-x-0 top-0" initial={reduce ? false : { x: "12.5%" }} animate={{ x: `${12.5 + (station - 1) * 25}%` }} transition={{ duration: reduce || received ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] }}><span className="block w-fit -translate-x-1/2"><CanoeMark size={40} /></span></motion.div>
    <ol className="relative grid grid-cols-4 gap-2 pt-4">{labels.map((label, i) => <li key={label} aria-current={station === i + 1 ? "step" : undefined} className={`text-center font-mono text-[10px] sm:text-xs ${station >= i + 1 ? "text-ink" : "text-stone"}`}><span className="mx-auto mb-2 block h-px w-3 bg-current" />{t(label)}</li>)}</ol>
  </div>;
}