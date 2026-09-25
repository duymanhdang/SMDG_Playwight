/**
 * readiness.js — Release Readiness / Go-No-Go (v1.4.0, item 1) and
 * Requirement-Risk (v1.4.0, item 2) pure aggregation logic.
 *
 * Kept separate from server.js so it's unit-testable without booting
 * Express/SQLite (same pattern as coverage-matrix.js / report-aggregator.js).
 * This module invents NO new tracked data — it only combines numbers already
 * produced by report-aggregator.js (pass rate), quarantine-store.js (expiry),
 * and coverage-matrix.js (per-business-process buckets).
 */

'use strict';

const VERDICT_RANK = { PASS: 0, WARN: 1, FAIL: 2 };

/** Worst-of a list of verdicts (FAIL > WARN > PASS). */
function worstVerdict(verdicts) {
  return verdicts.reduce((worst, v) => (VERDICT_RANK[v] > VERDICT_RANK[worst] ? v : worst), 'PASS');
}

/**
 * Generic "higher is better" percentage check: PASS at/above threshold,
 * WARN within `warnBandPts` percentage points below it, FAIL further below.
 * `value === null` (no data yet) is reported as WARN, never FAIL — an empty
 * sandbox/new project shouldn't read as "not ready to ship", just "unknown".
 */
function percentVerdict(value, threshold, warnBandPts) {
  const band = warnBandPts == null ? 10 : warnBandPts;
  if (value === null || value === undefined) return 'WARN';
  if (value >= threshold) return 'PASS';
  if (value >= threshold - band) return 'WARN';
  return 'FAIL';
}

/**
 * Quarantine check: any past-due (already expired but not yet auto-released —
 * shouldn't normally happen since server.js auto-releases daily, but the
 * check must be defensive) entry is FAIL; near-expiry-only is WARN; none is PASS.
 * @param {Array<{daysRemaining:number}>} entries  quarantineStore.listActive() shape
 * @param {number} nearExpiryDays  entries at/under this many days remaining are "near-expiry"
 */
function quarantineVerdict(entries, nearExpiryDays) {
  const list = entries || [];
  const pastDue = list.filter((e) => e.daysRemaining < 0);
  const nearExpiry = list.filter((e) => e.daysRemaining >= 0 && e.daysRemaining <= nearExpiryDays);
  let verdict = 'PASS';
  if (pastDue.length) verdict = 'FAIL';
  else if (nearExpiry.length) verdict = 'WARN';
  return { verdict, pastDue: pastDue.length, nearExpiry: nearExpiry.length, total: list.length };
}

/**
 * Regression check: 0 regressions is PASS, a handful is WARN, a lot is FAIL.
 * Thresholds are deliberately simple counts, not rates — a single flipped
 * test post-merge is a normal WARN-worthy nudge, not a release blocker.
 */
function regressionVerdict(count, warnAt, failAt) {
  const n = count || 0;
  const w = warnAt == null ? 1 : warnAt;
  const f = failAt == null ? 3 : failAt;
  if (n >= f) return 'FAIL';
  if (n >= w) return 'WARN';
  return 'PASS';
}

/**
 * @param {object} params
 * @param {number|null} params.passRate  0-100 or null (report-aggregator.js computeOverview().passRate)
 * @param {number} params.passRateThreshold  default 95
 * @param {Array} params.quarantineEntries  quarantineStore.listActive() output
 * @param {number} params.nearExpiryDays  default 3
 * @param {number|null} params.coveragePct  0-100 or null — % of bps with >=1 automated&passing test
 * @param {number} params.coverageThreshold  default 80
 * @param {Array} params.regressions  list of {suiteName, title} tests that regressed
 * @param {number} [params.regressionWarnAt] default 1
 * @param {number} [params.regressionFailAt] default 3
 * @returns {{ overall: string, checks: Array<{id:string, label:string, verdict:string, detail:object}> }}
 */
function computeReadiness({
  passRate, passRateThreshold,
  quarantineEntries, nearExpiryDays,
  coveragePct, coverageThreshold,
  regressions, regressionWarnAt, regressionFailAt,
} = {}) {
  const passRateThresh = passRateThreshold == null ? 95 : passRateThreshold;
  const coverageThresh = coverageThreshold == null ? 80 : coverageThreshold;
  const nearExpiry = nearExpiryDays == null ? 3 : nearExpiryDays;

  const passVerdict = percentVerdict(passRate, passRateThresh);
  const q = quarantineVerdict(quarantineEntries, nearExpiry);
  const covVerdict = percentVerdict(coveragePct, coverageThresh);
  const regressionList = regressions || [];
  const regVerdict = regressionVerdict(regressionList.length, regressionWarnAt, regressionFailAt);

  const checks = [
    {
      id: 'passRate',
      label: 'Overall pass rate',
      verdict: passVerdict,
      detail: { passRate, threshold: passRateThresh },
    },
    {
      id: 'quarantine',
      label: 'Quarantine health',
      verdict: q.verdict,
      detail: { pastDue: q.pastDue, nearExpiry: q.nearExpiry, total: q.total, nearExpiryDays: nearExpiry },
    },
    {
      id: 'coverage',
      label: 'Business-process coverage',
      verdict: covVerdict,
      detail: { coveragePct, threshold: coverageThresh },
    },
    {
      id: 'regressions',
      label: 'Recent regressions',
      verdict: regVerdict,
      detail: { count: regressionList.length, tests: regressionList },
    },
  ];

  return { overall: worstVerdict(checks.map((c) => c.verdict)), checks };
}

// ── Requirement-Risk (v1.4.0 item 2) ────────────────────────────────────
// Simple, explainable weighted score per business process:
//   risk = failRate * 0.4 + coverageGap * 0.4 + quarantineRatio * 0.2
// where, for a given @bp: group (buildCoverageMatrix() shape):
//   total            = automatedPassing + automatedFailing + quarantined
//   failRate         = automatedFailing / total   (0 when total is 0 — no data, no evidence of risk)
//   coverageGap      = 1 - (automatedPassing / total)  (1 when total is 0 — zero passing coverage IS the risk signal)
//   quarantineRatio  = quarantined / total        (0 when total is 0)
// All three are 0..1 fractions; risk is reported as a 0-100 score. Fail rate
// and coverage gap are weighted equally and heaviest (0.4 each) because they
// most directly answer "is this business process actually working and
// tested?"; quarantine ratio is a smaller (0.2) signal because a quarantined
// test hides risk rather than proving it. Sorted descending — highest risk first.
const RISK_WEIGHTS = { failRate: 0.4, coverageGap: 0.4, quarantineRatio: 0.2 };

function computeRequirementRisk(groups) {
  return (groups || [])
    .map((g) => {
      const total = (g.automatedPassing || 0) + (g.automatedFailing || 0) + (g.quarantined || 0);
      const failRate = total > 0 ? g.automatedFailing / total : 0;
      const coverageGap = total > 0 ? 1 - g.automatedPassing / total : 1;
      const quarantineRatio = total > 0 ? g.quarantined / total : 0;
      const risk = failRate * RISK_WEIGHTS.failRate
                 + coverageGap * RISK_WEIGHTS.coverageGap
                 + quarantineRatio * RISK_WEIGHTS.quarantineRatio;
      return {
        businessProcess: g.businessProcess,
        riskScore: Math.round(risk * 100),
        failRatePct: Math.round(failRate * 100),
        coverageGapPct: Math.round(coverageGap * 100),
        quarantineRatioPct: Math.round(quarantineRatio * 100),
        automatedPassing: g.automatedPassing || 0,
        automatedFailing: g.automatedFailing || 0,
        quarantined: g.quarantined || 0,
        total,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

module.exports = {
  worstVerdict, percentVerdict, quarantineVerdict, regressionVerdict,
  computeReadiness, computeRequirementRisk, RISK_WEIGHTS,
};
