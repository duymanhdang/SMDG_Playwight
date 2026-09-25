import { describe, it, expect } from 'vitest';
import { easeOutCubic, countUpValue, staggerDelayMs } from '../public/count-up.js';

describe('count-up (v1.8.0 part 2 — stat-card count-up animation helpers)', () => {
  describe('easeOutCubic', () => {
    it('starts at 0 and ends at 1', () => {
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
    });
    it('is monotonically increasing and front-loaded (ease-out)', () => {
      const a = easeOutCubic(0.25);
      const b = easeOutCubic(0.5);
      const c = easeOutCubic(0.75);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
      // ease-out-cubic: progress at t=0.25 is already more than a quarter done
      expect(a).toBeGreaterThan(0.25);
    });
    it('clamps out-of-range input', () => {
      expect(easeOutCubic(-1)).toBe(0);
      expect(easeOutCubic(2)).toBe(1);
    });
  });

  describe('countUpValue', () => {
    it('returns the start value at elapsed <= 0', () => {
      expect(countUpValue(0, 100, 0, 800)).toBe(0);
      expect(countUpValue(10, 100, -5, 800)).toBe(10);
    });
    it('returns the target value once elapsed reaches duration', () => {
      expect(countUpValue(0, 100, 800, 800)).toBe(100);
      expect(countUpValue(0, 100, 1000, 800)).toBe(100);
    });
    it('returns the target value immediately for a zero/invalid duration (reduced-motion path)', () => {
      expect(countUpValue(0, 42, 0, 0)).toBe(42);
      expect(countUpValue(0, 42, 100, -1)).toBe(42);
    });
    it('returns a whole-number interpolated value mid-animation', () => {
      const v = countUpValue(0, 100, 400, 800);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(100);
    });
  });

  describe('staggerDelayMs', () => {
    it('is 0 for the first row', () => {
      expect(staggerDelayMs(0)).toBe(0);
    });
    it('scales linearly with index under the cap', () => {
      expect(staggerDelayMs(3, 30)).toBe(90);
    });
    it('caps at maxMs for long lists', () => {
      expect(staggerDelayMs(50, 30, 300)).toBe(300);
    });
    it('treats a negative index as 0', () => {
      expect(staggerDelayMs(-1)).toBe(0);
    });
  });
});
