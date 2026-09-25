import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isValidExpiresInDays, computeExpiresAt, daysRemaining, computeExpiredSplit,
  MIN_EXPIRES_DAYS, MAX_EXPIRES_DAYS, DEFAULT_EXPIRES_DAYS, testKey,
  readQuarantineFile, writeQuarantineFile, quarantineFilePath,
} from '../quarantine-store.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('quarantine-store — pure expiry calculations (F3)', () => {
  it('testKey matches the "suiteName::title" convention used everywhere else', () => {
    expect(testKey('S4_SIT_AUTO_FOO', 'does a thing')).toBe('S4_SIT_AUTO_FOO::does a thing');
  });

  it('isValidExpiresInDays accepts the 1-60 inclusive range', () => {
    expect(isValidExpiresInDays(1)).toBe(true);
    expect(isValidExpiresInDays(60)).toBe(true);
    expect(isValidExpiresInDays(14)).toBe(true);
  });

  it('isValidExpiresInDays rejects 0, negative, >60, non-integers, and non-numbers', () => {
    expect(isValidExpiresInDays(0)).toBe(false);
    expect(isValidExpiresInDays(-1)).toBe(false);
    expect(isValidExpiresInDays(61)).toBe(false);
    expect(isValidExpiresInDays(14.5)).toBe(false);
    expect(isValidExpiresInDays('not-a-number')).toBe(false);
    expect(isValidExpiresInDays(undefined)).toBe(false);
  });

  it('computeExpiresAt defaults to 14 days when expiresInDays is omitted/invalid', () => {
    const now = 1_700_000_000_000;
    expect(computeExpiresAt(now, undefined)).toBe(now + DEFAULT_EXPIRES_DAYS * DAY_MS);
    expect(computeExpiresAt(now, 999)).toBe(now + DEFAULT_EXPIRES_DAYS * DAY_MS);
  });

  it('computeExpiresAt honors a valid explicit expiresInDays', () => {
    const now = 1_700_000_000_000;
    expect(computeExpiresAt(now, 60)).toBe(now + 60 * DAY_MS);
    expect(computeExpiresAt(now, 1)).toBe(now + 1 * DAY_MS);
  });

  it('daysRemaining rounds up (an entry expiring in a few hours still reads as 1, not 0)', () => {
    const now = 1_700_000_000_000;
    expect(daysRemaining(now + 3 * 60 * 60 * 1000, now)).toBe(1);
    expect(daysRemaining(now + 10 * DAY_MS, now)).toBe(10);
  });

  it('daysRemaining is negative once an entry is past expiry', () => {
    const now = 1_700_000_000_000;
    expect(daysRemaining(now - DAY_MS, now)).toBeLessThan(0);
  });

  it('computeExpiredSplit separates active vs expired entries by expiresAt <= now', () => {
    const now = 1_700_000_000_000;
    const entries = [
      { key: 'a', expiresAt: now + DAY_MS },   // active
      { key: 'b', expiresAt: now - DAY_MS },   // expired
      { key: 'c', expiresAt: now },            // expired (boundary, <=)
    ];
    const { active, released } = computeExpiredSplit(entries, now);
    expect(active.map((e) => e.key)).toEqual(['a']);
    expect(released.map((e) => e.key).sort()).toEqual(['b', 'c']);
  });

  it('MIN/MAX/DEFAULT constants match the F3 spec (1-60, default 14)', () => {
    expect(MIN_EXPIRES_DAYS).toBe(1);
    expect(MAX_EXPIRES_DAYS).toBe(60);
    expect(DEFAULT_EXPIRES_DAYS).toBe(14);
  });
});

describe('quarantine-store — file read/write round-trip', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-store-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  });

  it('readQuarantineFile returns [] when .hub/quarantine.json does not exist yet', () => {
    expect(readQuarantineFile(tmpRoot)).toEqual([]);
  });

  it('writeQuarantineFile then readQuarantineFile round-trips the entries array', () => {
    const entries = [{ key: 'Suite::test', suiteName: 'Suite', title: 'test', reason: 'flaky', requestedBy: 'ken', createdAt: 1, expiresAt: 2 }];
    writeQuarantineFile(tmpRoot, entries);
    expect(readQuarantineFile(tmpRoot)).toEqual(entries);
    expect(fs.existsSync(quarantineFilePath(tmpRoot))).toBe(true);
  });

  it('readQuarantineFile returns [] (never throws) for malformed JSON on disk', () => {
    fs.mkdirSync(path.join(tmpRoot, '.hub'), { recursive: true });
    fs.writeFileSync(quarantineFilePath(tmpRoot), '{not valid json');
    expect(readQuarantineFile(tmpRoot)).toEqual([]);
  });
});
