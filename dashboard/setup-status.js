/**
 * setup-status.js — Onboarding Wizard + Tag Adoption % pure logic (v1.7.0).
 *
 * Kept separate from server.js so it's unit-testable without booting
 * Express/SQLite (same pattern as coverage-matrix.js / readiness.js).
 *
 * Two independent pieces of pure logic live here:
 *
 *  1. computeTagAdoptionPercent(specs) — "what fraction of discovered spec
 *     files have at least one test carrying a @bp: or @TC- tag", using the
 *     v1.6.0 AST scanner's per-test resolution (specTestTags), NOT the old
 *     file-level regex approximation. A spec counts as "adopted" the moment
 *     ANY test inside it has at least one businessProcess or testCaseId tag.
 *
 *  2. computeSetupStatus(flags) — the 6-step Setup Wizard checklist, given
 *     already-gathered boolean/numeric flags (server.js is responsible for
 *     gathering those from the real endpoints/checks; this function only
 *     decides pass/fail/skip per step so the derivation itself is testable
 *     without touching the filesystem, Playwright, or SQLite).
 */

'use strict';

/**
 * @param {Array<{testTags: Array<{businessProcesses?: string[], testCaseIds?: string[]}>}>} specs
 *   One entry per known spec file (same `specs` shape server.js already
 *   builds for GET /api/coverage), each carrying its per-test tag records.
 * @returns {{ totalSpecs: number, taggedSpecs: number, percent: number|null }}
 *   `percent` is null (not 0) when there are no specs at all — there is
 *   nothing to have "adopted" yet, which is a different state than "0% of
 *   many specs are tagged".
 */
function computeTagAdoptionPercent(specs) {
  const list = Array.isArray(specs) ? specs : [];
  const totalSpecs = list.length;
  if (totalSpecs === 0) return { totalSpecs: 0, taggedSpecs: 0, percent: null };

  let taggedSpecs = 0;
  for (const spec of list) {
    const testTags = Array.isArray(spec.testTags) ? spec.testTags : [];
    const hasAnyTag = testTags.some((t) =>
      (Array.isArray(t.businessProcesses) && t.businessProcesses.length > 0) ||
      (Array.isArray(t.testCaseIds) && t.testCaseIds.length > 0)
    );
    if (hasAnyTag) taggedSpecs += 1;
  }

  return {
    totalSpecs,
    taggedSpecs,
    percent: Math.round((taggedSpecs / totalSpecs) * 100),
  };
}

/**
 * @param {object} flags
 * @param {boolean} flags.playwrightCliPresent
 * @param {number}  flags.totalSuites
 * @param {number}  flags.totalSpecs
 * @param {boolean} flags.hubReporterAcked   settings.setupHubReporterAcked
 * @param {number|null} flags.tagAdoptionPercent
 * @param {boolean} flags.targetUrlConfigured
 * @param {boolean} flags.aiConfigured        settings.aiEnabled && a key is set
 * @returns {Array<{id:string, label:string, status:'ok'|'warn'|'todo', optional:boolean, detail:string}>}
 */
function computeSetupStatus(flags) {
  const f = flags || {};
  const steps = [];

  steps.push({
    id: 'playwright',
    label: 'Playwright resolvable',
    optional: false,
    status: f.playwrightCliPresent ? 'ok' : 'todo',
    detail: f.playwrightCliPresent
      ? 'Playwright CLI found.'
      : 'Playwright CLI not found — run "npm install" in the project root.',
  });

  steps.push({
    id: 'suites',
    label: 'Suites discovered',
    optional: false,
    status: (f.totalSuites || 0) > 0 ? 'ok' : 'todo',
    detail: (f.totalSuites || 0) > 0
      ? `${f.totalSuites} suite(s), ${f.totalSpecs || 0} spec(s) found.`
      : 'No suites/specs discovered — check suites/<name>/e2e/*.spec.ts exists under the project root.',
  });

  steps.push({
    id: 'hubReporter',
    label: 'Hub Reporter opt-in',
    optional: false,
    status: f.hubReporterAcked ? 'ok' : 'todo',
    detail: f.hubReporterAcked
      ? 'Acknowledged — live progress/SSE features are available when the host project has opted in.'
      : 'Not acknowledged yet — this cannot be auto-detected; add the reporter snippet to playwright.config.ts, then check the box.',
  });

  const pct = f.tagAdoptionPercent;
  steps.push({
    id: 'tagging',
    label: 'Business-process tagging',
    optional: false,
    status: pct === null || pct === undefined ? 'todo' : (pct >= 50 ? 'ok' : 'warn'),
    detail: pct === null || pct === undefined
      ? 'No specs discovered yet.'
      : `${pct}% of specs have at least one @bp:/@TC- tag.`,
  });

  steps.push({
    id: 'targetEnv',
    label: 'Target environment configured',
    optional: false,
    status: f.targetUrlConfigured ? 'ok' : 'todo',
    detail: f.targetUrlConfigured
      ? 'Target URL is configured.'
      : 'No target URL set — configure one in Settings.',
  });

  steps.push({
    id: 'ai',
    label: 'AI diagnosis (optional)',
    optional: true,
    status: f.aiConfigured ? 'ok' : 'todo',
    detail: f.aiConfigured
      ? 'AI diagnosis is enabled and configured.'
      : 'Optional — skip this if you don\'t need AI-assisted failure diagnosis.',
  });

  const requiredSteps = steps.filter((s) => !s.optional);
  const completedRequired = requiredSteps.filter((s) => s.status === 'ok').length;

  return {
    steps,
    completedCount: steps.filter((s) => s.status === 'ok').length,
    totalCount: steps.length,
    requiredCompletedCount: completedRequired,
    requiredTotalCount: requiredSteps.length,
  };
}

module.exports = { computeTagAdoptionPercent, computeSetupStatus };
