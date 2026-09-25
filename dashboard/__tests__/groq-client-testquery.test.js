import { describe, it, expect } from 'vitest';
import { buildTestQueryIntentMessages, buildTestDataMessages, TEST_QUERY_REPORT_TYPES } from '../groq-client.js';

// classifyTestQuery()/summarizeTestData() themselves (-> callGroq() ->
// network) are NOT exercised here, same rationale as groq-client.js's other
// network-touching functions.

describe('groq-client.buildTestQueryIntentMessages', () => {
  it('returns a system + user message pair with the raw question as the user message', () => {
    const messages = buildTestQueryIntentMessages('how is QA doing this week?', 'en');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('how is QA doing this week?');
  });

  it('lists every valid report type in the system prompt', () => {
    const messages = buildTestQueryIntentMessages('x', 'en');
    for (const type of TEST_QUERY_REPORT_TYPES) {
      expect(messages[0].content).toContain(`"${type}"`);
    }
  });

  it('requires the strict JSON response shape', () => {
    const messages = buildTestQueryIntentMessages('x', 'en');
    expect(messages[0].content).toMatch(/"reportType"/);
    expect(messages[0].content).toMatch(/"suiteName"/);
    expect(messages[0].content).toMatch(/"days"/);
  });

  it('instructs extracting a suite name and a day count from the question', () => {
    const messages = buildTestQueryIntentMessages('x', 'en');
    expect(messages[0].content).toMatch(/suiteName/);
    expect(messages[0].content).toMatch(/this week.*7/);
  });
});

describe('groq-client.buildTestDataMessages', () => {
  it('returns a system + user message pair with the data as JSON in the user message', () => {
    const data = { flaky: [{ title: 'logs in', suiteName: 'auth', flakinessScore: 0.5 }] };
    const messages = buildTestDataMessages('flaky', data, 'en');
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain('"logs in"');
  });

  it('instructs the model to never invent test names/suites not in the data', () => {
    const messages = buildTestDataMessages('top_failing', {}, 'en');
    expect(messages[0].content).toMatch(/never invent/i);
  });

  it('requires the strict JSON response shape (summary/recommendation)', () => {
    const messages = buildTestDataMessages('suite_health', {}, 'en');
    expect(messages[0].content).toMatch(/"summary"/);
    expect(messages[0].content).toMatch(/"recommendation"/);
  });

  it('instructs the model to say plainly when there is nothing to report for empty data', () => {
    const messages = buildTestDataMessages('latest_run', null, 'en');
    expect(messages[0].content).toMatch(/nothing to.*report/);
  });

  it('respects the language parameter', () => {
    const messages = buildTestDataMessages('flaky', {}, 'vi');
    expect(messages[0].content).toMatch(/Respond in Vietnamese/);
  });
});
