/**
 * storage.test.js — roundtrip tests for storage.js's SQLite-backed behavior.
 *
 * Uses the real storage.js/db.js module pair (so we exercise the actual
 * mapping code), pointed at an isolated temp file via HUB_DB_FILE (set
 * before requiring db.js/storage.js below) instead of the real
 * dashboard/data/hub.db. This used to run destructive `DELETE FROM <table>`
 * resets directly against the real file — harmless in CI, but it silently
 * wiped real settings (Groq key, SAP cookie, ...) whenever a manual
 * `npm test` run overlapped with the live dashboard dev server.
 */

import path from 'node:path';
import fs   from 'node:fs';
import os   from 'node:os';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-storage-test-'));
process.env.HUB_DB_FILE = path.join(tmpDir, 'test.db');

const db      = require('../db');
const storage = require('../storage');

function resetTables() {
  const conn = db.raw;
  for (const t of ['test_results', 'runs', 'triage', 'quarantine', 'cycle_runs', 'cycles', 'settings']) {
    conn.prepare(`DELETE FROM ${t}`).run();
  }
}

beforeEach(() => {
  resetTables();
});

afterAll(() => {
  resetTables();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('storage.js — run index', () => {
  it('upsertIndexEntry inserts new entries at the front (position 0)', () => {
    storage.upsertIndexEntry({ id: 'run_a', type: 'suite', suiteName: 'checkout', label: 'Checkout', status: 'done', startTime: 1, endTime: 2, totalTests: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, exitCode: 0 });
    storage.upsertIndexEntry({ id: 'run_b', type: 'suite', suiteName: 'checkout', label: 'Checkout', status: 'done', startTime: 5, endTime: 6, totalTests: 2, passed: 2, failed: 0, skipped: 0, flaky: 0, exitCode: 0 });

    const list = storage.readIndex();
    expect(list.map((r) => r.id)).toEqual(['run_b', 'run_a']);
    expect(list[0]).toMatchObject({ suiteName: 'checkout', totalTests: 2, passed: 2 });
  });

  it('upsertIndexEntry merges a partial patch into an existing entry', () => {
    storage.upsertIndexEntry({ id: 'run_a', status: 'running', startTime: 1, totalTests: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 });
    storage.upsertIndexEntry({ id: 'run_a', status: 'done', endTime: 99 });

    const entry = storage.readIndex().find((r) => r.id === 'run_a');
    expect(entry.status).toBe('done');
    expect(entry.endTime).toBe(99);
    expect(entry.startTime).toBe(1); // untouched fields preserved
  });

  it('removeIndexEntry deletes the run', () => {
    storage.upsertIndexEntry({ id: 'run_a', startTime: 1 });
    storage.removeIndexEntry('run_a');
    expect(storage.readIndex().find((r) => r.id === 'run_a')).toBeUndefined();
  });

  it('writeIndex replaces the whole list, newest-first order preserved', () => {
    storage.writeIndex([
      { id: 'run_x', startTime: 10, totalTests: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
      { id: 'run_y', startTime: 5,  totalTests: 2, passed: 2, failed: 0, skipped: 0, flaky: 0 },
    ]);
    expect(storage.readIndex().map((r) => r.id)).toEqual(['run_x', 'run_y']);
  });
});

describe('storage.js — run detail', () => {
  it('writeRunDetail/readRunDetail roundtrip preserves shape', () => {
    const detail = {
      id: 'run_1',
      suiteName: 'checkout',
      label: 'Checkout',
      modeLabel: 'w2',
      status: 'done',
      startTime: 100,
      endTime: 200,
      exitCode: 0,
      summary: { totalTests: 2, passed: 1, failed: 1, flaky: 0, skipped: 0 },
      tests: [
        { title: 'adds item', file: 'cart.spec.ts', project: 'chromium', status: 'passed', duration: 500, error: null, category: null, artifacts: { screenshots: [], videos: [], traces: [] } },
        { title: 'checks out', file: 'cart.spec.ts', project: 'chromium', status: 'failed', duration: 800, error: 'timeout 5000ms exceeded', category: 'timeout', artifacts: { screenshots: [], videos: [], traces: [] } },
      ],
    };

    storage.writeRunDetail('run_1', detail);
    const readBack = storage.readRunDetail('run_1');

    expect(readBack.suiteName).toBe('checkout');
    expect(readBack.summary).toEqual(detail.summary);
    expect(readBack.tests).toHaveLength(2);
    expect(readBack.tests[1]).toMatchObject({ title: 'checks out', status: 'failed', category: 'timeout' });
  });

  it('deleteRunDetail removes the test rows for a run', () => {
    storage.writeRunDetail('run_1', { id: 'run_1', suiteName: 's', summary: {}, tests: [{ title: 't1', status: 'passed' }] });
    storage.deleteRunDetail('run_1');
    const readBack = storage.readRunDetail('run_1');
    expect(readBack.tests).toEqual([]);
  });

  it('readRunDetail returns null for an unknown run', () => {
    expect(storage.readRunDetail('does_not_exist')).toBeNull();
  });
});

describe('storage.js — triage', () => {
  it('readTriage/writeTriage roundtrip', () => {
    storage.writeTriage({
      'checkout::adds item': { suiteName: 'checkout', title: 'adds item', status: 'bug', note: 'known', updatedAt: 123 },
    });
    const map = storage.readTriage();
    expect(map['checkout::adds item']).toMatchObject({ status: 'bug', note: 'known' });
  });
});

describe('storage.js — cycles', () => {
  it('readCycles/writeCycles roundtrip runIds order', () => {
    storage.writeCycles([
      { id: 'cycle_1', name: 'Release 1', createdAt: 1, runIds: ['run_a', 'run_b'] },
    ]);
    const cycles = storage.readCycles();
    expect(cycles).toHaveLength(1);
    expect(cycles[0].runIds).toEqual(['run_a', 'run_b']);
  });
});

describe('storage.js — settings + quarantine sync', () => {
  it('readSettings falls back to defaults, writeSettings persists a merged patch', () => {
    const s1 = storage.readSettings();
    expect(s1.retentionDays).toBe(30);

    const updated = storage.writeSettings({ retentionDays: 10, aiEnabled: true });
    expect(updated.retentionDays).toBe(10);
    expect(updated.aiEnabled).toBe(true);

    const s2 = storage.readSettings();
    expect(s2.retentionDays).toBe(10);
    expect(s2.aiEnabled).toBe(true);
  });

  it('writing quarantinedTests syncs the quarantine table', () => {
    storage.writeSettings({ quarantinedTests: ['checkout::flaky test'] });
    const row = db.raw.prepare('SELECT * FROM quarantine WHERE test_key = ?').get('checkout::flaky test');
    expect(row).toBeTruthy();

    storage.writeSettings({ quarantinedTests: [] });
    const rowAfter = db.raw.prepare('SELECT * FROM quarantine WHERE test_key = ?').get('checkout::flaky test');
    expect(rowAfter).toBeUndefined();
  });
});
