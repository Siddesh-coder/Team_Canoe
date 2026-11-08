import { useCustomerClock } from "@/lib/customer/clock";
import { getReminders, SIMULATED } from "@/lib/customer/reminders";
import { useSiteTools } from "@/components/site-tools/SiteTools";

export function CustomerReminders({ createdAt }: { createdAt: string }) {
  const { now } = useCustomerClock();
  const { t, locale } = useSiteTools();
  const r = getReminders(createdAt, now);
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return <div className="space-y-2 text-sm text-stone" aria-live="polite">
    <p>{t("Reminder")} {Math.min(r.stage, 3)} {t("of 3 sent")} {date(r.sentAt.at(-1) ?? createdAt)}{r.stage >= 3 && " · SMS"}{r.nextAt && <> · {t("next on")} {date(r.nextAt)}</>}</p>
    {r.overdue && <p>{t("A reviewer call is due (simulated).")}</p>}
    <p className="text-xs">{t(SIMULATED)}</p>
  </div>;
}