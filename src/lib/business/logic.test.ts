import { describe, expect, it } from 'vitest';
import fixture from './fixture.json';
import { calculateBusiness, DEFAULT_ASSUMPTIONS, impactVerdict, isNewDraft, publishedPreview, share, csv } from './logic';
import type { BusinessClaim, Impact, Quality } from './types';
import { POLICY_V1, toDraft, withLimit } from '@/lib/policy/mock';
const claims = fixture.claims.claims as BusinessClaim[];
const quality = fixture.quality as Quality;
const impact = fixture.impact as Impact;
describe('Business reporting', () => {
  it('requires an edited draft before simulating', () => { const d = toDraft(POLICY_V1); expect(isNewDraft(d, toDraft(POLICY_V1))).toBe(false); expect(isNewDraft(withLimit(d, 1200), d)).toBe(true); });
  it('reports six published changes', () => { expect(publishedPreview(impact, claims).rows.filter(r => r.changed)).toHaveLength(6); });
  it('protects two closed decisions', () => { const closed = publishedPreview(impact, claims).rows.filter(r => r.retained); expect(closed).toHaveLength(2); expect(closed.every(r => r.from === r.to && !r.changed)).toBe(true); });
  it('states when a move ends in routine', () => { expect(impactVerdict({ ...impact, moves: { 'human_review -> routine_processing': 1 } })).toContain('Some claims moved to routine.'); expect(impactVerdict(impact)).toContain('Nothing moved to routine.'); });
  it('uses measured routine/open shares', () => { expect(share(claims, 'before')).toBe(8 / 24); expect(share(claims, 'now')).toBe(3 / 24); });
  it('preserves the mentor assumptions', () => { expect(DEFAULT_ASSUMPTIONS).toMatchObject({ claims: 200000, simpleMinutes: 2.5, escalationMinutes: 9, salary: 40000, days: 220, hours: 8, overhead: 1.3 }); });
  it('does not invent results for unknown costs or missing quality labels', () => { const r = calculateBusiness(DEFAULT_ASSUMPTIONS, 3 / 24, quality); expect(r.net).toBeNull(); expect(r.payback).toBeNull(); expect(r.errorCosts['v2']).toBeNull(); expect(r.changeCanoe).toBeNull(); });
  it('updates benefit and payback with entered costs', () => { const a = { ...DEFAULT_ASSUMPTIONS, annualRun: 10000, implementation: 20000 }; const r = calculateBusiness(a, 3 / 24, quality); expect(r.hourly).toBeCloseTo(22.7272727); expect(r.today).toBeCloseTo(806344.6970); expect(r.canoe).toBeCloseTo(775568.1818); expect(r.net).toBeCloseTo(20776.5152); expect(r.payback).toBeCloseTo(11.5515, 3); });
  it('escapes CSV values and spreadsheet formulas', () => { expect(csv([['=SUM(1)', 'a"b', 12]])).toBe('"\'=SUM(1)","a""b","12"'); });
});