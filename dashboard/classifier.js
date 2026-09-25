/**
 * classifier.js — Rule-based failure categorizer (no AI required)
 *
 * Inspired by yuantest-playwright's 6-category classification, implemented
 * with plain regex matching against the error message — fast, free, and
 * works offline. This also acts as the fallback when AI (Groq, Phase 3)
 * is disabled or the request fails.
 */

const RULES = [
  { category: 'timeout',   re: /timeout\s+\d+\s*ms\s+exceeded|timed out|exceeded while waiting/i },
  { category: 'selector',  re: /waiting for selector|strict mode violation|element(s)? not found|locator\.(click|fill|check|hover)|resolved to \d+ elements/i },
  { category: 'network',   re: /net::ERR|ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|net_error/i },
  { category: 'frame',     re: /frame was detached|navigation failed|execution context was destroyed|frame.*navigat/i },
  { category: 'auth',      re: /\b401\b|\b403\b|unauthorized|forbidden|login failed|session expired|not authenticated/i },
  { category: 'assertion', re: /expect\(.*received.*\)|toBe\(|toEqual\(|toHaveText|toHaveValue|toContainText|toHaveCount|assertion/i },
];

/**
 * @param {string} errorMessage - message/stack captured from a Playwright test result
 * @returns {string} one of: timeout | selector | network | frame | auth | assertion | other
 */
function categorize(errorMessage) {
  if (!errorMessage) return 'other';
  for (const rule of RULES) {
    if (rule.re.test(errorMessage)) return rule.category;
  }
  return 'other';
}

/**
 * Aggregates failed tests by category — used for the insight breakdown chart
 * and, later, to group tests before sending an AI cluster-diagnosis request (Phase 3).
 */
function breakdown(tests) {
  const counts = {};
  for (const t of tests) {
    if (t.status !== 'failed') continue;
    const cat = t.category || categorize(t.error);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = { categorize, breakdown };
