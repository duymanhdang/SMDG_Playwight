import { describe, it, expect } from 'vitest';
import { buildEventlogAnalysisMessages } from '../groq-client.js';

// analyzeEventlog() itself (-> callGroq() -> network) is NOT exercised here,
// same rationale as groq-client.js's other network-touching functions.

function sampleCrLogs(overrides = {}) {
  return {
    crNumber: 'CR0000029831',
    overall: 'FAILED',
    stages: [
      {
        label: 'Submit', ok: true,
        events: [{ stepID: 'validateDuplication', status: 'BYPASS', log: 'Duplication found', mdgLogID: 'abc-123' }],
      },
      { label: 'Approve', ok: true, events: [] },
    ],
    ...overrides,
  };
}

describe('groq-client.buildEventlogAnalysisMessages', () => {
  it('returns a system + user message pair', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'Check status', 'en');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('instructs the model to respond in Vietnamese when language is vi', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'Kiem tra CR', 'vi');
    expect(messages[0].content).toMatch(/Respond in Vietnamese/);
  });

  it('instructs the model to never invent ABAP/Cloud Logging sources', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[0].content).toMatch(/Never invent/);
    expect(messages[0].content).toMatch(/ABAP, Cloud Logging/);
  });

  it('requires the strict JSON response shape (overview/timeline/errors/recommendation)', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[0].content).toMatch(/"overview"/);
    expect(messages[0].content).toMatch(/"timeline"/);
    expect(messages[0].content).toMatch(/"errors"/);
    expect(messages[0].content).toMatch(/"recommendation"/);
  });

  it('includes the CR number and stage data in the user prompt', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[1].content).toContain('CR0000029831');
    expect(messages[1].content).toContain('validateDuplication');
  });

  it('excludes stages with no events from the "present" stage list but still lists them as stagesWithoutEvents', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    const payloadJson = messages[1].content.split('CR logs JSON:\n')[1];
    const payload = JSON.parse(payloadJson);
    expect(payload.stages.map((s) => s.stage)).toEqual(['Submit']);
    expect(payload.stagesWithoutEvents).toEqual(['Approve']);
  });

  it('falls back to a generic question when none is given', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), undefined, 'en');
    expect(messages[1].content).toMatch(/Analyze this CR\./);
  });

  it('instructs the model on how to parse validateTemplatePayloadData comparison-operator errors', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[0].content).toMatch(/validateTemplatePayloadData/);
    expect(messages[0].content).toMatch(/Comparison operator/);
    expect(messages[0].content).toMatch(/DATA issue/);
    expect(messages[0].content).toMatch(/SYSTEM issue/);
  });

  it('explains RequestActionLog entries (action name, no stepID/status) to the model', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[0].content).toMatch(/RequestActionLog entries are different/);
    expect(messages[0].content).toMatch(/`action` name/);
  });

  it('includes the action field (not just stepID) for RequestActionLog-style events with no stepID', () => {
    const crLogs = sampleCrLogs({
      stages: [
        {
          label: 'RequestAction', ok: true,
          events: [{ action: 'submitCreateRequest', log: 'start submitCreateRequest', createdBy: 'richard.pham@laidon.com' }],
        },
      ],
    });
    const messages = buildEventlogAnalysisMessages(crLogs, 'x', 'en');
    const payload = JSON.parse(messages[1].content.split('CR logs JSON:\n')[1]);
    expect(payload.stages[0].events[0].action).toBe('submitCreateRequest');
    expect(payload.stages[0].events[0].stepID).toBeUndefined();
  });

  it('keeps the full log text on the first occurrence but replaces byte-identical repeats with a short pointer', () => {
    const longMsg = 'Duplication found for below Product: '.repeat(20); // long enough to matter, but content doesn't matter for this test
    const crLogs = sampleCrLogs({
      stages: [
        {
          label: 'Submit', ok: true,
          events: [
            { stepID: 'validateDuplication', status: 'FAILED', log: longMsg, mdgLogID: 'first-id' },
            { stepID: 'validateDuplication', status: 'FAILED', log: longMsg, mdgLogID: 'second-id' },
            { stepID: 'validateDuplication', status: 'FAILED', log: 'a completely different message', mdgLogID: 'third-id' },
          ],
        },
      ],
    });
    const messages = buildEventlogAnalysisMessages(crLogs, 'x', 'en');
    const events = JSON.parse(messages[1].content.split('CR logs JSON:\n')[1]).stages[0].events;
    expect(events[0].log).toContain('Duplication found');
    expect(events[1].log).toBe('[same message as the event with mdgLogID first-id]');
    expect(events[2].log).toContain('a completely different message');
  });

  it('explains the dedupe pointer marker to the model', () => {
    const messages = buildEventlogAnalysisMessages(sampleCrLogs(), 'x', 'en');
    expect(messages[0].content).toMatch(/same message as the event with mdgLogID/);
  });
});
