import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parsedDocumentDraft, policyDocumentApi, type DocumentMode, type DocumentParseResult } from "@/lib/policy/documents";
import type { Draft } from "@/lib/policy/types";

export function PolicyDocumentUpload({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const [mode, setMode] = useState<DocumentMode>("replace");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<DocumentParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  async function upload(file?: File) {
    if (!file || busy) return;
    const id = ++request.current;
    setBusy(true); setError(null); setResult(null); setFilename(file.name);
    try {
      const parsed = await policyDocumentApi.parse(file, mode);
      if (id !== request.current) return;
      setResult(parsed);
      const draft = parsedDocumentDraft(parsed);
      if (draft) onDraft(draft);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "We couldn't read the document. Try uploading again.");
    } finally { if (id === request.current) setBusy(false); }
  }

  return (
    <section aria-labelledby="policy-document-title" className="mb-8 border-b border-stone/25 pb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="policy-document-title" className="font-display text-xl">Upload a policy document</h3>
        {policyDocumentApi.templateUrl && <a href={policyDocumentApi.templateUrl} className="text-sm text-cedar underline underline-offset-2">Download the template</a>}
      </div>
      <p id="policy-document-help" className="mt-2 text-sm text-stone">Write one rule per line, for example: Send to human_review if quote_eur is greater than 1200</p>
      <fieldset disabled={busy} className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <legend className="sr-only">Policy document mode</legend>
        <label className="flex items-center gap-2"><input type="radio" name="policy-document-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[var(--cedar)]" />This document is the whole policy</label>
        <label className="flex items-center gap-2"><input type="radio" name="policy-document-mode" value="add" checked={mode === "add"} onChange={() => setMode("add")} className="accent-[var(--cedar)]" />Add these rules to the current ones</label>
      </fieldset>
      <div onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}
        className={cn("mt-4 flex flex-wrap items-center justify-between gap-4 border border-dashed p-5", dragging ? "border-cedar bg-mist" : "border-stone/40")} aria-busy={busy}>
        <div className="min-w-0">
          <p className="break-all text-sm">{filename || "Drop a policy document here"}</p>
          <p className="mt-1 font-mono text-[11px] text-stone">.txt · .md · .docx</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => picker.current?.click()} className="btn-quiet shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <FileUp className="size-4" />}{busy ? "Reading document…" : "Choose file"}
        </Button>
        <input ref={picker} type="file" accept=".txt,.md,.docx" className="sr-only" tabIndex={-1} disabled={busy} aria-label="Policy document" aria-describedby="policy-document-help" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div aria-live="polite" className="mt-3">
        {error && <p role="alert" className="text-sm text-cedar">{error}</p>}
        {result && <>
          {result.has_errors && <p role="alert" className="mb-4 border-l-2 border-cedar pl-3 text-sm text-cedar">Some lines could not be read, so nothing was changed. Fix the red lines in your file and upload it again.</p>}
          <ol aria-label="Document lines" className="divide-y divide-stone/20 border-y border-stone/20">
            {result.lines.map((line, i) => <li key={`${line.n}-${i}`} className={cn("grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-3 text-sm", line.status === "error" ? "text-cedar" : line.status === "ignored" ? "text-stone" : "text-ink")}>
              <span className="font-mono text-xs">{line.n}</span><div className="min-w-0 break-words"><p>{line.text}</p><p className="mt-1 text-xs">{line.status === "error" ? "Error: " : line.status === "ignored" ? "Ignored: " : ""}{line.detail}</p></div>
            </li>)}
          </ol>
          {!result.has_errors && <div className="mt-3 space-y-2 text-sm">
            {result.notes.map((note, i) => <p key={`note-${i}`}>{note}</p>)}
            {result.warnings.map((warning, i) => <p key={`warning-${i}`} className="text-cedar">{warning}</p>)}
          </div>}
        </>}
      </div>
    </section>
  );
}