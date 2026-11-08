import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecommendationLabel } from '@/components/canoe/RecommendationLabel';
import { importLabels } from '@/lib/business/api';
import type { Quality as QualityData } from '@/lib/business/types';
import { CaseLink, percent, Section, Stat } from './shared';
import { useDemoSession } from '@/components/demo-role/DemoSession';
import { canAct } from '@/lib/demo-role/logic';
const correctness = (v: boolean | null) => v == null ? 'Not labelled' : v ? 'Correct' : 'Wrong';
export function Quality({ quality: q, refresh }: { quality: QualityData; refresh: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null);
  const { session } = useDemoSession();
  const writable = canAct(session?.role, 'business');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const upload = writable ? <Button variant="outline" className="btn-quiet" disabled={busy} onClick={() => input.current?.click()}><Upload />{busy ? 'Importing…' : 'Import labels'}</Button> : null;
  const m = q.monitoring;
  return <div>
    <input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="Import labels CSV" onChange={async e => {
      const file = e.target.files?.[0]; if (!file || !writable) return; setBusy(true); setNotice('');
      try { await importLabels(await file.text()); await refresh(); setNotice('Labels imported. Quality refreshed.'); } catch (err) { setNotice(err instanceof Error ? err.message : 'Labels could not be imported.'); } finally { setBusy(false); e.target.value = ''; }
    }} />
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-display text-2xl">Quality on labelled cases</h2>{upload}</div>
    {notice && <p role="status" className="mt-3 text-sm text-cedar">{notice}</p>}
    <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="eyebrow"><tr><th className="pb-3">Version</th><th className="text-cedar">Wrong routine</th><th>Labelled</th><th>Correct</th><th>Accuracy</th><th>Unnecessary escalations</th></tr></thead><tbody>{Object.entries(q.versions).map(([v, x]) => <tr key={v} className="border-t border-stone/20"><td className="py-4 font-mono">{v}</td>{x.note ? <td colSpan={5}><div className="flex flex-wrap items-center justify-between gap-3 text-stone">{x.note}{upload}</div></td> : <><td className="font-display text-2xl text-cedar">{x.incorrect_routine ?? '-'}</td><td>{x.labelled_cases ?? x.n ?? '-'}</td><td className="font-display text-xl">{x.correct ?? '-'} / {x.n ?? x.labelled_cases ?? '-'}</td><td>{percent(x.accuracy)}</td><td>{x.unnecessary_human_review ?? '-'}</td></>}</tr>)}</tbody></table></div>
    <Section title={`Changed labelled cases · ${q.changed_cases.count}`}>
      <p className="mb-4 font-mono text-xs text-stone">{q.changed_cases.from_version} → {q.changed_cases.to_version} · {q.changed_cases.labelled} labelled · {q.changed_cases.correct_after} correct after · {q.changed_cases.wrong_after} wrong after</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="eyebrow"><tr><th className="pb-3">Case</th><th>Recommendation</th><th>Before correctness</th><th>After correctness</th><th>Rule before → after</th></tr></thead><tbody>{q.changed_cases.cases.map(c => <tr key={c.case_id} className="border-t border-stone/20"><td className="py-3"><CaseLink id={c.case_id} /></td><td><RecommendationLabel recommendation={c.from} /> → <RecommendationLabel recommendation={c.to} /></td><td>{correctness(c.correct_before)}</td><td>{correctness(c.correct_after)}</td><td className="font-mono text-xs text-stone">{c.rule_before} → {c.rule_after}</td></tr>)}</tbody></table></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><p><span className="eyebrow text-cedar">Regressions</span><span className="mt-1 block text-sm">{q.changed_cases.regressions.join(', ') || 'None recorded.'}</span></p><p><span className="eyebrow">Fixes</span><span className="mt-1 block text-sm">{q.changed_cases.fixed.join(', ') || 'None recorded.'}</span></p></div>
    </Section>
    {Object.entries(q.versions).some(([, x]) => x.failures?.length) && <Section title="Failures">{Object.entries(q.versions).map(([v, x]) => x.failures?.map((f, n) => <p key={`${v}-${n}`} className="border-b border-stone/20 py-3 font-mono text-xs text-cedar">{v} · {typeof f === 'string' ? f : JSON.stringify(f)}</p>))}</Section>}
    <Section title="Blank & unreadable inputs"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="eyebrow"><tr><th className="pb-3">Case</th><th>Absent fields</th><th>Unreadable fields</th><th>What the system did</th></tr></thead><tbody>{q.blank_fields.map(c => <tr key={c.case_id} className="border-t border-stone/20"><td className="py-3"><CaseLink id={c.case_id} /></td><td className="font-mono text-xs">{c.absent_fields.join(', ') || '-'}</td><td className="font-mono text-xs">{c.unreadable_fields.join(', ') || '-'}</td><td><RecommendationLabel recommendation={c.recommendation} /><span className="ml-2 font-mono text-xs text-stone">{c.rule}</span></td></tr>)}</tbody></table></div>{q.notes.map(n => <p key={n} className="mt-3 text-sm text-stone">{n}</p>)}</Section>
    <Section title="Monitoring after launch"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{([
      ['Claims with reviewer action', m.claims_with_reviewer_action], ['Overrides recorded', m.overrides_recorded], ['Confirmations', m.confirmations_recorded], ['Override rate', percent(m.override_rate)], ['Final outcomes', m.final_outcomes_recorded], ['Outcome agreement', m.outcome_agreement], ['Outcome disagreement', m.outcome_disagreement], ['Pending rechecks', m.pending_rechecks],
    ] as const).map(([label, value]) => <Stat key={label} label={label} value={value} />)}</div>
      <div className="mt-5"><p className="eyebrow">Overrides by rule</p>{Object.entries(m.overrides_by_rule).map(([rule, v]) => <p className="mt-2 font-mono text-xs" key={rule}>{rule} · {typeof v === 'number' ? v : JSON.stringify(v)}</p>)}{!Object.keys(m.overrides_by_rule).length && <p className="mt-2 text-sm text-stone">None recorded.</p>}<p className="mt-4 text-sm">Routine recommendations contradicted by a final outcome: {m.routine_recommendations_contradicted_by_outcome.length}</p>{m.routine_recommendations_contradicted_by_outcome.map((v, n) => <p key={n} className="mt-2 font-mono text-xs text-cedar">{typeof v === 'string' ? v : JSON.stringify(v)}</p>)}</div>
      <div className="mt-6 space-y-3 text-sm text-stone"><p>Sampling: review 5% of routine claims weekly.</p><p>Investigate an override rate above 10% by rule, or any routine claim contradicted by a final outcome.</p><p>A policy owner and a second approver approve each change. Preview is required on all open and labelled claims before release.</p><p>Late outcomes are recorded separately and compared. They never overwrite the original recommendation.</p></div>
    </Section>
  </div>;
}