import { queryOptions } from '@tanstack/react-query';
import { getPolicyApi } from '@/lib/policy/api';
import { ApiError } from '@/lib/review/types';
import type { BusinessData, BusinessClaim, Impact, Quality, AuditEvent } from './types';
import type { PolicyDoc } from '@/lib/policy/types';

const base = import.meta.env['VITE_API_URL'] as string | undefined;
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = import.meta.env['VITE_API_TOKEN'] as string | undefined;
  let res: Response;
  try { res = await fetch(`${base?.replace(/\/$/, '')}${path}`, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } }); }
  catch { throw new ApiError("We can't reach the Business service.", 0); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Business service returned ${res.status}.`, res.status);
  return data as T;
}
export async function loadBusiness(): Promise<BusinessData> {
  if (!base) {
    const { default: fixture } = await import('./fixture.json');
    const { default: policy } = await import('./policy-fixture.json');
    return { impact: fixture.impact as Impact, quality: fixture.quality as Quality, claims: fixture.claims.claims as BusinessClaim[], audit: fixture.audit.events, policy: policy as PolicyDoc, mode: 'mock' };
  }
  const [impact, quality, claims, audit, policy] = await Promise.all([
    call<Impact>('/api/impact'), call<Quality>('/api/quality'), call<{ claims: BusinessClaim[] }>('/api/claims'),
    call<{ events: AuditEvent[] }>('/api/audit'), getPolicyApi().getPolicy(),
  ]);
  const enriched = await Promise.all(claims.claims.map(async c => {
    if (!impact.rechecks.some(r => r.case_id === c.case_id)) return c;
    const detail = await call<{ decisions: { policy_version: string; rule_id: string }[] }>(`/api/claims/${encodeURIComponent(c.case_id)}`);
    const old = detail.decisions.find(d => d.policy_version === (impact.rechecks.find(r => r.case_id === c.case_id)?.from_version ?? 'v1'));
    return old ? { ...c, rule_v1: old.rule_id } : c;
  }));
  return { impact, quality, claims: enriched, audit: audit.events, policy, mode: 'http' };
}
export const businessQuery = queryOptions({ queryKey: ['business'], queryFn: loadBusiness, staleTime: 0 });
export async function importLabels(text: string) {
  if (!base) throw new ApiError('Import labels needs the live engine.', 422);
  return call<unknown>('/api/labelled-import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
}