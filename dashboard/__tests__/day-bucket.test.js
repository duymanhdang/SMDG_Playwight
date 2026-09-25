import { describe, it, expect } from 'vitest';
import { makeDayKeyFn } from '../day-bucket.js';

describe('day-bucket (§3.7 timezone-aware bucketing)', () => {
  it('buckets a UTC timestamp into the correct local day for a positive-offset TZ', () => {
    const dayKeyIct = makeDayKeyFn('Asia/Ho_Chi_Minh'); // UTC+7
    // 2026-08-02T23:00:00Z is 2026-08-03T06:00:00 in ICT (UTC+7).
    const ts = Date.parse('2026-08-02T23:00:00Z');
    expect(dayKeyIct(ts)).toBe('2026-08-03');
  });

  it('the old UTC-only bucketing would have gotten this wrong', () => {
    const ts = Date.parse('2026-08-02T23:00:00Z');
    const utcDay = new Date(ts).toISOString().slice(0, 10);
    expect(utcDay).toBe('2026-08-02'); // one day off vs. the ICT-local bucket above
  });

  it('respects a different configured timezone', () => {
    const dayKeyUtc = makeDayKeyFn('UTC');
    const ts = Date.parse('2026-08-02T23:00:00Z');
    expect(dayKeyUtc(ts)).toBe('2026-08-02');
  });

  it('produces a stable YYYY-MM-DD format', () => {
    const dayKeyIct = makeDayKeyFn('Asia/Ho_Chi_Minh');
    expect(dayKeyIct(Date.parse('2026-01-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
