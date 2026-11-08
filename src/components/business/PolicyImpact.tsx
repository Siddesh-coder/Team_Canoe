import { useMemo, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecommendationLabel } from '@/components/canoe/RecommendationLabel';
import { LocksScene } from '@/components/policy/LocksScene';
import { toDraft } from '@/lib/policy/mock';
import { impactVerdict, publishedPreview, share } from '@/lib/business/logic';
import type { BusinessData } from '@/lib/business/types';
import { CaseLink, percent, Section, Stat, when } from './shared';

export function PolicyImpact({ data }: { data: BusinessData }) {
  const { impact: i, claims, policy } = data;
  const p = useMemo(() => publishedPreview(i, claims), [i, claims]);
  const [view, setView] = useState<'v1' | 'v2'>('v2');
  const [highlight, setHighlight] = useState<string | null>(null);
  const old = policy.versions.find(v => v.version === p.from_version);
  const current = policy.versions.find(v => v.version === p.to_version);
  return <div>
    <p className="font-display text-2xl" aria-live="polite">{impactVerdict(i)}</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Open claims re-decided" value={i.open_claims} /><Stat label="Changed & flagged for recheck" value={i.recheck_total} accent /><Stat label="Still waiting for a reviewer" value={i.recheck_pending} /><Stat label="Closed, untouched" value={<span className="inline-flex items-center gap-3">{i.closed_claims}<LockKeyhole className="size-6 text-stone" /></span>} /></div>
    <Section title={`Published change · ${p.from_version} → ${p.to_version}`}>
      <Button variant="outline" className="btn-quiet mb-4 font-mono text-xs" aria-pressed={view === 'v1'} onClick={() => setView(v => v === 'v1' ? 'v2' : 'v1')}>{p.from_version} ⇄ {p.to_version} · showing {view === 'v1' ? p.from_version : p.to_version}</Button>
      {old && current ? <div className="card-calm overflow-hidden p-3 md:p-5"><LocksScene draft={toDraft(current)} live={toDraft(old)} preview={p} stale={false} runId={1} skipToken={1} glide={0} showGhosts={true} highlight={highlight} liveLimit={null} escalations={0} onLimit={() => {}} view={view} published /></div> : <p className="text-stone">No earlier published version to compare.</p>}
      <div className="mt-5 flex flex-wrap gap-3">{Object.entries(i.moves).map(([move, n]) => { const [a, b] = move.split(/\s*->\s*/); return <Button key={move} variant="ghost" aria-pressed={highlight === move} onClick={() => setHighlight(h => h === move ? null : move)} className={highlight === move ? 'border-b border-cedar' : ''}><RecommendationLabel recommendation={a ?? ''} /> → <RecommendationLabel recommendation={b ?? ''} /><span className="font-mono">{n}</span></Button>; })}</div>
    </Section>
    <Section title="Changed claims"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="eyebrow"><tr><th className="pb-3">Case</th><th>From → to</th><th>Versions</th><th>Recheck status</th></tr></thead><tbody>{i.rechecks.map((r, n) => <tr key={`${r.case_id}-${n}`} className="border-t border-stone/20"><td className="py-3"><CaseLink id={r.case_id} /></td><td><RecommendationLabel recommendation={r.from_recommendation} /> → <RecommendationLabel recommendation={r.to_recommendation} /></td><td className="font-mono text-xs">{r.from_version} → {r.to_version}</td><td className="font-mono text-xs text-stone">{r.status}</td></tr>)}</tbody></table></div></Section>
    {!!i.policy_changes.length && <Section title="Time from draft to live"><div className="grid gap-4 md:grid-cols-2">{i.policy_changes.map((c, n) => <div className="card-calm p-5" key={`${c.version}-${n}`}><p className="eyebrow">{c.version}</p><p className="mt-2 font-display text-4xl">{c.duration_minutes} min</p><p className="mt-3 text-sm text-stone">First preview {when(c.first_preview_at)} · Published {when(c.published_at)} · {c.open_claims_rechecked} claims rechecked</p></div>)}</div><p className="mt-3 text-sm text-stone">Large insurers report weeks to months for a change like this.</p></Section>}
    <Section title="Straight-through share of open claims"><div className="grid gap-4 sm:grid-cols-2"><Stat label={p.from_version} value={percent(share(claims, 'before'))} /><Stat label="Now" value={percent(share(claims, 'now'))} /></div><p className="mt-3 font-mono text-xs text-stone">Routine recommendations / open claims</p></Section>
  </div>;
}