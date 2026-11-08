import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { calculateBusiness, csv, DEFAULT_ASSUMPTIONS, share, type Assumptions } from '@/lib/business/logic';
import type { BusinessData } from '@/lib/business/types';
import { downloadCsv, money, percent } from './shared';
import { BusinessVisuals } from './BusinessVisuals';
const FIELDS: { key: keyof Assumptions; label: string; source: string; step?: string }[] = [
  { key: 'claims', label: 'Claims per year', source: 'Taktile mentor: 150–250k' },
  { key: 'simpleMinutes', label: 'Minutes per simple claim', source: 'Taktile mentor', step: '0.1' },
  { key: 'escalationMinutes', label: 'Minutes per escalation', source: 'Taktile mentor', step: '0.1' },
  { key: 'salary', label: 'Salary · EUR/year', source: 'Taktile mentor' },
  { key: 'days', label: 'Working days/year', source: 'Assumption' }, { key: 'hours', label: 'Hours/day', source: 'Assumption' },
  { key: 'overhead', label: 'Overhead factor', source: 'Mentor + assumption', step: '0.1' },
  { key: 'wrongRoutineCost', label: 'Cost of a wrong routine approval · EUR', source: 'Assumption - to be confirmed' },
  { key: 'unnecessaryCost', label: 'Cost of unnecessary escalation · EUR', source: 'Assumption - to be confirmed' },
  { key: 'implementation', label: 'Implementation cost · EUR', source: 'Assumption - to be confirmed' },
  { key: 'annualRun', label: 'Yearly run cost · EUR', source: 'Assumption - to be confirmed' },
  { key: 'changeWeeks', label: 'Policy change today · weeks', source: 'Assumption - to be confirmed', step: '0.1' },
  { key: 'changePeople', label: 'People per policy change', source: 'Assumption - to be confirmed' },
];
export function BusinessCase({ data }: { data: BusinessData }) {
  const [a, setA] = useState<Assumptions>({ ...DEFAULT_ASSUMPTIONS });
  const stp = share(data.claims, 'now');
  const measured = data.impact.policy_changes.at(-1)?.duration_minutes;
  const r = calculateBusiness(a, stp, data.quality, measured);
  const results = [
    { label: 'Annual triage cost today', value: r.today, formula: 'N × [s × simple min + (1−s) × escalation min] / 60 × loaded hourly' },
    { label: 'Annual triage cost with Canoe', value: r.canoe, formula: 'N × (1−s) × escalation min / 60 × loaded hourly; run cost separate' },
    { label: 'Net annual benefit', value: r.net, formula: 'Cost today − cost with Canoe − yearly run cost' },
    { label: 'Payback · months', value: r.payback, formula: 'Implementation / net annual benefit × 12', months: true },
    ...Object.entries(r.errorCosts).map(([v, value]) => ({ label: `Annual error cost · ${v}`, value, formula: 'N × [wrong routine rate × cost + unnecessary escalation rate × cost]' })),
    { label: 'Policy change cost today', value: r.changeToday, formula: 'Weeks × 5 days × hours/day × people × loaded hourly' },
    { label: 'Policy change cost with Canoe', value: r.changeCanoe, formula: 'Measured draft-to-live minutes / 60 × people × loaded hourly' },
  ];
  return <div><BusinessVisuals data={data} /><p className="text-sm text-stone">Assumptions marked 'to be confirmed' are placeholders.</p><div className="mt-5 grid gap-10 lg:grid-cols-2"><section><h2 className="font-display text-2xl">Assumptions</h2><div className="mt-4 divide-y divide-stone/20">{FIELDS.map(f => <label key={f.key} className="flex items-start justify-between gap-4 py-3"><span className="min-w-0 text-sm">{f.label}<span className="mt-1 block font-mono text-[10px] text-stone underline underline-offset-2">{f.source}</span></span><input aria-label={f.label} type="number" readOnly title="Read-only operations view" min="0" step={f.step ?? '1'} placeholder="-" className="field-input w-28 shrink-0 px-3 py-2 font-mono text-sm" value={a[f.key] ?? ''} onChange={e => { const n = e.target.value === '' ? null : Number(e.target.value); setA(old => ({ ...old, [f.key]: n === null && DEFAULT_ASSUMPTIONS[f.key] !== null ? 0 : n === null ? null : Math.max(0, n) })); }} /></label>)}</div><div className="mt-4 border-t border-stone/25 pt-4"><p className="eyebrow">Straight-through share · measured</p><p className="mt-2 font-display text-3xl">{percent(stp)}</p><p className="mt-2 font-mono text-xs text-stone">Routine / open claims · hourly salary {r.hourly == null ? '-' : `€${r.hourly.toFixed(1)}`} · loaded {money(r.loaded)}/h</p></div></section><section aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-2xl">Results</h2><Button variant="outline" className="btn-quiet" onClick={() => downloadCsv('canoe-business-case.csv', csv([['Type', 'Name', 'Value', 'Source / formula'], ...FIELDS.map(f => ['Assumption', f.label, a[f.key], f.source]), ['Measured', 'Straight-through share', stp, 'Routine/open'], ['Measured', 'Draft-to-live minutes', measured, 'Policy changes'], ...results.map(x => ['Result', x.label, x.value, x.formula])]))}><Download />Export CSV</Button></div><div className="mt-4 space-y-4">{results.map(x => <div key={x.label} className="card-calm p-5"><p className="eyebrow">{x.label}</p><p className="mt-2 font-display text-3xl">{x.months ? x.value == null ? '-' : x.value.toFixed(1) : money(x.value)}</p><p className="mt-3 font-mono text-[11px] leading-relaxed text-stone">{x.formula}</p>{x.value === null && <p className="mt-2 text-xs text-stone">Awaiting confirmed inputs or measured data.</p>}</div>)}</div></section></div></div>;
}