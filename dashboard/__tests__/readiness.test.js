import { describe, it, expect } from 'vitest';
import {
  worstVerdict, percentVerdict, quarantineVerdict, regressionVerdict,
  computeReadiness, computeRequirementRisk,
} from '../readiness.js';

describe('worstVerdict', () => {
  it('returns PASS when all PASS', () => {
    expect(worstVerdict(['PASS', 'PASS'])).toBe('PASS');
  });
  it('returns WARN when the worst is WARN', () => {
    expect(worstVerdict(['PASS', 'WARN'])).toBe('WARN');
  });
  it('returns FAIL when any is FAIL', () => {
    expect(worstVerdict(['PASS', 'WARN', 'FAIL'])).toBe('FAIL');
  });
});

describe('percentVerdict', () => {
  it('PASS at or above threshold', () => {
    expect(percentVerdict(95, 95)).toBe('PASS');
    expect(percentVerdict(99, 95)).toBe('PASS');
  });
  it('WARN within the warn band below threshold', () => {
    expect(percentVerdict(90, 95)).toBe('WARN');
    expect(percentVerdict(85, 95, 10)).toBe('WARN');
  });
  it('FAIL further below the warn band', () => {
    expect(percentVerdict(70, 95)).toBe('FAIL');
  });
  it('WARN (not FAIL) when there is no data yet', () => {
    expect(percentVerdict(null, 95)).toBe('WARN');
    expect(percentVerdict(undefined, 80)).toBe('WARN');
  });
});

describe('quarantineVerdict', () => {
  it('PASS when no entries', () => {
    expect(quarantineVerdict([], 3).verdict).toBe('PASS');
  });
  it('WARN when only near-expiry entries', () => {
    const entries = [{ daysRemaining: 2 }, { daysRemaining: 10 }];
    const result = quarantineVerdict(entries, 3);
    expect(result.verdict).toBe('WARN');
    expect(result.nearExpiry).toBe(1);
  });
  it('FAIL when any entry is past-due', () => {
    const entries = [{ daysRemaining: -1 }, { daysRemaining: 10 }];
    const result = quarantineVerdict(entries, 3);
    expect(result.verdict).toBe('FAIL');
    expect(result.pastDue).toBe(1);
  });
});

describe('regressionVerdict', () => {
  it('PASS at zero', () => {
    expect(regressionVerdict(0)).toBe('PASS');
  });
  it('WARN at the warn threshold', () => {
    expect(regressionVerdict(1, 1, 3)).toBe('WARN');
    expect(regressionVerdict(2, 1, 3)).toBe('WARN');
  });
  it('FAIL at the fail threshold', () => {
    expect(regressionVerdict(3, 1, 3)).toBe('FAIL');
    expect(regressionVerdict(10, 1, 3)).toBe('FAIL');
  });
});

describe('computeReadiness', () => {
  it('overall PASS when every check passes', () => {
    const result = computeReadiness({
      passRate: 98, passRateThreshold: 95,
      quarantineEntries: [], nearExpiryDays: 3,
      coveragePct: 90, coverageThreshold: 80,
      regressions: [],
    });
    expect(result.overall).toBe('PASS');
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.verdict === 'PASS')).toBe(true);
  });

  it('overall FAIL when any single check fails, even if others pass', () => {
    const result = computeReadiness({
      passRate: 98, passRateThreshold: 95,
      quarantineEntries: [{ daysRemaining: -2 }], nearExpiryDays: 3,
      coveragePct: 90, coverageThreshold: 80,
      regressions: [],
    });
    expect(result.overall).toBe('FAIL');
    const q = result.checks.find((c) => c.id === 'quarantine');
    expect(q.verdict).toBe('FAIL');
  });

  it('overall WARN (not FAIL) on a single WARN-level check', () => {
    const result = computeReadiness({
      passRate: 90, passRateThreshold: 95, // within warn band
      quarantineEntries: [], nearExpiryDays: 3,
      coveragePct: 90, coverageThreshold: 80,
      regressions: [],
    });
    expect(result.overall).toBe('WARN');
  });

  it('regression check reflects the given regression list', () => {
    const result = computeReadiness({
      passRate: 100, passRateThreshold: 95,
      quarantineEntries: [], nearExpiryDays: 3,
      coveragePct: 100, coverageThreshold: 80,
      regressions: [{ suiteName: 'x', title: 'y' }, { suiteName: 'x', title: 'z' }, { suiteName: 'x', title: 'w' }],
    });
    const reg = result.checks.find((c) => c.id === 'regressions');
    expect(reg.verdict).toBe('FAIL');
    expect(reg.detail.count).toBe(3);
  });
});

describe('computeRequirementRisk', () => {
  it('sorts descending by risk score', () => {
    const groups = [
      { businessProcess: 'low-risk', automatedPassing: 10, automatedFailing: 0, quarantined: 0 },
      { businessProcess: 'high-risk', automatedPassing: 0, automatedFailing: 5, quarantined: 5 },
    ];
    const risk = computeRequirementRisk(groups);
    expect(risk[0].businessProcess).toBe('high-risk');
    expect(risk[1].businessProcess).toBe('low-risk');
    expect(risk[0].riskScore).toBeGreaterThan(risk[1].riskScore);
  });

  it('a fully-passing business process scores 0 risk', () => {
    const groups = [{ businessProcess: 'bp1', automatedPassing: 10, automatedFailing: 0, quarantined: 0 }];
    const risk = computeRequirementRisk(groups);
    expect(risk[0].riskScore).toBe(0);
  });

  it('an all-quarantined business process is riskier than an all-failing one is not silently hidden', () => {
    const groups = [{ businessProcess: 'bp1', automatedPassing: 0, automatedFailing: 0, quarantined: 10 }];
    const risk = computeRequirementRisk(groups);
    // coverageGap is 1 (no passing tests) weighted 0.4, quarantineRatio is 1 weighted 0.2 -> 60
    expect(risk[0].riskScore).toBe(60);
  });

  it('a business process with zero tracked tests reports max coverage gap, not a crash', () => {
    const groups = [{ businessProcess: 'bp-empty', automatedPassing: 0, automatedFailing: 0, quarantined: 0 }];
    const risk = computeRequirementRisk(groups);
    expect(risk[0].coverageGapPct).toBe(100);
    expect(risk[0].total).toBe(0);
  });
});
