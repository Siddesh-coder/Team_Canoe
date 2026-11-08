import { PapercutSea } from "./PapercutSea";

/** Papercut lake with a canoe riding between the layers. Decorative only. `contained` pins it to the parent section instead of the viewport. */
export function PencilBackdrop({ contained = false, onCanoeEntered }: { contained?: boolean; onCanoeEntered?: () => void }) {
  return <PapercutSea contained={contained} {...(onCanoeEntered ? { onCanoeEntered } : {})} />;
}
