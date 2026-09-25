import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanFileForTags } from '../tag-scanner.js';

describe('tag-scanner.scanFileForTags', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `tag-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.spec.ts`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  it('extracts @tags from test titles, including a tag on an enclosing describe', () => {
    // v1.6.0: file-level scanFileForTags() is a union over per-test AST
    // results now, so a describe's tag only surfaces if it has a test
    // nested inside it to inherit it (an empty describe contributes
    // nothing — there's no test to attribute the tag to).
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test('create material @smoke', async () => {});
      test.describe('MDG @regression', () => {
        test('update material', async () => {});
      });
    `);
    const tags = scanFileForTags(tmpFile);
    expect(tags).toContain('smoke');
    expect(tags).toContain('regression');
  });

  it('does not pick up the scoped npm import specifier as a tag', () => {
    fs.writeFileSync(tmpFile, `import { test, expect } from '@playwright/test';\ntest('x @smoke', async () => {});`);
    const tags = scanFileForTags(tmpFile);
    expect(tags).not.toContain('playwright/test');
    expect(tags).toContain('smoke');
  });

  it('§3.2 fixed: JSDoc/email/directive noise no longer leaks in as false-positive tags (v1.6.0 AST rewrite)', () => {
    // Previously (whole-file-regex scanner) this exact fixture leaked
    // 'deprecated', 'laidon', 'param', 'returns', and 'ts-ignore' as fake
    // tags — see the old version of this test. The v1.6.0 AST-based scanner
    // only ever looks at title-argument string literals of test()/describe()
    // calls, so none of that surrounding noise is visible to it anymore.
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      /**
       * @param page the page
       * @returns void
       * @deprecated use v2
       * Contact: alain.truong@laidon.com
       */
      // @ts-ignore
      test('create material @smoke', async ({ page }) => {});
    `);
    const tags = scanFileForTags(tmpFile);
    expect(tags).toEqual(['smoke']);
  });

  it('returns an empty array for a nonexistent file instead of throwing', () => {
    expect(scanFileForTags(path.join(os.tmpdir(), 'does-not-exist-xyz.spec.ts'))).toEqual([]);
  });
});
