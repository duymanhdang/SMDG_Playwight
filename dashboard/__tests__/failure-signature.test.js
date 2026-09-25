import { describe, it, expect } from 'vitest';
import { normalizeErrorSignature } from '../failure-signature.js';

describe('normalizeErrorSignature (§v1.3.0 item 3 — failure clustering)', () => {
  it('collapses differing material numbers into the same signature', () => {
    const a = normalizeErrorSignature('Timeout waiting for #material-4521 to load');
    const b = normalizeErrorSignature('Timeout waiting for #material-9981 to load');
    expect(a).toBe(b);
    expect(a).toContain('#');
  });

  it('collapses ISO timestamps', () => {
    const a = normalizeErrorSignature('Request failed at 2026-08-04T10:15:30.123Z');
    const b = normalizeErrorSignature('Request failed at 2026-08-05T22:01:09Z');
    expect(a).toBe(b);
    expect(a).toContain('<timestamp>');
  });

  it('collapses UUID-like ids', () => {
    const a = normalizeErrorSignature('Record 3fa85f64-5717-4562-b3fc-2c963f66afa6 not found');
    const b = normalizeErrorSignature('Record 11111111-2222-3333-4444-555555555555 not found');
    expect(a).toBe(b);
    expect(a).toContain('<uuid>');
  });

  it('collapses Windows and POSIX file paths (with line:col) but keeps the rest of the message distinct across categories', () => {
    const win = normalizeErrorSignature("Error at C:\\Users\\bob\\project\\suites\\S1\\e2e\\test.spec.ts:42:13 timeout exceeded");
    const posix = normalizeErrorSignature('Error at /home/bob/project/suites/S1/e2e/test.spec.ts:42:13 timeout exceeded');
    expect(win).toContain('<path>');
    expect(posix).toContain('<path>');
  });

  it('mixed message with numbers, timestamp and a path all normalize to a stable, shorter signature', () => {
    const msg = 'locator.click: Timeout 30000ms exceeded at 2026-08-04T10:15:30.000Z file C:\\repo\\suites\\S4\\e2e\\a.spec.ts:12:4 for material 88123';
    const sig = normalizeErrorSignature(msg);
    expect(sig).not.toContain('30000');
    expect(sig).not.toContain('88123');
    expect(sig).not.toContain('2026-08-04');
    expect(sig.length).toBeLessThan(msg.length);
  });

  it('returns an empty string for falsy input', () => {
    expect(normalizeErrorSignature('')).toBe('');
    expect(normalizeErrorSignature(null)).toBe('');
    expect(normalizeErrorSignature(undefined)).toBe('');
  });

  it('two genuinely different error kinds still normalize to different signatures', () => {
    const timeout = normalizeErrorSignature('Timeout 5000ms exceeded waiting for selector');
    const network = normalizeErrorSignature('net::ERR_CONNECTION_REFUSED at http://example.com');
    expect(timeout).not.toBe(network);
  });
});
