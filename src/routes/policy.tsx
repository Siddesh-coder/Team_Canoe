import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/policy/PolicyPage";

export const Route = createFileRoute("/policy")({
  head: () => ({
    meta: [
      { title: "Policy - Canoe" },
      { name: "description", content: "Change a draft triage rule, simulate its effect on open claims, and release it with an approver." },
      { property: "og:title", content: "Policy - Canoe" },
      { property: "og:description", content: "Internal policy owner page: change a draft, simulate, release." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PolicyPage,
});
