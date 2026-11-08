import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCustomerClaim } from "@/lib/customer/customer.functions";
import { getCustomerStatus } from "@/lib/customer/status";
import { useCustomerClock } from "@/lib/customer/clock";
import { recentClaims, rememberClaim } from "@/lib/customer/recent";
import { CustomerReminders } from "./CustomerReminders";
import { Wordmark, Accent } from "@/components/canoe/brand";
import { PencilBackdrop } from "@/components/canoe/PencilBackdrop";
import { DemoMenu } from "@/components/canoe/DemoMenu";
import { useSiteTools } from "@/components/site-tools/SiteTools";
import { Button } from "@/components/ui/button";
import { CustomerTrack } from "./CustomerTrack";
export function TrackingPage({ caseId }: { caseId?: string }) {
  const { t, locale } = useSiteTools();
  const navigate = useNavigate();
  const [id, setId] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const { now, demo } = useCustomerClock();
  useEffect(() => { setRecent(recentClaims()); }, []);
  const claim = useQuery({ queryKey: ["customer", caseId], queryFn: () => { if (!caseId) throw new Error("Claim number required"); return getCustomerClaim({ data: { caseId } }); }, enabled: !!caseId, retry: false, refetchInterval: (q) => q.state.data?.case_status === "closed" ? false : 10000 });
  useEffect(() => { if (claim.data) rememberClaim(claim.data.case_id); }, [claim.data]);
  const status = claim.data ? getCustomerStatus(claim.data, now) : null;
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="relative isolate min-h-screen">
    <PencilBackdrop /><header className="mx-auto max-w-6xl px-5 pt-6 md:px-8"><Wordmark /></header>
    <main className="mx-auto max-w-6xl px-5 pb-32 pt-12 md:px-8"><section className="max-w-[620px]">
      <p className="eyebrow mb-5">{t("Your claim")}</p>
      {!caseId ? <>
        <h1 className="question-title">{t("Track your")} <Accent>{t("claim")}</Accent>.</h1>
        <form className="mt-8 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (/^(CLM-\d{4,8}|DEV-\d{3}|PRA-\d{3}|FORM-\d{4,8})$/.test(id.trim().toUpperCase())) navigate({ to: "/track/$caseId", params: { caseId: id.trim().toUpperCase() } }); }}>
          <label className="min-w-0 flex-1 text-sm">{t("Claim number")}<input className="field-input mt-2 w-full px-4 py-3 font-mono" aria-label={t("Claim number")} placeholder="CLM-0012" required maxLength={16} pattern="(CLM|DEV|PRA|FORM)-[0-9]+" value={id} onChange={(e) => setId(e.target.value.toUpperCase())} /></label>
          <Button type="submit">{t("Track your claim")}</Button>
        </form>
        {recent.length > 0 && <div className="mt-10"><h2 className="font-display text-xl">{t("Your recent claims")}</h2><ul className="mt-3 divide-y divide-stone/20">{recent.map((id) => <li key={id}><Link to="/track/$caseId" params={{ caseId: id }} className="block py-3 font-mono text-sm underline underline-offset-4">{id} →</Link></li>)}</ul></div>}
      </> : claim.isError ? <div role="alert"><h1 className="question-title">{t("We can't find that claim number. Check your confirmation email.")}</h1><p className="mt-4 text-stone">{t(claim.error.message)}</p><div className="mt-5 flex gap-3"><Button variant="outline" onClick={() => claim.refetch()}>{t("Try again")}</Button><Button asChild variant="link"><Link to="/track">{t("Claim number")}</Link></Button></div></div> : !status ? <p role="status">{t("Checking your claim…")}</p> : <>
        <p className="font-mono text-xl">{status.caseId}</p>
        <CustomerTrack station={status.station} needInfo={status.kind === "need_info"} />
        <h1 className="question-title">{t(status.headline)}</h1>
        <h2 className="eyebrow mb-2 mt-8">{t("What happens next")}</h2><p className="text-stone">{t(status.next)}</p>
        {status.needInfo && <div className="card-calm mt-6 space-y-3 p-5">
          <p>{t("We need:")} {status.needInfo.labels.map(t).join(" · ")}</p>
          <CustomerReminders createdAt={claim.data?.info_requests.filter((r) => r.status === "open").at(-1)?.created_at ?? claim.data?.created_at ?? ""} />
          <Button asChild><Link to="/continue/$caseId" params={{ caseId: status.caseId }} search={{ missing: undefined }}>{t("Add it now")}</Link></Button>
        </div>}
        <ol className="mt-8 border-l border-stone/30 bg-paper/95 py-3 pl-5">{status.events.map((e, i) => <li key={`${e.at}-${i}`} className="relative pb-4"><span className="absolute -left-6 top-2 h-px w-2 bg-stone" /><p className="text-sm">{e.text.endsWith(" · SMS") ? <>{t(e.text.slice(0, -6))} · SMS</> : t(e.text)}</p><p className="font-mono text-[10px] text-stone">{date(e.at)}</p></li>)}</ol>
      </>}
      {demo && <p className="mt-6 font-mono text-xs text-cedar">{t("Demo time")} · {t("1 day = 10 seconds")}</p>}
    </section></main><DemoMenu onPick={() => { navigate({ to: "/claim" }); }} clockOnly />
  </div>;
}