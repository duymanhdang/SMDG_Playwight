/**
 * storage.js — SQLite-backed storage layer (via db.js / node:sqlite).
 *
 * Keeps the exact same exported function names, signatures, and return
 * shapes as the old JSON-file-based storage.js, so server.js and the
 * frontend never need to change. Only the persistence backend moved.
 *
 * Artifacts/HTML reports/NDJSON logs stay as plain files under
 * dashboard/reports and dashboard/data/{trash,tmp} — only the relational
 * data (run index/detail, triage, quarantine, cycles, settings) lives in
 * SQLite now.
 *
 * The original JSON files under dashboard/data/ are left untouched as
 * read-only backups (see migrate-to-sqlite.js) — this file no longer reads
 * or writes them as the source of truth.
 */

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const DATA_DIR      = path.join(__dirname, 'data');
const RUNS_DIR       = path.join(DATA_DIR, 'runs');
const REPORTS_DIR    = path.join(__dirname, 'reports');
const TRASH_DIR      = path.join(DATA_DIR, 'trash');
const TMP_DIR        = path.join(DATA_DIR, 'tmp');

const DEFAULT_SETTINGS = {
  aiEnabled:           false,
  groqApiKey:          '',
  aiModel:             'llama-3.1-8b-instant',
  retentionDays:       30,
  notificationWebhook: null,
  notifierType:        'slack', // 'slack' | 'teams' | 'none' — preserves prior default behavior
  quarantinedTests:    [],
  targetUrl:           '',
  // v1.7.0 — Setup Wizard: Hub Reporter opt-in can't be auto-detected (it's
  // a change in the HOST project's playwright.config.ts), so it's a manual
  // acknowledgment checkbox persisted here, following the same
  // add-a-boolean-to-DEFAULT_SETTINGS pattern as notifierType (v1.0.0).
  setupHubReporterAcked: false,
  // EventlogBot (SAP MDG CR event-log chat widget) — reuses groqApiKey/aiModel
  // above for AI analysis; this only adds the SAP-side connection config.
  eventlogBotEnabled: false,
  sapCookie:          '',
  sapCookieUpdatedAt: null,
  sapBaseUrl:         '',
  sapServicePath:     '/srv-process/CommonProcessService',
};

function ensureDirs() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(TRASH_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  db.ensureDb();
  if (db.isFreshDatabase()) {
    try {
      const { migrate } = require('./migrate-to-sqlite');
      const result = migrate();
      console.log('[storage] Migrated legacy JSON data into SQLite:', result);
    } catch (err) {
      console.error('[storage] One-time JSON->SQLite migration failed:', err.message);
    }
  }
}

function testKeyOf(suiteName, title) { return `${suiteName}::${title}`; }

// ── Run index (compact list) ──────────────────────────────
// Row shape: {id, type, suiteName, label, modeLabel, status, startTime,
//             endTime, totalTests, passed, failed, skipped, flaky, exitCode}
function rowToIndexEntry(r) {
  return {
    id:         r.id,
    type:       r.type,
    suiteName:  r.suite_name,
    label:      r.label,
    modeLabel:  r.mode_label,
    status:     r.status,
    startTime:  r.started_at,
    endTime:    r.finished_at,
    totalTests: r.total_tests,
    passed:     r.passed,
    failed:     r.failed,
    skipped:    r.skipped,
    flaky:      r.flaky,
    exitCode:   r.exit_code,
  };
}

function readIndex() {
  const conn = db.raw;
  const rows = conn.prepare('SELECT * FROM runs ORDER BY position ASC, started_at DESC').all();
  return rows.map(rowToIndexEntry);
}

// Persists the compact index array as-given, in order (index 0 first). This
// mirrors the old JSON file's "whatever order the array is in" semantics —
// upsertIndexEntry's `unshift` puts new runs at position 0, so we store the
// array's order via an integer `position` column and sort by it on read.
function writeIndex(list) {
  const conn = db.raw;
  const existingIds = new Set(conn.prepare('SELECT id FROM runs').all().map((r) => r.id));
  const keepIds = new Set(list.map((r) => r.id));

  const upsert = conn.prepare(`
    INSERT INTO runs (id, type, suite_name, label, mode_label, status, started_at, finished_at,
                       total_tests, passed, failed, skipped, flaky, exit_code, position)
    VALUES (@id, @type, @suiteName, @label, @modeLabel, @status, @startTime, @endTime,
            @totalTests, @passed, @failed, @skipped, @flaky, @exitCode, @position)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, suite_name=excluded.suite_name, label=excluded.label,
      mode_label=excluded.mode_label, status=excluded.status, started_at=excluded.started_at,
      finished_at=excluded.finished_at, total_tests=excluded.total_tests, passed=excluded.passed,
      failed=excluded.failed, skipped=excluded.skipped, flaky=excluded.flaky,
      exit_code=excluded.exit_code, position=excluded.position
  `);

  list.forEach((r, i) => {
    upsert.run({
      id:         r.id,
      type:       r.type || null,
      suiteName:  r.suiteName || null,
      label:      r.label || null,
      modeLabel:  r.modeLabel || null,
      status:     r.status || null,
      startTime:  r.startTime != null ? r.startTime : null,
      endTime:    r.endTime != null ? r.endTime : null,
      totalTests: r.totalTests || 0,
      passed:     r.passed || 0,
      failed:     r.failed || 0,
      skipped:    r.skipped || 0,
      flaky:      r.flaky || 0,
      exitCode:   (typeof r.exitCode === 'number') ? r.exitCode : null,
      position:   i,
    });
  });

  // Anything that existed before but isn't in the new list gets removed —
  // matches the old writeIndex(list) behaviour of fully replacing the file.
  for (const id of existingIds) {
    if (!keepIds.has(id)) conn.prepare('DELETE FROM runs WHERE id = ?').run(id);
  }
}

function upsertIndexEntry(entry) {
  const conn = db.raw;
  const existing = conn.prepare('SELECT * FROM runs WHERE id = ?').get(entry.id);
  if (existing) {
    const merged = { ...rowToIndexEntry(existing), ...entry };
    conn.prepare(`
      UPDATE runs SET type=@type, suite_name=@suiteName, label=@label, mode_label=@modeLabel,
        status=@status, started_at=@startTime, finished_at=@endTime, total_tests=@totalTests,
        passed=@passed, failed=@failed, skipped=@skipped, flaky=@flaky, exit_code=@exitCode
      WHERE id=@id
    `).run({
      id: merged.id,
      type: merged.type || null,
      suiteName: merged.suiteName || null,
      label: merged.label || null,
      modeLabel: merged.modeLabel || null,
      status: merged.status || null,
      startTime: merged.startTime != null ? merged.startTime : null,
      endTime: merged.endTime != null ? merged.endTime : null,
      totalTests: merged.totalTests || 0,
      passed: merged.passed || 0,
      failed: merged.failed || 0,
      skipped: merged.skipped || 0,
      flaky: merged.flaky || 0,
      exitCode: (typeof merged.exitCode === 'number') ? merged.exitCode : null,
    });
  } else {
    // New entries go to the front: shift everyone else's position up by 1.
    conn.prepare('UPDATE runs SET position = position + 1').run();
    conn.prepare(`
      INSERT INTO runs (id, type, suite_name, label, mode_label, status, started_at, finished_at,
                         total_tests, passed, failed, skipped, flaky, exit_code, position)
      VALUES (@id, @type, @suiteName, @label, @modeLabel, @status, @startTime, @endTime,
              @totalTests, @passed, @failed, @skipped, @flaky, @exitCode, 0)
    `).run({
      id: entry.id,
      type: entry.type || null,
      suiteName: entry.suiteName || null,
      label: entry.label || null,
      modeLabel: entry.modeLabel || null,
      status: entry.status || null,
      startTime: entry.startTime != null ? entry.startTime : null,
      endTime: entry.endTime != null ? entry.endTime : null,
      totalTests: entry.totalTests || 0,
      passed: entry.passed || 0,
      failed: entry.failed || 0,
      skipped: entry.skipped || 0,
      flaky: entry.flaky || 0,
      exitCode: (typeof entry.exitCode === 'number') ? entry.exitCode : null,
    });
  }
  return entry;
}

function removeIndexEntry(id) {
  db.raw.prepare('DELETE FROM runs WHERE id = ?').run(id);
  db.raw.prepare('DELETE FROM test_results WHERE run_id = ?').run(id);
}

// ── Run detail (full record) ────────────────────────────
// Shape: {id, suiteName, label, modeLabel, status, startTime, endTime,
//         exitCode, summary, tests: [{id?, title, file, project, status,
//         duration, error, category, artifacts, aiDiagnosis, triage?}]}
function runDetailPath(id) {
  return path.join(RUNS_DIR, `${id}.json`);
}

function readRunDetail(id) {
  const conn = db.raw;
  const run = conn.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  if (!run) return null;

  const testRows = conn.prepare(
    'SELECT * FROM test_results WHERE run_id = ? ORDER BY seq ASC'
  ).all(id);

  const tests = testRows.map((t) => ({
    id:          t.test_key,
    title:       t.title,
    file:        t.file_path,
    project:     t.project_name,
    status:      t.status,
    duration:    t.duration_ms,
    error:       t.error_message,
    category:    t.error_category,
    artifacts:   t.artifacts_json ? JSON.parse(t.artifacts_json) : null,
    aiDiagnosis: t.ai_diagnosis_json ? JSON.parse(t.ai_diagnosis_json) : null,
  }));

  return {
    id:         run.id,
    suiteName:  run.suite_name,
    label:      run.label,
    modeLabel:  run.mode_label,
    status:     run.status,
    startTime:  run.started_at,
    endTime:    run.finished_at,
    exitCode:   run.exit_code,
    summary: {
      totalTests: run.total_tests,
      passed:     run.passed,
      failed:     run.failed,
      flaky:      run.flaky,
      skipped:    run.skipped,
    },
    gitContext: run.context_json ? JSON.parse(run.context_json) : null,
    quarantineSkipped: run.plan_json ? (JSON.parse(run.plan_json).quarantineSkipped || []) : [],
    tests,
  };
}

function writeRunDetail(id, detail) {
  const conn = db.raw;

  const upsertRun = conn.prepare(`
    INSERT INTO runs (id, suite_name, label, mode_label, status, started_at, finished_at,
                       exit_code, total_tests, passed, failed, skipped, flaky, context_json, plan_json)
    VALUES (@id, @suiteName, @label, @modeLabel, @status, @startTime, @endTime,
            @exitCode, @totalTests, @passed, @failed, @skipped, @flaky, @contextJson, @planJson)
    ON CONFLICT(id) DO UPDATE SET
      suite_name=excluded.suite_name, label=excluded.label, mode_label=excluded.mode_label,
      status=excluded.status, started_at=excluded.started_at, finished_at=excluded.finished_at,
      exit_code=excluded.exit_code, total_tests=excluded.total_tests, passed=excluded.passed,
      failed=excluded.failed, skipped=excluded.skipped, flaky=excluded.flaky,
      context_json=COALESCE(excluded.context_json, runs.context_json),
      plan_json=COALESCE(excluded.plan_json, runs.plan_json)
  `);

  const summary = detail.summary || {};
  upsertRun.run({
    id,
    suiteName: detail.suiteName || null,
    label:     detail.label || null,
    modeLabel: detail.modeLabel || null,
    status:    detail.status || null,
    startTime: detail.startTime != null ? detail.startTime : null,
    endTime:   detail.endTime != null ? detail.endTime : null,
    exitCode:  (typeof detail.exitCode === 'number') ? detail.exitCode : null,
    totalTests: summary.totalTests || 0,
    passed:     summary.passed || 0,
    failed:     summary.failed || 0,
    skipped:    summary.skipped || 0,
    flaky:      summary.flaky || 0,
    contextJson: detail.gitContext !== undefined ? JSON.stringify(detail.gitContext) : null,
    planJson:    detail.quarantineSkipped !== undefined ? JSON.stringify({ quarantineSkipped: detail.quarantineSkipped }) : null,
  });

  conn.prepare('DELETE FROM test_results WHERE run_id = ?').run(id);
  const insertTest = conn.prepare(`
    INSERT INTO test_results (run_id, test_key, title, suite_name, project_name, file_path,
                               status, duration_ms, error_message, error_category, retries,
                               artifacts_json, ai_diagnosis_json, seq)
    VALUES (@runId, @testKey, @title, @suiteName, @project, @file, @status, @duration,
            @error, @category, 0, @artifacts, @aiDiagnosis, @seq)
    ON CONFLICT(run_id, test_key) DO UPDATE SET
      title=excluded.title, suite_name=excluded.suite_name, project_name=excluded.project_name,
      file_path=excluded.file_path, status=excluded.status, duration_ms=excluded.duration_ms,
      error_message=excluded.error_message, error_category=excluded.error_category,
      artifacts_json=excluded.artifacts_json, ai_diagnosis_json=excluded.ai_diagnosis_json,
      seq=excluded.seq
  `);

  (detail.tests || []).forEach((t, i) => {
    const key = t.id || `${t.file || ''}::${t.title}::${t.project || 'default'}`;
    insertTest.run({
      runId:      id,
      testKey:    key,
      title:      t.title || null,
      suiteName:  detail.suiteName || null,
      project:    t.project || null,
      file:       t.file || null,
      status:     t.status || null,
      duration:   t.duration || 0,
      error:      t.error || null,
      category:   t.category || null,
      artifacts:  t.artifacts !== undefined ? JSON.stringify(t.artifacts) : null,
      aiDiagnosis: t.aiDiagnosis !== undefined ? JSON.stringify(t.aiDiagnosis) : null,
      seq: i,
    });
  });
}

function deleteRunDetail(id) {
  db.raw.prepare('DELETE FROM test_results WHERE run_id = ?').run(id);
}

// §6.2 — set at run-start time (git branch/sha/dirty), before writeRunDetail
// exists for this run id. The run index row is already inserted by
// upsertIndexEntry() before this is called.
function setRunContext(id, gitContext) {
  db.raw.prepare('UPDATE runs SET context_json = ? WHERE id = ?').run(JSON.stringify(gitContext || null), id);
}

// §F3 — quarantineSkipped: [{testKey, reason}], set at run-start time too.
function setRunPlan(id, plan) {
  db.raw.prepare('UPDATE runs SET plan_json = ? WHERE id = ?').run(JSON.stringify(plan || {}), id);
}

// §v1.3.0 item 1 — persist the spawned child process's OS PID alongside the
// run, so a hub restart can tell a truly-dead run apart from an orphaned but
// still-running Playwright process (see reconcileIndexOnBoot() in server.js).
function setRunPid(id, pid) {
  db.raw.prepare('UPDATE runs SET pid = ? WHERE id = ?').run(pid || null, id);
}

// Rows still marked 'running' plus whatever PID (if any) was on file for
// them — used once at boot, before the in-memory `runs`/`runningProcesses`
// have any entries of their own.
function readRunningWithPid() {
  return db.raw.prepare("SELECT id, pid FROM runs WHERE status = 'running'").all()
    .map((r) => ({ id: r.id, pid: r.pid || null }));
}

// ── Settings ─────────────────────────────────────────────────
function readSettingsRaw() {
  const row = db.raw.prepare('SELECT data FROM settings WHERE id = 1').get();
  return row ? JSON.parse(row.data) : {};
}

function readSettings() {
  const merged = { ...DEFAULT_SETTINGS, ...readSettingsRaw() };
  // §2.4 — prefer GROQ_API_KEY from the environment over the plaintext value
  // stored in settings. The stored value is kept as a fallback for
  // users who don't/can't set an env var; it is never overwritten here.
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    merged.groqApiKey = process.env.GROQ_API_KEY.trim();
    merged.groqApiKeySource = 'env';
  } else {
    merged.groqApiKeySource = merged.groqApiKey ? 'file' : 'none';
  }
  return merged;
}

function syncQuarantineTable(quarantinedTests) {
  const conn = db.raw;
  const keys = Array.isArray(quarantinedTests) ? quarantinedTests : [];
  const existing = conn.prepare('SELECT test_key FROM quarantine').all().map((r) => r.test_key);
  const keepSet = new Set(keys);
  const upsert = conn.prepare(`
    INSERT INTO quarantine (test_key, added_at) VALUES (?, ?)
    ON CONFLICT(test_key) DO NOTHING
  `);
  for (const key of keys) upsert.run(key, Date.now());
  for (const key of existing) {
    if (!keepSet.has(key)) conn.prepare('DELETE FROM quarantine WHERE test_key = ?').run(key);
  }
}

function writeSettings(partial) {
  const merged = { ...readSettings(), ...partial };
  // Don't persist the derived/env-only fields into the stored blob.
  const toStore = { ...merged };
  delete toStore.groqApiKeySource;

  db.raw.prepare(`
    INSERT INTO settings (id, data) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data
  `).run(JSON.stringify(toStore));

  if (Object.prototype.hasOwnProperty.call(partial, 'quarantinedTests')) {
    syncQuarantineTable(merged.quarantinedTests);
  }

  return merged;
}

// ── Report / artifact folders per run id ───────────────────
function reportDir(id) {
  return path.join(REPORTS_DIR, id);
}

function reportHtmlDir(id) {
  return path.join(reportDir(id), 'html');
}

// Persistent copy of a run's screenshots/videos/traces, made right after the
// run finishes (see server.js's archiveAttachments()) — because Playwright
// clears its own outputDir (test-results/) at the START of the *next* run,
// links into the live project folder go dead as soon as another run starts.
// Nested under reportDir(id) so it's covered by the same soft-delete/trash
// and hard-delete lifecycle as the HTML report, with no extra cleanup code.
function reportArtifactsDir(id) {
  return path.join(reportDir(id), 'artifacts');
}

// ── Failure triage (Phase 6.4) ──────────────────────────────
// Keyed by "suiteName::title" (same convention as flaky quarantine keys).
// { [key]: { suiteName, title, status, note, updatedAt } }
function readTriage() {
  const rows = db.raw.prepare('SELECT * FROM triage').all();
  const map = {};
  for (const r of rows) {
    map[r.test_key] = {
      suiteName: r.suite_name,
      title:     r.title,
      status:    r.status,
      note:      r.note,
      updatedAt: r.updated_at,
    };
  }
  return map;
}

function writeTriage(map) {
  const conn = db.raw;
  conn.prepare('DELETE FROM triage').run();
  const insert = conn.prepare(`
    INSERT INTO triage (test_key, suite_name, title, status, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [key, v] of Object.entries(map || {})) {
    insert.run(key, v.suiteName || null, v.title || null, v.status || null, v.note || '', v.updatedAt || Date.now());
  }
}

// ── Regression cycles (Phase 6.6) ───────────────────────────
// [{ id, name, runIds: [], createdAt }]
function readCycles() {
  const conn = db.raw;
  const cycles = conn.prepare('SELECT * FROM cycles ORDER BY position ASC, created_at DESC').all();
  const runRows = conn.prepare('SELECT * FROM cycle_runs ORDER BY position ASC').all();
  const byCycle = {};
  for (const r of runRows) {
    if (!byCycle[r.cycle_id]) byCycle[r.cycle_id] = [];
    byCycle[r.cycle_id].push(r.run_id);
  }
  return cycles.map((c) => ({
    id:        c.id,
    name:      c.name,
    createdAt: c.created_at,
    runIds:    byCycle[c.id] || [],
  }));
}

function writeCycles(list) {
  const conn = db.raw;
  conn.prepare('DELETE FROM cycle_runs').run();
  conn.prepare('DELETE FROM cycles').run();
  const insertCycle = conn.prepare('INSERT INTO cycles (id, name, created_at, position) VALUES (?, ?, ?, ?)');
  const insertRun = conn.prepare('INSERT INTO cycle_runs (cycle_id, run_id, position) VALUES (?, ?, ?)');
  (list || []).forEach((c, i) => {
    insertCycle.run(c.id, c.name || null, c.createdAt || Date.now(), i);
    (c.runIds || []).forEach((runId, j) => insertRun.run(c.id, runId, j));
  });
}

module.exports = {
  DATA_DIR, RUNS_DIR, REPORTS_DIR, TRASH_DIR, TMP_DIR,
  ensureDirs,
  readIndex, writeIndex, upsertIndexEntry, removeIndexEntry,
  readRunDetail, writeRunDetail, deleteRunDetail, setRunContext, setRunPlan,
  setRunPid, readRunningWithPid,
  readSettings, writeSettings,
  reportDir, reportHtmlDir, reportArtifactsDir,
  readTriage, writeTriage,
  readCycles, writeCycles,
};
