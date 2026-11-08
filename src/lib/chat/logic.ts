import type { ChatLocale, ChatTurn, TrackingStatus } from "./types";

export function extractCaseId(text: string): string | null {
  const m = text.match(/\b(DEV|PRA|FORM|CLM)\s*-?\s*(\d{3,8})\b/i);
  return m ? `${m[1]?.toUpperCase()}-${m[2]}` : null;
}
/** Fixed synthetic dataset, not a prefix permission for future customer IDs. */
export function isPublicDemoId(id: string): boolean {
  return /^DEV-(00[1-9]|01[0-4])$/.test(id) || /^PRA-(00[1-9]|01[0-2])$/.test(id);
}
export function trackingIntent(text: string, history: ChatTurn[]): boolean {
  return !!extractCaseId(text) || /\b(track|tracking|status|reference|application|claim update|what happened to (?:my|case)|verfolg|schadenszeichen|referenz|stand meiner|antrag)\b/i.test(text)
    || (history.at(-1)?.role === "assistant" && /tracking ID|Schadenszeichen/.test(history.at(-1)?.content ?? "") && /^\s*[\w -]{1,40}\s*$/.test(text));
}
export const askReference = (locale: ChatLocale) => locale === "de"
  ? "Bitte teilen Sie Ihr Schadenszeichen / Ihre Tracking-ID mit."
  : "Please share your claim reference/tracking ID.";
export const privacyReply = (locale: ChatLocale) => locale === "de"
  ? "Zum Schutz Ihrer Daten lassen Sie Ihre Identität bitte über den Support bestätigen. Ohne Verifizierung kann ich keine Angaben zu Kundenschäden anzeigen. Öffentlich abrufbar sind nur synthetische DEV-/PRA-Demofälle."
  : "For privacy, please verify through support. I cannot show customer claim information without verification. Only synthetic DEV-/PRA-demo cases can be tracked publicly.";
export const unknownReply = (locale: ChatLocale) => locale === "de"
  ? "Diese Referenz kann hier nicht geprüft werden. Prüfen Sie die Schreibweise oder lassen Sie Ihre Identität über den Support bestätigen."
  : "This reference cannot be checked here. Please check the spelling or verify through support.";

/** Presentation only: no policy evaluation, no inferred approval or settlement. */
export function explainStatus(s: TrackingStatus, locale: ChatLocale): string {
  if (s.case_status === "closed") return locale === "de"
    ? `${s.case_id} ist geschlossen. Die angezeigte Empfehlung ist die aufgezeichnete Triage, keine Zahlungsbestätigung. Informationen zur endgültigen Regulierung erhalten Sie nach Verifizierung über den Support.`
    : `${s.case_id} is closed. The recommendation shown is recorded triage, not a payment approval. Please verify through support for final settlement information.`;
  if (s.request_status === "answered_awaiting_recheck") return locale === "de"
    ? `${s.case_id}: Ihre Ergänzung wurde eingereicht und wartet auf erneute Prüfung. Die bisherige Empfehlung bleibt angezeigt, bis die Prüfung abgeschlossen ist. Bitte reichen Sie dieselben Unterlagen nicht erneut ein.`
    : `${s.case_id}: your update was submitted and is awaiting recheck. The previous recommendation remains recorded until that check completes. You do not need to submit the same documents again.`;
  if (s.recheck_pending) return locale === "de"
    ? `${s.case_id} wartet nach einer erneuten Bewertung auf die Sachbearbeitung. Die aufgezeichnete Empfehlung ist keine endgültige Regulierung.`
    : `${s.case_id} is waiting for a reviewer after re-evaluation. The recorded recommendation is not a final settlement.`;
  if (s.recommendation === "human_review") return locale === "de"
    ? `${s.case_id} ist offen und benötigt menschliche Prüfung. Eine Sachbearbeitung muss den Fall prüfen; dies ist weder eine Zusage noch eine Ablehnung.`
    : `${s.case_id} is open and needs human review. A reviewer must examine the case; this is neither approval nor denial.`;
  if (s.recommendation === "request_information") return locale === "de"
    ? `${s.case_id} ist offen. Die aufgezeichnete Empfehlung verlangt weitere Informationen${s.request_status === "requested" ? "; eine Anfrage wurde gesendet" : ""}. Prüfen Sie Ihre bestehende Anfrage. Der Support kann die benötigten Unterlagen nach Verifizierung bestätigen.`
    : `${s.case_id} is open. The recorded recommendation requests information${s.request_status === "requested" ? "; a request has been sent" : ""}. Check your existing request. Support can confirm the requested documents after verification.`;
  if (s.recommendation === "routine_processing") return locale === "de"
    ? `${s.case_id} ist offen und für reguläre Weiterbearbeitung vorgesehen. Das ist keine Genehmigung und keine Zahlungszusage.`
    : `${s.case_id} is open and recommended for routine downstream processing. This is not approval or a payment promise.`;
  return locale === "de" ? `${s.case_id}: Der aufgezeichnete Status ist ${s.case_status}. Eine Triage-Empfehlung ist nicht aufgezeichnet.`
    : `${s.case_id}: the recorded status is ${s.case_status}. No triage recommendation is recorded.`;
}