import { useEffect, useState } from "react";
import type { Fact, Question } from "@/lib/intake/types";
import { cn } from "@/lib/utils";
import { DocumentPicker, type ConfirmedDoc } from "./DocumentStep";
import { useSiteTools } from "@/components/site-tools/SiteTools";

const TRI = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "I'm not sure" },
];

export function QuestionCard({
  q, fact, optional, onAnswer, onDocument, confirmedDocIds, quoteTotal,
}: {
  q: Question;
  fact?: Fact | undefined;
  optional?: boolean;
  onAnswer: (value: string | number | null) => void;
  onDocument: (c: ConfirmedDoc) => void;
  confirmedDocIds: string[];
  quoteTotal?: number | undefined;
}) {
  const initial = fact ? (fact.status === "dont_know" ? "not_sure" : fact.value == null ? "" : String(fact.value)) : "";
  const [value, setValue] = useState<string>(initial);
  const [showUpload, setShowUpload] = useState(false);
  const { t } = useSiteTools();
  const opts: { value: string; label: string; hint?: string }[] = q.type === "tri_state" ? (q.options ?? TRI) : q.options ?? [];

  const submit = () => {
    if (q.type === "number") {
      const n = Number(value);
      return onAnswer(value.trim() === "" || !Number.isFinite(n) ? null : n);
    }
    onAnswer(value.trim() === "" ? null : value === "not_sure" ? "not_sure" : value.trim());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      if (!typing && (q.type === "tri_state" || q.type === "choice")) {
        const idx = ["1", "2", "3", "4"].indexOf(e.key);
        if (idx >= 0 && opts[idx]) { e.preventDefault(); setValue(opts[idx].value); return; }
      }
      if (e.key === "Enter" && !(el.tagName === "TEXTAREA" && !e.metaKey && !e.ctrlKey)) {
        if (el.tagName === "BUTTON") return;
        if (value !== "" || q.type === "text" || q.type === "number" || q.type === "date") { e.preventDefault(); submit(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-6">
      <div>
        {optional && <p className="mb-2 text-xs uppercase tracking-wider text-stone">Optional - helps us prepare</p>}
        <h1 className="question-title text-ink">{t(q.label)}</h1>
        <p className="mt-3 text-sm text-stone">{t(q.help)}</p>
      </div>

      {(q.type === "tri_state" || q.type === "choice") && (
        <div className={cn("grid gap-2", q.type === "tri_state" && "sm:grid-cols-3")} role="radiogroup">
          {opts.map((o, i) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={value === o.value}
              data-selected={value === o.value}
              onClick={() => setValue(o.value)}
              className="answer-btn flex items-center gap-3 px-4 py-4 text-left"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded border border-stone/40 text-[10px] text-stone">{i + 1}</span>
              <span>
                <span className="block text-[15px]">{t(o.label)}</span>
                {o.hint ? <span className="block text-xs text-stone">{t(o.hint)}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {q.type === "text" && (q.id === "description" ? (
        <textarea value={value} maxLength={1500} onChange={(e) => setValue(e.target.value)} rows={4} autoFocus className="field-input w-full resize-none px-4 py-3" placeholder="I was parking outside the supermarket when…" />
      ) : (
        <input value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} autoFocus className="field-input w-full px-4 py-3" />
      ))}
      {q.type === "number" && (
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone">€</span>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} autoFocus className="field-input w-full py-3 pl-9 pr-4" />
        </div>
      )}
      {q.type === "date" && (
        <input type="date" value={value} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setValue(e.target.value)} autoFocus className="field-input w-full px-4 py-3" />
      )}

      {q.upload_on_yes && value === "yes" && (
        showUpload ? (
          <DocumentPicker only={q.upload_on_yes} confirmedIds={confirmedDocIds} onConfirm={onDocument} quoteTotal={quoteTotal} />
        ) : (
          <button onClick={() => setShowUpload(true)} className="text-sm underline underline-offset-4">Add it now - we'll read it for you</button>
        )
      )}

      {q.type === "number" && q.extractable_from && (
        showUpload ? (
          <DocumentPicker only={q.extractable_from} confirmedIds={confirmedDocIds} onConfirm={onDocument} quoteTotal={quoteTotal} />
        ) : (
          <button onClick={() => setShowUpload(true)} className="text-sm underline underline-offset-4">Or add the quote - we'll read it for you</button>
        )
      )}

      <div className="flex items-center gap-4">
        <button onClick={submit} disabled={(q.type === "tri_state" || q.type === "choice") && value === ""} className="btn-cedar px-6 py-2.5 text-sm">{t("Continue")}</button>
        {q.type !== "tri_state" && q.type !== "choice" && (
          <button onClick={() => onAnswer(null)} className="text-sm text-stone hover:text-ink">{t("I'm not sure")}</button>
        )}
        <span className="hidden text-xs text-stone sm:inline">Enter ↵</span>
      </div>
    </div>
  );
}
