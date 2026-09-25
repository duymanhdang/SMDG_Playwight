/**
 * pw-json-parser.js — Converts Playwright's native JSON reporter output
 * (--reporter=json, written via the PLAYWRIGHT_JSON_OUTPUT_NAME env var)
 * into this app's simplified RunDetail schema.
 *
 * Playwright's JSON reporter returns a nested suite structure:
 *   suite.suites[]  (nested)
 *   suite.specs[].tests[].results[]
 * Reference: https://playwright.dev/docs/test-reporters#json-reporter
 */

const fs = require('fs');
const { categorize } = require('./classifier');

function statusFromTest(test) {
  // test.status: 'expected' | 'unexpected' | 'flaky' | 'skipped'
  switch (test.status) {
    case 'expected':   return 'passed';
    case 'unexpected': return 'failed';
    case 'flaky':      return 'flaky';
    case 'skipped':    return 'skipped';
    default:           return 'unknown';
  }
}

function extractError(test) {
  const lastResult = (test.results || [])[test.results.length - 1];
  if (!lastResult) return null;
  if (lastResult.error && lastResult.error.message) return lastResult.error.message;
  if (Array.isArray(lastResult.errors) && lastResult.errors.length) {
    return lastResult.errors.map((e) => e.message).filter(Boolean).join('\n');
  }
  return null;
}

function extractDuration(test) {
  const lastResult = (test.results || [])[test.results.length - 1];
  return lastResult ? (lastResult.duration || 0) : 0;
}

function extractArtifacts(test) {
  const lastResult = (test.results || [])[test.results.length - 1];
  const out = { screenshots: [], videos: [], traces: [] };
  if (!lastResult || !Array.isArray(lastResult.attachments)) return out;
  for (const att of lastResult.attachments) {
    if (!att.path) continue;
    if (att.name === 'trace' || /trace\.zip$/.test(att.path)) out.traces.push(att.path);
    else if (att.contentType && att.contentType.startsWith('video/')) out.videos.push(att.path);
    else if (att.contentType && att.contentType.startsWith('image/')) out.screenshots.push(att.path);
  }
  return out;
}

function walkSuite(suite, filePrefix, sink) {
  const specs = suite.specs || [];
  for (const spec of specs) {
    for (const test of (spec.tests || [])) {
      const status = statusFromTest(test);
      const error  = status === 'failed' || status === 'flaky' ? extractError(test) : null;
      sink.push({
        id:        `${filePrefix}::${spec.title}::${test.projectName || 'default'}`,
        title:     spec.title,
        file:      suite.file || filePrefix,
        project:   test.projectName || 'default',
        status,
        duration:  extractDuration(test),
        error,
        category:  error ? categorize(error) : null,
        artifacts: extractArtifacts(test),
      });
    }
  }
  for (const child of (suite.suites || [])) {
    walkSuite(child, filePrefix, sink);
  }
}

/**
 * @param {string} jsonFilePath - path to the JSON file written by Playwright
 * @returns {{ tests: object[], summary: object } | null}
 */
function parsePlaywrightJsonReport(jsonFilePath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  } catch (_) {
    return null;
  }

  const tests = [];
  for (const suite of (raw.suites || [])) {
    walkSuite(suite, suite.file || suite.title, tests);
  }

  const summary = {
    totalTests: tests.length,
    passed:     tests.filter((t) => t.status === 'passed').length,
    failed:     tests.filter((t) => t.status === 'failed').length,
    flaky:      tests.filter((t) => t.status === 'flaky').length,
    skipped:    tests.filter((t) => t.status === 'skipped').length,
  };

  return { tests, summary };
}

module.exports = { parsePlaywrightJsonReport };
