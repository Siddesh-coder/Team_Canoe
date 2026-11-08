import { createFileRoute } from "@tanstack/react-router";
import { ReviewPage } from "@/components/review/ReviewPage";

export const Route = createFileRoute("/review/")({
  head: () => ({
    meta: [
      { title: "Review - Canoe" },
      { name: "description", content: "Internal reviewer queue: cases that need a person." },
      { property: "og:title", content: "Review - Canoe" },
      { property: "og:description", content: "Internal reviewer queue for Canoe claims." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <ReviewPage />,
});
