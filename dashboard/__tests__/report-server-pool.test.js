/**
 * report-server-pool.test.js — v1.8.1
 *
 * Covers the pool's own bookkeeping/lifecycle logic (port selection, LRU
 * eviction order, reuse-by-runId, graceful degradation when the Playwright
 * CLI is "missing") using FAKE stand-in child processes (either a stub
 * EventEmitter, or a real-but-harmless `node -e "setInterval(...)"` process)
 * — never a real Playwright install, which isn't present in this sandbox.
 * See UPGRADE_NOTES.md v1.8.1 for why this can't be end-to-end verified
 * against a real `show-report` server here.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn as realSpawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createReportServerPool, findFreePort } = require('../report-server-pool.js');

// A fake "child process" that never errors/exits on its own — stands in for
// a healthy, long-running show-report server for pool bookkeeping tests.
function makeFakeProc(pid) {
  const proc = new EventEmitter();
  proc.pid = pid;
  proc.kill = vi.fn();
  return proc;
}

describe('report-server-pool — spawn/track/evict/kill lifecycle', () => {
  it('spawns via spawn(process.execPath, [...], { shell:false }) — never a shell string', async () => {
    const spawnFn = vi.fn(() => makeFakeProc(111));
    const pool = createReportServerPool({
      spawnFn,
      pwCliPath: '/fake/cli.js',
      cwd: '/fake/project',
      cliExists: () => true,
      basePort: 20000,
    });

    const result = await pool.ensure('run_a', '/fake/reports/run_a/html');
    expect(result.ok).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [cmd, args, options] = spawnFn.mock.calls[0];
    expect(cmd).toBe(process.execPath);
    expect(args).toEqual(['/fake/cli.js', 'show-report', '/fake/reports/run_a/html', '--host', '127.0.0.1', '--port', String(result.port)]);
    expect(options.shell).toBe(false);
    expect(options.cwd).toBe('/fake/project');
  });

  it('reuses an already-tracked instance for the same runId instead of spawning a duplicate', async () => {
    const spawnFn = vi.fn(() => makeFakeProc(222));
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/fake/cli.js', cliExists: () => true, basePort: 20010 });

    const first = await pool.ensure('run_b', '/fake/html');
    const second = await pool.ensure('run_b', '/fake/html');

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(second.reused).toBe(true);
    expect(second.port).toBe(first.port);
    expect(pool.size()).toBe(1);
  });

  it('caps concurrent instances and evicts the least-recently-used one first', async () => {
    let pid = 300;
    const spawnFn = vi.fn(() => makeFakeProc(pid++));
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/fake/cli.js', cliExists: () => true, basePort: 20020, maxInstances: 2 });

    await pool.ensure('run_1', '/html/1');
    // Touch run_1 again a tick later so run_2 is the actual least-recently-used
    // once run_3 forces an eviction below.
    await new Promise((r) => setTimeout(r, 5));
    await pool.ensure('run_2', '/html/2');
    await new Promise((r) => setTimeout(r, 5));
    pool._pool.get('run_1').lastUsedAt = Date.now(); // run_1 used most recently
    await new Promise((r) => setTimeout(r, 5));

    expect(pool.size()).toBe(2);
    const thirdSpawnResult = await pool.ensure('run_3', '/html/3');
    expect(thirdSpawnResult.ok).toBe(true);

    // run_2 (least recently used) should have been evicted; run_1 and run_3 remain.
    expect(pool.size()).toBe(2);
    expect(pool._pool.has('run_1')).toBe(true);
    expect(pool._pool.has('run_2')).toBe(false);
    expect(pool._pool.has('run_3')).toBe(true);
  });

  it('kills evicted/stopped entries via taskkill on win32 (matching the existing Stop-handler pattern), or SIGTERM elsewhere', async () => {
    let pid = 400;
    const spawnFn = vi.fn(() => makeFakeProc(pid++));
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/fake/cli.js', cliExists: () => true, basePort: 20040, maxInstances: 1, isWindows: true });

    await pool.ensure('run_x', '/html/x');
    await pool.ensure('run_y', '/html/y'); // forces eviction of run_x (cap is 1)

    const taskkillCall = spawnFn.mock.calls.find(([cmd]) => cmd === 'taskkill');
    expect(taskkillCall).toBeTruthy();
    expect(taskkillCall[1]).toEqual(['/pid', '400', '/T', '/F']);
    expect(taskkillCall[2]).toEqual({ shell: false });
  });

  it('stopAll() kills every tracked entry and empties the pool', async () => {
    let pid = 500;
    const spawnFn = vi.fn(() => makeFakeProc(pid++));
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/fake/cli.js', cliExists: () => true, basePort: 20060, maxInstances: 5, isWindows: false });

    await pool.ensure('run_p', '/html/p');
    await pool.ensure('run_q', '/html/q');
    const procs = Array.from(pool._pool.values()).map((e) => e.proc);

    pool.stopAll();

    expect(pool.size()).toBe(0);
    for (const proc of procs) expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('degrades gracefully (ok:false, no throw) when the Playwright CLI is reported missing', async () => {
    const spawnFn = vi.fn(() => makeFakeProc(600));
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/nonexistent/cli.js', cliExists: () => false, basePort: 20080 });

    const result = await pool.ensure('run_missing_cli', '/html/missing');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Playwright CLI not found/);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('degrades gracefully when the child process emits an immediate spawn error (e.g. ENOENT)', async () => {
    const spawnFn = vi.fn(() => {
      const proc = makeFakeProc(700);
      queueMicrotask(() => proc.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return proc;
    });
    const pool = createReportServerPool({ spawnFn, pwCliPath: '/fake/cli.js', cliExists: () => true, basePort: 20090 });

    const result = await pool.ensure('run_enoent', '/html/enoent');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/failed to start/i);
    expect(pool.size()).toBe(0);
  });
});

describe('findFreePort — port-selection retry logic', () => {
  const activeServers = [];
  afterEach(async () => {
    while (activeServers.length) {
      const s = activeServers.pop();
      await new Promise((r) => s.close(r));
    }
  });

  it('returns the base port when it is free', async () => {
    const port = await findFreePort({ basePort: 21500, host: '127.0.0.1', maxRetries: 5, usedPorts: new Set() });
    expect(port).toBe(21500);
  });

  it('skips ports already recorded as used by the pool, even if technically free', async () => {
    const port = await findFreePort({ basePort: 21510, host: '127.0.0.1', maxRetries: 5, usedPorts: new Set([21510, 21511]) });
    expect(port).toBe(21512);
  });

  it('skips a port that is genuinely occupied by a real listening server', async () => {
    const net = await import('node:net');
    const occupied = net.default.createServer();
    await new Promise((resolve) => occupied.listen(21520, '127.0.0.1', resolve));
    activeServers.push(occupied);

    const port = await findFreePort({ basePort: 21520, host: '127.0.0.1', maxRetries: 5, usedPorts: new Set() });
    expect(port).toBe(21521);
  });

  it('throws a clear error after exhausting maxRetries', async () => {
    const net = await import('node:net');
    const occupied = net.default.createServer();
    await new Promise((resolve) => occupied.listen(21530, '127.0.0.1', resolve));
    activeServers.push(occupied);

    await expect(
      findFreePort({ basePort: 21530, host: '127.0.0.1', maxRetries: 1, usedPorts: new Set() })
    ).rejects.toThrow(/Could not find a free port/);
  });
});

describe('report-server-pool — real child-process lifecycle (stand-in fake server, no Playwright)', () => {
  it('actually spawns, tracks, and kills a real long-running process end-to-end', async () => {
    // Directly exercise ensure() but spawn a real, harmless stand-in
    // "server" process (setInterval keeps it alive) instead of a real
    // Playwright show-report — proves the pool's real spawn->track->kill
    // mechanics work against an actual OS process, not just a stub.
    const fakeServerPool = createReportServerPool({
      // Substitute a harmless long-running node process for the initial
      // "show-report" spawn only; pass everything else (e.g. the pool's own
      // taskkill/SIGTERM calls on eviction) straight through unmodified.
      spawnFn: (cmd, args, options) => {
        if (args.includes('show-report')) return realSpawn(cmd, ['-e', 'setInterval(()=>{}, 1000)'], options);
        return realSpawn(cmd, args, options);
      },
      pwCliPath: '/fake/cli.js',
      cliExists: () => true,
      basePort: 21610,
      isWindows: process.platform === 'win32',
    });

    const result = await fakeServerPool.ensure('run_real', '/fake/html/real');
    expect(result.ok).toBe(true);
    const entry = fakeServerPool._pool.get('run_real');
    expect(entry).toBeTruthy();
    expect(typeof entry.proc.pid).toBe('number');

    // Confirm the process is genuinely alive right now.
    expect(() => process.kill(entry.proc.pid, 0)).not.toThrow();

    fakeServerPool.stopAll();
    // Give the OS a brief moment to actually reap the killed process.
    await new Promise((r) => setTimeout(r, 300));

    let stillAlive = true;
    try { process.kill(entry.proc.pid, 0); } catch (_) { stillAlive = false; }
    expect(stillAlive).toBe(false);
  }, 10000);
});
