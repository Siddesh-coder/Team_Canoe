import { useState } from "react";
import { answer, applyDocument, emptyState } from "@/lib/intake/logic";
import type { IntakeState } from "@/lib/intake/types";
import { setDemoTime, useCustomerClock } from "@/lib/customer/clock";
import { useSiteTools } from "@/components/site-tools/SiteTools";

export interface Preset { name: string; state: IntakeState }

const story = (s: IntakeState) =>
  [
    ["what_happened", "motor_own_damage"],
    ["description", "I scraped the rear bumper on a bollard while parking outside the supermarket."],
    ["incident_date", "2026-11-02"],
    ["policy_number", "POL-1001"],
    ["other_party", "no"],
    ["injury", "no"],
  ].reduce((acc, pair) => { const [k, v] = pair; return k && v ? answer(acc, k, v) : acc; }, s);

function easy() {
  let s = story(emptyState());
  s = answer(s, "is_electric", "no");
  s = applyDocument(s, "quote", { amount: 750, itemized: true, sampleId: "quote-a" });
  s = applyDocument(s, "police_report", { sampleId: "report-c" });
  return s;
}
function incomplete() {
  let s = answer(story(emptyState()), "incident_date", "2026-11-04");
  s = answer(s, "is_electric", "no");
  s = applyDocument(s, "quote", { amount: 750, itemized: true, sampleId: "quote-a" });
  s = answer(s, "has_report", "no");
  return s;
}
function electric() {
  let s = story(emptyState());
  s = answer(s, "description", "A car reversed into my front left wing in a car park. It's an electric car.");
  s = answer(s, "is_electric", "yes");
  s = answer(s, "battery_affected", "yes");
  s = applyDocument(s, "quote", { amount: 1850, itemized: true, sampleId: "quote-b" });
  s = answer(s, "has_report", "no");
  return s;
}

export function DemoMenu({ onPick, clockOnly = false }: { onPick: (p: Preset | "reset") => void; clockOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const { demo } = useCustomerClock();
  const { t } = useSiteTools();
  const presets: [string, () => IntakeState][] = [["Easy claim", easy], ["Incomplete claim", incomplete], ["Electric car", electric]];
  return (
    <div className="fixed bottom-16 left-4 z-30 text-xs">
      {open && (
        <div className="card-calm mb-2 flex w-44 flex-col p-1.5">
          {!clockOnly && presets.map(([name, fn]) => (
            <button key={name} onClick={() => { onPick({ name, state: fn() }); setOpen(false); }} className="rounded-lg px-3 py-2 text-left hover:bg-paper">{name}</button>
          ))}
          <div className="my-1 h-px bg-stone/20" />
          <label className="flex items-center gap-2 px-3 py-2"><input type="checkbox" checked={demo} onChange={(e) => setDemoTime(e.target.checked)} />{t("Demo time")}</label>
          <p className="px-3 pb-2 text-stone">{t("1 day = 10 seconds")}</p>
          <p className="px-3 pb-2 text-stone">{t("Reminders are simulated in this prototype.")}</p>
          {!clockOnly && <button onClick={() => { onPick("reset"); setOpen(false); }} className="rounded-lg px-3 py-2 text-left text-stone hover:bg-paper">Reset</button>}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-stone hover:text-ink">Demo</button>
        <span className="h-3 w-px bg-stone/30" aria-hidden="true" />
        {!clockOnly && <button onClick={() => { if (window.confirm("Start over? This clears every answer and upload.")) { onPick("reset"); setOpen(false); } }} className="font-mono text-[11px] uppercase tracking-wider text-stone hover:text-cedar">Reset demo</button>}
      </div>
    </div>
  );
}
