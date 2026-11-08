import { createFileRoute } from "@tanstack/react-router";
import { ReviewPage } from "@/components/review/ReviewPage";

export const Route = createFileRoute("/review/$caseId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.caseId} · Review - Canoe` },
      { name: "description", content: "Internal review of one claim: recommendation, facts and history." },
      { property: "og:title", content: `${params.caseId} · Review - Canoe` },
      { property: "og:description", content: "Internal claim review in Canoe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CaseRoute,
});
function CaseRoute() {
  const { caseId } = Route.useParams();
  return <ReviewPage caseId={caseId} />;
}
