import { describe, it, expect } from 'vitest';
import { buildUrl, aggregateOverall, ENTITIES } from '../sap-eventlog-client.js';

// Network-hitting logic (fetchCrLogs -> https.request) is NOT exercised here,
// same rationale as groq-client.js's callGroq(): no outbound network access
// in this sandbox. Only the pure, unit-testable pieces are covered.

describe('sap-eventlog-client.buildUrl', () => {
  it('builds a $filter query against reqID for the given entity', () => {
    const url = buildUrl('https://host.example.com', '/srv-process/CommonProcessService', 'SubmitEventLog', 'CR0000029831');
    expect(url).toBe(
      "https://host.example.com/srv-process/CommonProcessService/SubmitEventLog?$filter=reqID%20eq%20'CR0000029831'"
    );
  });

  it('strips trailing slashes from the base URL', () => {
    const url = buildUrl('https://host.example.com/', '/srv-process/CommonProcessService', 'ApproveEventLog', 'CR1');
    expect(url.startsWith('https://host.example.com/srv-process')).toBe(true);
  });

  it('defaults to the CommonProcessService path when none is given', () => {
    const url = buildUrl('https://host.example.com', undefined, 'ActivateEventLog', 'CR1');
    expect(url).toContain('/srv-process/CommonProcessService/ActivateEventLog');
  });
});

describe('sap-eventlog-client.aggregateOverall', () => {
  it('returns NO_EVENTS when no stage has any event', () => {
    const stages = [{ ok: true, events: [] }, { ok: false, events: [] }];
    expect(aggregateOverall(stages)).toBe('NO_EVENTS');
  });

  it('returns PASSED when every event in every stage with events passed', () => {
    const stages = [
      { ok: true, events: [{ status: 'PASSED' }, { status: 'PASSED' }] },
      { ok: true, events: [] },
    ];
    expect(aggregateOverall(stages)).toBe('PASSED');
  });

  it('returns FAILED when any event in any stage did not pass', () => {
    const stages = [
      { ok: true, events: [{ status: 'PASSED' }] },
      { ok: true, events: [{ status: 'FAILED' }] },
    ];
    expect(aggregateOverall(stages)).toBe('FAILED');
  });

  it('treats BYPASS (or any non-PASSED status) as a failure', () => {
    const stages = [{ ok: true, events: [{ status: 'BYPASS' }] }];
    expect(aggregateOverall(stages)).toBe('FAILED');
  });

  it('ignores stages that failed to fetch (ok:false)', () => {
    const stages = [{ ok: false, events: [] }];
    expect(aggregateOverall(stages)).toBe('NO_EVENTS');
  });
});

describe('sap-eventlog-client.ENTITIES', () => {
  it('includes the 4 v1 entities: Submit/Approve/Activate/RequestAction', () => {
    const names = ENTITIES.map((e) => e.name);
    expect(names).toEqual(['SubmitEventLog', 'ApproveEventLog', 'ActivateEventLog', 'RequestActionLog']);
  });
});
