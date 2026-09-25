import { describe, it, expect } from 'vitest';
import { buildSummaryMessages, DEFAULT_MODEL } from '../groq-client.js';

// Report Center (v1.1) — the AI-summary prompt-building logic is factored
// out as a pure function (no network) so it's unit-testable, same split as
// classifier.js/coverage-matrix.js. The actual Groq network call
// (summarizeReport -> callGroq) is NOT exercised here — see groq-client.js's
// own header comment: outbound access to api.groq.com isn't available in
// this sandbox, matching how diagnose()/callGroq() are already untested
// against the live API.

describe('groq-client.buildSummaryMessages (Report Center AI summary)', () => {
  it('returns a system + user message pair', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 7 });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('instructs the model to respond with the expected JSON shape', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 7 });
    expect(messages[0].content).toMatch(/healthAssessment/);
    expect(messages[0].content).toMatch(/trends/);
    expect(messages[0].content).toMatch(/riskAreas/);
    expect(messages[0].content).toMatch(/recommendations/);
  });

  it('includes the time range and suite filter in the user prompt', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 14, suite: 'S4_SIT_AUTO_FOO' });
    expect(messages[1].content).toMatch(/last 14 day/i);
    expect(messages[1].content).toMatch(/S4_SIT_AUTO_FOO/);
  });

  it('says "all suites" when no suite filter is given', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 30 });
    expect(messages[1].content).toMatch(/all suites/);
  });

  it('includes overall rates and per-suite breakdown when present', () => {
    const stats = {
      totalRuns: 5, totalExecutions: 50,
      passRate: 80, failRate: 12, flakyRate: 4, skippedRate: 4, quarantinedSkipRate: 2,
      avgDurationMs: 90000,
      suiteBreakdown: [{ suiteName: 'SUITE_A', passRate: 95, runs: 3 }],
      timeSeries: [{ date: '2026-07-01', passRate: 70 }, { date: '2026-07-30', passRate: 90 }],
    };
    const messages = buildSummaryMessages({ stats, days: 30 });
    expect(messages[1].content).toMatch(/80%/);
    expect(messages[1].content).toMatch(/SUITE_A/);
    expect(messages[1].content).toMatch(/95%/);
    expect(messages[1].content).toMatch(/2026-07-01/);
    expect(messages[1].content).toMatch(/2026-07-30/);
  });

  it('includes top failure categories and top failing tests when present', () => {
    const messages = buildSummaryMessages({
      stats: {},
      days: 7,
      categoryBreakdown: [{ category: 'timeout', count: 4 }],
      topFailing: [{ suiteName: 'SUITE_A', title: 'logs in', failCount: 3 }],
    });
    expect(messages[1].content).toMatch(/timeout: 4/);
    expect(messages[1].content).toMatch(/logs in: 3 failure/);
  });

  it('does not throw when given no stats/categoryBreakdown/topFailing at all', () => {
    expect(() => buildSummaryMessages({})).not.toThrow();
    expect(() => buildSummaryMessages(undefined)).not.toThrow();
  });

  it('exports the same DEFAULT_MODEL used elsewhere', () => {
    expect(typeof DEFAULT_MODEL).toBe('string');
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  it('defaults to English when no language is given (Report Center\'s original always-English behavior)', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 7 });
    expect(messages[0].content).toMatch(/Respond in English/);
  });

  it('asks for Vietnamese when bundle.language is "vi" (Auto Bot test-query path)', () => {
    const messages = buildSummaryMessages({ stats: {}, days: 7, language: 'vi' });
    expect(messages[0].content).toMatch(/Respond in Vietnamese/);
  });
});
