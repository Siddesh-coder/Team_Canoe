import { createFileRoute } from "@tanstack/react-router";
import { BatchPage } from "@/components/batch/BatchPage";

export const Route = createFileRoute("/batch")({
  head: () => ({ meta: [
    { title: "Canoe - Batch version" },
    { name: "description", content: "Upload a claims CSV and view the policy engine’s batch results." },
    { property: "og:title", content: "Canoe - Batch version" },
    { property: "og:description", content: "Compare returned policy recommendations and download batch results." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BatchPage,
});