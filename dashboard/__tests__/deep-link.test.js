import { describe, it, expect } from 'vitest';
import { parseDeepLinkParams, buildDeepLinkParams } from '../public/deep-link.js';

describe('deep-link.js (v1.5.0 item 2 — URL state sync)', () => {
  const spec = {
    suite:  { key: 'suite',  default: '' },
    status: { key: 'status', default: '' },
    days:   { key: 'days',   default: '30' },
  };

  describe('parseDeepLinkParams', () => {
    it('reads present params into their mapped state keys', () => {
      const params = new URLSearchParams('suite=login&status=failed');
      expect(parseDeepLinkParams(params, spec)).toEqual({
        suite: 'login', status: 'failed', days: '30',
      });
    });

    it('falls back to each field default when a param is missing', () => {
      const params = new URLSearchParams('');
      expect(parseDeepLinkParams(params, spec)).toEqual({
        suite: '', status: '', days: '30',
      });
    });

    it('treats an empty-string param value the same as absent (uses default)', () => {
      const params = new URLSearchParams('suite=&days=7');
      expect(parseDeepLinkParams(params, spec)).toEqual({
        suite: '', status: '', days: '7',
      });
    });

    it('ignores unrelated query params not present in spec', () => {
      const params = new URLSearchParams('foo=bar&suite=login');
      expect(parseDeepLinkParams(params, spec)).toEqual({
        suite: 'login', status: '', days: '30',
      });
    });
  });

  describe('buildDeepLinkParams', () => {
    it('omits keys whose value equals the declared default', () => {
      const qs = buildDeepLinkParams({ suite: '', status: '', days: '30' }, spec);
      expect(qs.toString()).toBe('');
    });

    it('includes only non-default keys', () => {
      const qs = buildDeepLinkParams({ suite: 'login', status: '', days: '30' }, spec);
      expect(qs.toString()).toBe('suite=login');
    });

    it('includes multiple non-default keys in spec order', () => {
      const qs = buildDeepLinkParams({ suite: 'login', status: 'failed', days: '7' }, spec);
      expect(qs.toString()).toBe('suite=login&status=failed&days=7');
    });

    it('is the inverse of parseDeepLinkParams for a round trip', () => {
      const original = { suite: 'checkout', status: 'flaky', days: '90' };
      const qs = buildDeepLinkParams(original, spec);
      const roundTripped = parseDeepLinkParams(new URLSearchParams(qs.toString()), spec);
      expect(roundTripped).toEqual(original);
    });

    it('treats undefined/null state values as default (omitted)', () => {
      const qs = buildDeepLinkParams({ suite: undefined, status: null }, spec);
      expect(qs.toString()).toBe('');
    });
  });
});
