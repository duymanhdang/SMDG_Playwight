/**
 * db.js — node:sqlite (DatabaseSync) storage backend.
 *
 * Uses Node's built-in `node:sqlite` module (Node >= 22.5, confirmed on
 * Node v24.14.0 here) — no native bindings, no better-sqlite3 dependency.
 *
 * Schema (schema_version = 1):
 *   runs         — one row per test run (mirrors the old runs-index.json + summary)
 *   test_results — one row per test within a run (mirrors runs/<id>.json .tests[])
 *   triage       — failure triage annotations, keyed by "suiteName::title"
 *   quarantine   — quarantined test keys (mirrors settings.quarantinedTests, kept as
 *                  its own table for querying convenience; settings.quarantinedTests
 *                  stays the source of truth exposed through readSettings()/writeSettings())
 *   cycles       — regression cycles
 *   cycle_runs   — join table: which run ids belong to which cycle, with order
 *   settings     — single-row JSON blob (keeps the exact same merged-object shape
 *                  storage.js has always exposed, with the least amount of churn)
 *   schema_version — single row tracking the current schema version
 *
 * All other modules must go through storage.js, not this file, directly.
 */

const path = require('node:path');
const fs   = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
// Overridable so tests can point at an isolated temp file instead of the
// real dashboard/data/hub.db — see __tests__/storage.test.js, which used to
// run destructive DELETE FROM <table> resets directly against the real file
// (the only other option, since this path was previously hardcoded), which
// wiped real settings (Groq key, SAP cookie, ...) if a manual `npm test` run
// ever overlapped with the live dashboard process.
const DB_FILE  = process.env.HUB_DB_FILE || path.join(DATA_DIR, 'hub.db');

const SCHEMA_VERSION = 1;

let db = null;

function ensureDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate();
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id           TEXT PRIMARY KEY,
      type         TEXT,
      suite_name   TEXT,
      label        TEXT,
      mode_label   TEXT,
      status       TEXT,
      started_at   INTEGER,
      finished_at  INTEGER,
      total_tests  INTEGER DEFAULT 0,
      passed       INTEGER DEFAULT 0,
      failed       INTEGER DEFAULT 0,
      skipped      INTEGER DEFAULT 0,
      flaky        INTEGER DEFAULT 0,
      exit_code    INTEGER,
      plan_json    TEXT,
      context_json TEXT,
      position     INTEGER DEFAULT 0,
      pid          INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
    CREATE INDEX IF NOT EXISTS idx_runs_status_started_at ON runs(status, started_at);

    CREATE TABLE IF NOT EXISTS test_results (
      run_id          TEXT NOT NULL,
      test_key        TEXT NOT NULL,
      title           TEXT,
      suite_name      TEXT,
      project_name    TEXT,
      file_path       TEXT,
      status          TEXT,
      duration_ms     INTEGER,
      error_message   TEXT,
      error_category  TEXT,
      retries         INTEGER DEFAULT 0,
      artifacts_json  TEXT,
      ai_diagnosis_json TEXT,
      seq             INTEGER DEFAULT 0,
      PRIMARY KEY (run_id, test_key)
    );
    CREATE INDEX IF NOT EXISTS idx_test_results_test_key ON test_results(test_key, run_id);

    CREATE TABLE IF NOT EXISTS triage (
      test_key   TEXT PRIMARY KEY,
      suite_name TEXT,
      title      TEXT,
      status     TEXT,
      note       TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS quarantine (
      test_key     TEXT PRIMARY KEY,
      added_at     INTEGER,
      suite_name   TEXT,
      title        TEXT,
      reason       TEXT,
      requested_by TEXT,
      created_at   INTEGER,
      expires_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id         TEXT PRIMARY KEY,
      name       TEXT,
      created_at INTEGER,
      position   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cycle_runs (
      cycle_id TEXT NOT NULL,
      run_id   TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (cycle_id, run_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      id   INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
  `);

  const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
  if (!row) {
    db.prepare('INSERT INTO schema_version (id, version) VALUES (1, ?)').run(SCHEMA_VERSION);
  }

  // §v1.0 F3 — older databases created before the quarantine governance
  // columns existed. ALTER TABLE ADD COLUMN is idempotent-guarded here since
  // node:sqlite has no "ADD COLUMN IF NOT EXISTS".
  const quarantineCols = db.prepare("PRAGMA table_info(quarantine)").all().map((c) => c.name);
  const wantedCols = {
    suite_name: 'TEXT', title: 'TEXT', reason: 'TEXT',
    requested_by: 'TEXT', created_at: 'INTEGER', expires_at: 'INTEGER',
  };
  for (const [col, type] of Object.entries(wantedCols)) {
    if (!quarantineCols.includes(col)) {
      db.exec(`ALTER TABLE quarantine ADD COLUMN ${col} ${type}`);
    }
  }

  // §v1.0 — context_json column on runs (git branch/sha/dirty at run-start).
  const runsCols = db.prepare("PRAGMA table_info(runs)").all().map((c) => c.name);
  if (!runsCols.includes('context_json')) {
    db.exec('ALTER TABLE runs ADD COLUMN context_json TEXT');
  }

  // §v1.3.0 item 1 — pid column so an active run's OS process id survives a
  // hub restart (reconcileIndexOnBoot() in server.js uses this to tell a
  // truly-dead run apart from a still-running orphaned Playwright process).
  // Runs created before this migration simply have pid = NULL, which the
  // boot-reconcile code treats as "no PID on file -> fall back to the old
  // mark-interrupted behavior".
  if (!runsCols.includes('pid')) {
    db.exec('ALTER TABLE runs ADD COLUMN pid INTEGER');
  }
}

function isFreshDatabase() {
  ensureDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM runs').get();
  return row.c === 0;
}

module.exports = {
  DATA_DIR, DB_FILE, SCHEMA_VERSION,
  ensureDb,
  isFreshDatabase,
  get raw() { return ensureDb(); },
};
