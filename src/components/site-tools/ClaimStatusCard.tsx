import { RecommendationLabel } from "@/components/canoe/RecommendationLabel";
import type { ChatLocale, TrackingStatus } from "@/lib/chat/types";

export function ClaimStatusCard({ status: s, locale }: { status: TrackingStatus; locale: ChatLocale }) {
  const de = locale === "de";
  return <section className="canoe-chat-status" aria-label={de ? "Aufgezeichneter Schadenstatus" : "Recorded claim status"}>
    <header><strong>{s.case_id}</strong>{s.recommendation && <RecommendationLabel recommendation={s.recommendation} />}</header>
    <dl>
      <div><dt>Status</dt><dd>{s.case_status}</dd></div>
      <div><dt>{de ? "Empfehlung" : "Recommendation"}</dt><dd>{s.recommendation ?? "-"}</dd></div>
      {s.request_status && <div><dt>{de ? "Anfrage" : "Request"}</dt><dd>{s.request_status}</dd></div>}
      <div><dt>Policy</dt><dd>{s.policy_version ?? "-"}</dd></div>
      <div><dt>{de ? "Aktualisiert" : "Updated"}</dt><dd>{s.updated_at ? new Date(s.updated_at).toLocaleString(de ? "de-DE" : "en-GB") : "-"}</dd></div>
    </dl>
    <small>{de ? "Synthetischer Demofall · aktuell abgefragt" : "Synthetic demo case · checked now"}</small>
  </section>;
}