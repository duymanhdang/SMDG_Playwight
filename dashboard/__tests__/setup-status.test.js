import { describe, it, expect } from 'vitest';
import { computeTagAdoptionPercent, computeSetupStatus } from '../setup-status.js';

describe('computeTagAdoptionPercent', () => {
  it('returns null percent when there are no specs at all', () => {
    expect(computeTagAdoptionPercent([])).toEqual({ totalSpecs: 0, taggedSpecs: 0, percent: null });
  });

  it('returns 0% when specs exist but none have any @bp:/@TC- tag', () => {
    const specs = [
      { testTags: [{ businessProcesses: [], testCaseIds: [] }] },
      { testTags: [{ businessProcesses: [], testCaseIds: [] }] },
    ];
    expect(computeTagAdoptionPercent(specs)).toEqual({ totalSpecs: 2, taggedSpecs: 0, percent: 0 });
  });

  it('counts a spec as tagged if ANY test in it has a businessProcess tag', () => {
    const specs = [
      { testTags: [{ businessProcesses: [], testCaseIds: [] }, { businessProcesses: ['material-create'], testCaseIds: [] }] },
      { testTags: [{ businessProcesses: [], testCaseIds: [] }] },
    ];
    const result = computeTagAdoptionPercent(specs);
    expect(result).toEqual({ totalSpecs: 2, taggedSpecs: 1, percent: 50 });
  });

  it('counts a spec as tagged if ANY test in it has a testCaseId tag', () => {
    const specs = [
      { testTags: [{ businessProcesses: [], testCaseIds: ['TC-101'] }] },
    ];
    expect(computeTagAdoptionPercent(specs)).toEqual({ totalSpecs: 1, taggedSpecs: 1, percent: 100 });
  });

  it('rounds the percentage (3 specs, 1 tagged -> 33%)', () => {
    const specs = [
      { testTags: [{ businessProcesses: ['x'], testCaseIds: [] }] },
      { testTags: [{ businessProcesses: [], testCaseIds: [] }] },
      { testTags: [{ businessProcesses: [], testCaseIds: [] }] },
    ];
    expect(computeTagAdoptionPercent(specs).percent).toBe(33);
  });

  it('handles specs with no testTags array gracefully', () => {
    const specs = [{}, { testTags: null }];
    expect(computeTagAdoptionPercent(specs)).toEqual({ totalSpecs: 2, taggedSpecs: 0, percent: 0 });
  });
});

describe('computeSetupStatus', () => {
  it('marks every required step todo and AI optional-todo when nothing is configured', () => {
    const result = computeSetupStatus({
      playwrightCliPresent: false,
      totalSuites: 0,
      totalSpecs: 0,
      hubReporterAcked: false,
      tagAdoptionPercent: null,
      targetUrlConfigured: false,
      aiConfigured: false,
    });
    expect(result.steps).toHaveLength(6);
    expect(result.completedCount).toBe(0);
    expect(result.requiredCompletedCount).toBe(0);
    expect(result.requiredTotalCount).toBe(5);
    const ai = result.steps.find((s) => s.id === 'ai');
    expect(ai.optional).toBe(true);
    expect(ai.status).toBe('todo');
  });

  it('marks all required steps ok and reports full completion when everything is set up', () => {
    const result = computeSetupStatus({
      playwrightCliPresent: true,
      totalSuites: 3,
      totalSpecs: 10,
      hubReporterAcked: true,
      tagAdoptionPercent: 80,
      targetUrlConfigured: true,
      aiConfigured: true,
    });
    expect(result.completedCount).toBe(6);
    expect(result.requiredCompletedCount).toBe(5);
    expect(result.requiredTotalCount).toBe(5);
    result.steps.forEach((s) => expect(s.status).toBe('ok'));
  });

  it('treats low tag adoption (<50%) as warn, not a blocking todo', () => {
    const result = computeSetupStatus({
      playwrightCliPresent: true,
      totalSuites: 1,
      totalSpecs: 4,
      hubReporterAcked: true,
      tagAdoptionPercent: 25,
      targetUrlConfigured: true,
      aiConfigured: false,
    });
    const tagging = result.steps.find((s) => s.id === 'tagging');
    expect(tagging.status).toBe('warn');
  });

  it('never marks the AI step as a blocking todo/fail that pulls down required completion', () => {
    const result = computeSetupStatus({
      playwrightCliPresent: true,
      totalSuites: 1,
      totalSpecs: 1,
      hubReporterAcked: true,
      tagAdoptionPercent: 100,
      targetUrlConfigured: true,
      aiConfigured: false,
    });
    expect(result.requiredCompletedCount).toBe(result.requiredTotalCount);
  });
});
