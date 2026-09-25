import { describe, it, expect, vi } from 'vitest';
import { isProcessAlive } from '../process-liveness.js';

describe('isProcessAlive (§v1.3.0 item 1 — restart PID reconciliation)', () => {
  it('returns true when process.kill(pid, 0) does not throw', () => {
    const killFn = vi.fn(() => {});
    expect(isProcessAlive(12345, killFn)).toBe(true);
    expect(killFn).toHaveBeenCalledWith(12345, 0);
  });

  it('returns false when process.kill throws ESRCH (no such process)', () => {
    const killFn = vi.fn(() => { const e = new Error('no such process'); e.code = 'ESRCH'; throw e; });
    expect(isProcessAlive(12345, killFn)).toBe(false);
  });

  it('returns true when process.kill throws EPERM (exists, no permission)', () => {
    const killFn = vi.fn(() => { const e = new Error('not permitted'); e.code = 'EPERM'; throw e; });
    expect(isProcessAlive(12345, killFn)).toBe(true);
  });

  it('returns false for a missing/invalid pid without even calling kill', () => {
    const killFn = vi.fn();
    expect(isProcessAlive(null, killFn)).toBe(false);
    expect(isProcessAlive(undefined, killFn)).toBe(false);
    expect(isProcessAlive(0, killFn)).toBe(false);
    expect(isProcessAlive(-1, killFn)).toBe(false);
    expect(isProcessAlive(NaN, killFn)).toBe(false);
    expect(killFn).not.toHaveBeenCalled();
  });

  it('uses the real process.kill by default (self-check: current process is alive)', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});
