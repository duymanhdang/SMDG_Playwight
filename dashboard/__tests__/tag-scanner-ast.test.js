import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanFileForTestTags } from '../tag-scanner.js';

describe('tag-scanner.scanFileForTestTags (v1.6.0, AST-based, per-test resolution)', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `tag-scanner-ast-test-${Date.now()}-${Math.random().toString(36).slice(2)}.spec.ts`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  it('attributes a tag on one test to that test only, not to a sibling test in the same file', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test('create material @bp:material-create', async () => {});
      test('delete material @bp:material-delete', async () => {});
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results).toHaveLength(2);
    const create = results.find((r) => r.titlePath[r.titlePath.length - 1].startsWith('create'));
    const del = results.find((r) => r.titlePath[r.titlePath.length - 1].startsWith('delete'));
    expect(create.businessProcess).toBe('material-create');
    expect(del.businessProcess).toBe('material-delete');
  });

  it('inherits a tag from an enclosing test.describe() title, combined with the test\'s own title tags', () => {
    // Core correctness claim of the v1.6.0 rewrite: a @bp: tag on the
    // describe block applies to every test nested inside it, and combines
    // (doesn't replace) with tags on the individual test's own title.
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test.describe('MDG Material @bp:material-master', () => {
        test('create material', async () => {});
        test('update material @bp:material-update', async () => {});
      });
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results).toHaveLength(2);

    const createTest = results.find((r) => r.titlePath[r.titlePath.length - 1] === 'create material');
    expect(createTest.titlePath).toEqual(['MDG Material @bp:material-master', 'create material']);
    expect(createTest.businessProcesses).toEqual(['material-master']);

    const updateTest = results.find((r) => r.titlePath[r.titlePath.length - 1] === 'update material @bp:material-update');
    // combines the describe's bp with the test's own bp — both apply.
    expect(updateTest.businessProcesses).toEqual(['material-master', 'material-update']);
  });

  it('supports the modern test(title, {tag: [...]}, fn) second-argument tag array', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test('create material', { tag: ['@smoke', '@bp:material-create'] }, async () => {});
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results).toHaveLength(1);
    expect(results[0].tags).toContain('smoke');
    expect(results[0].businessProcess).toBe('material-create');
  });

  it('handles test.skip/test.only/test.fixme the same as a plain test()', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test.skip('skipped @bp:a', async () => {});
      test.only('only @bp:b', async () => {});
      test.fixme('fixme @bp:c', async () => {});
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results.map((r) => r.businessProcess).sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not pick up the @playwright/test import specifier, JSDoc, or comments as tags', () => {
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      /** @param page the page @returns void */
      // @ts-ignore
      test('create material @smoke', async ({ page }) => {});
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results).toHaveLength(1);
    expect(results[0].tags).toEqual(['smoke']);
  });

  it('returns [] for a nonexistent file instead of throwing', () => {
    expect(scanFileForTestTags(path.join(os.tmpdir(), 'does-not-exist-xyz.spec.ts'))).toEqual([]);
  });

  it('handles a malformed/unparseable spec file gracefully (no throw, returns an array)', () => {
    fs.writeFileSync(tmpFile, `this is }}} not { valid TS at all ( ( ( [[[`);
    expect(() => scanFileForTestTags(tmpFile)).not.toThrow();
    expect(Array.isArray(scanFileForTestTags(tmpFile))).toBe(true);
  });

  it('flags a typo tag on a per-test basis', () => {
    fs.writeFileSync(tmpFile, `
      test('x @bp-order-to-cash', async () => {});
    `);
    const results = scanFileForTestTags(tmpFile);
    expect(results[0].tagTypos).toEqual(['@bp-order-to-cash (did you mean @bp:order-to-cash?)']);
  });
});
