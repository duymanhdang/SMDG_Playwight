import { describe, it, expect } from 'vitest';
import { categorize, breakdown } from '../classifier.js';

describe('classifier.categorize', () => {
  it('categorizes timeout errors', () => {
    expect(categorize('Timeout 30000ms exceeded while waiting for locator')).toBe('timeout');
  });
  it('categorizes selector errors', () => {
    expect(categorize('waiting for selector "#foo" to be visible')).toBe('selector');
  });
  it('categorizes network errors', () => {
    expect(categorize('net::ERR_CONNECTION_REFUSED')).toBe('network');
  });
  it('categorizes auth errors', () => {
    expect(categorize('Request failed with status 401 Unauthorized')).toBe('auth');
  });
  it('categorizes assertion errors', () => {
    expect(categorize('expect(received).toBe(expected)')).toBe('assertion');
  });
  it('falls back to "other" for unrecognized errors', () => {
    expect(categorize('some totally unexpected error')).toBe('other');
  });
  it('falls back to "other" for empty/null input', () => {
    expect(categorize(null)).toBe('other');
    expect(categorize('')).toBe('other');
  });
});

describe('classifier.breakdown', () => {
  it('counts only failed tests, grouped by category', () => {
    const tests = [
      { status: 'failed', error: 'Timeout 5000ms exceeded' },
      { status: 'failed', error: 'Timeout 5000ms exceeded' },
      { status: 'failed', error: 'net::ERR_CONNECTION_RESET' },
      { status: 'passed', error: null },
      { status: 'skipped', error: null },
    ];
    const result = breakdown(tests);
    expect(result).toEqual([
      { category: 'timeout', count: 2 },
      { category: 'network', count: 1 },
    ]);
  });

  it('uses a precomputed category field when present instead of re-categorizing', () => {
    const tests = [{ status: 'failed', category: 'custom-cat', error: 'irrelevant text' }];
    expect(breakdown(tests)).toEqual([{ category: 'custom-cat', count: 1 }]);
  });
});
