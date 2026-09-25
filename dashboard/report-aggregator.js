/**
 * report-aggregator.js — Report Center (v1.1 flagship feature) pure
 * aggregation logic, kept separate from server.js so it's unit-testable
 * without booting Express/SQLite (same pattern as coverage-matrix.js).
 *
 * server.js runs the SQL (parameterized, scoped by ?days=/?suite=, matching
 * the existing /api/insights/* endpoints' convention) and hands the raw rows
 * to computeOverview() here, which does all the shaping/math.
 */

'use strict';

const { dayKey } = require('./day-bucket');

/**
 * @param {object} params
 * @param {Array<{id:string, suiteName:string, status:string, startTime:number,
 *   endTime:number, totalTests:number, passed:number, failed:number,
 *   flaky:number, skipped:number}>} params.runs - run-index-shaped rows in range
 * @param {Array<{status:string, suiteName:string, startTime:number}>} params.testRows
 *   one row per test EXECUTION (test_results joined to its run's started_at)
 * @param {Array<{startTime:number, count:number}>} [params.quarantineSkippedCounts]
 *   per-run count of tests skipped due to quarantine (from runs.plan_json)
 * @returns {object} shaped overview payload (see /api/reports/overview)
 */
function computeOverview({ runs, testRows, quarantineSkippedCounts } = {}) {
  runs = runs || [];
  testRows = testRows || [];
  quarantineSkippedCounts = quarantineSkippedCounts || [];

  const totalRuns = runs.length;
  const totalExecutions = testRows.length;

  const passed  = testRows.filter((t) => t.status === 'passed').length;
  const failed  = testRows.filter((t) => t.status === 'failed').length;
  const flaky   = testRows.filter((t) => t.status === 'flaky').length;
  const skipped = testRows.filter((t) => t.status === 'skipped').length;
  const quarantinedSkip = quarantineSkippedCounts.reduce((a, r) => a + (r.count || 0), 0);

  const rate = (n) => (totalExecutions > 0 ? Math.round((n / totalExecutions) * 100) : null);

  const durations = runs
    .filter((r) => r.endTime && r.startTime && r.endTime > r.startTime)
    .map((r) => r.endTime - r.startTime);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // ── Per-suite breakdown ──
  const bySuite = {};
  for (const r of runs) {
    const key = r.suiteName || '(unknown)';
    if (!bySuite[key]) bySuite[key] = { suiteName: key, runs: 0, totalTests: 0, passed: 0, lastRunTime: null };
    bySuite[key].runs += 1;
    bySuite[key].totalTests += (r.totalTests || 0);
    bySuite[key].passed += (r.passed || 0);
    if (!bySuite[key].lastRunTime || (r.startTime || 0) > bySuite[key].lastRunTime) {
      bySuite[key].lastRunTime = r.startTime || null;
    }
  }
  const suiteBreakdown = Object.values(bySuite)
    .map((s) => ({
      suiteName:   s.suiteName,
      runs:        s.runs,
      passRate:    s.totalTests > 0 ? Math.round((s.passed / s.totalTests) * 100) : null,
      lastRunTime: s.lastRunTime,
    }))
    .sort((a, b) => (b.lastRunTime || 0) - (a.lastRunTime || 0));

  // ── Day-bucketed time series (pass rate + run count) ──
  const byDay = {};
  for (const t of testRows) {
    if (t.startTime == null) continue;
    const day = dayKey(t.startTime);
    if (!byDay[day]) byDay[day] = { total: 0, passed: 0 };
    byDay[day].total += 1;
    if (t.status === 'passed') byDay[day].passed += 1;
  }
  const runsByDay = {};
  for (const r of runs) {
    if (r.startTime == null) continue;
    const day = dayKey(r.startTime);
    runsByDay[day] = (runsByDay[day] || 0) + 1;
  }
  const allDays = new Set([...Object.keys(byDay), ...Object.keys(runsByDay)]);
  const timeSeries = Array.from(allDays)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      date,
      passRate: byDay[date] && byDay[date].total > 0 ? Math.round((byDay[date].passed / byDay[date].total) * 100) : null,
      runs: runsByDay[date] || 0,
    }));

  return {
    totalRuns,
    totalExecutions,
    passed, failed, flaky, skipped, quarantinedSkip,
    passRate: rate(passed),
    failRate: rate(failed),
    flakyRate: rate(flaky),
    skippedRate: rate(skipped),
    quarantinedSkipRate: rate(quarantinedSkip),
    avgDurationMs,
    suiteBreakdown,
    timeSeries,
  };
}

/**
 * Extracts the {startTime, count} shape computeOverview() expects from raw
 * run rows carrying a plan_json/planJson column (quarantineSkipped: [...]).
 */
function quarantineSkippedCountsFromRuns(runs) {
  return (runs || []).map((r) => {
    let count = 0;
    const raw = r.planJson !== undefined ? r.planJson : r.plan_json;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        count = Array.isArray(parsed.quarantineSkipped) ? parsed.quarantineSkipped.length : 0;
      } catch (_) { count = 0; }
    }
    return { startTime: r.startTime != null ? r.startTime : r.started_at, count };
  });
}

// v1.9.0 — percent change of each headline KPI vs. the same-length prior
// period, for "vs last N days" pills on the KPI cards. null when the prior
// period has no baseline to compare against (avoids a misleading "+Infinity%").
// `keys` defaults to the Report Center overview's KPI set; Execution Center
// passes its own (run-level) key set — see computeRunStats() below.
const DELTA_KEYS = ['totalRuns', 'totalExecutions', 'passRate', 'failed', 'flaky', 'avgDurationMs'];
function computeDeltas(current, previous, keys = DELTA_KEYS) {
  const deltas = {};
  for (const key of keys) {
    const curVal = current[key];
    const prevVal = previous[key];
    deltas[key] = (prevVal === null || prevVal === undefined || prevVal === 0)
      ? null
      : Math.round(((curVal - prevVal) / prevVal) * 100);
  }
  return deltas;
}

/**
 * Execution Center KPI strip — run-level status counts (a run's own
 * lifecycle status: done/failed/interrupted), distinct from computeOverview()'s
 * test-execution-level pass/fail counts used by Report Center.
 * @param {object} params
 * @param {Array<{status:string, startTime:number, endTime:number}>} params.runs
 */
const RUN_STATS_DELTA_KEYS = ['totalRuns', 'passed', 'failed', 'interrupted', 'avgDurationMs'];
function computeRunStats({ runs } = {}) {
  runs = runs || [];
  const totalRuns = runs.length;
  const passed      = runs.filter((r) => r.status === 'done').length;
  const failed      = runs.filter((r) => r.status === 'failed').length;
  const interrupted = runs.filter((r) => r.status === 'interrupted').length;

  const rate = (n) => (totalRuns > 0 ? Math.round((n / totalRuns) * 100) : null);

  const durations = runs
    .filter((r) => r.endTime && r.startTime && r.endTime > r.startTime)
    .map((r) => r.endTime - r.startTime);
  const avgDurationMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return {
    totalRuns, passed, failed, interrupted,
    passedRate: rate(passed), failedRate: rate(failed), interruptedRate: rate(interrupted),
    avgDurationMs,
  };
}

/**
 * Day-bucketed run-status counts for the "Run Status Trend" stacked bar —
 * how many runs finished each day, split by their terminal status.
 */
function computeRunStatusTrend({ runs } = {}) {
  runs = runs || [];
  const byDay = {};
  for (const r of runs) {
    if (r.startTime == null) continue;
    const day = dayKey(r.startTime);
    if (!byDay[day]) byDay[day] = { date: day, passed: 0, failed: 0, interrupted: 0 };
    if (r.status === 'done') byDay[day].passed += 1;
    else if (r.status === 'failed') byDay[day].failed += 1;
    else if (r.status === 'interrupted') byDay[day].interrupted += 1;
  }
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * v1.11.0 — day-bucketed pass rate for ONE suite, used for the small
 * sparkline on Insights' Suite Health row. Run-level totals (totalTests/
 * passed, already on each index row) are enough for day granularity — no
 * need to join test_results for this.
 * @param {Array<{startTime:number, totalTests:number, passed:number}>} runsForSuite
 */
function computeSuiteHealthTrend(runsForSuite) {
  const byDay = {};
  for (const r of (runsForSuite || [])) {
    if (r.startTime == null) continue;
    const day = dayKey(r.startTime);
    if (!byDay[day]) byDay[day] = { total: 0, passed: 0 };
    byDay[day].total += (r.totalTests || 0);
    byDay[day].passed += (r.passed || 0);
  }
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, passRate: v.total > 0 ? Math.round((v.passed / v.total) * 100) : null }));
}

module.exports = {
  computeOverview, quarantineSkippedCountsFromRuns, computeDeltas,
  computeRunStats, computeRunStatusTrend, RUN_STATS_DELTA_KEYS,
  computeSuiteHealthTrend,
};
