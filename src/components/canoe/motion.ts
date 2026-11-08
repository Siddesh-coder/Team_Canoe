import { useReducedMotion } from "framer-motion";

/** A paddle stroke: a push, then a glide. No overshoot anywhere. */
export const PADDLE = [0.22, 1, 0.36, 1] as const;

export function useCalmMotion() {
  const reduce = useReducedMotion();
  const t = (ms: number) => ({ duration: reduce ? 0.15 : ms / 1000, ease: PADDLE });
  return {
    reduce: !!reduce,
    t,
    advance: reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t(150) }
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -24 },
          transition: t(240),
        },
  };
}
