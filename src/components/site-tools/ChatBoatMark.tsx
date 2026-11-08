import { cn } from "@/lib/utils";

/** The logo canoe as a single ink line - the same stroke as the wordmark mark. */
export function ChatBoatMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("text-ink", className)}>
      <path
        d="M3 17.5c4.2 4.6 21.8 4.6 26 0-6.5 1.6-19.5 1.6-26 0Z M20.5 9.5 L13 23.5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
