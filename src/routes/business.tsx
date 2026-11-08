import { createFileRoute, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { BusinessPage } from '@/components/business/BusinessPage';
import { BusinessShell } from '@/components/business/shared';
import { Button } from '@/components/ui/button';
import { businessQuery } from '@/lib/business/api';
interface BusinessSearch { tab?: 'impact' | 'quality' | 'case' | 'history'; filter?: 'all' | 'open' | 'closed'; q?: string }
export const Route = createFileRoute('/business')({
  validateSearch: (s: Record<string, unknown>): BusinessSearch => ({ tab: s['tab'] === 'quality' || s['tab'] === 'case' || s['tab'] === 'history' ? s['tab'] : 'impact', filter: s['filter'] === 'open' || s['filter'] === 'closed' ? s['filter'] : 'all', q: typeof s['q'] === 'string' ? s['q'] : '' }),
  loader: async ({ context }) => { await context.queryClient.ensureQueryData(businessQuery); },
  head: () => ({ meta: [{ title: 'Business - Canoe' }, { name: 'description', content: 'Published policy impact, measured quality and the Canoe business case.' }, { property: 'og:title', content: 'Business - Canoe' }, { property: 'og:description', content: 'See what a policy change did, measure quality and model its business value.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex' }] }),
  component: BusinessPage,
  pendingComponent: () => <BusinessShell><p className="mt-10 font-mono text-xs text-stone">Loading Business…</p></BusinessShell>,
  errorComponent: BusinessError,
  notFoundComponent: () => <BusinessShell><p className="mt-10">Business data not found.</p></BusinessShell>,
});
function BusinessError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return <BusinessShell><p role="alert" className="mt-10 text-stone">{error instanceof Error ? error.message : 'Business could not be loaded.'}</p><Button variant="outline" className="btn-quiet mt-4" onClick={() => router.invalidate()}>Retry</Button></BusinessShell>;
}