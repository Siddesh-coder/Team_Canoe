import { createFileRoute } from "@tanstack/react-router";
import { IntakeFlow } from "@/components/canoe/IntakeFlow";

export const Route = createFileRoute("/claim")({
  head: () => ({
    meta: [
      { title: "Canoe - Report a car claim" },
      { name: "description", content: "Tell us what happened to your car. Add a quote or report and Canoe fills in what it can." },
      { property: "og:title", content: "Canoe - Report a car claim" },
      { property: "og:description", content: "A calm, short claim form. Steady through changing water." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <IntakeFlow />,
});
