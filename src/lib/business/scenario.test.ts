import { describe, expect, it } from 'vitest';
import { calculateScenario, policyDistribution, TURNAROUND_SCENARIO } from './logic';
import fixture from './fixture.json';
import type { BusinessClaim, Impact } from './types';
describe('Business Case scenario', () => {
  it('uses the supplied per-minute salary without overhead', () => expect(calculateScenario(200000).perMin).toBeCloseTo(40000 / (220 * 8 * 60), 12));
  it('uses the specified today mix and handling minutes', () => expect(calculateScenario(200000).today).toBeCloseTo(200000 * ((15 / 26) * 3 + (11 / 26) * 9) * 40000 / (220 * 8 * 60)));
  it('uses the specified Canoe sample, review and escalation minutes', () => expect(calculateScenario(200000).canoeHandling).toBeCloseTo(200000 * ((10 / 26) * 0.05 * 3 + (5 / 26) + (11 / 26) * 6) * 40000 / (220 * 8 * 60)));
  it('applies the platform fee floor of 30000', () => expect(calculateScenario(100000).fee).toBe(30000));
  it('applies the 0.25 per-claim fee above the floor', () => expect(calculateScenario(200000).fee).toBe(50000));
  it('subtracts both handling and fee from annual savings', () => { const s = calculateScenario(200000); expect(s.net).toBeCloseTo(s.today - s.canoeHandling - 50000); });
  it('uses 25000 integration and positive net for payback', () => { const s = calculateScenario(200000); expect(s.paybackMonths).toBeCloseTo(25000 / (s.net / 12)); expect(calculateScenario(0).paybackMonths).toBeNull(); });
  it('declares the supplied 58/42 mix and 98:1 ratio as scenario values', () => expect(calculateScenario(200000)).toMatchObject({ simpleShare: .58, escalatedShare: .42, riskRatio: 98 }));
  it('preserves the supplied turnaround ranges', () => expect(TURNAROUND_SCENARIO.map(v => v.range)).toEqual(['60–90 days', '15–20 days', '1–2 days', '1–10 minutes']));
  it('counts engine recommendations with closed outcomes retained', () => { const d = policyDistribution(fixture.impact as Impact, fixture.claims.claims as BusinessClaim[]); expect(d.before).toEqual([10, 11, 5]); expect(d.after).toEqual([5, 17, 4]); expect(d.closed).toBe(2); expect(d.extraReview).toBe(6); });
});