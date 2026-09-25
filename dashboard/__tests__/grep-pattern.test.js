import { describe, it, expect } from 'vitest';
import { buildGrepPattern } from '../grep-pattern.js';

describe('buildGrepPattern (§3.3 anchoring)', () => {
  it('anchors each title so it cannot match as a substring of another title', () => {
    const pattern = buildGrepPattern(['create material master']);
    const re = new RegExp(pattern);
    expect(re.test('create material master')).toBe(true);
    expect(re.test('create material master with attachment')).toBe(false);
    expect(re.test('create material master duplicate check')).toBe(false);
    expect(re.test('please create material master')).toBe(true); // preceded by whitespace is fine
  });

  it('escapes regex metacharacters in titles', () => {
    const pattern = buildGrepPattern(['verify "Save" button (v2)']);
    const re = new RegExp(pattern);
    expect(re.test('verify "Save" button (v2)')).toBe(true);
  });

  it('joins multiple titles with alternation', () => {
    const pattern = buildGrepPattern(['test a', 'test b']);
    const re = new RegExp(pattern);
    expect(re.test('test a')).toBe(true);
    expect(re.test('test b')).toBe(true);
    expect(re.test('test c')).toBe(false);
  });

  it('does not let one title match as a prefix of another', () => {
    const pattern = buildGrepPattern(['login']);
    const re = new RegExp(pattern);
    expect(re.test('login')).toBe(true);
    expect(re.test('login with invalid password')).toBe(false);
    expect(re.test('user can login')).toBe(true);
  });
});
