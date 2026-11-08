import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReviewApi } from "@/lib/review/api";
import { getReminders, DAY, SIMULATED } from "@/lib/customer/reminders";
import { useCustomerClock } from "@/lib/customer/clock";
import { Button } from "@/components/ui/button";
export function ReviewReminders({ createdAt }: { createdAt: string }) {
  const { now } = useCustomerClock();
  const [paused, setPaused] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [resumedOffset, setResumedOffset] = useState(0);
  const effectiveNow = paused ?? now - resumedOffset;
  const r = getReminders(createdAt, effectiveNow + skipped);
  const nextDays = r.nextAt ? Math.max(0, Math.ceil((Date.parse(r.nextAt) - effectiveNow - skipped) / DAY)) : 0;
  return <div className="mt-4 border-t border-stone/20 pt-3">
    <ol className="grid grid-cols-4 gap-1 font-mono text-[9px]">{["Request", "Reminder", "Final + SMS", "Handover"].map((s, i) => <li key={s} className={i < r.stage ? "text-cedar" : "text-stone"}><span className="mb-1 block h-px w-3 bg-current" />{s}</li>)}</ol>
    <p className="mt-3 text-xs">{paused ? "Reminders paused" : r.overdue ? "Handover due - reviewer calls" : `Stage ${r.stage} of 3 · next ${r.stage === 3 ? "handover" : "reminder"} in ${nextDays} days (${new Date(r.nextAt ?? createdAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })})`}</p>
    <div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!!paused || r.overdue} onClick={() => { const next = r.nextAt; if (next) setSkipped((s) => s + Math.max(0, Date.parse(next) - effectiveNow - s)); }}>Send now</Button><Button variant="ghost" size="sm" onClick={() => { if (paused) { setResumedOffset((s) => s + now - resumedOffset - paused); setPaused(null); } else setPaused(effectiveNow); }}>{paused ? "Resume reminders" : "Pause reminders"}</Button></div>
    <p className="mt-2 text-[10px] text-stone">{SIMULATED} Send and pause affect this panel only.</p>
  </div>;
}
export function QueueReminder({ caseId }: { caseId: string }) {
  const { now } = useCustomerClock();
  const { data } = useQuery({ queryKey: ["review", "claim", caseId], queryFn: () => getReviewApi().getClaim(caseId), staleTime: 10000 });
  const req = data?.info_requests.filter((r) => r.status === "open").at(-1);
  if (!req) return null;
  const r = getReminders(req.created_at, now);
  const days = r.nextAt ? Math.max(0, Math.ceil((Date.parse(r.nextAt) - now) / DAY)) : 0;
  return <span className="font-mono text-[10px] lowercase text-stone underline decoration-stone/35 underline-offset-2">{r.overdue ? "handover due" : `reminder ${r.stage} · in ${days}d`} · simulated</span>;
}