import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { parsePlaywrightJsonReport } from '../pw-json-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE = path.join(__dirname, 'fixtures', 'pw-report-mixed.json');

describe('parsePlaywrightJsonReport (golden fixture: all-pass/fail/flaky mix)', () => {
  it('parses the nested suite structure into a flat test list', () => {
    const result = parsePlaywrightJsonReport(FIXTURE);
    expect(result).not.toBeNull();
    expect(result.tests).toHaveLength(4);
  });

  it('maps Playwright statuses to the simplified status vocabulary', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    const byTitle = Object.fromEntries(tests.map((t) => [t.title, t]));
    expect(byTitle['create material master'].status).toBe('passed');
    expect(byTitle['create material master with attachment'].status).toBe('failed');
    expect(byTitle['duplicate check on material create'].status).toBe('flaky');
    expect(byTitle['skipped test example'].status).toBe('skipped');
  });

  it('descends into nested suites (not just the top-level specs array)', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    expect(tests.some((t) => t.title === 'skipped test example')).toBe(true);
  });

  it('extracts the error from the last result for failed/flaky tests', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    const byTitle = Object.fromEntries(tests.map((t) => [t.title, t]));
    expect(byTitle['create material master with attachment'].error).toMatch(/Timeout 30000ms exceeded/);
    // flaky: last result was the passing retry, so no error should be carried.
    expect(byTitle['duplicate check on material create'].error).toBeNull();
  });

  it('classifies failed tests by error category', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    const byTitle = Object.fromEntries(tests.map((t) => [t.title, t]));
    expect(byTitle['create material master with attachment'].category).toBe('timeout');
  });

  it('splits attachments into screenshots/videos/traces', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    const t = tests.find((x) => x.title === 'create material master with attachment');
    expect(t.artifacts.screenshots).toHaveLength(1);
    expect(t.artifacts.videos).toHaveLength(1);
    expect(t.artifacts.traces).toHaveLength(1);
  });

  it('computes an accurate summary, including the flaky bucket', () => {
    const { summary } = parsePlaywrightJsonReport(FIXTURE);
    expect(summary).toEqual({ totalTests: 4, passed: 1, failed: 1, flaky: 1, skipped: 1 });
  });

  it('builds a stable id from file::title::project', () => {
    const { tests } = parsePlaywrightJsonReport(FIXTURE);
    const t = tests.find((x) => x.title === 'create material master');
    expect(t.id).toBe('suites/material-master/e2e/create.spec.ts::create material master::chromium');
  });

  it('returns null instead of throwing for a missing/invalid file', () => {
    expect(parsePlaywrightJsonReport(path.join(__dirname, 'fixtures', 'does-not-exist.json'))).toBeNull();
  });
});
