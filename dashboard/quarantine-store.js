/**
 * quarantine-store.js — F3 Quarantine Governance (v1.0.0).
 *
 * PROJECT_ROOT/.hub/quarantine.json is the SOURCE OF TRUTH (git-committable,
 * human-diffable, JSON — see ARCHITECTURE_PLAN §ADR-5/ADR-6 for the "commit
 * friendly, JSON not YAML" decision). The SQLite `quarantine` table is a
 * queryable mirror rebuilt from this file on every write and on boot — never
 * the other way around.
 *
 * Entry shape:
 *   { key, suiteName, title, reason, requestedBy, createdAt, expiresAt }
 * key === `${suiteName}::${title}` (same convention used everywhere else in
 * this codebase for triage/flaky keys).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const MIN_EXPIRES_DAYS = 1;
const MAX_EXPIRES_DAYS = 60;
const DEFAULT_EXPIRES_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function testKey(suiteName, title) { return `${suiteName}::${title}`; }

function quarantineFilePath(projectRoot) {
  return path.join(projectRoot, '.hub', 'quarantine.json');
}

function readQuarantineFile(projectRoot) {
  const file = quarantineFilePath(projectRoot);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
    return [];
  } catch (_) {
    return [];
  }
}

function writeQuarantineFile(projectRoot, entries) {
  const file = quarantineFilePath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = { entries: entries || [] };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function isValidExpiresInDays(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN_EXPIRES_DAYS && n <= MAX_EXPIRES_DAYS;
}

/** Pure calculation, unit-tested separately. */
function computeExpiresAt(createdAt, expiresInDays) {
  const days = isValidExpiresInDays(expiresInDays) ? Number(expiresInDays) : DEFAULT_EXPIRES_DAYS;
  return createdAt + days * DAY_MS;
}

function daysRemaining(expiresAt, now) {
  return Math.ceil((expiresAt - (now || Date.now())) / DAY_MS);
}

/** Rebuild the SQLite `quarantine` mirror table + settings.quarantinedTests
 * cache from the given (authoritative) entries array. `db` and `storage` are
 * passed in to avoid a require cycle (storage.js does not need to know about
 * this module). */
function rebuildMirror(db, storage, entries) {
  const conn = db.raw;
  conn.prepare('DELETE FROM quarantine').run();
  const insert = conn.prepare(`
    INSERT INTO quarantine (test_key, added_at, suite_name, title, reason, requested_by, created_at, expires_at)
    VALUES (@key, @createdAt, @suiteName, @title, @reason, @requestedBy, @createdAt, @expiresAt)
  `);
  for (const e of entries) {
    insert.run({
      key: e.key, createdAt: e.createdAt, suiteName: e.suiteName,
      title: e.title, reason: e.reason, requestedBy: e.requestedBy, expiresAt: e.expiresAt,
    });
  }
  // Keep the legacy settings.quarantinedTests array (consumed by
  // quarantinedTitlesForSuite() to build the --grep-invert exclusion list)
  // in sync so existing run-start logic keeps working unmodified.
  storage.writeSettings({ quarantinedTests: entries.map((e) => e.key) });
}

function loadAll(projectRoot, db, storage) {
  return readQuarantineFile(projectRoot);
}

/**
 * @returns the newly-created entry, or { error } if reason/requestedBy/expiresInDays invalid.
 */
function addEntry(projectRoot, db, storage, { suiteName, title, reason, requestedBy, expiresInDays }) {
  if (!suiteName || !title) return { error: 'suiteName and title are required' };
  if (!reason || typeof reason !== 'string' || !reason.trim()) return { error: 'reason is required' };
  if (!requestedBy || typeof requestedBy !== 'string' || !requestedBy.trim()) return { error: 'requestedBy is required' };
  if (expiresInDays !== undefined && !isValidExpiresInDays(expiresInDays)) {
    return { error: `expiresInDays must be an integer between ${MIN_EXPIRES_DAYS} and ${MAX_EXPIRES_DAYS}` };
  }

  const entries = readQuarantineFile(projectRoot);
  const key = testKey(suiteName, title);
  const now = Date.now();
  const entry = {
    key, suiteName, title,
    reason: reason.trim(),
    requestedBy: requestedBy.trim(),
    createdAt: now,
    expiresAt: computeExpiresAt(now, expiresInDays),
  };
  const filtered = entries.filter((e) => e.key !== key);
  filtered.push(entry);
  writeQuarantineFile(projectRoot, filtered);
  rebuildMirror(db, storage, filtered);
  return entry;
}

function releaseEntry(projectRoot, db, storage, key) {
  const entries = readQuarantineFile(projectRoot);
  const filtered = entries.filter((e) => e.key !== key);
  writeQuarantineFile(projectRoot, filtered);
  rebuildMirror(db, storage, filtered);
  return filtered.length !== entries.length;
}

/** Scans entries, removes (releases) any past expiresAt. Returns the list of
 * released entries so callers can log what happened. Pure-ish: takes `now`
 * for testability. */
function computeExpiredSplit(entries, now) {
  const nowTs = now || Date.now();
  const active = entries.filter((e) => e.expiresAt > nowTs);
  const released = entries.filter((e) => e.expiresAt <= nowTs);
  return { active, released };
}

function releaseExpired(projectRoot, db, storage, now) {
  const entries = readQuarantineFile(projectRoot);
  const { active, released } = computeExpiredSplit(entries, now);
  if (released.length) {
    writeQuarantineFile(projectRoot, active);
    rebuildMirror(db, storage, active);
  }
  return released;
}

function listActive(projectRoot, now) {
  const nowTs = now || Date.now();
  return readQuarantineFile(projectRoot).map((e) => ({
    ...e,
    daysRemaining: daysRemaining(e.expiresAt, nowTs),
  }));
}

module.exports = {
  MIN_EXPIRES_DAYS, MAX_EXPIRES_DAYS, DEFAULT_EXPIRES_DAYS,
  testKey, quarantineFilePath,
  readQuarantineFile, writeQuarantineFile,
  isValidExpiresInDays, computeExpiresAt, daysRemaining,
  addEntry, releaseEntry, releaseExpired, listActive,
  computeExpiredSplit, loadAll, rebuildMirror,
};
