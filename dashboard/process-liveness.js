/**
 * process-liveness.js — pure-ish helper for checking whether a PID is still
 * an alive OS process, used by reconcileIndexOnBoot() (§v1.3.0 item 1) to
 * decide whether a run left in status:'running' after a hub restart is a
 * truly-dead run (safe to mark 'interrupted') or an orphaned-but-still-alive
 * Playwright process (must stay represented as 'running').
 *
 * Node's `process.kill(pid, 0)` sends signal 0 — no actual signal is
 * delivered, it just performs the permission/existence check. This works
 * cross-platform, including on Windows (confirmed via Node's libuv
 * implementation, which maps this to OpenProcess/GetExitCodeProcess-style
 * checks under the hood).
 *   - Throws ESRCH  -> no such process (dead).
 *   - Throws EPERM  -> process exists, but we don't have permission to
 *                      signal it (still alive; treat as alive).
 *   - No throw      -> process exists (alive).
 */

'use strict';

function isProcessAlive(pid, killFn) {
  const kill = killFn || process.kill.bind(process);
  if (!pid || typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true; // exists, just not signalable by us
    return false; // ESRCH (or any other error) -> treat as not alive
  }
}

module.exports = { isProcessAlive };
