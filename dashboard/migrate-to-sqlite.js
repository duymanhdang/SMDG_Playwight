/**
 * migrate-to-sqlite.js — one-time (but safely re-runnable) migration of the
 * legacy JSON-file storage into SQLite (dashboard/data/hub.db).
 *
 * Idempotent: uses INSERT OR REPLACE / check-then-insert everywhere, so
 * running it again (e.g. because storage.ensureDirs() calls it on every
 * boot when it detects a fresh DB) never duplicates or corrupts data.
 *
 * The original JSON files under dashboard/data/ are NEVER deleted or
 * modified by this script — they remain as read-only backups.
 *
 * This script reads JSON exclusively through the *old* read functions
 * (kept here as local file-reading helpers, independent of storage.js,
 * so this migration keeps working even after storage.js itself is
 * rewired to read from SQLite).
 */

const fs   = require('node:fs');
const path = require('node:path');
const db   = require('./db');

const DATA_DIR     = path.join(__dirname, 'data');
const RUNS_DIR      = path.join(DATA_DIR, 'runs');
const INDEX_FILE    = path.join(DATA_DIR, 'runs-index.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TRIAGE_FILE   = path.join(DATA_DIR, 'triage.json');
const CYCLES_FILE   = path.join(DATA_DIR, 'cycles.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function testKey(suiteName, title) { return `${suiteName}::${title}`; }

function migrate() {
  const conn = db.ensureDb();

  const index = readJSON(INDEX_FILE, []);
  let runsUpserted = 0;
  let testsUpserted = 0;

  const upsertRun = conn.prepare(`
    INSERT INTO runs (id, type, suite_name, label, mode_label, status, started_at, finished_at,
                       total_tests, passed, failed, skipped, flaky, exit_code, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, suite_name=excluded.suite_name, label=excluded.label,
      mode_label=excluded.mode_label, status=excluded.status, started_at=excluded.started_at,
      finished_at=excluded.finished_at, total_tests=excluded.total_tests, passed=excluded.passed,
      failed=excluded.failed, skipped=excluded.skipped, flaky=excluded.flaky,
      exit_code=excluded.exit_code, position=excluded.position
  `);

  const upsertTest = conn.prepare(`
    INSERT INTO test_results (run_id, test_key, title, suite_name, project_name, file_path,
                               status, duration_ms, error_message, error_category, retries,
                               artifacts_json, ai_diagnosis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, test_key) DO UPDATE SET
      title=excluded.title, suite_name=excluded.suite_name, project_name=excluded.project_name,
      file_path=excluded.file_path, status=excluded.status, duration_ms=excluded.duration_ms,
      error_message=excluded.error_message, error_category=excluded.error_category,
      retries=excluded.retries, artifacts_json=excluded.artifacts_json,
      ai_diagnosis_json=excluded.ai_diagnosis_json
  `);

  index.forEach((r, i) => {
    upsertRun.run(
      r.id, r.type || null, r.suiteName || null, r.label || null, r.modeLabel || null,
      r.status || null, r.startTime || null, r.endTime || null,
      r.totalTests || 0, r.passed || 0, r.failed || 0, r.skipped || 0, r.flaky || 0,
      (typeof r.exitCode === 'number' ? r.exitCode : null), i
    );
    runsUpserted++;

    const detailPath = path.join(RUNS_DIR, `${r.id}.json`);
    const detail = readJSON(detailPath, null);
    if (detail && Array.isArray(detail.tests)) {
      for (const t of detail.tests) {
        const key = t.id || `${t.file || ''}::${t.title}::${t.project || 'default'}`;
        upsertTest.run(
          r.id, key, t.title || null, r.suiteName || null, t.project || null, t.file || null,
          t.status || null, t.duration || 0, t.error || null, t.category || null,
          0,
          t.artifacts ? JSON.stringify(t.artifacts) : null,
          t.aiDiagnosis ? JSON.stringify(t.aiDiagnosis) : null
        );
        testsUpserted++;
      }
    }
  });

  const triageMap = readJSON(TRIAGE_FILE, {});
  const upsertTriage = conn.prepare(`
    INSERT INTO triage (test_key, suite_name, title, status, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(test_key) DO UPDATE SET
      suite_name=excluded.suite_name, title=excluded.title, status=excluded.status,
      note=excluded.note, updated_at=excluded.updated_at
  `);
  for (const [key, v] of Object.entries(triageMap)) {
    upsertTriage.run(key, v.suiteName || null, v.title || null, v.status || null, v.note || '', v.updatedAt || Date.now());
  }

  const cycles = readJSON(CYCLES_FILE, []);
  const upsertCycle = conn.prepare(`
    INSERT INTO cycles (id, name, created_at) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, created_at=excluded.created_at
  `);
  const upsertCycleRun = conn.prepare(`
    INSERT INTO cycle_runs (cycle_id, run_id, position) VALUES (?, ?, ?)
    ON CONFLICT(cycle_id, run_id) DO UPDATE SET position=excluded.position
  `);
  for (const c of cycles) {
    upsertCycle.run(c.id, c.name || null, c.createdAt || Date.now());
    (c.runIds || []).forEach((runId, i) => upsertCycleRun.run(c.id, runId, i));
  }

  const settings = readJSON(SETTINGS_FILE, null);
  if (settings) {
    conn.prepare(`
      INSERT INTO settings (id, data) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data
    `).run(JSON.stringify(settings));
  }

  // Sync settings.quarantinedTests into the dedicated `quarantine` table too,
  // so it can be queried directly (settings.json blob remains the source of
  // truth exposed through readSettings()/writeSettings()).
  let quarantineCount = 0;
  const upsertQuarantine = conn.prepare(`
    INSERT INTO quarantine (test_key, added_at) VALUES (?, ?)
    ON CONFLICT(test_key) DO NOTHING
  `);
  const quarantinedTests = (settings && Array.isArray(settings.quarantinedTests)) ? settings.quarantinedTests : [];
  for (const key of quarantinedTests) {
    upsertQuarantine.run(key, Date.now());
    quarantineCount++;
  }

  return { runsUpserted, testsUpserted, triageCount: Object.keys(triageMap).length, cyclesCount: cycles.length, settingsMigrated: !!settings, quarantineCount };
}

if (require.main === module) {
  const result = migrate();
  console.log('[migrate-to-sqlite] Done:', result);
}

module.exports = { migrate };
