import { motion } from "framer-motion";
import { CanoeMark } from "./brand";
import { useCalmMotion } from "./motion";

export function RiverProgress({ done, total, label, onBack }: { done: number; total: number; label?: string | undefined; onBack?: (() => void) | undefined }) {
  const { t } = useCalmMotion();
  const ratio = total ? Math.min(1, done / total) : 0;
  return (
    <div className="w-full" aria-label={`${done} of ${total} details`}>
      <div className="relative h-8">
        <svg viewBox="0 0 400 12" preserveAspectRatio="none" className="absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2" aria-hidden="true">
          <path d="M0 6 C 60 2, 120 10, 200 6 S 340 2, 400 6" stroke="currentColor" className="text-stone/40" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: "100%" }}>
          <motion.div className="absolute top-1/2 h-px -translate-y-1/2 bg-cedar" initial={false} animate={{ width: `${ratio * 100}%` }} transition={t(600)} />
        </div>
        <motion.div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-[62%]"
          initial={false}
          animate={{ left: `${ratio * 100}%` }}
          transition={t(600)}
        >
          {onBack ? (
            <motion.button
              type="button"
              aria-label="Go back one step"
              title="Drag the canoe back to go back"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              dragSnapToOrigin
              onDragEnd={(_, info) => { if (info.offset.x < -24) onBack(); }}
              onKeyDown={(e) => { if (e.key === "ArrowLeft") onBack(); }}
              className="block cursor-grab touch-none active:cursor-grabbing"
            >
              <CanoeMark size={26} />
            </motion.button>
          ) : <CanoeMark size={26} />}
        </motion.div>
      </div>
      <p className="mt-1 font-mono text-[11px] text-stone">{label ?? `${done} of ${total} details`}{onBack && <span className="hidden sm:inline"> · drag the canoe back to go back</span>}</p>
    </div>
  );
}
