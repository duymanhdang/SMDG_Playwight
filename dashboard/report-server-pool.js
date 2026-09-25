'use strict';

/**
 * report-server-pool.js — v1.8.1
 *
 * Manages a small pool of `playwright show-report <dir>` child processes so
 * a run's NATIVE Playwright HTML report can be served by Playwright's own
 * report server (with its own attachment-resolution logic) instead of a
 * plain `express.static` mount, which was found to leave screenshot
 * thumbnails broken in the report's "Screenshots" panel (see
 * UPGRADE_NOTES.md v1.8.1 for the full writeup).
 *
 * Safety: every spawn here uses the SAME pattern already established
 * elsewhere in server.js since the v0.7 security pass — `spawn(cmd, argv,
 * { shell: false })`, never a shell string, never cmd.exe/npx.cmd. This
 * module does not reintroduce the `spawnPsWindow`/shell:true mechanism that
 * was removed for command-injection risk.
 *
 * Design (single-user local tool, so kept intentionally simple):
 *  - `Map<runId, { proc, port, htmlDir, lastUsedAt }>` tracks running
 *    instances. Viewing the same run's report again reuses its existing
 *    instance rather than spawning a duplicate.
 *  - Capped at `maxInstances` (default 3) concurrent show-report processes;
 *    exceeding the cap evicts (kills) the least-recently-used entry first.
 *  - Port selection: probe for a free TCP port starting at `basePort`
 *    (default 9223) using a real `net.createServer()` listen/close probe,
 *    incrementing on collision — a documented, version-independent way to
 *    find a free port (avoids relying on `--port 0` support, which was not
 *    confirmed for this Playwright CLI version in this sandbox).
 *  - `ensure(runId, htmlDir)` resolves `{ ok:false, error }` (never throws)
 *    whenever the Playwright CLI is missing, spawn fails, or no port could
 *    be found — callers MUST treat that as "fall back to the old static
 *    /report-assets/:runId/ route", never as a hard failure.
 */

const net = require('net');
const { spawn: defaultSpawn } = require('child_process');

const DEFAULT_BASE_PORT = 9223;
const DEFAULT_MAX_INSTANCES = 3;
const DEFAULT_PORT_RETRIES = 20;
// Give the child a brief window to fail fast (ENOENT, immediate crash)
// before we optimistically report success. Playwright's show-report server
// itself takes a little longer to actually start listening, but that's a
// client-side concern (retry the fetch/open), not something worth blocking
// this call on.
const SPAWN_SETTLE_MS = 400;

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    try {
      tester.listen(port, host);
    } catch (_) {
      resolve(false);
    }
  });
}

async function findFreePort({ basePort, host, maxRetries, usedPorts }) {
  let port = basePort;
  let attempts = 0;
  while (attempts < maxRetries) {
    if (!usedPorts.has(port) && (await isPortFree(port, host))) return port;
    port += 1;
    attempts += 1;
  }
  throw new Error(`Could not find a free port after ${maxRetries} attempts starting at ${basePort}`);
}

/**
 * @param {object} opts
 * @param {Function} [opts.spawnFn] — injectable for tests (defaults to child_process.spawn)
 * @param {string} opts.pwCliPath — absolute path to Playwright's cli.js
 * @param {string} [opts.cwd] — cwd for the spawned process (project root)
 * @param {string} [opts.host] — host to bind (default 127.0.0.1, loopback-only)
 * @param {number} [opts.basePort]
 * @param {number} [opts.maxInstances]
 * @param {number} [opts.portRetries]
 * @param {Function} [opts.cliExists] — injectable existence check for tests
 * @param {boolean} [opts.isWindows] — injectable for tests
 */
function createReportServerPool(opts = {}) {
  const {
    spawnFn = defaultSpawn,
    pwCliPath,
    cwd,
    host = '127.0.0.1',
    basePort = DEFAULT_BASE_PORT,
    maxInstances = DEFAULT_MAX_INSTANCES,
    portRetries = DEFAULT_PORT_RETRIES,
    cliExists = () => {
      try { return require('fs').existsSync(pwCliPath); } catch (_) { return false; }
    },
    isWindows = process.platform === 'win32',
  } = opts;

  /** @type {Map<string, { proc: any, port: number, htmlDir: string, lastUsedAt: number }>} */
  const pool = new Map();

  function killEntry(entry) {
    try {
      if (isWindows) {
        // §2.3 pattern reused verbatim from the main test-runner Stop handler
        // in server.js — taskkill invoked directly, no cmd.exe, no shell:true.
        spawnFn('taskkill', ['/pid', String(entry.proc.pid), '/T', '/F'], { shell: false });
      } else {
        entry.proc.kill('SIGTERM');
      }
    } catch (_) { /* best-effort; nothing more useful to do if this throws */ }
  }

  // Kills and removes whichever tracked entry was least recently used.
  // Returns the evicted runId, or null if the pool was empty.
  function evictLru() {
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [id, entry] of pool.entries()) {
      if (entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt;
        oldestId = id;
      }
    }
    if (oldestId !== null) {
      killEntry(pool.get(oldestId));
      pool.delete(oldestId);
    }
    return oldestId;
  }

  async function ensure(runId, htmlDir) {
    const existing = pool.get(runId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return { ok: true, port: existing.port, url: `http://${host}:${existing.port}/`, reused: true };
    }

    if (!cliExists()) {
      return { ok: false, error: 'Playwright CLI not found (node_modules/@playwright/test/cli.js missing) — cannot start show-report.' };
    }

    if (pool.size >= maxInstances) {
      evictLru();
    }

    const usedPorts = new Set(Array.from(pool.values()).map((e) => e.port));
    let port;
    try {
      port = await findFreePort({ basePort, host, maxRetries: portRetries, usedPorts });
    } catch (err) {
      return { ok: false, error: err.message };
    }

    let proc;
    try {
      proc = spawnFn(
        process.execPath,
        [pwCliPath, 'show-report', htmlDir, '--host', host, '--port', String(port)],
        { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      return { ok: false, error: `Failed to spawn Playwright show-report: ${err.message}` };
    }

    const earlyFailure = await new Promise((resolve) => {
      let settled = false;
      const onError = (err) => {
        if (!settled) { settled = true; resolve(err); }
      };
      const onExit = (code) => {
        if (!settled && code !== null && code !== 0) {
          settled = true;
          resolve(new Error(`show-report exited immediately with code ${code}`));
        }
      };
      proc.once('error', onError);
      proc.once('exit', onExit);
      setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.removeListener('error', onError);
          proc.removeListener('exit', onExit);
          resolve(null);
        }
      }, SPAWN_SETTLE_MS);
    });

    if (earlyFailure) {
      return { ok: false, error: `Playwright show-report failed to start: ${earlyFailure.message}` };
    }

    pool.set(runId, { proc, port, htmlDir, lastUsedAt: Date.now() });
    proc.on('exit', () => {
      const entry = pool.get(runId);
      if (entry && entry.proc === proc) pool.delete(runId);
    });

    return { ok: true, port, url: `http://${host}:${port}/`, reused: false };
  }

  function stopAll() {
    for (const entry of pool.values()) killEntry(entry);
    pool.clear();
  }

  function size() {
    return pool.size;
  }

  return { ensure, stopAll, size, _pool: pool, _evictLru: evictLru };
}

module.exports = { createReportServerPool, findFreePort, isPortFree };
