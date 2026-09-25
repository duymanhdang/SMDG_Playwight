import { describe, it, expect } from 'vitest';
import { computeOverview, quarantineSkippedCountsFromRuns, computeDeltas, computeRunStats, computeRunStatusTrend, computeSuiteHealthTrend } from '../report-aggregator.js';

describe('report-aggregator.computeOverview (Report Center, v1.1)', () => {
  it('returns clean zeros/nulls for an empty range instead of crashing', () => {
    const o = computeOverview({ runs: [], testRows: [], quarantineSkippedCounts: [] });
    expect(o.totalRuns).toBe(0);
    expect(o.totalExecutions).toBe(0);
    expect(o.passRate).toBeNull();
    expect(o.failRate).toBeNull();
    expect(o.avgDurationMs).toBe(0);
    expect(o.suiteBreakdown).toEqual([]);
    expect(o.timeSeries).toEqual([]);
  });

  it('computes overall pass/fail/flaky/skipped counts and rates', () => {
    const testRows = [
      { status: 'passed', suiteName: 'S1', startTime: 1000 },
      { status: 'passed', suiteName: 'S1', startTime: 1000 },
      { status: 'failed', suiteName: 'S1', startTime: 1000 },
      { status: 'flaky',  suiteName: 'S1', startTime: 1000 },
      { status: 'skipped', suiteName: 'S1', startTime: 1000 },
    ];
    const o = computeOverview({ runs: [], testRows, quarantineSkippedCounts: [] });
    expect(o.totalExecutions).toBe(5);
    expect(o.passed).toBe(2);
    expect(o.failed).toBe(1);
    expect(o.flaky).toBe(1);
    expect(o.skipped).toBe(1);
    expect(o.passRate).toBe(40);
    expect(o.failRate).toBe(20);
  });

  it('sums quarantined-skip counts across runs and computes a rate against executions', () => {
    const testRows = [{ status: 'passed', suiteName: 'S1', startTime: 1 }];
    const quarantineSkippedCounts = [{ startTime: 1, count: 2 }, { startTime: 2, count: 3 }];
    const o = computeOverview({ runs: [], testRows, quarantineSkippedCounts });
    expect(o.quarantinedSkip).toBe(5);
    expect(o.quarantinedSkipRate).toBe(500); // rate is against totalExecutions, not a bounded percentage
  });

  it('computes average run duration only from runs with both start and end times', () => {
    const runs = [
      { id: 'r1', suiteName: 'S1', startTime: 1000, endTime: 3000, totalTests: 1, passed: 1 },
      { id: 'r2', suiteName: 'S1', startTime: 1000, endTime: 5000, totalTests: 1, passed: 1 },
      { id: 'r3', suiteName: 'S1', startTime: 1000, endTime: null, totalTests: 1, passed: 1 }, // excluded
    ];
    const o = computeOverview({ runs, testRows: [], quarantineSkippedCounts: [] });
    expect(o.avgDurationMs).toBe(3000); // avg(2000, 4000)
  });

  it('builds a per-suite breakdown with pass rate and last-run time', () => {
    const runs = [
      { id: 'r1', suiteName: 'SUITE_A', startTime: 1000, endTime: 2000, totalTests: 10, passed: 8 },
      { id: 'r2', suiteName: 'SUITE_A', startTime: 5000, endTime: 6000, totalTests: 10, passed: 10 },
      { id: 'r3', suiteName: 'SUITE_B', startTime: 3000, endTime: 4000, totalTests: 4, passed: 2 },
    ];
    const o = computeOverview({ runs, testRows: [], quarantineSkippedCounts: [] });
    const a = o.suiteBreakdown.find((s) => s.suiteName === 'SUITE_A');
    const b = o.suiteBreakdown.find((s) => s.suiteName === 'SUITE_B');
    expect(a.runs).toBe(2);
    expect(a.passRate).toBe(90); // (8+10)/(10+10)
    expect(a.lastRunTime).toBe(5000);
    expect(b.passRate).toBe(50);
    // sorted by most-recently-run first
    expect(o.suiteBreakdown[0].suiteName).toBe('SUITE_A');
  });

  it('day-buckets the time series and computes a pass rate per day', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const day1 = Date.UTC(2026, 0, 1, 12); // noon UTC, well clear of TZ bucket edges
    const day2 = day1 + dayMs;
    const runs = [
      { id: 'r1', suiteName: 'S1', startTime: day1, endTime: day1 + 1000, totalTests: 2, passed: 1 },
      { id: 'r2', suiteName: 'S1', startTime: day2, endTime: day2 + 1000, totalTests: 2, passed: 2 },
    ];
    const testRows = [
      { status: 'passed', suiteName: 'S1', startTime: day1 },
      { status: 'failed', suiteName: 'S1', startTime: day1 },
      { status: 'passed', suiteName: 'S1', startTime: day2 },
      { status: 'passed', suiteName: 'S1', startTime: day2 },
    ];
    const o = computeOverview({ runs, testRows, quarantineSkippedCounts: [] });
    expect(o.timeSeries.length).toBe(2);
    expect(o.timeSeries[0].passRate).toBe(50);
    expect(o.timeSeries[0].runs).toBe(1);
    expect(o.timeSeries[1].passRate).toBe(100);
    // sorted ascending by date
    expect(o.timeSeries[0].date <= o.timeSeries[1].date).toBe(true);
  });
});

describe('report-aggregator.computeDeltas', () => {
  it('computes percent change vs the prior period', () => {
    const current = { totalRuns: 110, totalExecutions: 220, passRate: 90, failed: 5, flaky: 3, avgDurationMs: 4000 };
    const previous = { totalRuns: 100, totalExecutions: 200, passRate: 80, failed: 10, flaky: 5, avgDurationMs: 5000 };
    const d = computeDeltas(current, previous);
    expect(d.totalRuns).toBe(10);
    expect(d.passRate).toBe(13); // round((90-80)/80*100)
    expect(d.failed).toBe(-50);
    expect(d.avgDurationMs).toBe(-20);
  });

  it('returns null instead of Infinity when the prior period had no baseline', () => {
    const current = { totalRuns: 5, totalExecutions: 10, passRate: 100, failed: 0, flaky: 0, avgDurationMs: 1000 };
    const previous = { totalRuns: 0, totalExecutions: 0, passRate: null, failed: 0, flaky: 0, avgDurationMs: 0 };
    const d = computeDeltas(current, previous);
    expect(d.totalRuns).toBeNull();
    expect(d.passRate).toBeNull();
    expect(d.failed).toBeNull();
  });
});

describe('report-aggregator.computeRunStats (Execution Center KPIs)', () => {
  it('counts runs by their own lifecycle status, not test-level pass/fail', () => {
    const runs = [
      { status: 'done', startTime: 1000, endTime: 3000 },
      { status: 'done', startTime: 1000, endTime: 5000 },
      { status: 'failed', startTime: 1000, endTime: 2000 },
      { status: 'interrupted', startTime: 1000, endTime: 1500 },
      { status: 'running', startTime: 1000, endTime: null },
    ];
    const s = computeRunStats({ runs });
    expect(s.totalRuns).toBe(5);
    expect(s.passed).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.interrupted).toBe(1);
    expect(s.passedRate).toBe(40); // 2/5
    expect(s.avgDurationMs).toBe(1875); // avg(2000, 4000, 1000, 500) — running run excluded (no endTime)
  });

  it('returns clean zeros/nulls for no runs', () => {
    const s = computeRunStats({ runs: [] });
    expect(s.totalRuns).toBe(0);
    expect(s.passedRate).toBeNull();
    expect(s.avgDurationMs).toBe(0);
  });
});

describe('report-aggregator.computeRunStatusTrend', () => {
  it('day-buckets runs by terminal status', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const day1 = Date.UTC(2026, 0, 1, 12);
    const day2 = day1 + dayMs;
    const runs = [
      { status: 'done', startTime: day1 },
      { status: 'failed', startTime: day1 },
      { status: 'done', startTime: day2 },
      { status: 'interrupted', startTime: day2 },
    ];
    const trend = computeRunStatusTrend({ runs });
    expect(trend.length).toBe(2);
    expect(trend[0]).toMatchObject({ passed: 1, failed: 1, interrupted: 0 });
    expect(trend[1]).toMatchObject({ passed: 1, failed: 0, interrupted: 1 });
  });
});

describe('report-aggregator.computeSuiteHealthTrend', () => {
  it('day-buckets one suite\'s runs into a pass-rate sparkline', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const day1 = Date.UTC(2026, 0, 1, 12);
    const day2 = day1 + dayMs;
    const runs = [
      { startTime: day1, totalTests: 10, passed: 8 },
      { startTime: day2, totalTests: 10, passed: 10 },
    ];
    const trend = computeSuiteHealthTrend(runs);
    expect(trend.length).toBe(2);
    expect(trend[0].passRate).toBe(80);
    expect(trend[1].passRate).toBe(100);
  });

  it('returns an empty array for no runs', () => {
    expect(computeSuiteHealthTrend([])).toEqual([]);
    expect(computeSuiteHealthTrend(undefined)).toEqual([]);
  });
});

describe('report-aggregator.quarantineSkippedCountsFromRuns', () => {
  it('parses plan_json/planJson quarantineSkipped arrays into counts', () => {
    const runs = [
      { startTime: 1, planJson: JSON.stringify({ quarantineSkipped: [{ testKey: 'a' }, { testKey: 'b' }] }) },
      { started_at: 2, plan_json: JSON.stringify({ quarantineSkipped: [{ testKey: 'c' }] }) },
      { startTime: 3, planJson: null },
    ];
    const counts = quarantineSkippedCountsFromRuns(runs);
    expect(counts).toEqual([
      { startTime: 1, count: 2 },
      { startTime: 2, count: 1 },
      { startTime: 3, count: 0 },
    ]);
  });

  it('never throws on malformed plan_json — falls back to 0', () => {
    const runs = [{ startTime: 1, planJson: '{not valid json' }];
    expect(() => quarantineSkippedCountsFromRuns(runs)).not.toThrow();
    expect(quarantineSkippedCountsFromRuns(runs)[0].count).toBe(0);
  });

  it('handles an empty/undefined runs array', () => {
    expect(quarantineSkippedCountsFromRuns([])).toEqual([]);
    expect(quarantineSkippedCountsFromRuns(undefined)).toEqual([]);
  });
});
