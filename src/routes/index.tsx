import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canoe - Claims triage that holds when the rules change" },
      { name: "description", content: "Canoe reads a motor claim, applies your written policy and tells your team the next step, with the rule and policy version behind every answer." },
      { property: "og:title", content: "Canoe - Decisions that hold when the rules change" },
      { property: "og:description", content: "Rules decide, people review, and every policy change is previewed before it goes live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});
