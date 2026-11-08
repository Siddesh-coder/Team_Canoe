import { createFileRoute } from "@tanstack/react-router";
import { TrackingPage } from "@/components/customer/TrackingPage";
export const Route = createFileRoute("/track/$caseId")({
  head: () => ({ meta: [{ title: "Your claim status - Canoe" }, { name: "description", content: "See your claim's progress and add requested information." }, { property: "og:title", content: "Your claim status - Canoe" }, { property: "og:description", content: "See what happens next with your Canoe claim." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => { const { caseId } = Route.useParams(); return <TrackingPage caseId={caseId} />; },
});