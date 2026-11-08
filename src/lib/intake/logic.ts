import type {
  ClaimRow, CsvColumn, Fact, FormConfig, IntakeState, Mode, Question, UploadEvidence,
} from "./types";
import { CSV_COLUMNS } from "./types";

export const emptyState = (): IntakeState => ({ facts: {}, uploads: {} });

export function factOf(state: IntakeState, id: string): Fact | undefined {
  return state.facts[id];
}

/** A fact counts as "answered" once known, dont_know or system - never ask it again. */
export function isSettled(f?: Fact) {
  return !!f && (f.status === "known" || f.status === "dont_know" || f.status === "system");
}

export function knownValue(state: IntakeState, id: string) {
  const f = state.facts[id];
  return f && (f.status === "known" || f.status === "system") ? f.value : null;
}

export function isVisible(q: Question, state: IntakeState, config: FormConfig): boolean {
  if (!q.show_if) return true;
  const parent = config.questions.find((p) => p.id === q.show_if!.q);
  if (parent && !isVisible(parent, state, config)) return false;
  const v = knownValue(state, q.show_if.q);
  if (v == null) return false;
  if (q.show_if.eq !== undefined) return String(v) === q.show_if.eq;
  if (q.show_if.in) return q.show_if.in.includes(String(v));
  return true;
}

function sectionOrder(config: FormConfig, q: Question) {
  const i = config.sections.indexOf(q.section);
  return i === -1 ? 999 : i;
}

export function orderedQuestions(config: FormConfig) {
  return config.questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => sectionOrder(config, a.q) - sectionOrder(config, b.q) || a.i - b.i)
    .map((x) => x.q);
}

function matchesMissing(q: Question, missing: string[]) {
  return missing.includes(q.id) || (!!q.field && missing.includes(q.field)) || !!q.also_for?.some((f) => missing.includes(f));
}

function inMissing(q: Question, mode: Mode) {
  if (mode.kind !== "missing") return true;
  return matchesMissing(q, mode.missing);
}

/** liability_disputed: nobody else involved → False; else other side agrees (inverted); unsure/unanswered → blank. */
export function deriveLiability(state: IntakeState, config: FormConfig): string {
  const other = knownValue(state, "other_party");
  if (other === "no") return "False";
  if (other !== "yes") return "";
  return triBool(state, config.questions.find((q) => q.id === "other_party_agrees"), config);
}

/** Questions that are still ahead of the customer, in order. */
export function upcoming(state: IntakeState, config: FormConfig, mode: Mode = { kind: "intake" }) {
  return orderedQuestions(config).filter(
    (q) => q.source === "customer" && !isSettled(state.facts[q.id]) && isVisible(q, state, config) && inMissing(q, mode),
  );
}

export function nextQuestion(state: IntakeState, config: FormConfig, mode: Mode = { kind: "intake" }): Question | null {
  return upcoming(state, config, mode)[0] ?? null;
}

/** River progress. total = visible required customer facts; done = known or "not sure". */
export function progress(state: IntakeState, config: FormConfig) {
  const visible = config.questions.filter((q) => q.source === "customer" && isVisible(q, state, config));
  const done = visible.filter((q) => isSettled(state.facts[q.id])).length;
  return { done, total: visible.length, ratio: visible.length ? done / visible.length : 0 };
}

/** Questions the customer never has to answer: hidden by branching, or filled from a document. */
export function skippedCount(state: IntakeState, config: FormConfig) {
  return config.questions.filter((q) => {
    if (q.source !== "customer") return false;
    if (!isVisible(q, state, config)) return true;
    const f = state.facts[q.id];
    return f?.source === "upload" && f.status === "known";
  }).length;
}

export function injuryReported(state: IntakeState) {
  return knownValue(state, "injury") === "yes";
}

function triBool(state: IntakeState, q: Question | undefined, config: FormConfig): string {
  if (!q || !isVisible(q, state, config)) return "";
  const v = knownValue(state, q.id);
  if (v == null || typeof q.mapping !== "object") return "";
  return q.mapping[String(v)] ?? "";
}

export function deriveRepairType(state: IntakeState, config: FormConfig): string {
  const isEv = config.questions.find((q) => q.id === "is_electric");
  if (!isEv || !isVisible(isEv, state, config)) return "";
  const ev = state.facts["is_electric"];
  if (!ev || ev.status !== "known") return "";
  if (ev.value === "no") return "standard";
  const bat = state.facts["battery_affected"];
  if (!bat || bat.status !== "known") return "";
  if (bat.value === "yes") return "ev_high_voltage_battery";
  if (bat.value === "no") return "standard";
  return "";
}

/** Mock "insurer systems" step. Never asked; source = system. */
export function insurerLookup(state: IntakeState) {
  const policy = String(knownValue(state, "policy_number") ?? "").trim().toUpperCase();
  const policy_active_on_incident = policy === "" ? "" : policy.startsWith("EXP") ? "False" : "True";
  const duplicate_flag = policy.startsWith("DUP") ? "True" : "False";
  const quote = state.facts["quote_amount"];
  const uploaded = state.uploads.quote?.amount;
  let evidence_conflict = "False";
  if (quote && quote.status === "known" && quote.source === "customer" && typeof uploaded === "number" && uploaded > 0) {
    const typed = Number(quote.value);
    if (Number.isFinite(typed) && Math.abs(typed - uploaded) / uploaded > 0.05) evidence_conflict = "True";
  }
  return { policy_active_on_incident, duplicate_flag, evidence_conflict };
}

export function buildRow(caseId: string, state: IntakeState, config: FormConfig): ClaimRow {
  const q = (id: string) => config.questions.find((x) => x.id === id);
  const text = (id: string) => {
    const qq = q(id);
    if (!qq || !isVisible(qq, state, config)) return "";
    const v = knownValue(state, id);
    return v == null ? "" : String(v).trim();
  };
  const quoteQ = q("quote_amount");
  let quote_eur = "";
  if (quoteQ && isVisible(quoteQ, state, config)) {
    const v = knownValue(state, "quote_amount");
    if (v != null && v !== "" && Number.isFinite(Number(v))) quote_eur = String(Math.round(Number(v)));
  }
  const sys = insurerLookup(state);
  return {
    case_id: caseId,
    case_status: "open",
    claim_summary: text("description"),
    policy_active_on_incident: sys.policy_active_on_incident,
    claim_type: text("what_happened"),
    repair_type: deriveRepairType(state, config),
    quote_eur,
    incident_report_present: triBool(state, q("has_report"), config),
    itemized_quote_present: triBool(state, q("has_quote"), config),
    injury_reported: triBool(state, q("injury"), config),
    liability_disputed: deriveLiability(state, config),
    duplicate_flag: sys.duplicate_flag,
    evidence_conflict: sys.evidence_conflict,
  };
}

/** Live insurer service owns system facts; preserve the existing customer mapping. */
export function buildApiPayload(state: IntakeState, config: FormConfig) {
  const { case_id: _id, case_status: _status, ...row } = buildRow("", state, config);
  const quote = state.facts["quote_amount"];
  return { ...row, policy_active_on_incident: "", duplicate_flag: "", evidence_conflict: "",
    policy_number: String(knownValue(state, "policy_number") ?? ""),
    incident_date: String(knownValue(state, "incident_date") ?? ""),
    stated_quote_eur: quote?.source === "customer" && quote.status === "known" ? String(quote.value ?? "") : "",
    document_quote_eur: state.uploads.quote?.amount == null ? "" : String(state.uploads.quote.amount),
  };
}

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: Partial<Record<CsvColumn, string | null>>[]) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c] ?? "")).join(","));
  return lines.join("\n") + "\n";
}

/** Answer helper: "not_sure" leaves the field blank (dont_know) - never a guess. */
export function answer(state: IntakeState, id: string, value: string | number | null, source: Fact["source"] = "customer"): IntakeState {
  const blank = value === "not_sure" || value === null || value === "";
  return {
    ...state,
    facts: {
      ...state.facts,
      [id]: { value: blank ? null : value, status: blank ? "dont_know" : "known", source, timestamp: new Date().toISOString() },
    },
  };
}

/** Confirming a document fills every fact it can, in one move. */
export function applyDocument(
  state: IntakeState,
  kind: "quote" | "police_report",
  extracted: UploadEvidence,
  edited?: { amount?: number },
): IntakeState {
  let s: IntakeState = { ...state, uploads: { ...state.uploads, [kind]: extracted } };
  if (kind === "quote") {
    if (extracted.itemized !== undefined) s = answer(s, "has_quote", extracted.itemized ? "yes" : "no", "upload");
    if (edited?.amount !== undefined) s = answer(s, "quote_amount", edited.amount, "customer");
    else if (extracted.amount !== undefined) s = answer(s, "quote_amount", extracted.amount, "upload");
  } else {
    s = answer(s, "has_report", "yes", "upload");
  }
  return s;
}

/** Facts to log: every question fact, document evidence, plus system lookups. */
export function factLogEntries(state: IntakeState, config: FormConfig) {
  const now = new Date().toISOString();
  const out: { field: string; value: string; status: string; source: string; timestamp: string }[] = [];
  for (const q of config.questions) {
    const f = state.facts[q.id];
    const active = isVisible(q, state, config);
    out.push({
      field: q.id,
      value: f?.value == null ? "" : String(f.value),
      status: f ? (active ? f.status : `${f.status}:inactive`) : "unknown",
      source: f?.source ?? "customer",
      timestamp: f?.timestamp ?? now,
    });
  }
  for (const [kind, ev] of Object.entries(state.uploads)) {
    if (!ev) continue;
    out.push({ field: `doc:${kind}`, value: JSON.stringify(ev), status: "known", source: "upload", timestamp: now });
  }
  const sys = insurerLookup(state);
  for (const [k, v] of Object.entries(sys)) out.push({ field: k, value: v, status: "system", source: "system", timestamp: now });
  return out;
}

/** Rebuild state from the latest fact_log entry per field. */
export function stateFromLog(entries: { field: string; value: string; status: string; source: string; timestamp: string }[]): IntakeState {
  const s = emptyState();
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const e of sorted) {
    if (e.field.startsWith("doc:")) {
      try { s.uploads[e.field.slice(4) as "quote" | "police_report"] = JSON.parse(e.value); } catch { /* ignore */ }
      continue;
    }
    if (e.source === "system") continue;
    const status = e.status.replace(":inactive", "") as Fact["status"];
    if (status === "unknown") { delete s.facts[e.field]; continue; }
    const num = e.field === "quote_amount" && e.value !== "" ? Number(e.value) : e.value;
    s.facts[e.field] = { value: e.value === "" ? null : num, status, source: e.source as Fact["source"], timestamp: e.timestamp };
  }
  return s;
}

/** Missing-information mode: clear only the listed facts so they are asked again. */
export function openMissing(state: IntakeState, config: FormConfig, missing: string[]): IntakeState {
  const facts = { ...state.facts };
  for (const q of config.questions) {
    if (matchesMissing(q, missing)) delete facts[q.id];
  }
  return { ...state, facts };
}

/** Case ids the continue flow accepts: imported DEV/PRA cases and Canoe FORM cases. */
export const CASE_ID_RE = /^(DEV-\d{3,}|PRA-\d{3,}|FORM-\d{4,})$/;

/** Missing list from a link (?missing=a,b) or the stored missing_fields (a;b). */
export function parseMissing(raw: string | null | undefined): string[] {
  return (raw ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

/** Imported cases have no fact log: seed only what the question flow needs (claim type for show_if). */
export function stateFromStoredRow(row: { claim_type?: string | null }): IntakeState {
  const s = emptyState();
  if (row.claim_type) s.facts["what_happened"] = { value: row.claim_type, status: "known", source: "system", timestamp: new Date().toISOString() };
  return s;
}

/** Missing mode: only the CSV columns named in `missing` are recomputed; nothing else is touched. */
export function patchMissingColumns(state: IntakeState, config: FormConfig, missing: string[]): Partial<ClaimRow> {
  const built = buildRow("_", state, config);
  const out: Partial<ClaimRow> = {};
  for (const m of missing) {
    const col = (CSV_COLUMNS as readonly string[]).includes(m) ? m : config.questions.find((q) => q.id === m)?.field;
    if (!col || col === "case_id" || col === "case_status" || !(CSV_COLUMNS as readonly string[]).includes(col)) continue;
    out[col as CsvColumn] = built[col as CsvColumn];
  }
  return out;
}
