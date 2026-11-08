import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Accent, Wordmark } from "@/components/canoe/brand";
import { Button } from "@/components/ui/button";
import { runBatch, summarizeBatch, validateCsv, type BatchResponse } from "@/lib/batch/api";

const recommendationColor: Record<string, string> = {
  human_review: "bg-cedar/10 text-cedar border-cedar/25",
  request_information: "bg-ochre/10 text-ochre border-ochre/25",
  routine_processing: "bg-ink/5 text-ink border-ink/20",
};
function ResultCell({ column, value }: { column: string; value: unknown }) {
  const text = value == null ? "" : String(value);
  if (column === "recommendation_v1" || column === "recommendation_v2") {
    return <span className={`inline-block rounded border px-2 py-1 font-mono text-[11px] ${recommendationColor[text] ?? "border-border text-ink"}`}>{text}</span>;
  }
  return <span className={column === "needs_recheck" && value === "True" ? "text-cedar" : undefined}>{text}</span>;
}

export function BatchPage() {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [save, setSave] = useState(false);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BatchResponse | null>(null);
  const submit = async (chosen: File) => {
    if (busy.current) return;
    busy.current = true;
    setFile(chosen); setError(""); setResult(null); setPending(true);
    try {
      validateCsv(chosen.name, "validation");
      const text = await chosen.text();
      validateCsv(chosen.name, text);
      setResult(await runBatch(text, save));
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn't read this file. Please try again."); }
    finally { busy.current = false; setPending(false); }
  };
  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "results.csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const summary = result ? summarizeBatch(result) : null;
  return <div className="min-h-screen bg-paper">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-6 md:px-8"><Wordmark /><Button asChild variant="ghost"><Link to="/claim"><ArrowLeft />Report a claim</Link></Button></header>
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-12 md:px-8">
      <p className="eyebrow mb-5">Canoe / batch</p>
      <h1 className="question-title">Batch <Accent>version</Accent></h1>
      <div className="mt-8 max-w-2xl">
        <label className="mb-5 flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={save} disabled={pending} onChange={(event) => setSave(event.target.checked)} className="size-4 accent-cedar" />Also add these claims to the register</label>
        <div className={`flex min-h-52 flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-5 py-8 ${dragging ? "border-cedar bg-cedar/5" : "border-stone/40 bg-mist"}`}
          onDragOver={(event) => { event.preventDefault(); if (!pending) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const chosen = event.dataTransfer.files[0]; if (chosen) void submit(chosen); }} aria-busy={pending}>
          <FileSpreadsheet className="size-7 text-stone" aria-hidden="true" />
          <p className="text-sm text-stone">Drop a CSV file here</p>
          <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}><Upload />Choose CSV file</Button>
          <input ref={input} type="file" accept=".csv" aria-label="Upload claims CSV" className="sr-only" tabIndex={-1} disabled={pending} onChange={(event) => { const chosen = event.target.files?.[0]; if (chosen) void submit(chosen); event.target.value = ""; }} />
          {file && <p className="max-w-full break-all font-mono text-xs text-stone">{file.name}</p>}
        </div>
        {pending && <p role="status" className="mt-5 text-sm text-stone">Running the batch, the server may need up to a minute to wake up.</p>}
        {error && <div role="alert" className="mt-5 rounded-lg border border-cedar/40 bg-cedar/5 p-4 text-sm text-cedar"><p>{error}</p>{file && <Button variant="outline" className="mt-3" onClick={() => { void submit(file); }}>Try again</Button>}</div>}
      </div>
      {result && summary && <section className="mt-12 border-t border-border pt-8" aria-label="Batch results">
        <div className="flex flex-wrap items-start justify-between gap-6"><div><h2 className="font-display text-2xl">{summary.triaged} claims triaged</h2><p className="mt-3 text-sm text-stone">Policy versions: {result.policy_versions.join(", ")}</p><p className="mt-2 text-sm">Open claims to recheck: {summary.recheck}</p></div><Button variant="outline" onClick={download}><Download />Download results.csv</Button></div>
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">{summary.outcomes.map(([outcome, count]) => <div key={outcome} className="flex flex-wrap items-baseline gap-3"><dt className="break-all font-mono text-xs text-stone">{outcome}</dt><dd className="font-display text-xl">{count}</dd></div>)}</dl>
        <div className="mt-8 overflow-x-auto rounded-lg border border-border" tabIndex={0} role="region" aria-label="Claim results table"><table className="w-full border-collapse text-left text-sm"><thead className="bg-mist"><tr>{result.columns.map((column, index) => <th key={`${index}-${column}`} scope="col" className="whitespace-nowrap border-b border-border px-4 py-3 font-mono text-xs font-medium text-stone">{column}</th>)}</tr></thead><tbody>{result.results.map((row, index) => <tr key={index} className="border-b border-border last:border-0">{result.columns.map((column, columnIndex) => <td key={`${columnIndex}-${column}`} className={`px-4 py-4 align-top ${column === "explanation" ? "min-w-72 max-w-lg break-words" : "whitespace-nowrap font-mono text-xs"}`}><ResultCell column={column} value={row[column]} /></td>)}</tr>)}</tbody></table></div>
      </section>}
    </main>
  </div>;
}