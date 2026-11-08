import { getRouteApi } from '@tanstack/react-router';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Accent } from '@/components/canoe/brand';
import { Button } from '@/components/ui/button';
import { businessQuery } from '@/lib/business/api';
import { BusinessShell } from './shared';
import { PolicyImpact } from './PolicyImpact';
import { Quality } from './Quality';
import { BusinessCase } from './BusinessCase';
import { History } from './History';
const route = getRouteApi('/business');
const tabs = [['impact', 'Policy impact'], ['quality', 'Quality'], ['case', 'Business case'], ['history', 'History']] as const;
export function BusinessPage() {
  const { data } = useSuspenseQuery(businessQuery);
  const qc = useQueryClient();
  const { tab = 'impact', filter = 'all', q = '' } = route.useSearch();
  const navigate = route.useNavigate();
  return <BusinessShell><div className="mt-8"><p className="eyebrow">Business</p><h1 className="mt-2 font-display text-4xl md:text-5xl">What the <Accent>change</Accent> did.</h1>{data.mode === 'mock' && <p className="mt-3 font-mono text-xs text-stone">Demo reporting snapshot · live API unset</p>}</div><div role="tablist" aria-label="Business views" className="mt-8 flex flex-wrap gap-3 border-b border-stone/25">{tabs.map(([key, label]) => <Button key={key} variant="ghost" role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab === key} className={`rounded-none border-b-2 px-2 font-mono text-[11px] uppercase ${tab === key ? 'border-cedar text-ink' : 'border-transparent text-stone'}`} onClick={() => navigate({ search: old => ({ ...old, tab: key }) })}>{label}</Button>)}</div><div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-8">{tab === 'impact' && <PolicyImpact data={data} />}{tab === 'quality' && <Quality quality={data.quality} refresh={() => qc.invalidateQueries({ queryKey: ['business'] })} />}{tab === 'case' && <BusinessCase data={data} />}{tab === 'history' && <History data={data} filter={filter} search={q} setFilter={v => navigate({ search: old => ({ ...old, filter: v }) })} setSearch={v => navigate({ search: old => ({ ...old, q: v }) })} />}</div></BusinessShell>;
}