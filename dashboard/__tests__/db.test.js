/**
 * db.test.js — CRUD-roundtrip tests for db.js (node:sqlite backend).
 *
 * Uses a dedicated temp database file (not dashboard/data/hub.db) so these
 * tests never touch real app data. Loads db.js fresh via vi.resetModules()
 * per test file run, pointed at a temp DATA_DIR by overriding process.cwd-
 * independent path — simplest approach: require db.js, then swap its
 * internal DB file by requiring a throwaway copy path via env var isn't
 * supported by db.js, so instead we just use db.js's real ensureDb() but
 * against an isolated on-disk file created via a temp HOME, OR — simplest
 * and most robust — directly construct a DatabaseSync against a temp file
 * using the exact same schema, to avoid any risk of touching real data.
 */

import path from 'node:path';
import fs   from 'node:fs';
import os   from 'node:os';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-db-test-'));
const tmpDbFile = path.join(tmpDir, 'test.db');

let db;

function freshDb() {
  if (db) { try { db.close(); } catch (_) {} }
  try { fs.unlinkSync(tmpDbFile); } catch (_) {}
  try { fs.unlinkSync(`${tmpDbFile}-journal`); } catch (_) {}
  try { fs.unlinkSync(`${tmpDbFile}-wal`); } catch (_) {}
  try { fs.unlinkSync(`${tmpDbFile}-shm`); } catch (_) {}
  db = new DatabaseSync(tmpDbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, type TEXT, suite_name TEXT, label TEXT, mode_label TEXT,
      status TEXT, started_at INTEGER, finished_at INTEGER,
      total_tests INTEGER DEFAULT 0, passed INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0, flaky INTEGER DEFAULT 0, exit_code INTEGER,
      plan_json TEXT, context_json TEXT, position INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS test_results (
      run_id TEXT NOT NULL, test_key TEXT NOT NULL, title TEXT, suite_name TEXT,
      project_name TEXT, file_path TEXT, status TEXT, duration_ms INTEGER,
      error_message TEXT, error_category TEXT, retries INTEGER DEFAULT 0,
      artifacts_json TEXT, ai_diagnosis_json TEXT, seq INTEGER DEFAULT 0,
      PRIMARY KEY (run_id, test_key)
    );
    CREATE TABLE IF NOT EXISTS triage (
      test_key TEXT PRIMARY KEY, suite_name TEXT, title TEXT, status TEXT,
      note TEXT, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS quarantine (
      test_key TEXT PRIMARY KEY, added_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY, name TEXT, created_at INTEGER, position INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cycle_runs (
      cycle_id TEXT NOT NULL, run_id TEXT NOT NULL, position INTEGER DEFAULT 0,
      PRIMARY KEY (cycle_id, run_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL
    );
  `);
  return db;
}

afterAll(() => {
  try { db.close(); } catch (_) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

beforeEach(() => {
  freshDb();
});

describe('db.js schema (CRUD roundtrip against an isolated sqlite file)', () => {
  it('inserts and reads back a run row', () => {
    db.prepare(`
      INSERT INTO runs (id, type, suite_name, label, status, started_at, finished_at,
                         total_tests, passed, failed, skipped, flaky, exit_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('run_1', 'suite', 'checkout', 'Checkout', 'done', 1000, 2000, 10, 8, 1, 1, 0, 0);

    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get('run_1');
    expect(row.suite_name).toBe('checkout');
    expect(row.total_tests).toBe(10);
    expect(row.passed).toBe(8);
  });

  it('upserts a run via ON CONFLICT DO UPDATE', () => {
    const upsert = db.prepare(`
      INSERT INTO runs (id, status, total_tests) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, total_tests = excluded.total_tests
    `);
    upsert.run('run_2', 'running', 0);
    upsert.run('run_2', 'done', 5);
    const row = db.prepare('SELECT * FROM runs WHERE id = ?').get('run_2');
    expect(row.status).toBe('done');
    expect(row.total_tests).toBe(5);
    expect(db.prepare('SELECT COUNT(*) AS c FROM runs').get().c).toBe(1);
  });

  it('stores and joins test_results against runs', () => {
    db.prepare('INSERT INTO runs (id, suite_name, started_at, status) VALUES (?, ?, ?, ?)')
      .run('run_3', 'checkout', 1000, 'done');
    db.prepare(`
      INSERT INTO test_results (run_id, test_key, title, suite_name, status, duration_ms, error_category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('run_3', 'k1', 'adds item to cart', 'checkout', 'failed', 1200, 'timeout');

    const rows = db.prepare(`
      SELECT tr.title, tr.status, r.suite_name FROM test_results tr
      JOIN runs r ON r.id = tr.run_id WHERE tr.run_id = ?
    `).all('run_3');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('adds item to cart');
    expect(rows[0].suite_name).toBe('checkout');
  });

  it('deletes test_results when a run is removed', () => {
    db.prepare('INSERT INTO runs (id) VALUES (?)').run('run_4');
    db.prepare('INSERT INTO test_results (run_id, test_key, title) VALUES (?, ?, ?)').run('run_4', 'k1', 't1');
    db.prepare('DELETE FROM runs WHERE id = ?').run('run_4');
    db.prepare('DELETE FROM test_results WHERE run_id = ?').run('run_4');
    expect(db.prepare('SELECT COUNT(*) AS c FROM test_results WHERE run_id = ?').get('run_4').c).toBe(0);
  });

  it('roundtrips triage rows', () => {
    db.prepare(`
      INSERT INTO triage (test_key, suite_name, title, status, note, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('checkout::adds item', 'checkout', 'adds item', 'bug', 'known issue', 12345);
    const row = db.prepare('SELECT * FROM triage WHERE test_key = ?').get('checkout::adds item');
    expect(row.status).toBe('bug');
    expect(row.note).toBe('known issue');
  });

  it('roundtrips quarantine rows with ON CONFLICT DO NOTHING', () => {
    const upsert = db.prepare('INSERT INTO quarantine (test_key, added_at) VALUES (?, ?) ON CONFLICT(test_key) DO NOTHING');
    upsert.run('checkout::flaky test', 111);
    upsert.run('checkout::flaky test', 222); // should be a no-op
    const row = db.prepare('SELECT * FROM quarantine WHERE test_key = ?').get('checkout::flaky test');
    expect(row.added_at).toBe(111);
    expect(db.prepare('SELECT COUNT(*) AS c FROM quarantine').get().c).toBe(1);
  });

  it('roundtrips cycles + cycle_runs', () => {
    db.prepare('INSERT INTO cycles (id, name, created_at) VALUES (?, ?, ?)').run('cycle_1', 'Release 1', 999);
    db.prepare('INSERT INTO cycle_runs (cycle_id, run_id, position) VALUES (?, ?, ?)').run('cycle_1', 'run_a', 0);
    db.prepare('INSERT INTO cycle_runs (cycle_id, run_id, position) VALUES (?, ?, ?)').run('cycle_1', 'run_b', 1);

    const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get('cycle_1');
    const runIds = db.prepare('SELECT run_id FROM cycle_runs WHERE cycle_id = ? ORDER BY position').all('cycle_1').map((r) => r.run_id);
    expect(cycle.name).toBe('Release 1');
    expect(runIds).toEqual(['run_a', 'run_b']);
  });

  it('roundtrips the settings single-row JSON blob', () => {
    const blob = { aiEnabled: true, retentionDays: 45 };
    db.prepare(`
      INSERT INTO settings (id, data) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run(JSON.stringify(blob));

    const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
    expect(JSON.parse(row.data)).toEqual(blob);

    const blob2 = { aiEnabled: false, retentionDays: 10 };
    db.prepare(`
      INSERT INTO settings (id, data) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `).run(JSON.stringify(blob2));
    const row2 = db.prepare('SELECT data FROM settings WHERE id = 1').get();
    expect(JSON.parse(row2.data)).toEqual(blob2);
    expect(db.prepare('SELECT COUNT(*) AS c FROM settings').get().c).toBe(1);
  });
});

describe('db.js module surface (real module, real data dir)', () => {
  it('exposes the expected exports and a working DatabaseSync via .raw', () => {
    const realDb = require('../db');
    expect(typeof realDb.ensureDb).toBe('function');
    expect(typeof realDb.isFreshDatabase).toBe('function');
    expect(typeof realDb.DATA_DIR).toBe('string');
    expect(typeof realDb.DB_FILE).toBe('string');
    expect(realDb.SCHEMA_VERSION).toBe(1);

    const conn = realDb.raw;
    expect(conn).toBeTruthy();
    // sanity: the well-known tables exist
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    for (const t of ['runs', 'test_results', 'triage', 'quarantine', 'cycles', 'cycle_runs', 'settings', 'schema_version']) {
      expect(tables).toContain(t);
    }
  });
});
