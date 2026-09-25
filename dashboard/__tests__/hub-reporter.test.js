import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import HubReporter, {
  buildBeginEvent,
  buildTestBeginEvent,
  buildTestEndEvent,
  buildStepEndEvent,
  buildEndEvent,
  buildErrorEvent,
} from '../hub-reporter.js';

// Fake Playwright-shaped objects — only the fields hub-reporter.js's pure
// builders actually read, per the TestCase/TestResult/FullConfig API shape.
function fakeSuite(count) {
  return { allTests: () => Array.from({ length: count }, (_, i) => ({ id: `t${i}` })) };
}
function fakeTestCase(overrides = {}) {
  return {
    id: 'tc-1',
    title: 'does the thing',
    project: { name: 'chromium' },
    titlePath: () => ['suite-a', 'describe-a', 'does the thing'],
    ...overrides,
  };
}
function fakeResult(overrides = {}) {
  return { status: 'passed', duration: 1234, error: null, ...overrides };
}

describe('hub-reporter pure builders (§ADR-2)', () => {
  it('buildBeginEvent counts total planned tests from suite.allTests()', () => {
    const event = buildBeginEvent({}, fakeSuite(7));
    expect(event.type).toBe('begin');
    expect(event.totalTests).toBe(7);
    expect(typeof event.time).toBe('number');
  });

  it('buildBeginEvent never throws when suite has no allTests()', () => {
    expect(() => buildBeginEvent({}, {})).not.toThrow();
    expect(buildBeginEvent({}, {}).totalTests).toBe(0);
    expect(buildBeginEvent({}, null).totalTests).toBe(0);
  });

  it('buildTestBeginEvent carries id, title, titlePath, and project', () => {
    const event = buildTestBeginEvent(fakeTestCase());
    expect(event).toMatchObject({
      type: 'testBegin',
      id: 'tc-1',
      title: 'does the thing',
      titlePath: ['suite-a', 'describe-a', 'does the thing'],
      project: 'chromium',
    });
  });

  it('buildTestEndEvent includes status, duration, and no error on a pass', () => {
    const event = buildTestEndEvent(fakeTestCase(), fakeResult());
    expect(event).toMatchObject({
      type: 'testEnd',
      id: 'tc-1',
      status: 'passed',
      duration: 1234,
      error: null,
    });
  });

  it('buildTestEndEvent surfaces the error message on a failure', () => {
    const result = fakeResult({ status: 'failed', error: { message: 'expect(received).toBe(expected)' } });
    const event = buildTestEndEvent(fakeTestCase(), result);
    expect(event.status).toBe('failed');
    expect(event.error).toBe('expect(received).toBe(expected)');
  });

  it('buildStepEndEvent carries the step title/category/duration', () => {
    const step = { title: 'click Save', category: 'pw:api', duration: 42, error: null };
    const event = buildStepEndEvent(fakeTestCase(), fakeResult(), step);
    expect(event).toMatchObject({ type: 'stepEnd', title: 'click Save', category: 'pw:api', duration: 42, error: null });
  });

  it('buildEndEvent produces a final summary with counts by status', () => {
    const result = { status: 'passed', duration: 9999, totalTests: 10, passed: 8, failed: 1, skipped: 1, flaky: 0 };
    const event = buildEndEvent(result);
    expect(event).toMatchObject({
      type: 'end',
      status: 'passed',
      duration: 9999,
      summary: { totalTests: 10, passed: 8, failed: 1, skipped: 1, flaky: 0 },
    });
  });

  it('buildEndEvent tolerates a minimal FullResult without per-status counts', () => {
    const event = buildEndEvent({ status: 'failed' });
    expect(event.summary).toEqual({ totalTests: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 });
  });

  it('buildErrorEvent extracts the message from an Error-like object', () => {
    const event = buildErrorEvent(new Error('global setup blew up'));
    expect(event).toMatchObject({ type: 'error', message: 'global setup blew up' });
  });

  it('buildErrorEvent falls back to String() for a non-Error value', () => {
    const event = buildErrorEvent('plain string error');
    expect(event.message).toBe('plain string error');
  });
});

describe('HubReporter class (no-op when HUB_RUN_ID is unset)', () => {
  const originalEnv = process.env.HUB_RUN_ID;

  beforeEach(() => {
    delete process.env.HUB_RUN_ID;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.HUB_RUN_ID;
    else process.env.HUB_RUN_ID = originalEnv;
  });

  it('every reporter method is a complete no-op and never throws without HUB_RUN_ID', () => {
    const reporter = new HubReporter();
    expect(reporter.runId).toBeNull();
    expect(() => reporter.onBegin({}, fakeSuite(3))).not.toThrow();
    expect(() => reporter.onTestBegin(fakeTestCase())).not.toThrow();
    expect(() => reporter.onTestEnd(fakeTestCase(), fakeResult())).not.toThrow();
    expect(() => reporter.onStepEnd(fakeTestCase(), fakeResult(), { title: 's' })).not.toThrow();
    expect(() => reporter.onEnd(fakeResult())).not.toThrow();
    expect(() => reporter.onError(new Error('boom'))).not.toThrow();
  });
});
