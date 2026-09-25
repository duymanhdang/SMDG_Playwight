/**
 * coverage-matrix.js — G1 Coverage Matrix, minimal version (v1.0.0).
 *
 * Pure grouping logic, kept separate from server.js so it's unit-testable
 * without booting Express/SQLite. Groups tests by @bp: businessProcess tag
 * into automated&passing / automated&failing / quarantined / no-coverage
 * buckets. Tests with no @bp: tag at all go to noCoverage — reported
 * separately, never silently dropped.
 *
 * v1.6.0 — per-test resolution. Each spec file now carries `testTags`, the
 * AST scanner's (tag-scanner.js scanFileForTestTags()) per-test business
 * process list, keyed by that test's own (leaf) title — the same string
 * Playwright's JSON reporter records as the test's title. A test whose title
 * doesn't match any known per-test record (e.g. a stale/renamed test from an
 * older run) falls back to noCoverage rather than guessing, since attributing
 * it to the wrong business process would be worse than reporting it as
 * uncovered.
 */

'use strict';

function testKey(suiteName, title) { return `${suiteName}::${title}`; }

/**
 * @param {object} params
 * @param {Array<{suiteName:string, file:string, testTags:Array<{titlePath:string[], businessProcesses:string[]}>}>} params.specs
 *   One entry per known spec file, with per-test business-process tags found in it.
 * @param {Array<{suiteName:string, file:string, title:string, status:string}>} params.tests
 *   Latest-known status per test (from the most recent run per suite).
 * @param {Set<string>} params.quarantinedKeys  `${suiteName}::${title}` keys currently quarantined.
 * @returns {{ groups: object, noCoverage: {count:number, tests:Array} }}
 */
function buildCoverageMatrix({ specs, tests, quarantinedKeys }) {
  // `${suiteName}::${file}::${title}` -> string[] businessProcesses, resolved per test.
  const bpsByTest = new Map();
  for (const s of specs || []) {
    for (const t of s.testTags || []) {
      const leafTitle = t.titlePath[t.titlePath.length - 1];
      bpsByTest.set(`${s.suiteName}::${s.file}::${leafTitle}`, t.businessProcesses || []);
    }
  }

  const groups = {}; // bp -> { automatedPassing, automatedFailing, quarantined }
  const noCoverage = [];
  const qKeys = quarantinedKeys || new Set();

  function ensureGroup(bp) {
    if (!groups[bp]) groups[bp] = { businessProcess: bp, automatedPassing: 0, automatedFailing: 0, quarantined: 0 };
    return groups[bp];
  }

  for (const t of tests || []) {
    const key = testKey(t.suiteName, t.title);
    const bps = bpsByTest.get(`${t.suiteName}::${t.file}::${t.title}`) || [];
    const isQuarantined = qKeys.has(key);

    if (!bps.length) {
      noCoverage.push({ suiteName: t.suiteName, title: t.title, file: t.file, quarantined: isQuarantined });
      continue;
    }

    for (const bp of bps) {
      const g = ensureGroup(bp);
      if (isQuarantined) g.quarantined++;
      else if (t.status === 'failed') g.automatedFailing++;
      else if (t.status === 'passed' || t.status === 'flaky') g.automatedPassing++;
    }
  }

  return {
    groups: Object.values(groups).sort((a, b) => a.businessProcess.localeCompare(b.businessProcess)),
    noCoverage: { count: noCoverage.length, tests: noCoverage },
  };
}

module.exports = { buildCoverageMatrix };
