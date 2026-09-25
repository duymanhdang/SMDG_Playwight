import { describe, it, expect } from 'vitest';
import { buildCoverageMatrix } from '../coverage-matrix.js';

// v1.6.0: specs now carry per-test `testTags` (titlePath + businessProcesses
// per test), resolved by the AST scanner, instead of one file-level
// businessProcesses list applied to every test in the file.
describe('coverage-matrix.buildCoverageMatrix (§G1, v1.6.0 per-test resolution)', () => {
  const specs = [
    {
      suiteName: 'S4_SIT_AUTO_FOO',
      file: 'suites/FOO/e2e/a.spec.ts',
      testTags: [
        { titlePath: ['passes'], businessProcesses: ['order-to-cash'] },
        { titlePath: ['fails'], businessProcesses: ['order-to-cash'] },
      ],
    },
    { suiteName: 'S4_SIT_AUTO_FOO', file: 'suites/FOO/e2e/b.spec.ts', testTags: [
      { titlePath: ['untagged test'], businessProcesses: [] },
    ] }, // untagged spec
  ];

  it('buckets a passing test into automatedPassing for its business process', () => {
    const tests = [{ suiteName: 'S4_SIT_AUTO_FOO', file: 'suites/FOO/e2e/a.spec.ts', title: 'passes', status: 'passed' }];
    const { groups } = buildCoverageMatrix({ specs, tests, quarantinedKeys: new Set() });
    const g = groups.find((x) => x.businessProcess === 'order-to-cash');
    expect(g.automatedPassing).toBe(1);
    expect(g.automatedFailing).toBe(0);
    expect(g.quarantined).toBe(0);
  });

  it('buckets a failing test into automatedFailing', () => {
    const tests = [{ suiteName: 'S4_SIT_AUTO_FOO', file: 'suites/FOO/e2e/a.spec.ts', title: 'fails', status: 'failed' }];
    const { groups } = buildCoverageMatrix({ specs, tests, quarantinedKeys: new Set() });
    const g = groups.find((x) => x.businessProcess === 'order-to-cash');
    expect(g.automatedFailing).toBe(1);
  });

  it('a quarantined test is counted as quarantined regardless of its last status', () => {
    const key = 'S4_SIT_AUTO_FOO::fails';
    const tests = [{ suiteName: 'S4_SIT_AUTO_FOO', file: 'suites/FOO/e2e/a.spec.ts', title: 'fails', status: 'failed' }];
    const { groups } = buildCoverageMatrix({ specs, tests, quarantinedKeys: new Set([key]) });
    const g = groups.find((x) => x.businessProcess === 'order-to-cash');
    expect(g.quarantined).toBe(1);
    expect(g.automatedFailing).toBe(0);
  });

  it('a test whose spec file has no @bp: tag goes to noCoverage, never silently dropped', () => {
    const tests = [{ suiteName: 'S4_SIT_AUTO_FOO', file: 'suites/FOO/e2e/b.spec.ts', title: 'untagged test', status: 'passed' }];
    const { groups, noCoverage } = buildCoverageMatrix({ specs, tests, quarantinedKeys: new Set() });
    expect(groups.length).toBe(0);
    expect(noCoverage.count).toBe(1);
    expect(noCoverage.tests[0].title).toBe('untagged test');
  });

  it('a test tagged with multiple business processes counts toward each one', () => {
    const multiSpecs = [{ suiteName: 'S', file: 'f.spec.ts', testTags: [
      { titlePath: ['t'], businessProcesses: ['bp-a', 'bp-b'] },
    ] }];
    const tests = [{ suiteName: 'S', file: 'f.spec.ts', title: 't', status: 'passed' }];
    const { groups } = buildCoverageMatrix({ specs: multiSpecs, tests, quarantinedKeys: new Set() });
    expect(groups.map((g) => g.businessProcess).sort()).toEqual(['bp-a', 'bp-b']);
    expect(groups.every((g) => g.automatedPassing === 1)).toBe(true);
  });

  it('groups are sorted alphabetically by businessProcess', () => {
    const multiSpecs = [
      { suiteName: 'S', file: 'z.spec.ts', testTags: [{ titlePath: ['t1'], businessProcesses: ['zeta'] }] },
      { suiteName: 'S', file: 'a.spec.ts', testTags: [{ titlePath: ['t2'], businessProcesses: ['alpha'] }] },
    ];
    const tests = [
      { suiteName: 'S', file: 'z.spec.ts', title: 't1', status: 'passed' },
      { suiteName: 'S', file: 'a.spec.ts', title: 't2', status: 'passed' },
    ];
    const { groups } = buildCoverageMatrix({ specs: multiSpecs, tests, quarantinedKeys: new Set() });
    expect(groups.map((g) => g.businessProcess)).toEqual(['alpha', 'zeta']);
  });

  it('two tests in the same file resolve to DIFFERENT business processes (the core per-test correctness claim)', () => {
    // This is exactly the scenario the old file-level scanner got wrong: one
    // @bp: tag used to apply to every test in the file. Now each test is
    // bucketed by its own resolved businessProcesses only.
    const multiSpecs = [{ suiteName: 'S', file: 'shared.spec.ts', testTags: [
      { titlePath: ['create @bp:material-create'], businessProcesses: ['material-create'] },
      { titlePath: ['delete @bp:material-delete'], businessProcesses: ['material-delete'] },
    ] }];
    const tests = [
      { suiteName: 'S', file: 'shared.spec.ts', title: 'create @bp:material-create', status: 'passed' },
      { suiteName: 'S', file: 'shared.spec.ts', title: 'delete @bp:material-delete', status: 'failed' },
    ];
    const { groups } = buildCoverageMatrix({ specs: multiSpecs, tests, quarantinedKeys: new Set() });
    const create = groups.find((g) => g.businessProcess === 'material-create');
    const del = groups.find((g) => g.businessProcess === 'material-delete');
    expect(create.automatedPassing).toBe(1);
    expect(create.automatedFailing).toBe(0);
    expect(del.automatedPassing).toBe(0);
    expect(del.automatedFailing).toBe(1);
  });

  it('a test whose title has no matching per-test record falls back to noCoverage', () => {
    const multiSpecs = [{ suiteName: 'S', file: 'f.spec.ts', testTags: [
      { titlePath: ['known test'], businessProcesses: ['bp-a'] },
    ] }];
    const tests = [{ suiteName: 'S', file: 'f.spec.ts', title: 'renamed/unknown test', status: 'passed' }];
    const { groups, noCoverage } = buildCoverageMatrix({ specs: multiSpecs, tests, quarantinedKeys: new Set() });
    expect(groups.length).toBe(0);
    expect(noCoverage.count).toBe(1);
  });
});
