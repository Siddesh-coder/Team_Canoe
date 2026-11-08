import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  routine_processing: "ROUTINE",
  request_information: "INFO NEEDED",
  human_review: "REVIEW",
};

export function RecommendationLabel({ recommendation, closed = false, large = false, infoTone = "ochre", className }: {
  recommendation: string; closed?: boolean; large?: boolean; infoTone?: "ochre" | "cedar"; className?: string;
}) {
  const color = closed ? "text-stone" : recommendation === "routine_processing" ? "text-reed"
    : recommendation === "request_information" ? (infoTone === "cedar" ? "text-cedar" : "text-ochre") : "text-ink";
  return <span className={cn(large ? "font-display text-2xl" : "recommendation-label", color,
    recommendation === "human_review" && !closed && "font-semibold", className)}>
    {closed ? "CLOSED" : LABELS[recommendation] ?? recommendation}
  </span>;
}