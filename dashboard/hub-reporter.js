/**
 * hub-reporter.js — Playwright reporter (v0.9.0, ADR-2).
 *
 * Opt-in, zero-touch-by-default: a HOST project's playwright.config.ts adds
 * ONE line registering this reporter, guarded by process.env.HUB_RUN_ID so
 * it is a complete no-op for every `npx playwright test` invocation that
 * isn't launched by the hub. See UPGRADE_NOTES.md for the exact snippet and
 * dashboard/server.js's startTestRun() for how HUB_RUN_ID gets set.
 *
 * Design notes:
 *  - The "build a plain JSON-serializable event object from Playwright's
 *    TestCase/TestResult/FullConfig/etc arguments" logic lives in the
 *    exported pure functions below (buildBeginEvent, buildTestBeginEvent,
 *    buildTestEndEvent, buildEndEvent, buildErrorEvent). They take plain
 *    objects shaped like Playwright's types and do no I/O, so they can be
 *    unit-tested directly with fake objects — see __tests__/hub-reporter.test.js.
 *  - The HubReporter class only wires those pure functions to a single
 *    append-only NDJSON file per run. All file I/O is wrapped in try/catch:
 *    a filesystem hiccup here must never crash the actual Playwright run.
 *  - If HUB_RUN_ID is unset, every reporter method is a no-op.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Pure event builders (no I/O — exported for tests) ──────────────────

/**
 * @param {object} config  Playwright FullConfig-shaped object (only .projects used)
 * @param {Array}  suite   Playwright Suite[]-shaped array — the root suites Playwright
 *                         is about to run (onBegin's 2nd arg is the root Suite; we
 *                         accept whatever the caller passes and just count leaves if
 *                         a `allTests()` method is available, else fall back to 0).
 */
function buildBeginEvent(config, suite) {
  let total = 0;
  try {
    if (suite && typeof suite.allTests === 'function') {
      total = suite.allTests().length;
    } else if (Array.isArray(suite)) {
      total = suite.length;
    }
  } catch (_) {
    total = 0;
  }
  return {
    type: 'begin',
    time: Date.now(),
    totalTests: total,
  };
}

function safeTitlePath(testCase) {
  try {
    if (typeof testCase.titlePath === 'function') return testCase.titlePath();
  } catch (_) {}
  return [];
}

function buildTestBeginEvent(testCase) {
  return {
    type: 'testBegin',
    time: Date.now(),
    id: testCase.id,
    title: testCase.title,
    titlePath: safeTitlePath(testCase),
    project: testCase.project && testCase.project.name,
  };
}

function buildTestEndEvent(testCase, result) {
  return {
    type: 'testEnd',
    time: Date.now(),
    id: testCase.id,
    title: testCase.title,
    titlePath: safeTitlePath(testCase),
    project: testCase.project && testCase.project.name,
    status: result.status,
    duration: result.duration,
    error: (result.error && result.error.message) || null,
  };
}

function buildStepEndEvent(testCase, result, step) {
  return {
    type: 'stepEnd',
    time: Date.now(),
    id: testCase.id,
    title: step.title,
    category: step.category,
    duration: step.duration,
    error: (step.error && step.error.message) || null,
  };
}

function buildEndEvent(result) {
  return {
    type: 'end',
    time: Date.now(),
    status: result.status,
    summary: {
      totalTests: countOf(result, 'totalTests'),
      passed:     countOf(result, 'passed'),
      failed:     countOf(result, 'failed'),
      skipped:    countOf(result, 'skipped'),
      flaky:      countOf(result, 'flaky'),
    },
    duration: result.duration != null ? result.duration : null,
  };
}

// FullResult doesn't actually carry per-status counts in Playwright's real
// API (that's tracked by the hub itself via testEnd events) — this helper
// just tolerates a fake/enriched result object in tests without throwing.
function countOf(result, key) {
  return (result && typeof result[key] === 'number') ? result[key] : 0;
}

function buildErrorEvent(error) {
  return {
    type: 'error',
    time: Date.now(),
    message: (error && error.message) || String(error),
  };
}

// ── File I/O helpers ─────────────────────────────────────────────────

function runsDir() {
  return path.join(__dirname, 'data', 'tmp', 'runs');
}

function eventsFilePath(runId) {
  return path.join(runsDir(), runId, 'events.ndjson');
}

function appendEvent(runId, event) {
  try {
    const filePath = eventsFilePath(runId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
  } catch (_) {
    // A filesystem hiccup here must never crash the actual test run.
  }
}

// ── Reporter class ───────────────────────────────────────────────────

class HubReporter {
  constructor() {
    this.runId = process.env.HUB_RUN_ID || null;
  }

  onBegin(config, suite) {
    if (!this.runId) return;
    try { appendEvent(this.runId, buildBeginEvent(config, suite)); } catch (_) {}
  }

  onTestBegin(test) {
    if (!this.runId) return;
    try { appendEvent(this.runId, buildTestBeginEvent(test)); } catch (_) {}
  }

  onTestEnd(test, result) {
    if (!this.runId) return;
    try { appendEvent(this.runId, buildTestEndEvent(test, result)); } catch (_) {}
  }

  onStepEnd(test, result, step) {
    if (!this.runId) return;
    // Keep this cheap and best-effort — step-level detail is a nice-to-have,
    // not something the run should ever be slowed down or crashed by.
    try { appendEvent(this.runId, buildStepEndEvent(test, result, step)); } catch (_) {}
  }

  onEnd(result) {
    if (!this.runId) return;
    try { appendEvent(this.runId, buildEndEvent(result)); } catch (_) {}
  }

  onError(error) {
    if (!this.runId) return;
    try { appendEvent(this.runId, buildErrorEvent(error)); } catch (_) {}
  }
}

module.exports = HubReporter;
module.exports.HubReporter = HubReporter;
module.exports.buildBeginEvent = buildBeginEvent;
module.exports.buildTestBeginEvent = buildTestBeginEvent;
module.exports.buildTestEndEvent = buildTestEndEvent;
module.exports.buildStepEndEvent = buildStepEndEvent;
module.exports.buildEndEvent = buildEndEvent;
module.exports.buildErrorEvent = buildErrorEvent;
