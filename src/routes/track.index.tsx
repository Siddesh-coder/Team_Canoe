import { createFileRoute } from "@tanstack/react-router";
import { TrackingPage } from "@/components/customer/TrackingPage";
export const Route = createFileRoute("/track/")({
  head: () => ({ meta: [{ title: "Track your claim - Canoe" }, { name: "description", content: "Find your claim and see what happens next." }, { property: "og:title", content: "Track your claim - Canoe" }, { property: "og:description", content: "Your claim's next step, in plain language." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TrackingPage,
});