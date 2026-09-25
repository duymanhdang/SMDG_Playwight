import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractTraceabilityTags, scanFileForExtendedTags, findTagTypos } from '../tag-scanner.js';

describe('tag-scanner.extractTraceabilityTags (§6.3, additive)', () => {
  it('extracts @TC-\\d+ as testCaseIds, deduplicated and sorted', () => {
    const content = `
      // @TC-102
      test('a @TC-101', async () => {});
      test('b @TC-102 @TC-101', async () => {});
    `;
    const { testCaseIds } = extractTraceabilityTags(content);
    expect(testCaseIds).toEqual(['TC-101', 'TC-102']);
  });

  it('extracts @bp:[\\w-]+ as businessProcesses, deduplicated and sorted', () => {
    const content = `
      test('a @bp:order-to-cash', async () => {});
      test('b @bp:material-master @bp:order-to-cash', async () => {});
    `;
    const { businessProcesses } = extractTraceabilityTags(content);
    expect(businessProcesses).toEqual(['material-master', 'order-to-cash']);
  });

  it('returns empty arrays for content with no traceability tags', () => {
    expect(extractTraceabilityTags("test('plain @smoke', async () => {});")).toEqual({
      testCaseIds: [], businessProcesses: [],
    });
  });

  it('returns empty arrays for non-string input instead of throwing', () => {
    expect(extractTraceabilityTags(null)).toEqual({ testCaseIds: [], businessProcesses: [] });
    expect(extractTraceabilityTags(undefined)).toEqual({ testCaseIds: [], businessProcesses: [] });
  });

  it('does not touch/fix the known false-positive @tag scanning behavior (left alone on purpose)', () => {
    // @TC-/@bp: extraction is additive — it must not change what a generic
    // @word tag scan already (imperfectly) picks up elsewhere.
    const content = 'test(\'x @TC-5 @bp:foo @smoke\', async () => {});';
    const { testCaseIds, businessProcesses } = extractTraceabilityTags(content);
    expect(testCaseIds).toEqual(['TC-5']);
    expect(businessProcesses).toEqual(['foo']);
  });
});

describe('tag-scanner.scanFileForExtendedTags (file-based, additive wrapper)', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `tag-scanner-ext-test-${Date.now()}-${Math.random().toString(36).slice(2)}.spec.ts`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  it('returns tags, testCaseIds, and businessProcesses together', () => {
    // v1.6.0: tags must live in the test/describe title itself — the AST
    // scanner only reads title-argument string literals, so a tag placed in
    // a comment above the test (as the old regex-based fixture here used to
    // do) is no longer recognized. That's intentional: comments/JSDoc are
    // exactly the source of the false-positive regression fixed in this pass.
    fs.writeFileSync(tmpFile, `
      import { test } from '@playwright/test';
      test('create material master @smoke @P1 @TC-200 @bp:order-to-cash', async () => {});
    `);
    const result = scanFileForExtendedTags(tmpFile);
    expect(result.tags).toContain('smoke');
    expect(result.tags).toContain('p1');
    expect(result.testCaseIds).toEqual(['TC-200']);
    expect(result.businessProcesses).toEqual(['order-to-cash']);
  });

  it('returns empty arrays for a nonexistent file instead of throwing', () => {
    const result = scanFileForExtendedTags(path.join(os.tmpdir(), 'does-not-exist-xyz.spec.ts'));
    expect(result).toEqual({ tags: [], testCaseIds: [], businessProcesses: [], tagTypos: [] });
  });

  it('flags likely tag typos alongside the correctly-formed tags', () => {
    // v1.6.0: typos must also be in the title string for the AST scanner to
    // see them (same rationale as the test above — comments aren't scanned).
    fs.writeFileSync(tmpFile, `
      test('x @bp-order-to-cash @tc-77', async () => {});
    `);
    const result = scanFileForExtendedTags(tmpFile);
    expect(result.businessProcesses).toEqual([]); // not recognized as a real @bp: tag
    expect(result.testCaseIds).toEqual([]);        // not recognized as a real @TC- tag
    expect(result.tagTypos).toEqual([
      { found: '@bp-order-to-cash', likelyIntended: '@bp:order-to-cash' },
      { found: '@tc-77', likelyIntended: '@TC-77' },
    ]);
  });
});

describe('tag-scanner.findTagTypos (§v1.4.0 item 3, pure)', () => {
  it('flags @bp-foo as a likely typo of @bp:foo', () => {
    expect(findTagTypos("test('x @bp-order-to-cash', async () => {});")).toEqual([
      { found: '@bp-order-to-cash', likelyIntended: '@bp:order-to-cash' },
    ]);
  });

  it('flags lowercase @tc-123 as a likely typo of @TC-123', () => {
    expect(findTagTypos("test('x @tc-123', async () => {});")).toEqual([
      { found: '@tc-123', likelyIntended: '@TC-123' },
    ]);
  });

  it('does not flag correctly-formed tags', () => {
    expect(findTagTypos("test('x @bp:order-to-cash @TC-123', async () => {});")).toEqual([]);
  });

  it('returns [] for non-string input instead of throwing', () => {
    expect(findTagTypos(null)).toEqual([]);
    expect(findTagTypos(undefined)).toEqual([]);
  });
});
