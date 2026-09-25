/**
 * SimpleMDG Automation Hub — server.js
 * Dependencies: express, glob
 *
 * Architecture:
 *  - The server spawns Playwright directly (tracks exit code + status).
 *  - A separate PowerShell window is opened to show live output via a tailed log file.
 *  - The browser polls /api/runs every 3s for live status updates in the current session.
 *  - Full run results are persisted through storage.js (plain JSON files, no DB required).
 *  - Each run gets its own HTML report folder (reports/<runId>/html) so concurrent
 *    runs never overwrite each other's report.
 *  - Failed tests are categorized with a rule-based classifier (no AI needed).
 *  - Screenshots/videos/traces produced under the project's test-results/ folder are
 *    exposed as clickable links via the /test-artifacts static route.
 *  - AI diagnosis (Groq) is an entirely optional layer, off by default — see
 *    the Settings page. When disabled, every other feature keeps working.
 *  - A lightweight retention policy deletes old runs automatically on boot.
 */

const express       = require('express');
const path          = require('path');
const fs            = require('fs');
const dns           = require('dns');
const http          = require('http');
const https         = require('https');
const { spawn }     = require('child_process');
const { glob }      = require('glob');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');

const storage       = require('./storage');
const db            = require('./db');
const { parsePlaywrightJsonReport } = require('./pw-json-parser');
const { breakdown } = require('./classifier');
const { scanFileForTags, scanFileForExtendedTags, scanFileForTestTags, findTagTypos } = require('./tag-scanner');
const { buildRunHistoryCsv, generateSummaryPdf, buildPrintReportHtml, buildReportCenterPrintHtml, buildTeamsPayload } = require('./export');
const groq          = require('./groq-client');
const sapEventlog   = require('./sap-eventlog-client');
const pkg           = require('./package.json');
const { buildGrepPattern } = require('./grep-pattern');
const { dayKey }    = require('./day-bucket');
const { readHubConfig } = require('./hub-config');
const { readNewLines } = require('./ndjson-tail');
const quarantineStore = require('./quarantine-store');
const { getGitContext } = require('./git-context');
const { buildCoverageMatrix } = require('./coverage-matrix');
const { computeOverview, quarantineSkippedCountsFromRuns, computeDeltas, computeRunStats, computeRunStatusTrend, RUN_STATS_DELTA_KEYS, computeSuiteHealthTrend } = require('./report-aggregator');
const { isProcessAlive } = require('./process-liveness');
const { normalizeErrorSignature } = require('./failure-signature');
const { computeReadiness, computeRequirementRisk } = require('./readiness');
const { computeTagAdoptionPercent, computeSetupStatus } = require('./setup-status');
const { createReportServerPool } = require('./report-server-pool');

const app  = express();
// §7 (v0.9.0) — PORT was previously hardcoded; both PORT and HOST are now
// env-overridable, matching the HOST override that already existed.
const PORT = Number(process.env.PORT) || 3000;
// §2.1 — local-only tool: bind to loopback by default, HOST env var for override.
const HOST = process.env.HOST || '127.0.0.1';

const PROJECT_ROOT      = path.resolve(__dirname, '..');
// Default Playwright output dir for screenshots/videos/traces (playwright.config.ts
// can override this — see UPGRADE_NOTES.md for the "outputDir must match" caveat).
const TEST_RESULTS_ROOT = path.join(PROJECT_ROOT, 'test-results');
// Resolve the Playwright CLI directly so we never need shell:true / npx.cmd (§2.3).
const PW_CLI = path.join(PROJECT_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

storage.ensureDirs();

// §v1.8.1 — restores Playwright's OWN `show-report` server for viewing a
// run's native HTML report (screenshot thumbnails in that report's own
// "Screenshots" panel were found broken when served via plain
// express.static — see UPGRADE_NOTES.md v1.8.1). Spawned the same safe way
// as everything else in this file: shell:false, argv-only, PW_CLI resolved
// directly (no npx/cmd.exe). If this ever fails to spawn (Playwright CLI
// missing, port exhaustion, etc.) every call site below falls back to the
// old static /report-assets/:runId/index.html route.
const reportServerPool = createReportServerPool({
  pwCliPath: PW_CLI,
  cwd: PROJECT_ROOT,
});

// ── §3.13 — sweep any leftover _pw_result_*/_pw_log_* tmp files on boot ──
function sweepTmpOnBoot() {
  try {
    const entries = fs.readdirSync(storage.TMP_DIR);
    for (const name of entries) {
      try { fs.unlinkSync(path.join(storage.TMP_DIR, name)); } catch (_) {}
    }
  } catch (_) {}
  // Also clean up any stragglers from older versions that wrote to PROJECT_ROOT.
  try {
    const rootEntries = fs.readdirSync(PROJECT_ROOT);
    for (const name of rootEntries) {
      if (/^_pw_(result|log)_/.test(name)) {
        try { fs.unlinkSync(path.join(PROJECT_ROOT, name)); } catch (_) {}
      }
    }
  } catch (_) {}
}
sweepTmpOnBoot();

// ── In-memory session store (keeps /api/runs polling snappy) ──────────
// { id, label, suite, suiteFullName, modeLabel, status, startTime, endTime, exitCode }
let runs = [];
const runningProcesses = new Map(); // runId -> child process (used by Stop)

function generateRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `run_${stamp}_${rand}`;
}

// §v1.3.0 item 1 — if the server restarts while a run was still in progress,
// don't blindly mark it "interrupted": check whether the underlying OS
// process (by persisted PID) is actually still alive. If it is, the
// Playwright process is orphaned-but-running from the hub's point of view —
// keep it represented as 'running' (re-tracked into the in-memory `runs`/
// `runningProcesses` maps below, so /api/runs/:id/stop can still kill it by
// PID) rather than falsely calling it "interrupted" while it keeps consuming
// a real worker slot. Only when the PID is missing (pre-migration run) or
// the process is confirmed dead does the previous mark-interrupted behavior
// apply.
function reconcileIndexOnBoot() {
  const list = storage.readIndex();
  const pidRows = storage.readRunningWithPid();
  const pidById = new Map(pidRows.map((r) => [r.id, r.pid]));
  let changed = false;
  for (const r of list) {
    if (r.status !== 'running') continue;
    const pid = pidById.get(r.id);
    if (pid && isProcessAlive(pid)) {
      console.log(`[boot] Run ${r.id} (pid ${pid}) is still alive after a hub restart — keeping it as 'running' and re-tracking by PID.`);
      runs.unshift({
        id:            r.id,
        label:         r.label,
        suite:         (r.suiteName || '').replace(/^S4_(SIT|QAS)_AUTO_/, ''),
        suiteFullName: r.suiteName,
        modeLabel:     r.modeLabel,
        status:        'running',
        startTime:     r.startTime,
        endTime:       null,
        exitCode:      null,
        reattached:    true, // no live stdout/stderr pipe available post-restart, only PID control
      });
      // Minimal stand-in "process handle" — enough for the existing
      // /api/runs/:id/stop code path (which only ever reads .pid, or on
      // win32 shells out to `taskkill /pid <pid>` directly) to keep working
      // even though this process wasn't spawned by this hub instance.
      runningProcesses.set(r.id, {
        pid,
        kill(signal) { try { process.kill(pid, signal || 'SIGTERM'); } catch (_) {} },
      });
      continue;
    }
    r.status = 'interrupted';
    changed = true;
  }
  if (changed) storage.writeIndex(list);
}
reconcileIndexOnBoot();

// §v1.3.0 item 1 — graceful shutdown: a clean SIGTERM/SIGINT (e.g. Ctrl+C,
// or a process manager stopping the hub) should not itself orphan any
// in-progress Playwright child unnecessarily. We don't kill the children
// here (a user may want their test run to keep going even if the hub UI is
// restarted) but we do log a clear warning so it's obvious they'll be
// reconciled-by-PID on next boot rather than silently vanishing.
function shutdownGracefully(signal) {
  console.log(`\n[hub] Received ${signal}, shutting down...`);
  if (runningProcesses.size > 0) {
    const ids = Array.from(runningProcesses.keys()).join(', ');
    console.warn(`[hub] ${runningProcesses.size} run(s) still in progress (${ids}) — their child process(es) are left running and will be re-detected by PID on the next boot.`);
  }
  // §v1.8.1 — unlike in-progress test runs (left running, above), any
  // `show-report` server processes we spawned are purely a viewing
  // convenience with no in-progress work to preserve — always clean these up.
  try { reportServerPool.stopAll(); } catch (_) {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));

// ── Retention: delete runs older than settings.retentionDays, run once at boot ──
function dirSize(dirPath) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch (_) { return 0; }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else {
      try { total += fs.statSync(full).size; } catch (_) {}
    }
  }
  return total;
}

// §3.8 — soft delete: move a run's data to data/trash/<runId>/ instead of an
// immediate hard delete. Hard-delete sweep for trash entries runs separately
// (see sweepTrash below) and only removes entries older than 7 days.
function isValidRetentionDays(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 3650;
}

function softDeleteRun(id) {
  const trashEntryDir = path.join(storage.TRASH_DIR, id);
  fs.mkdirSync(trashEntryDir, { recursive: true });

  // Move run detail JSON, if present.
  const detailSrc = path.join(storage.RUNS_DIR, `${id}.json`);
  if (fs.existsSync(detailSrc)) {
    try { fs.renameSync(detailSrc, path.join(trashEntryDir, 'detail.json')); } catch (_) {}
  }
  // Move the report dir (html report, pdf, etc.), if present.
  const reportSrc = storage.reportDir(id);
  if (fs.existsSync(reportSrc)) {
    try { fs.renameSync(reportSrc, path.join(trashEntryDir, 'report')); }
    catch (_) { try { fs.rmSync(reportSrc, { recursive: true, force: true }); } catch (_) {} }
  }
  try { fs.writeFileSync(path.join(trashEntryDir, 'trashed-at.txt'), String(Date.now())); } catch (_) {}

  storage.removeIndexEntry(id);
}

function deleteRunCompletely(id) {
  // Kept for the explicit DELETE /api/runs/:id endpoint — hard delete on
  // direct user request, soft-delete is used for retention/cleanup instead.
  storage.removeIndexEntry(id);
  storage.deleteRunDetail(id);
  fs.rmSync(storage.reportDir(id), { recursive: true, force: true });
}

function cleanupOldRuns(retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const list = storage.readIndex();
  let deletedCount = 0;
  let freedBytes = 0;
  for (const r of list) {
    if (r.status === 'running') continue; // never auto-delete an in-progress run
    if (r.startTime && r.startTime < cutoff) {
      freedBytes += dirSize(storage.reportDir(r.id));
      softDeleteRun(r.id);
      deletedCount++;
    }
  }
  return { deletedCount, freedBytes };
}

// Hard-delete trash entries older than 7 days.
function sweepTrash() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let entries;
  try { entries = fs.readdirSync(storage.TRASH_DIR, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(storage.TRASH_DIR, entry.name);
    let trashedAt = 0;
    try { trashedAt = Number(fs.readFileSync(path.join(dir, 'trashed-at.txt'), 'utf8')) || 0; } catch (_) {}
    if (!trashedAt || trashedAt < cutoff) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

function runRetentionCleanupOnBoot() {
  try {
    const settings = storage.readSettings();
    if (isValidRetentionDays(settings.retentionDays)) {
      const result = cleanupOldRuns(settings.retentionDays);
      if (result.deletedCount) {
        console.log(`[retention] Cleaned up ${result.deletedCount} run(s) older than ${settings.retentionDays} day(s).`);
      }
    }
    sweepTrash();
  } catch (err) {
    console.error('[retention] Cleanup on boot failed:', err.message);
  }
}
runRetentionCleanupOnBoot();

// §3.14 — also run retention (and the trash sweep) on a 24h interval while
// the server stays up, not just once at boot.
setInterval(runRetentionCleanupOnBoot, 24 * 60 * 60 * 1000);

// ── F3 Quarantine Governance — auto-release expired entries ────────────
// On boot AND once per 24h interval (reuses the retention-interval pattern
// above). PROJECT_ROOT/.hub/quarantine.json is the source of truth; the
// SQLite `quarantine` table + settings.quarantinedTests are rebuilt from it.
function runQuarantineAutoRelease() {
  try {
    const released = quarantineStore.releaseExpired(PROJECT_ROOT, db, storage);
    if (released.length) {
      console.log(`[quarantine] Auto-released ${released.length} expired entr${released.length === 1 ? 'y' : 'ies'}:`,
        released.map((e) => `${e.key} (expired ${new Date(e.expiresAt).toISOString()})`).join(', '));
    }
  } catch (err) {
    console.error('[quarantine] Auto-release failed:', err.message);
  }
}
runQuarantineAutoRelease();
setInterval(runQuarantineAutoRelease, 24 * 60 * 60 * 1000);

// ── Concurrency limits ────────────────────
// §A6 / §7 (v0.9.0) — the hardcoded values below are still the defaults;
// dashboard/hub.config.json (optional, gitignored, NOT created by the hub
// itself — see hub.config.example.json) can override any of these three
// keys. Read once at boot; a missing/malformed file falls back cleanly to
// these defaults and never crashes boot (see hub-config.js).
const LIMITS = readHubConfig({
  maxSpecs:        4,   // max spec runs at the same time
  maxSuites:       2,   // max suite runs at the same time
  maxTotalWorkers: 6,   // max total workers across all running suites
});

function getRunningStats() {
  const running = runs.filter(r => r.status === 'running');
  const specs   = running.filter(r => r.label.startsWith('[SPEC]'));
  const suites  = running.filter(r => r.label.startsWith('[SUITE]'));
  const totalWorkers = suites.reduce((sum, r) => {
    const m = r.modeLabel.match(/w(\d+)/);
    return sum + (m ? parseInt(m[1]) : 1);
  }, 0);
  return { running, specs, suites, totalWorkers };
}

function checkLimits(type, workers) {
  const { specs, suites, totalWorkers } = getRunningStats();
  if (type === 'spec') {
    if (specs.length >= LIMITS.maxSpecs) {
      return `Too many specs running (${specs.length}/${LIMITS.maxSpecs} max). Wait for one to finish.`;
    }
  }
  if (type === 'suite') {
    if (suites.length >= LIMITS.maxSuites) {
      return `Too many suites running (${suites.length}/${LIMITS.maxSuites} max). Wait for one to finish.`;
    }
    const projectedWorkers = totalWorkers + (workers || 2);
    if (projectedWorkers > LIMITS.maxTotalWorkers) {
      return `Worker limit exceeded: ${totalWorkers} used + ${workers || 2} requested = ${projectedWorkers} (max ${LIMITS.maxTotalWorkers}).`;
    }
  }
  return null; // OK
}

// ── §v1.3.0 item 2 — pre-flight checks before starting a run ───────────
// Reuses the existing hub.config.json merge pattern (§A6) for the one
// configurable knob: whether an unreachable target env should hard-BLOCK a
// run or just warn. Default is warn-only — a hard block can be too strict
// if a QA wants to run anyway against a known-flaky environment.
const PREFLIGHT_CONFIG = readHubConfig({ blockOnUnreachableTarget: false });

// ── §v1.4.0 item 1 — Release Readiness / Go-No-Go thresholds ───────────
// Same hub.config.json merge pattern (§A6) as LIMITS/PREFLIGHT_CONFIG above —
// no second config mechanism. All four keys are optional; missing/malformed
// values fall back to these defaults and never crash boot (see hub-config.js).
const READINESS_CONFIG = readHubConfig({
  passRateThreshold:  95,  // % — overall pass rate check (readiness.js percentVerdict)
  coverageThreshold:  80,  // % — business processes with >=1 automated&passing test
  nearExpiryDays:     3,   // quarantine entries at/under this many days remaining -> WARN
  regressionWarnAt:   1,   // count of newly-regressed tests -> WARN
  regressionFailAt:   3,   // count of newly-regressed tests -> FAIL
});

// (b) Playwright CLI resolves — this is already implicitly required by the
// spawn in startTestRun(), but checking explicitly up front gives a clear
// error message instead of an obscure spawn ENOENT deep in a 'close'/'error'
// handler.
function checkPlaywrightCliPresent() {
  return fs.existsSync(PW_CLI);
}

// (c) Basic disk-space sanity check on the drive containing dashboard/data
// and dashboard/reports. Node has no built-in cross-platform disk-free API
// without adding a dependency; `fs.statfsSync` (Node >= 18.15) IS built-in
// and reports free blocks for the filesystem containing a given path on
// both POSIX and Windows — so that's used here instead of pulling in a new
// package or shelling out to `wmic`/`df`. Non-fatal by design (warn only):
// this is the least critical of the three pre-flight checks.
const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024; // 500 MB
function checkDiskSpace(dirPath) {
  try {
    const stats = fs.statfsSync(dirPath);
    const freeBytes = stats.bavail * stats.bsize;
    return { ok: freeBytes >= MIN_FREE_DISK_BYTES, freeBytes, checked: true };
  } catch (err) {
    // fs.statfsSync can be unavailable/unsupported on some platforms/older
    // Node builds — never fail the pre-flight sequence over this.
    return { ok: true, freeBytes: null, checked: false, error: err.message };
  }
}

// Runs all three checks and returns a UI-friendly result list plus an
// overall `blocked` flag. `checkTarget` is true only when settings.targetUrl
// is configured (there's nothing to ping otherwise).
async function runPreflightChecks() {
  const checks = [];

  // (a) target environment reachability (reuses the same pingUrl()/
  // assertOutboundUrlAllowed() used by GET /api/environment/ping — no
  // duplicated HTTP-request code).
  const settings = storage.readSettings();
  if (settings.targetUrl) {
    try {
      await assertOutboundUrlAllowed(settings.targetUrl);
      const result = await pingUrl(settings.targetUrl);
      checks.push({ name: 'target-env', status: 'ok', message: `Target environment reachable (HTTP ${result.statusCode}).` });
    } catch (err) {
      const blocking = !!PREFLIGHT_CONFIG.blockOnUnreachableTarget;
      checks.push({
        name: 'target-env',
        status: blocking ? 'block' : 'warn',
        message: `Target environment (${settings.targetUrl}) appears unreachable: ${err.message}`,
      });
    }
  } else {
    checks.push({ name: 'target-env', status: 'ok', message: 'No target URL configured — skipped.' });
  }

  // (b) Playwright CLI present — always fatal if missing, a run cannot
  // possibly succeed without it.
  if (checkPlaywrightCliPresent()) {
    checks.push({ name: 'playwright-cli', status: 'ok', message: 'Playwright CLI found.' });
  } else {
    checks.push({
      name: 'playwright-cli', status: 'block',
      message: `Playwright CLI not found at ${PW_CLI} — run "npm install" in the project root.`,
    });
  }

  // (c) disk space — warn only.
  const disk = checkDiskSpace(storage.DATA_DIR);
  if (!disk.checked) {
    checks.push({ name: 'disk-space', status: 'ok', message: 'Disk space check unavailable on this platform/Node version — skipped.' });
  } else if (!disk.ok) {
    checks.push({ name: 'disk-space', status: 'warn', message: `Low disk space: ${(disk.freeBytes / (1024 * 1024)).toFixed(0)} MB free (recommended >= 500 MB).` });
  } else {
    checks.push({ name: 'disk-space', status: 'ok', message: `Disk space OK (${(disk.freeBytes / (1024 * 1024)).toFixed(0)} MB free).` });
  }

  const blocked = checks.some((c) => c.status === 'block');
  return { checks, blocked };
}

// ── Input sanitization (blocks path traversal via suiteName/specFile) ──
const SAFE_SUITE_RE = /^[A-Za-z0-9_-]+$/;
const SAFE_SPEC_RE  = /^[A-Za-z0-9_-]+\.spec\.ts$/;

function isSafeSuiteName(name) { return typeof name === 'string' && SAFE_SUITE_RE.test(name); }
function isSafeSpecFile(name)  { return typeof name === 'string' && SAFE_SPEC_RE.test(name); }
function isSafeRunId(id)       { return typeof id === 'string' && /^run_[A-Za-z0-9_]+$/.test(id); }

// ── §2.2 SSRF guard — used by both /api/notifications/test (webhook) and
// /api/environment/ping (target env reachability check). Blocks non-http(s)
// protocols, obvious loopback/link-local/metadata hosts by name, and (after
// a DNS resolve) private/loopback IPs — a basic DNS-rebinding guard, not a
// full allowlist system (explicitly out of scope per architecture doc).
const net = require('net');
const BLOCKED_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '::1', '0.0.0.0',
  '169.254.169.254',        // AWS/Azure/GCP metadata
  'metadata.google.internal',
]);

function isPrivateIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    return false;
  }
  return false;
}

async function assertOutboundUrlAllowed(raw) {
  const url = new URL(raw); // throws if invalid
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed');
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error('Host not allowed');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private/loopback IP not allowed');
    return url;
  }
  // Resolve DNS and check the resolved IP too (basic DNS-rebinding guard).
  try {
    const { address } = await dns.promises.lookup(host);
    if (isPrivateIp(address)) throw new Error('Host resolves to a private/loopback IP, not allowed');
  } catch (err) {
    if (err.message && err.message.includes('not allowed')) throw err;
    throw new Error(`Could not resolve host: ${err.message}`);
  }
  return url;
}

// ── Quarantine key helpers (Phase 4 flaky-test quarantine) ──
function testKey(suiteName, title) { return `${suiteName}::${title}`; }
function quarantinedTitlesForSuite(settings, suiteName) {
  const prefix = `${suiteName}::`;
  return (settings.quarantinedTests || [])
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

// ─────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────
// §Security — helmet's defaults are tightened just enough for this app's own
// pages to keep working: Google Fonts CSS/font files are allowlisted, and
// inline <script>/<style> blocks (used throughout public/*.html) are kept.
// script-src-attr is intentionally left at helmet's default (which blocks
// inline `onclick="..."` attribute handlers) is NOT tightened further here,
// but note: public/*.html pages DO use onclick="..." attributes, so we widen
// script-src-attr to 'unsafe-inline' too rather than silently breaking every
// button on every page (removing the onclick attributes is out of scope).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // v1.8.0 added Chart.js from cdn.jsdelivr.net (pinned version + SRI
      // integrity hash on the <script> tag itself — see report-center.html/
      // insights.html) as this app's one deliberate CDN exception. This CSP
      // was never updated to match, so the browser silently blocked the
      // script load and the page's own onerror handler misreported it as
      // "offline" — it was actually this CSP blocking it locally, every time,
      // online or not. Allowlisting the exact CDN host fixes it.
      'script-src':      ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      'script-src-attr': ["'unsafe-inline'"],
      'style-src':       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src':        ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}));

// §Security — cap POST /api/run* (starts a Playwright process) at ~30/min so
// a runaway script/UI bug can't spawn unbounded test runs.
const runStartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many run requests — please wait a moment and try again.' },
});
app.use(/^\/api\/run(s\/[^/]+\/(stop|rerun-failed))?$/, (req, res, next) => {
  if (req.method === 'POST') return runStartLimiter(req, res, next);
  next();
});

// §Security — cap POST /api/eventlog-bot/query (and /chitchat) similarly:
// each query fans out to 4 OData requests against the SAP BTP backend plus
// one Groq call (chitchat is just the one Groq call), so an unbounded loop
// from the widget (or a stuck retry) shouldn't be able to hammer either
// service.
const eventlogBotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many Capybara requests — please wait a moment and try again.' },
});
app.use(/^\/api\/eventlog-bot\/(query|chitchat|test-query)$/, eventlogBotLimiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve report HTML assets (CSS/JS/images produced by the Playwright HTML reporter)
// per run id.
app.use('/report-assets/:runId', (req, res, next) => {
  if (!isSafeRunId(req.params.runId)) return res.status(400).send('Invalid run id');
  express.static(storage.reportHtmlDir(req.params.runId))(req, res, next);
});

// Serve screenshots/videos/traces produced under the project's test-results/ folder.
// Only files inside TEST_RESULTS_ROOT are ever exposed (see attachmentUrl below).
// §2.5 — express.static already prevents path traversal outside this root, and
// now that the server binds to 127.0.0.1 (see app.listen below) these
// artifacts are no longer reachable from the rest of the LAN, which closes
// most of the real-world exposure. A signed-URL/TTL scheme was considered
// and explicitly deferred — see ARCHITECTURE_PLAN §0 (local-first model).
app.use('/test-artifacts', express.static(TEST_RESULTS_ROOT));

// Serve the hub's own persistent copy of a run's artifacts (see
// archiveAttachments() below) — these survive Playwright clearing
// TEST_RESULTS_ROOT at the start of the next run, unlike /test-artifacts above.
app.use('/run-artifacts/:runId', (req, res, next) => {
  if (!isSafeRunId(req.params.runId)) return res.status(400).send('Invalid run id');
  express.static(storage.reportArtifactsDir(req.params.runId))(req, res, next);
});

// ─────────────────────────────────────────
// Suite scanner (also scans each spec file for @tag annotations)
// ─────────────────────────────────────────
async function scanSuites() {
  const files = await glob('suites/**/e2e/*.spec.ts', { cwd: PROJECT_ROOT, posix: true });
  const map   = {};
  for (const file of files) {
    const parts = file.split('/');
    const dir   = parts[1];
    const spec  = parts[3];
    if (!map[dir]) {
      map[dir] = {
        id:       dir,
        name:     dir,
        short:    dir, // keep full folder name
        e2eDir:   `suites/${dir}/e2e`,
        specs:    [],
        specTags: {}, // { [specFileName]: string[] } — file-level union (Explorer tag chips)
        specBusinessProcesses: {}, // { [specFileName]: string[] } — file-level union — §6.3/G1
        specTestCaseIds: {},        // { [specFileName]: string[] } — file-level union — §6.3
        specTagTypos: {},           // { [specFileName]: Array } — §v1.4.0 item 3
        specTestTags: {},           // { [specFileName]: Array } — per-TEST resolution (v1.6.0, AST-based)
      };
    }
    map[dir].specs.push(spec);
    const filePath = path.join(PROJECT_ROOT, file);
    const extended = scanFileForExtendedTags(filePath);
    map[dir].specTags[spec] = extended.tags;
    map[dir].specBusinessProcesses[spec] = extended.businessProcesses;
    map[dir].specTestCaseIds[spec] = extended.testCaseIds;
    map[dir].specTagTypos[spec] = extended.tagTypos || [];
    map[dir].specTestTags[spec] = scanFileForTestTags(filePath);
  }
  const suites = Object.values(map);
  suites.sort((a, b) => a.name.localeCompare(b.name));
  suites.forEach(s => {
    s.specs.sort();
    s.tags = Array.from(new Set(Object.values(s.specTags).flat())).sort();
    s.businessProcesses = Array.from(new Set(Object.values(s.specBusinessProcesses).flat())).sort();
  });
  return suites;
}

// ─────────────────────────────────────────
// GET /healthz  (v0.9.0, §5.7)
// Not under /api on purpose — this is an infra/liveness-probe endpoint, not
// a dashboard data endpoint (matches the common convention of keeping health
// checks outside the app's API namespace so it isn't affected by /api's JSON
// 404 catch-all or rate limiting).
// ─────────────────────────────────────────
app.get('/healthz', (req, res) => {
  let dbOk = false;
  try {
    db.raw.prepare('SELECT 1').get();
    dbOk = true;
  } catch (_) {
    dbOk = false;
  }
  res.json({ ok: true, uptime: process.uptime(), dbOk });
});

// ─────────────────────────────────────────
// API: GET /api/meta
// ─────────────────────────────────────────
app.get('/api/meta', (req, res) => {
  let frameworkVersion = 'N/A';
  let playwrightVersion = 'N/A';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    frameworkVersion  = pkg.version || 'N/A';
    const pwVer = (pkg.dependencies && pkg.dependencies['@playwright/test'])
               || (pkg.devDependencies && pkg.devDependencies['@playwright/test'])
               || 'N/A';
    playwrightVersion = pwVer.replace(/[^\d.]/g, '') || pwVer;
  } catch (_) {}

  let environment = 'N/A';
  try {
    const entries = fs.readdirSync(path.join(PROJECT_ROOT, 'suites'));
    const m = entries.join(' ').match(/S4_([A-Z]+)_(?:[A-Z]+_)*AUTO_/);
    if (m) environment = `S4_${m[1]}`;
  } catch (_) {}

  let dashboardVersion = 'N/A';
  try {
    const dashPkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    dashboardVersion = dashPkg.version || 'N/A';
  } catch (_) {}

  res.json({
    ok: true,
    product: 'SimpleMDG',
    environment,
    frameworkVersion,
    playwrightVersion,
    dashboardVersion,
  });
});

// ─────────────────────────────────────────
// API: GET /api/suites
// ─────────────────────────────────────────
app.get('/api/suites', async (req, res) => {
  try {
    res.json({ ok: true, suites: await scanSuites() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/tags
// ─────────────────────────────────────────
app.get('/api/tags', async (req, res) => {
  try {
    const suites = await scanSuites();
    const tags = Array.from(new Set(suites.flatMap(s => s.tags))).sort();
    res.json({ ok: true, tags });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs (current session, polled every 3s)
// ─────────────────────────────────────────
app.get('/api/runs', (req, res) => {
  res.json({ ok: true, runs });
});

// ─────────────────────────────────────────
// API: GET /api/runs/history
// Must be registered before /api/runs/:id.
// ─────────────────────────────────────────
app.get('/api/runs/history', (req, res) => {
  try {
    const { limit, suite, status, from, to } = req.query;
    let list = storage.readIndex();
    if (suite)  list = list.filter(r => r.suiteName === suite);
    if (status) list = list.filter(r => r.status === status);
    if (from)   list = list.filter(r => r.startTime >= Number(from));
    if (to)     list = list.filter(r => r.startTime <= Number(to));
    const total = list.length;
    if (limit) list = list.slice(0, Number(limit));
    res.json({ ok: true, runs: list, total });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs/export/csv
// Must be registered before /api/runs/:id.
// ─────────────────────────────────────────
app.get('/api/runs/export/csv', (req, res) => {
  try {
    const { suite, status, from, to } = req.query;
    let list = storage.readIndex();
    if (suite)  list = list.filter(r => r.suiteName === suite);
    if (status) list = list.filter(r => r.status === status);
    if (from)   list = list.filter(r => r.startTime >= Number(from));
    if (to)     list = list.filter(r => r.startTime <= Number(to));

    const csv = buildRunHistoryCsv(list);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="run-history.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs/compare  (Phase 6.5)
// Diffs two runs by matching test titles: what newly failed, what got fixed,
// what's still failing, what's still passing. Matching is by title only
// (not suite), so compare runs from the same suite for a meaningful result.
// MUST be registered before /api/runs/:id — same reason as /history and
// /export/csv above: otherwise "compare" gets swallowed as an :id value.
// ─────────────────────────────────────────
app.get('/api/runs/compare', (req, res) => {
  try {
    const { a, b } = req.query;
    if (!isSafeRunId(a) || !isSafeRunId(b)) return res.status(400).json({ ok: false, error: 'Both ?a= and ?b= must be valid run ids' });
    const runA = storage.readRunDetail(a);
    const runB = storage.readRunDetail(b);
    if (!runA || !runB) return res.status(404).json({ ok: false, error: 'One or both runs were not found' });

    const byTitleA = new Map((runA.tests || []).map(t => [t.title, t]));
    const byTitleB = new Map((runB.tests || []).map(t => [t.title, t]));
    const allTitles = new Set([...byTitleA.keys(), ...byTitleB.keys()]);

    const newlyFailed = [];  // passed (or absent) in A, failed in B
    const newlyFixed = [];   // failed in A, passed in B
    const stillFailing = []; // failed in both
    const stillPassing = []; // passed in both
    const onlyInA = [];
    const onlyInB = [];

    for (const title of allTitles) {
      const ta = byTitleA.get(title);
      const tb = byTitleB.get(title);
      if (ta && !tb) { onlyInA.push({ title, statusA: ta.status }); continue; }
      if (!ta && tb) { onlyInB.push({ title, statusB: tb.status }); continue; }
      const entry = { title, statusA: ta.status, statusB: tb.status, errorB: tb.error, categoryB: tb.category };
      if (ta.status !== 'failed' && tb.status === 'failed') newlyFailed.push(entry);
      else if (ta.status === 'failed' && tb.status !== 'failed') newlyFixed.push(entry);
      else if (ta.status === 'failed' && tb.status === 'failed') stillFailing.push(entry);
      else if (ta.status === 'passed' && tb.status === 'passed') stillPassing.push(entry);
    }

    res.json({
      ok: true,
      runA: { id: runA.id, label: runA.label, startTime: runA.startTime, summary: runA.summary },
      runB: { id: runB.id, label: runB.label, startTime: runB.startTime, summary: runB.summary },
      newlyFailed, newlyFixed, stillFailing, stillPassing, onlyInA, onlyInB,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id
// ─────────────────────────────────────────
app.get('/api/runs/:id', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const detail = storage.readRunDetail(req.params.id);
  if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
  detail.categoryBreakdown = breakdown(detail.tests || []);
  const triageMap = storage.readTriage();
  for (const t of (detail.tests || [])) {
    const triageEntry = triageMap[testKey(detail.suiteName, t.title)];
    if (triageEntry) t.triage = triageEntry;
  }
  res.json({ ok: true, run: detail });
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/export/json
// ─────────────────────────────────────────
app.get('/api/runs/:id/export/json', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const detail = storage.readRunDetail(req.params.id);
  if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.json"`);
  res.send(JSON.stringify(detail, null, 2));
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/export/pdf
// ─────────────────────────────────────────
app.get('/api/runs/:id/export/pdf', async (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const detail = storage.readRunDetail(req.params.id);
  if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
  try {
    const outputPath = path.join(storage.reportDir(req.params.id), 'summary.pdf');
    await generateSummaryPdf(PROJECT_ROOT, detail, outputPath);
    res.download(outputPath, `${req.params.id}-summary.pdf`);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/print  (D6, v1.0.0)
// Print-optimized HTML report — Ctrl+P -> Save as PDF, no headless Chromium
// launch. The old /export/pdf endpoint (Playwright/Chromium-based) is left
// working; this is the new recommended path.
// ─────────────────────────────────────────
app.get('/api/runs/:id/print', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).send('Invalid run id');
  const detail = storage.readRunDetail(req.params.id);
  if (!detail) return res.status(404).send('Run not found');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildPrintReportHtml(detail));
});

// ─────────────────────────────────────────
// API: POST /api/runs/:id/stop
// ─────────────────────────────────────────
app.post('/api/runs/:id/stop', (req, res) => {
  const run = runs.find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ ok: false, error: 'Run not found in current session' });
  if (run.status !== 'running') return res.status(400).json({ ok: false, error: 'Run is not currently running' });

  const proc = runningProcesses.get(run.id);
  if (!proc) return res.status(404).json({ ok: false, error: 'Process handle not found' });

  // §3.11 — a user-requested Stop is a distinct outcome from a test failure.
  // Mark it here so the exit-code-driven status assignment in the `close`
  // handler doesn't overwrite it with 'failed'.
  run.stoppedByUser = true;

  try {
    if (process.platform === 'win32') {
      // §2.3 — invoke taskkill directly (no cmd.exe, no shell:true) so the
      // whole process tree still gets terminated on Windows, where
      // proc.kill('SIGTERM') alone won't reach Playwright's child workers.
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: false });
    } else {
      proc.kill('SIGTERM');
    }
    res.json({ ok: true, stopped: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: POST /api/runs/:id/rerun-failed  (Phase 4)
// Reruns only the tests that failed in a given run, using --grep against
// their titles. Scoped to the whole suite folder so the grep can match tests
// from any spec file within it.
// ─────────────────────────────────────────
app.post('/api/runs/:id/rerun-failed', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const detail = storage.readRunDetail(req.params.id);
  if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
  if (!isSafeSuiteName(detail.suiteName)) {
    return res.status(400).json({ ok: false, error: 'Stored suite name for this run looks invalid' });
  }

  const failedTitles = (detail.tests || []).filter(t => t.status === 'failed').map(t => t.title);
  if (!failedTitles.length) {
    return res.status(400).json({ ok: false, error: 'This run has no failed tests to rerun' });
  }

  const result = startTestRun({
    type:        'suite',
    suiteName:   detail.suiteName,
    workers:     2,
    grep:        buildGrepPattern(failedTitles),
    labelSuffix: ' (rerun failed)',
  });
  if (!result.ok) return res.status(result.statusCode || 500).json(result);
  res.json(result);
});

// ─────────────────────────────────────────
// API: DELETE /api/runs/:id
// ─────────────────────────────────────────
app.delete('/api/runs/:id', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  try {
    deleteRunCompletely(req.params.id);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/report
// ─────────────────────────────────────────
app.get('/api/runs/:id/report', async (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).send('Invalid run id');
  const htmlDir = storage.reportHtmlDir(req.params.id);
  const indexHtml = path.join(htmlDir, 'index.html');
  if (!fs.existsSync(indexHtml)) return res.status(404).send('Report not found for this run.');

  // §v1.8.1 — prefer Playwright's own show-report server (correct
  // attachment resolution); degrade to the old static route on any failure
  // (Playwright CLI missing, port exhaustion, spawn error) — a report must
  // always be viewable in some form, never a dead end.
  const started = await reportServerPool.ensure(req.params.id, htmlDir);
  if (started.ok) return res.redirect(started.url);
  console.warn(`[report] show-report unavailable for run ${req.params.id}, falling back to static report-assets: ${started.error}`);
  res.redirect(`/report-assets/${req.params.id}/index.html`);
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/stream  (v0.9.0, §ADR-2 / §6.C)
// Server-Sent Events live feed of a run's NDJSON event log, written by the
// opt-in hub-reporter.js (see startTestRun()'s HUB_RUN_ID env var above).
// Works whether or not the host project ever opted in — if events.ndjson
// never appears, this just polls forever (until the run stops / client
// disconnects / safety timeout) sending only heartbeats, and the existing
// polling-based progress bar keeps working as the fallback (§5).
//
// Polling instead of fs.watch: fs.watch is notoriously flaky on Windows
// (rename-event storms, missed events on some filesystems/AV setups) — see
// Node's own docs caveat. A dumb 400ms poll of "read new bytes since last
// offset" is simple, correct, and cheap enough for a handful of concurrent
// local viewers.
// ─────────────────────────────────────────
const SSE_POLL_MS        = 400;
const SSE_HEARTBEAT_MS   = 15 * 1000;
const SSE_MAX_DURATION_MS = 60 * 60 * 1000; // 60 min safety cap

app.get('/api/runs/:id/stream', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const runId = req.params.id;
  const eventsFile = path.join(storage.TMP_DIR, 'runs', runId, 'events.ndjson');

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let offset = 0;
  let closed = false;
  const startedAt = Date.now();
  let lastHeartbeat = Date.now();

  function isStillRunning() {
    const run = runs.find(r => r.id === runId);
    if (run) return run.status === 'running';
    // Not in the in-memory session list (server restarted, or an older run)
    // — fall back to the persisted index so the stream still terminates
    // sanely instead of polling a run that will never produce more events.
    const list = storage.readIndex();
    const persisted = list.find(r => r.id === runId);
    return persisted ? persisted.status === 'running' : false;
  }

  function stop() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try { res.end(); } catch (_) {}
  }

  const timer = setInterval(() => {
    if (closed) return;

    try {
      const { lines, newOffset } = readNewLines(fs, eventsFile, offset);
      offset = newOffset;
      for (const line of lines) {
        res.write(`data: ${line}\n\n`);
      }
      if (lines.length) lastHeartbeat = Date.now();
    } catch (_) {
      // Never let a read error kill the polling loop — just try again next tick.
    }

    if (Date.now() - lastHeartbeat >= SSE_HEARTBEAT_MS) {
      try { res.write(': heartbeat\n\n'); } catch (_) {}
      lastHeartbeat = Date.now();
    }

    if (!isStillRunning() || (Date.now() - startedAt) >= SSE_MAX_DURATION_MS) {
      stop();
    }
  }, SSE_POLL_MS);

  req.on('close', stop);
});

// ─────────────────────────────────────────
// API: GET /api/runs/:id/events  (v1.5.0 item 1 — Run Timeline Strip)
// One-shot (non-streaming) read of a run's full events.ndjson, for the
// "shape of this run" static timeline strip on a completed run's Results
// detail page. Reuses readNewLines() (offset 0 = "read the whole file")
// instead of duplicating line-splitting logic. Returns ok:false with a
// 404-shaped empty result (not a hard error) when the file is missing —
// this is expected and common: events.ndjson only exists for runs whose
// host project opted the hub-reporter in AND whose tmp dir hasn't been
// cleaned up yet (see storage.js's retention for dashboard/data/tmp/runs).
// ─────────────────────────────────────────
app.get('/api/runs/:id/events', (req, res) => {
  if (!isSafeRunId(req.params.id)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
  const eventsFile = path.join(storage.TMP_DIR, 'runs', req.params.id, 'events.ndjson');
  if (!fs.existsSync(eventsFile)) {
    return res.json({ ok: true, exists: false, events: [] });
  }
  try {
    const { lines } = readNewLines(fs, eventsFile, 0);
    const events = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch (_) { /* skip a malformed line, keep the rest */ }
    }
    res.json({ ok: true, exists: true, events });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/categories
// ─────────────────────────────────────────
app.get('/api/insights/categories', (req, res) => {
  try {
    const days  = Number(req.query.days || 14);
    const suite = req.query.suite;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const params = [since];
    let sql = `
      SELECT COALESCE(tr.error_category, 'other') AS category, COUNT(*) AS count
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE r.started_at >= ? AND tr.status = 'failed'
    `;
    if (suite) { sql += ' AND r.suite_name = ?'; params.push(suite); }
    sql += ' GROUP BY category ORDER BY count DESC';

    const result = db.raw.prepare(sql).all(...params);
    res.json({ ok: true, breakdown: result.map((r) => ({ category: r.category, count: r.count })) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/trend
// ─────────────────────────────────────────
app.get('/api/insights/trend', (req, res) => {
  try {
    const days  = Number(req.query.days || 14);
    const suite = req.query.suite;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const params = [since];
    let sql = `
      SELECT started_at AS startTime, finished_at AS endTime, total_tests AS totalTests, passed
      FROM runs
      WHERE started_at >= ? AND status IN ('done', 'failed')
    `;
    if (suite) { sql += ' AND suite_name = ?'; params.push(suite); }
    const list = db.raw.prepare(sql).all(...params);

    const byDay = {};
    for (const r of list) {
      const day = dayKey(r.startTime);
      if (!byDay[day]) byDay[day] = { total: 0, passed: 0, duration: 0, count: 0 };
      byDay[day].total    += (r.totalTests || 0);
      byDay[day].passed   += (r.passed || 0);
      byDay[day].duration += (r.endTime && r.startTime) ? (r.endTime - r.startTime) : 0;
      byDay[day].count    += 1;
    }
    const points = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        passRate:    v.total > 0 ? Math.round((v.passed / v.total) * 100) : null,
        avgDuration: v.count > 0 ? Math.round(v.duration / v.count) : 0,
        runs:        v.count,
      }));
    res.json({ ok: true, points });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/failure-clusters  (§v1.3.0 item 3)
// Groups all failed test results in the given window by a normalized error
// "signature" (see failure-signature.js) — recurring failures with the same
// underlying cause but different material numbers/timestamps/ids collapse
// into one cluster instead of showing up as N separate unrelated failures.
// ─────────────────────────────────────────
app.get('/api/insights/failure-clusters', (req, res) => {
  try {
    const days  = Number(req.query.days || 14);
    const suite = req.query.suite;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const params = [since];
    let sql = `
      SELECT tr.title, tr.error_message AS error, tr.error_category AS category,
             tr.run_id AS runId, r.started_at AS startedAt
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE r.started_at >= ? AND tr.status = 'failed' AND tr.error_message IS NOT NULL
    `;
    if (suite) { sql += ' AND r.suite_name = ?'; params.push(suite); }
    sql += ' ORDER BY r.started_at ASC';

    const rows = db.raw.prepare(sql).all(...params);

    const clusters = new Map();
    for (const row of rows) {
      const sig = normalizeErrorSignature(row.error);
      if (!sig) continue;
      if (!clusters.has(sig)) {
        clusters.set(sig, {
          signature:  sig,
          firstSeenError: row.error,
          firstSeenAt: row.startedAt,
          category:   row.category || 'other',
          count:      0,
          tests:      new Set(),
        });
      }
      const cluster = clusters.get(sig);
      cluster.count += 1;
      cluster.tests.add(row.title);
    }

    const result = Array.from(clusters.values())
      .map((c) => ({
        signature:      c.signature,
        representativeError: c.firstSeenError,
        firstSeenAt:    c.firstSeenAt,
        category:       c.category,
        count:          c.count,
        affectedTests:  Array.from(c.tests),
      }))
      .sort((a, b) => b.count - a.count);

    res.json({ ok: true, clusters: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/overview/stats  (Phase 5)
// Aggregated totals for "today" vs "yesterday" (rolling 24h windows) plus a
// 7-day sparkline — all computed from the existing run index, no new
// storage needed. Backs the stat cards on the Overview page.
// ─────────────────────────────────────────
app.get('/api/overview/stats', (req, res) => {
  try {
    const now    = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const list   = db.raw.prepare(`
      SELECT started_at AS startTime, finished_at AS endTime, total_tests AS totalTests,
             passed, failed, skipped
      FROM runs WHERE status IN ('done', 'failed')
    `).all();

    const todayList = list.filter(r => r.startTime >= now - oneDay);
    const yestList  = list.filter(r => r.startTime >= now - 2 * oneDay && r.startTime < now - oneDay);

    const sum = (arr, key) => arr.reduce((a, r) => a + (r[key] || 0), 0);
    const avgDuration = (arr) => {
      const durations = arr.filter(r => r.endTime && r.startTime).map(r => r.endTime - r.startTime);
      return durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    };
    const bucket = (arr) => ({
      total:       sum(arr, 'totalTests'),
      passed:      sum(arr, 'passed'),
      failed:      sum(arr, 'failed'),
      skipped:     sum(arr, 'skipped'),
      avgDuration: avgDuration(arr),
    });

    const byDay = {};
    for (const r of list) {
      const day = dayKey(r.startTime);
      if (!byDay[day]) byDay[day] = { total: 0, passed: 0, failed: 0, skipped: 0, durationSum: 0, count: 0 };
      byDay[day].total   += (r.totalTests || 0);
      byDay[day].passed  += (r.passed || 0);
      byDay[day].failed  += (r.failed || 0);
      byDay[day].skipped += (r.skipped || 0);
      if (r.endTime && r.startTime) { byDay[day].durationSum += (r.endTime - r.startTime); byDay[day].count++; }
    }
    const sparkline = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7)
      .map(([date, v]) => ({
        date, total: v.total, passed: v.passed, failed: v.failed, skipped: v.skipped,
        avgDuration: v.count ? Math.round(v.durationSum / v.count) : 0,
      }));

    res.json({ ok: true, today: bucket(todayList), yesterday: bucket(yestList), sparkline });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/top-failing  (Phase 5)
// Finds the test with the most failures in the time range and its current
// consecutive-failure streak (chronological, per suite+title). Backs the
// "Failure Highlight" panel on the Overview page.
// ─────────────────────────────────────────
app.get('/api/insights/top-failing', (req, res) => {
  try {
    const days  = Number(req.query.days || 14);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = db.raw.prepare(`
      SELECT tr.suite_name AS suiteName, tr.title AS title, tr.status AS status, r.started_at AS startTime
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE r.started_at >= ? AND r.status IN ('done', 'failed')
        AND tr.status IN ('passed', 'failed', 'flaky')
      ORDER BY r.started_at ASC
    `).all(since);

    const perTest = {}; // key -> { suiteName, title, failCount, history: [{status,time}] }
    for (const t of rows) {
      // §3.6 — count Playwright's own `flaky` status (retried-then-passed) as
      // a signal too, not just passed/failed.
      const key = testKey(t.suiteName, t.title);
      if (!perTest[key]) perTest[key] = { suiteName: t.suiteName, title: t.title, failCount: 0, history: [] };
      perTest[key].history.push({ status: t.status, time: t.startTime });
      if (t.status === 'failed') perTest[key].failCount++;
    }

    const triageMap = storage.readTriage();
    let top = null;
    for (const [key, v] of Object.entries(perTest)) {
      if (v.failCount === 0) continue;
      if (triageMap[key] && triageMap[key].status === 'flaky-ignore') continue;
      let streak = 0;
      for (let i = v.history.length - 1; i >= 0; i--) {
        if (v.history[i].status === 'failed') streak++; else break;
      }
      v.consecutiveFailures = streak;
      if (!top || v.failCount > top.failCount) top = v;
    }

    res.json({
      ok: true,
      topFailingTest: top ? {
        title: top.title,
        suiteName: top.suiteName,
        failCount: top.failCount,
        consecutiveFailures: top.consecutiveFailures,
        lastFailTime: [...top.history].reverse().find(h => h.status === 'failed')?.time || null,
      } : null,
      trend: top ? top.history.slice(-7) : [],
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/suite-health  (Phase 6.1)
// Per-suite snapshot: when it was last run, and its recent pass rate — helps
// spot suites that have gone stale (not run in a while) or are trending down.
// ─────────────────────────────────────────
// Extracted from the /api/insights/suite-health route so Auto Bot's
// test-query intent can call it in-process too (same logic, same shape).
async function getSuiteHealth(days) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const suites = await scanSuites();
    const list = storage.readIndex().filter(r => r.status === 'done' || r.status === 'failed');

    const health = suites.map((s) => {
      const runsForSuite = list.filter(r => r.suiteName === s.id);
      const lastRun = runsForSuite.reduce((a, b) => (!a || b.startTime > a.startTime ? b : a), null);
      const recent = runsForSuite.filter(r => r.startTime >= since);
      const totalTests = recent.reduce((a, r) => a + (r.totalTests || 0), 0);
      const passed = recent.reduce((a, r) => a + (r.passed || 0), 0);
      // v1.9.0 — avgDurationMs, added for Overview's "Long Running Suites"
      // insight card; same completed-runs-only average as report-aggregator's
      // avgDurationMs, just scoped per suite instead of across all suites.
      const durations = recent
        .filter(r => r.endTime && r.startTime && r.endTime > r.startTime)
        .map(r => r.endTime - r.startTime);
      const avgDurationMs = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

      // v1.11.0 — failures/flaky counts + a pass-rate sparkline + a
      // first-half-vs-second-half trend direction, for Insights' Suite
      // Health row (health badge, Failures/Flaky columns, trend arrow).
      const failures = recent.reduce((a, r) => a + (r.failed || 0), 0);
      const flaky = recent.reduce((a, r) => a + (r.flaky || 0), 0);
      const trend = computeSuiteHealthTrend(recent);
      let trendDirection = null;
      if (trend.length >= 2) {
        const mid = Math.ceil(trend.length / 2);
        const firstHalf = trend.slice(0, mid).map(t => t.passRate).filter(v => v !== null);
        const secondHalf = trend.slice(mid).map(t => t.passRate).filter(v => v !== null);
        if (firstHalf.length && secondHalf.length) {
          const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
          trendDirection = avg(secondHalf) >= avg(firstHalf) ? 'up' : 'down';
        }
      }

      return {
        suiteName:     s.id,
        specCount:     s.specs.length,
        lastRunTime:   lastRun ? lastRun.startTime : null,
        lastRunStatus: lastRun ? lastRun.status : null,
        runsInRange:   recent.length,
        passRate:      totalTests > 0 ? Math.round((passed / totalTests) * 100) : null,
        failures, flaky,
        trend, trendDirection,
        avgDurationMs,
        staleDays:     lastRun ? Math.floor((Date.now() - lastRun.startTime) / (24 * 60 * 60 * 1000)) : null,
      };
    });
    health.sort((a, b) => (b.staleDays ?? 9999) - (a.staleDays ?? 9999));

    // Suites with zero runs ever (not just zero in the selected range) —
    // scanSuites() enumerates every suite dir regardless of run history.
    const untestedSuites = health.filter(h => h.lastRunTime === null).map(h => h.suiteName);

    return { suites: health, untestedSuites };
}

app.get('/api/insights/suite-health', async (req, res) => {
  try {
    const days = Number(req.query.days || 14);
    const result = await getSuiteHealth(days);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/insights/slow-tests  (Phase 6.2)
// Flags tests whose average duration is trending up: compares the average
// duration in the first half of the time range vs the second half.
// ─────────────────────────────────────────
app.get('/api/insights/slow-tests', (req, res) => {
  try {
    const days  = Number(req.query.days || 30);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const mid   = since + (Date.now() - since) / 2;
    const rows = db.raw.prepare(`
      SELECT tr.suite_name AS suiteName, tr.title AS title, tr.duration_ms AS duration, r.started_at AS startTime
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE r.started_at >= ? AND r.status IN ('done', 'failed')
        AND tr.status IN ('passed', 'failed', 'flaky') AND tr.duration_ms > 0
    `).all(since);

    const stats = {}; // key -> { suiteName, title, earlyDurations:[], lateDurations:[] }
    for (const t of rows) {
      const key = testKey(t.suiteName, t.title);
      if (!stats[key]) stats[key] = { suiteName: t.suiteName, title: t.title, early: [], late: [] };
      (t.startTime < mid ? stats[key].early : stats[key].late).push(t.duration);
    }

    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const results = Object.values(stats)
      .map((v) => {
        const earlyAvg = avg(v.early);
        const lateAvg  = avg(v.late);
        if (earlyAvg === null || lateAvg === null) return null;
        const changePct = earlyAvg > 0 ? Math.round(((lateAvg - earlyAvg) / earlyAvg) * 100) : 0;
        return { suiteName: v.suiteName, title: v.title, earlyAvgMs: Math.round(earlyAvg), lateAvgMs: Math.round(lateAvg), changePct, samples: v.early.length + v.late.length };
      })
      .filter((v) => v && v.changePct > 15 && v.samples >= 4) // only meaningfully slower tests, enough data points
      .sort((a, b) => b.changePct - a.changePct);

    res.json({ ok: true, tests: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/flaky  (Phase 4)
// A test is a "flaky candidate" if it has both passing and failing results
// across recent runs of the same suite.
// ─────────────────────────────────────────
// A test is a "flaky candidate" if it has both passing and failing results
// across recent runs of the same suite. Extracted from the /api/flaky route
// so Auto Bot's test-query intent (server.js, "API: EventLog Bot" section)
// can call it in-process too — same logic, same result shape either way.
function getFlakyTests(days, suite) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // §3.6 — Playwright's own `flaky` status (retried within the same run,
  // ended up passing) is the strongest, most reliable flaky signal
  // available and must not be dropped like "skipped" is.
  const params = [since];
  let sql = `
    SELECT tr.suite_name AS suiteName, tr.title AS title, tr.status AS status
    FROM test_results tr
    JOIN runs r ON r.id = tr.run_id
    WHERE r.started_at >= ? AND r.status IN ('done', 'failed')
      AND tr.status IN ('passed', 'failed', 'flaky')
  `;
  if (suite) { sql += ' AND r.suite_name = ?'; params.push(suite); }
  const rows = db.raw.prepare(sql).all(...params);

  const stats = {}; // key -> { suiteName, title, total, failed, flakyRuns }
  for (const t of rows) {
    {
      const key = testKey(t.suiteName, t.title);
      if (!stats[key]) stats[key] = { suiteName: t.suiteName, title: t.title, total: 0, failed: 0, flakyRuns: 0 };
      stats[key].total += 1;
      if (t.status === 'failed') stats[key].failed += 1;
      if (t.status === 'flaky') stats[key].flakyRuns += 1;
    }
  }

  const settings    = storage.readSettings();
  const quarantined = new Set(settings.quarantinedTests || []);

  return Object.entries(stats)
    .map(([key, v]) => {
      // flakinessScore = (flakyRuns * 2 + mixedResultRuns) / totalRuns, as
      // suggested in §3.6 — a run that Playwright itself flagged `flaky`
      // (retried then passed) counts double toward the score.
      const mixedResultRuns = (v.failed > 0 && v.failed < v.total) ? 1 : 0;
      const flakinessScore = v.total > 0 ? (v.flakyRuns * 2 + mixedResultRuns) / v.total : 0;
      return {
        key,
        suiteName:      v.suiteName,
        title:          v.title,
        totalRuns:      v.total,
        failedRuns:     v.failed,
        flakyRuns:      v.flakyRuns,
        failureRate:    Math.round((v.failed / v.total) * 100),
        flakinessScore: Math.round(flakinessScore * 100) / 100,
        quarantined:    quarantined.has(key),
      };
    })
    .filter(t => t.totalRuns >= 2 && (t.flakyRuns > 0 || (t.failedRuns > 0 && t.failedRuns < t.totalRuns)))
    .sort((a, b) => b.flakinessScore - a.flakinessScore || b.failureRate - a.failureRate);
}

app.get('/api/flaky', (req, res) => {
  try {
    const days  = Number(req.query.days || 30);
    const suite = req.query.suite;
    res.json({ ok: true, tests: getFlakyTests(days, suite) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: POST /api/flaky/quarantine  (Phase 4)
// Quarantined tests are automatically excluded (via --grep-invert) the next
// time their suite is run as a whole.
// ─────────────────────────────────────────
// §F3 (v1.0.0) — quarantining a test now REQUIRES a reason + requestedBy
// (free-text name), and persists to PROJECT_ROOT/.hub/quarantine.json as the
// source of truth (SQLite `quarantine` table + settings.quarantinedTests are
// rebuilt from it — see quarantine-store.js).
app.post('/api/flaky/quarantine', (req, res) => {
  try {
    const { suiteName, title, reason, requestedBy, expiresInDays } = req.body || {};
    if (!suiteName || !title) return res.status(400).json({ ok: false, error: 'suiteName and title are required' });
    if (!reason || !String(reason).trim()) return res.status(400).json({ ok: false, error: 'reason is required' });
    if (!requestedBy || !String(requestedBy).trim()) return res.status(400).json({ ok: false, error: 'requestedBy is required' });
    if (expiresInDays !== undefined && !quarantineStore.isValidExpiresInDays(expiresInDays)) {
      return res.status(400).json({ ok: false, error: `expiresInDays must be an integer between ${quarantineStore.MIN_EXPIRES_DAYS} and ${quarantineStore.MAX_EXPIRES_DAYS}` });
    }
    const entry = quarantineStore.addEntry(PROJECT_ROOT, db, storage, { suiteName, title, reason, requestedBy, expiresInDays });
    if (entry.error) return res.status(400).json({ ok: false, error: entry.error });
    res.json({ ok: true, quarantined: true, entry });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/flaky/release', (req, res) => {
  try {
    const { suiteName, title } = req.body || {};
    if (!suiteName || !title) return res.status(400).json({ ok: false, error: 'suiteName and title are required' });
    quarantineStore.releaseEntry(PROJECT_ROOT, db, storage, testKey(suiteName, title));
    res.json({ ok: true, quarantined: false });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/quarantine  (F3, v1.0.0)
// Lists all active quarantine entries with computed daysRemaining.
// ─────────────────────────────────────────
app.get('/api/quarantine', (req, res) => {
  try {
    const entries = quarantineStore.listActive(PROJECT_ROOT);
    res.json({ ok: true, count: entries.length, entries });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/quarantine/impact  (F4, v1.0.0)
// Count of quarantined tests, grouped by businessProcess if that mapping is
// available (via each entry's suite's @bp: tags), else just count + the
// oldest quarantine's age in days. Kept simple — no data is invented.
// ─────────────────────────────────────────
app.get('/api/quarantine/impact', async (req, res) => {
  try {
    const entries = quarantineStore.listActive(PROJECT_ROOT);
    const now = Date.now();
    const oldestAgeDays = entries.length
      ? Math.max(...entries.map((e) => Math.floor((now - e.createdAt) / (24 * 60 * 60 * 1000))))
      : 0;

    const suites = await scanSuites();
    const bpBySuite = {}; // suiteName -> string[] (union of businessProcesses across its specs)
    for (const s of suites) bpBySuite[s.id] = s.businessProcesses || [];

    const hasAnyBpTags = suites.some((s) => (s.businessProcesses || []).length > 0);

    let byBusinessProcess = null;
    if (hasAnyBpTags) {
      byBusinessProcess = {};
      for (const e of entries) {
        const bps = bpBySuite[e.suiteName] || [];
        if (!bps.length) {
          byBusinessProcess['(untagged)'] = (byBusinessProcess['(untagged)'] || 0) + 1;
          continue;
        }
        for (const bp of bps) byBusinessProcess[bp] = (byBusinessProcess[bp] || 0) + 1;
      }
    }

    res.json({
      ok: true,
      count: entries.length,
      oldestAgeDays,
      byBusinessProcess, // null when no @bp: tags exist anywhere in the scanned suites
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/coverage  (G1 Coverage Matrix — v1.6.0: per-test AST resolution)
// Groups every test by its own resolved @bp: businessProcess tag(s)
// (tag-scanner.js scanFileForTestTags(), per-test — not file-level),
// cross-referenced with each suite's most recent completed run for
// pass/fail status and current quarantine.
//
// Also reports `totalSuites`/`totalSpecs`/`hasAnyRun` so the UI (readiness.html,
// v1.6.0 item 3) can tell apart three distinct empty states — no suites/specs
// discovered at all, suites discovered but nothing has run yet, and suites
// that HAVE run but simply have zero @bp: tags — rather than one generic
// "no @bp: tags found" message for all three.
// ─────────────────────────────────────────
app.get('/api/coverage', async (req, res) => {
  try {
    const suites = await scanSuites();
    const specs = [];
    for (const s of suites) {
      for (const spec of s.specs) {
        specs.push({
          suiteName: s.id,
          file: `suites/${s.id}/e2e/${spec}`,
          testTags: s.specTestTags[spec] || [],
        });
      }
    }

    const index = storage.readIndex().filter((r) => r.status === 'done' || r.status === 'failed');
    const tests = [];
    for (const s of suites) {
      const runsForSuite = index.filter((r) => r.suiteName === s.id);
      const latest = runsForSuite.reduce((a, b) => (!a || b.startTime > a.startTime ? b : a), null);
      if (!latest) continue;
      const detail = storage.readRunDetail(latest.id);
      if (!detail) continue;
      for (const t of (detail.tests || [])) {
        tests.push({ suiteName: s.id, file: t.file, title: t.title, status: t.status });
      }
    }

    const quarantinedKeys = new Set(quarantineStore.listActive(PROJECT_ROOT).map((e) => e.key));
    const matrix = buildCoverageMatrix({ specs, tests, quarantinedKeys });
    // v1.7.0 — Tag Adoption % (setup-status.js), computed from the same
    // per-test `specs` list already built above (v1.6.0 AST scanner data),
    // not a second endpoint — see UPGRADE_NOTES.md v1.7.0.
    const tagAdoption = computeTagAdoptionPercent(specs);
    res.json({
      ok: true,
      ...matrix,
      totalSuites: suites.length,
      totalSpecs: specs.length,
      hasAnyRun: tests.length > 0,
      tagAdoption,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: Report Center  (v1.1 flagship feature)
// Aggregate stats + charts + AI-powered QA summary + print export, built on
// top of the same runs/test_results tables the v0.8/v0.9 analytics endpoints
// already query. computeOverview() (report-aggregator.js) does the shaping
// so it's unit-testable without SQLite.
// ─────────────────────────────────────────
function getReportOverviewInRange(since, until, suite) {
  const runParams = [since, until];
  let runSql = `
    SELECT id, suite_name AS suiteName, status, started_at AS startTime, finished_at AS endTime,
           total_tests AS totalTests, passed, failed, flaky, skipped, plan_json AS planJson
    FROM runs
    WHERE started_at >= ? AND started_at < ? AND status IN ('done', 'failed')
  `;
  if (suite) { runSql += ' AND suite_name = ?'; runParams.push(suite); }
  const runRows = db.raw.prepare(runSql).all(...runParams);

  let testRows = [];
  if (runRows.length) {
    const placeholders = runRows.map(() => '?').join(',');
    testRows = db.raw.prepare(`
      SELECT tr.status AS status, tr.suite_name AS suiteName, r.started_at AS startTime
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE tr.run_id IN (${placeholders})
    `).all(...runRows.map((r) => r.id));
  }

  const quarantineSkippedCounts = quarantineSkippedCountsFromRuns(runRows);
  return computeOverview({ runs: runRows, testRows, quarantineSkippedCounts });
}

function getReportOverview(days, suite) {
  const now = Date.now();
  const since = now - days * 24 * 60 * 60 * 1000;
  return getReportOverviewInRange(since, now, suite);
}

// v1.9.0 — period-over-period deltas for the Report Center KPI cards (and
// reused by Execution Center): the "previous period" is the same-length
// window immediately preceding the current one (e.g. days=30 -> the 30 days
// before that), matching the "vs last N days" wording already used on
// Overview's "vs yesterday" cards.
function getReportOverviewWithDeltas(days, suite) {
  const now = Date.now();
  const since = now - days * 24 * 60 * 60 * 1000;
  const prevSince = since - days * 24 * 60 * 60 * 1000;

  const current = getReportOverviewInRange(since, now, suite);
  const previous = getReportOverviewInRange(prevSince, since, suite);
  const deltas = computeDeltas(current, previous);
  return { ...current, deltas };
}

function getReportFailureInsights(days, suite) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const params = [since];
  let sql = `
    SELECT tr.suite_name AS suiteName, tr.title AS title, tr.status AS status,
           tr.error_message AS error, tr.error_category AS category
    FROM test_results tr
    JOIN runs r ON r.id = tr.run_id
    WHERE r.started_at >= ? AND r.status IN ('done', 'failed')
  `;
  if (suite) { sql += ' AND r.suite_name = ?'; params.push(suite); }
  const rows = db.raw.prepare(sql).all(...params);

  const categoryBreakdown = breakdown(rows);

  const failCounts = {};
  for (const r of rows) {
    if (r.status !== 'failed') continue;
    const key = testKey(r.suiteName, r.title);
    if (!failCounts[key]) failCounts[key] = { suiteName: r.suiteName, title: r.title, failCount: 0 };
    failCounts[key].failCount += 1;
  }
  const topFailing = Object.values(failCounts)
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 10);

  return { categoryBreakdown, topFailing };
}

app.get('/api/reports/overview', (req, res) => {
  try {
    const days  = Number(req.query.days || 30);
    const suite = req.query.suite || null;
    const overview = getReportOverviewWithDeltas(days, suite);
    res.json({ ok: true, days, suite, ...overview });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reports/print — print-optimized HTML (Ctrl+P -> Save as PDF),
// same convention as GET /api/runs/:id/print (D6, v1.0.0), but for the
// aggregate Report Center view instead of a single run.
app.get('/api/reports/print', (req, res) => {
  try {
    const days  = Number(req.query.days || 30);
    const suite = req.query.suite || null;
    const overview = getReportOverview(days, suite);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildReportCenterPrintHtml({ overview, days, suite }));
  } catch (err) {
    res.status(500).send(`Failed to build report: ${err.message}`);
  }
});

// POST /api/reports/ai-summary — AI-powered QA summary (the "tích hợp AI"
// ask). Same aiEnabled/API-key gating as POST /api/ai/diagnose — 400 cleanly
// when AI isn't configured rather than ever calling Groq without a key.
app.post('/api/reports/ai-summary', async (req, res) => {
  try {
    const settings = storage.readSettings();
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'AI summary is not enabled. Configure a Groq API key on the Settings page first.' });
    }

    const { days, suite } = req.body || {};
    const d = Number(days) || 30;
    const s = suite || null;

    const overview = getReportOverview(d, s);
    const { categoryBreakdown, topFailing } = getReportFailureInsights(d, s);

    const bundle = { stats: overview, categoryBreakdown, topFailing, days: d, suite: s };
    const summary = await groq.summarizeReport(settings.groqApiKey, bundle, settings.aiModel);
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: Release Readiness / Requirement-Risk / Tag validation  (v1.4.0)
// All three reuse existing tracked data only — coverage-matrix.js's @bp:
// grouping, quarantine-store.js's expiry logic, and report-aggregator.js's
// pass rate — nothing new is persisted.
// ─────────────────────────────────────────

/** Shared coverage-matrix build, factored out of GET /api/coverage so the
 * readiness/risk endpoints below reuse the exact same grouping logic. */
async function getCoverageMatrixData() {
  const suites = await scanSuites();
  const specs = [];
  for (const s of suites) {
    for (const spec of s.specs) {
      specs.push({
        suiteName: s.id,
        file: `suites/${s.id}/e2e/${spec}`,
        testTags: s.specTestTags[spec] || [],
      });
    }
  }

  const index = storage.readIndex().filter((r) => r.status === 'done' || r.status === 'failed');
  const tests = [];
  for (const s of suites) {
    const runsForSuite = index.filter((r) => r.suiteName === s.id);
    const latest = runsForSuite.reduce((a, b) => (!a || b.startTime > a.startTime ? b : a), null);
    if (!latest) continue;
    const detail = storage.readRunDetail(latest.id);
    if (!detail) continue;
    for (const t of (detail.tests || [])) {
      tests.push({ suiteName: s.id, file: t.file, title: t.title, status: t.status });
    }
  }

  const quarantinedKeys = new Set(quarantineStore.listActive(PROJECT_ROOT).map((e) => e.key));
  const matrix = buildCoverageMatrix({ specs, tests, quarantinedKeys });
  return { suites, matrix };
}

/** Approximates "recent regressions" without a full run-compare feature: for
 * each suite, tests that failed in its most recent completed run but passed
 * in the prior completed run of that same suite. Suites with fewer than two
 * completed runs contribute nothing (not enough history to compare). */
function computeRegressions(suites) {
  const index = storage.readIndex().filter((r) => r.status === 'done' || r.status === 'failed');
  const regressions = [];
  for (const s of suites) {
    const runsForSuite = index
      .filter((r) => r.suiteName === s.id)
      .sort((a, b) => b.startTime - a.startTime);
    if (runsForSuite.length < 2) continue;
    const latest = storage.readRunDetail(runsForSuite[0].id);
    const prior  = storage.readRunDetail(runsForSuite[1].id);
    if (!latest || !prior) continue;
    const priorStatus = new Map();
    for (const t of (prior.tests || [])) priorStatus.set(`${t.file}::${t.title}`, t.status);
    for (const t of (latest.tests || [])) {
      const key = `${t.file}::${t.title}`;
      if (t.status === 'failed' && priorStatus.get(key) === 'passed') {
        regressions.push({ suiteName: s.id, title: t.title, file: t.file });
      }
    }
  }
  return regressions;
}

// GET /api/reports/readiness — Go-No-Go rollup (v1.4.0 item 1).
app.get('/api/reports/readiness', async (req, res) => {
  try {
    const days  = Number(req.query.days || 30);
    const suite = req.query.suite || null;
    const overview = getReportOverview(days, suite);

    const { suites, matrix } = await getCoverageMatrixData();
    const totalBps = matrix.groups.length;
    const coveredBps = matrix.groups.filter((g) => g.automatedPassing > 0).length;
    const coveragePct = totalBps > 0 ? Math.round((coveredBps / totalBps) * 100) : null;

    const quarantineEntries = quarantineStore.listActive(PROJECT_ROOT);
    const scopedSuites = suite ? suites.filter((s) => s.id === suite) : suites;
    const regressions = computeRegressions(scopedSuites);

    const readiness = computeReadiness({
      passRate: overview.passRate,
      passRateThreshold: READINESS_CONFIG.passRateThreshold,
      quarantineEntries,
      nearExpiryDays: READINESS_CONFIG.nearExpiryDays,
      coveragePct,
      coverageThreshold: READINESS_CONFIG.coverageThreshold,
      regressions,
      regressionWarnAt: READINESS_CONFIG.regressionWarnAt,
      regressionFailAt: READINESS_CONFIG.regressionFailAt,
    });

    res.json({
      ok: true, days, suite,
      ...readiness,
      thresholds: READINESS_CONFIG,
      coveredBusinessProcesses: coveredBps,
      totalBusinessProcesses: totalBps,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reports/requirement-risk — risk-ranked business processes (v1.4.0 item 2).
app.get('/api/reports/requirement-risk', async (req, res) => {
  try {
    // `days` accepted for API symmetry with the other /api/reports/* endpoints;
    // the risk score itself is computed off the same latest-run-per-suite
    // snapshot GET /api/coverage already uses (no separate time-windowed query).
    const days = Number(req.query.days || 30);
    const { matrix } = await getCoverageMatrixData();
    const risk = computeRequirementRisk(matrix.groups);
    res.json({ ok: true, days, risk });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/tags/validation — taxonomy gap check (v1.4.0 item 3): specs with
// NEITHER an @bp: nor an @TC- tag (silently falling into coverage-matrix's
// no-coverage bucket), plus simple pattern-based typo flags.
app.get('/api/tags/validation', async (req, res) => {
  try {
    const suites = await scanSuites();
    const untaggedBySuite = {};
    let untaggedCount = 0;
    const typos = [];

    for (const s of suites) {
      const untaggedSpecs = s.specs.filter((spec) =>
        (s.specTestCaseIds[spec] || []).length === 0 && (s.specBusinessProcesses[spec] || []).length === 0);
      if (untaggedSpecs.length) {
        untaggedBySuite[s.id] = untaggedSpecs;
        untaggedCount += untaggedSpecs.length;
      }
      for (const spec of s.specs) {
        for (const t of (s.specTagTypos[spec] || [])) {
          typos.push({ suiteName: s.id, file: `suites/${s.id}/e2e/${spec}`, ...t });
        }
      }
    }

    res.json({ ok: true, untaggedCount, untaggedBySuite, typos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: Failure triage  (Phase 6.4)
// Lightweight annotation on a test (keyed by "suiteName::title", same
// convention as flaky quarantine keys) — no permissions, anyone can edit.
// Distinct from Quarantine: triage never changes what runs, it's purely a
// label + note for the next person reviewing results.
// ─────────────────────────────────────────
const TRIAGE_STATUSES = ['bug', 'environment-issue', 'flaky-ignore', 'investigating'];

// §v1.3.0 item 4 — the triage board page needs to link each entry back to
// the test's most recent run (results.html). The triage table itself only
// stores {testKey -> {suiteName, title, status, note, updatedAt}}, so this
// enriches each entry with lastRunId/lastSeenAt via a small join query
// against test_results/runs (most recent run that saw this exact test_key).
app.get('/api/triage', (req, res) => {
  try {
    const map = storage.readTriage();
    const entries = Object.entries(map).map(([testKey, entry]) => ({ testKey, ...entry }));

    // NOTE: test_results.test_key is built from file/project (see
    // pw-json-parser.js), NOT "suiteName::title" like the triage/quarantine
    // key convention — so this joins on suite_name + title columns instead
    // (same approach the existing flaky/coverage queries already use).
    const lastRunStmt = db.raw.prepare(`
      SELECT tr.run_id AS runId, r.started_at AS startedAt
      FROM test_results tr
      JOIN runs r ON r.id = tr.run_id
      WHERE tr.suite_name = ? AND tr.title = ?
      ORDER BY r.started_at DESC
      LIMIT 1
    `);
    for (const entry of entries) {
      try {
        const last = lastRunStmt.get(entry.suiteName, entry.title);
        entry.lastRunId  = last ? last.runId : null;
        entry.lastSeenAt = last ? last.startedAt : null;
      } catch (_) {
        entry.lastRunId  = null;
        entry.lastSeenAt = null;
      }
    }

    res.json({ ok: true, triage: entries });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/triage', (req, res) => {
  try {
    const { suiteName, title, status, note } = req.body || {};
    if (!suiteName || !title) return res.status(400).json({ ok: false, error: 'suiteName and title are required' });
    if (status && !TRIAGE_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: `status must be one of: ${TRIAGE_STATUSES.join(', ')}` });
    }
    const key = testKey(suiteName, title);
    const map = storage.readTriage();

    // §3.10 — the frontend's "— set —" option submits status: '' to mean
    // "clear the triage entry", not "leave whatever was there before".
    // Previously `status || (existing.status) || 'investigating'` silently
    // ignored an explicit empty string and kept the old status, while the UI
    // still showed a "Triage updated" success toast.
    if (status === '' && !note) {
      delete map[key];
      storage.writeTriage(map);
      return res.json({ ok: true, entry: null, cleared: true });
    }

    map[key] = {
      suiteName,
      title,
      status: (status === '' ? 'investigating' : status) || (map[key] && map[key].status) || 'investigating',
      note: note !== undefined ? note : (map[key] ? map[key].note : ''),
      updatedAt: Date.now(),
    };
    storage.writeTriage(map);
    res.json({ ok: true, entry: map[key] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/triage/:key', (req, res) => {
  try {
    const map = storage.readTriage();
    delete map[req.params.key];
    storage.writeTriage(map);
    res.json({ ok: true, deleted: req.params.key });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ─────────────────────────────────────────
// API: Regression cycles  (Phase 6.6)
// A cycle is just a named bucket of run ids (e.g. "Release 2.5 Regression").
// Aggregated stats are computed on read from the run index — the cycle
// itself only stores which runs belong to it.
// ─────────────────────────────────────────
function computeCycleStats(cycle) {
  const index = storage.readIndex();
  const runs = cycle.runIds.map(id => index.find(r => r.id === id)).filter(Boolean);
  const totalTests = runs.reduce((a, r) => a + (r.totalTests || 0), 0);
  const passed     = runs.reduce((a, r) => a + (r.passed || 0), 0);
  const failed     = runs.reduce((a, r) => a + (r.failed || 0), 0);
  return {
    ...cycle,
    runCount: runs.length,
    totalTests, passed, failed,
    passRate: totalTests > 0 ? Math.round((passed / totalTests) * 100) : null,
    runs,
  };
}

app.get('/api/cycles', (req, res) => {
  try {
    const cycles = storage.readCycles().map(computeCycleStats);
    res.json({ ok: true, cycles });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/cycles/:id', (req, res) => {
  try {
    const cycle = storage.readCycles().find(c => c.id === req.params.id);
    if (!cycle) return res.status(404).json({ ok: false, error: 'Cycle not found' });
    res.json({ ok: true, cycle: computeCycleStats(cycle) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/cycles', (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'name is required' });
    const cycles = storage.readCycles();
    const cycle = { id: `cycle_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), runIds: [], createdAt: Date.now() };
    cycles.unshift(cycle);
    storage.writeCycles(cycles);
    res.json({ ok: true, cycle: computeCycleStats(cycle) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/cycles/:id/runs', (req, res) => {
  try {
    const { runId } = req.body || {};
    if (!isSafeRunId(runId)) return res.status(400).json({ ok: false, error: 'Invalid runId' });
    const cycles = storage.readCycles();
    const cycle = cycles.find(c => c.id === req.params.id);
    if (!cycle) return res.status(404).json({ ok: false, error: 'Cycle not found' });
    if (!cycle.runIds.includes(runId)) cycle.runIds.push(runId);
    storage.writeCycles(cycles);
    res.json({ ok: true, cycle: computeCycleStats(cycle) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/cycles/:id/runs/:runId', (req, res) => {
  try {
    const cycles = storage.readCycles();
    const cycle = cycles.find(c => c.id === req.params.id);
    if (!cycle) return res.status(404).json({ ok: false, error: 'Cycle not found' });
    cycle.runIds = cycle.runIds.filter(id => id !== req.params.runId);
    storage.writeCycles(cycles);
    res.json({ ok: true, cycle: computeCycleStats(cycle) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/cycles/:id', (req, res) => {
  try {
    const cycles = storage.readCycles().filter(c => c.id !== req.params.id);
    storage.writeCycles(cycles);
    res.json({ ok: true, deleted: req.params.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: Settings  (Phase 3)
// The raw Groq API key is NEVER sent back to the client — only a boolean
// "aiKeySet" flag.
// ─────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const s = storage.readSettings();
  res.json({
    ok: true,
    settings: {
      aiEnabled:           s.aiEnabled,
      aiKeySet:             !!s.groqApiKey,
      aiModel:              s.aiModel || groq.DEFAULT_MODEL,
      retentionDays:        s.retentionDays,
      notificationWebhook:  s.notificationWebhook,
      notifierType:         s.notifierType || 'slack',
      targetUrl:            s.targetUrl || '',
      quarantinedCount:     (s.quarantinedTests || []).length,
      setupHubReporterAcked: !!s.setupHubReporterAcked,
      eventlogBotEnabled:   !!s.eventlogBotEnabled,
      sapCookieSet:         !!s.sapCookie,
      sapCookieUpdatedAt:   s.sapCookieUpdatedAt || null,
      sapBaseUrl:           s.sapBaseUrl || '',
      sapServicePath:       s.sapServicePath || '/srv-process/CommonProcessService',
    },
  });
});

const NOTIFIER_TYPES = ['slack', 'teams', 'none'];

app.post('/api/settings', (req, res) => {
  try {
    const {
      aiEnabled, groqApiKey, clearApiKey, aiModel, retentionDays, notificationWebhook, notifierType, targetUrl, setupHubReporterAcked,
      eventlogBotEnabled, sapCookie, clearSapCookie, sapBaseUrl, sapServicePath,
    } = req.body || {};
    const patch = {};
    if (typeof aiEnabled === 'boolean') patch.aiEnabled = aiEnabled;
    if (typeof setupHubReporterAcked === 'boolean') patch.setupHubReporterAcked = setupHubReporterAcked;
    if (clearApiKey) patch.groqApiKey = '';
    else if (typeof groqApiKey === 'string' && groqApiKey.trim()) patch.groqApiKey = groqApiKey.trim();
    if (typeof aiModel === 'string' && aiModel.trim()) patch.aiModel = aiModel.trim();
    if (typeof eventlogBotEnabled === 'boolean') patch.eventlogBotEnabled = eventlogBotEnabled;
    if (clearSapCookie) {
      patch.sapCookie = '';
      patch.sapCookieUpdatedAt = null;
    } else if (typeof sapCookie === 'string' && sapCookie.trim()) {
      patch.sapCookie = sapCookie.trim();
      patch.sapCookieUpdatedAt = Date.now();
    }
    if (typeof sapBaseUrl === 'string') patch.sapBaseUrl = sapBaseUrl.trim();
    if (typeof sapServicePath === 'string' && sapServicePath.trim()) patch.sapServicePath = sapServicePath.trim();
    if (retentionDays !== undefined) {
      if (!isValidRetentionDays(retentionDays)) {
        return res.status(400).json({ ok: false, error: 'retentionDays must be an integer between 1 and 3650' });
      }
      patch.retentionDays = Number(retentionDays);
    }
    if (typeof notificationWebhook === 'string') patch.notificationWebhook = notificationWebhook.trim() || null;
    if (typeof notifierType === 'string') {
      if (!NOTIFIER_TYPES.includes(notifierType)) {
        return res.status(400).json({ ok: false, error: `notifierType must be one of: ${NOTIFIER_TYPES.join(', ')}` });
      }
      patch.notifierType = notifierType;
    }
    if (typeof targetUrl === 'string') patch.targetUrl = targetUrl.trim();

    const updated = storage.writeSettings(patch);
    res.json({
      ok: true,
      settings: {
        aiEnabled:           updated.aiEnabled,
        aiKeySet:             !!updated.groqApiKey,
        aiModel:              updated.aiModel || groq.DEFAULT_MODEL,
        retentionDays:        updated.retentionDays,
        notificationWebhook:  updated.notificationWebhook,
        notifierType:         updated.notifierType || 'slack',
        targetUrl:            updated.targetUrl || '',
        setupHubReporterAcked: !!updated.setupHubReporterAcked,
        eventlogBotEnabled:   !!updated.eventlogBotEnabled,
        sapCookieSet:         !!updated.sapCookie,
        sapCookieUpdatedAt:   updated.sapCookieUpdatedAt || null,
        sapBaseUrl:           updated.sapBaseUrl || '',
        sapServicePath:       updated.sapServicePath || '/srv-process/CommonProcessService',
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/setup/status  (v1.7.0 — Onboarding Wizard)
// Live ✅/⬜ status for the 6 setup steps, derived by computeSetupStatus()
// (setup-status.js) from real endpoints/checks already used elsewhere:
// Playwright CLI presence (same check as runPreflightChecks()), suite/spec
// counts (scanSuites()), tag adoption % (same computation as /api/coverage),
// and settings (targetUrl / aiEnabled / setupHubReporterAcked). Nothing here
// is hardcoded or duplicated logic — this endpoint just gathers and hands
// off to the pure, independently-unit-tested computeSetupStatus().
// ─────────────────────────────────────────
app.get('/api/setup/status', async (req, res) => {
  try {
    const settings = storage.readSettings();
    const suites = await scanSuites();
    const specs = [];
    for (const s of suites) {
      for (const spec of s.specs) {
        specs.push({ testTags: s.specTestTags[spec] || [] });
      }
    }
    const tagAdoption = computeTagAdoptionPercent(specs);

    const result = computeSetupStatus({
      playwrightCliPresent:  checkPlaywrightCliPresent(),
      totalSuites:           suites.length,
      totalSpecs:            specs.length,
      hubReporterAcked:      !!settings.setupHubReporterAcked,
      tagAdoptionPercent:    tagAdoption.percent,
      targetUrlConfigured:   !!settings.targetUrl,
      aiConfigured:          !!settings.aiEnabled && !!settings.groqApiKey,
    });

    res.json({ ok: true, ...result, tagAdoption });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/environment/ping  (Phase 5)
// Lightweight reachability check for the configured target environment URL —
// a single HTTP HEAD/GET request, not a persistent uptime monitor.
// ─────────────────────────────────────────
app.get('/api/environment/ping', async (req, res) => {
  const settings = storage.readSettings();
  const targetUrl = settings.targetUrl;
  if (!targetUrl) {
    return res.json({ ok: false, targetUrl: '', hostname: null, responseTimeMs: null });
  }

  let hostname = targetUrl;
  try { hostname = new URL(targetUrl).hostname; } catch (_) {}

  const start = Date.now();
  try {
    await assertOutboundUrlAllowed(targetUrl);
    const result = await pingUrl(targetUrl);
    res.json({ ok: true, targetUrl, hostname, statusCode: result.statusCode, responseTimeMs: Date.now() - start });
  } catch (err) {
    res.json({ ok: false, targetUrl, hostname, error: err.message, responseTimeMs: Date.now() - start });
  }
});

// ─────────────────────────────────────────
// API: GET /api/preflight  (§v1.3.0 item 2)
// Lets the UI show pre-flight results (target env reachability, Playwright
// CLI presence, disk space) before/as a run is kicked off. The same checks
// also run server-side inside /api/run itself, so a run can never bypass
// them even if the client never called this endpoint.
// ─────────────────────────────────────────
app.get('/api/preflight', async (req, res) => {
  try {
    const result = await runPreflightChecks();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function pingUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(targetUrl); } catch (_) { return reject(new Error('Invalid URL')); }
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(
      { hostname: url.hostname, port: url.port || (url.protocol === 'http:' ? 80 : 443), path: url.pathname || '/', method: 'HEAD', timeout: 5000 },
      (res) => { res.resume(); resolve({ statusCode: res.statusCode }); }
    );
    req.on('timeout', () => req.destroy(new Error('Timed out after 5s')));
    req.on('error', reject);
    req.end();
  });
}

// ─────────────────────────────────────────
// API: AI diagnosis  (Phase 3, Groq)
// ─────────────────────────────────────────
function findTestInRun(detail, testId) {
  return (detail.tests || []).find(t => t.id === testId);
}

app.post('/api/ai/test-connection', async (req, res) => {
  const settings = storage.readSettings();
  if (!settings.groqApiKey) {
    return res.status(400).json({ ok: false, error: 'No Groq API key configured yet.' });
  }
  try {
    await groq.testConnection(settings.groqApiKey, settings.aiModel);
    res.json({ ok: true, valid: true, model: settings.aiModel || groq.DEFAULT_MODEL });
  } catch (err) {
    res.status(502).json({ ok: false, valid: false, error: err.message });
  }
});

app.post('/api/ai/diagnose', async (req, res) => {
  try {
    const { runId, testId, force } = req.body || {};
    if (!isSafeRunId(runId)) return res.status(400).json({ ok: false, error: 'Invalid run id' });

    const settings = storage.readSettings();
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'AI diagnosis is not enabled. Configure a Groq API key on the Settings page first.' });
    }

    const detail = storage.readRunDetail(runId);
    if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
    const test = findTestInRun(detail, testId);
    if (!test) return res.status(404).json({ ok: false, error: 'Test not found in this run' });

    if (test.aiDiagnosis && !force) {
      return res.json({ ok: true, diagnosis: test.aiDiagnosis, cached: true });
    }

    const diagnosis = await groq.diagnose(
      settings.groqApiKey,
      [{ title: test.title, error: test.error, category: test.category }],
      settings.aiModel
    );
    test.aiDiagnosis = diagnosis;
    storage.writeRunDetail(runId, detail);
    res.json({ ok: true, diagnosis, cached: false });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post('/api/ai/diagnose/cluster', async (req, res) => {
  try {
    const { runId, testIds, force } = req.body || {};
    if (!isSafeRunId(runId)) return res.status(400).json({ ok: false, error: 'Invalid run id' });
    if (!Array.isArray(testIds) || !testIds.length) {
      return res.status(400).json({ ok: false, error: 'testIds must be a non-empty array' });
    }

    const settings = storage.readSettings();
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'AI diagnosis is not enabled. Configure a Groq API key on the Settings page first.' });
    }

    const detail = storage.readRunDetail(runId);
    if (!detail) return res.status(404).json({ ok: false, error: 'Run not found' });
    const tests = testIds.map(id => findTestInRun(detail, id)).filter(Boolean);
    if (!tests.length) return res.status(404).json({ ok: false, error: 'None of the given testIds were found in this run' });

    if (!force && tests[0].aiDiagnosis) {
      return res.json({ ok: true, diagnosis: tests[0].aiDiagnosis, cached: true });
    }

    const diagnosis = await groq.diagnose(
      settings.groqApiKey,
      tests.map(t => ({ title: t.title, error: t.error, category: t.category })),
      settings.aiModel
    );
    diagnosis.clusterTestIds = testIds;
    for (const t of tests) t.aiDiagnosis = diagnosis;
    storage.writeRunDetail(runId, detail);
    res.json({ ok: true, diagnosis, cached: false });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: EventLog Bot  (SAP MDG CR event-log chat widget)
// Fetches Submit/Approve/Activate/RequestActionLog OData events for a CR
// (sap-eventlog-client.js) then hands them to Groq for analysis
// (groq-client.js's analyzeEventlog) — reuses the same Groq key/model
// already configured for AI Diagnosis above.
// ─────────────────────────────────────────
const CR_NUMBER_PATTERN = /^CR\d{6,}$/i;
const EVENTLOG_BOT_MAX_CRS = 3;

app.post('/api/eventlog-bot/test-connection', async (req, res) => {
  const settings = storage.readSettings();
  if (!settings.sapCookie) {
    return res.status(400).json({ ok: false, error: 'No SAP cookie configured yet.' });
  }
  if (!settings.sapBaseUrl) {
    return res.status(400).json({ ok: false, error: 'No SAP base URL configured yet.' });
  }
  try {
    const { crNumber } = req.body || {};
    const probeCr = (typeof crNumber === 'string' && CR_NUMBER_PATTERN.test(crNumber.trim()))
      ? crNumber.trim()
      : 'CR0000000000';
    const result = await sapEventlog.fetchCrLogs(
      settings.sapCookie,
      { baseUrl: settings.sapBaseUrl, servicePath: settings.sapServicePath },
      probeCr
    );
    res.json({ ok: true, valid: true, stages: result.stages.map((s) => ({ label: s.label, ok: s.ok, status: s.status || null })) });
  } catch (err) {
    if (err instanceof sapEventlog.SessionError) {
      return res.status(401).json({ ok: false, valid: false, code: err.code, error: err.message });
    }
    res.status(502).json({ ok: false, valid: false, error: err.message });
  }
});

app.post('/api/eventlog-bot/query', async (req, res) => {
  try {
    const settings = storage.readSettings();
    if (!settings.eventlogBotEnabled || !settings.sapCookie) {
      return res.status(400).json({ ok: false, error: 'EventLog Bot is not enabled. Configure the SAP cookie on the Settings page first.' });
    }
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'EventLog Bot needs AI Diagnosis (Groq key) enabled too — configure it on the Settings page.' });
    }
    if (!settings.sapBaseUrl) {
      return res.status(400).json({ ok: false, error: 'No SAP base URL configured yet.' });
    }

    const { crNumber, crNumbers, question, language } = req.body || {};
    const rawList = Array.isArray(crNumbers) ? crNumbers : (crNumber ? [crNumber] : []);
    const invalid = rawList.find((c) => typeof c !== 'string' || !CR_NUMBER_PATTERN.test(c.trim()));
    if (invalid !== undefined) {
      return res.status(400).json({ ok: false, error: "Each CR number must look like 'CR0000029831'" });
    }
    // Dedupe server-side too — defense in depth, the widget already dedupes client-side.
    const crList = [...new Set(rawList.map((c) => c.trim().toUpperCase()))];
    if (crList.length === 0) {
      return res.status(400).json({ ok: false, error: "crNumber must look like 'CR0000029831'" });
    }
    if (crList.length > EVENTLOG_BOT_MAX_CRS) {
      return res.status(400).json({ ok: false, error: `Please look up at most ${EVENTLOG_BOT_MAX_CRS} CRs per query.` });
    }
    const lang = language === 'vi' ? 'vi' : 'en';
    const sapConfig = { baseUrl: settings.sapBaseUrl, servicePath: settings.sapServicePath };

    const results = await Promise.all(crList.map(async (cr) => {
      try {
        const crLogs = await sapEventlog.fetchCrLogs(settings.sapCookie, sapConfig, cr);
        const analysis = await groq.analyzeEventlog(settings.groqApiKey, crLogs, question, lang, settings.aiModel);
        return { crNumber: cr, ok: true, crLogs, analysis };
      } catch (err) {
        // A SessionError means the SAP cookie itself is dead — that affects every
        // CR in the batch identically, so let it propagate and fail the whole
        // request (caught below) instead of reporting it as a per-CR error.
        if (err instanceof sapEventlog.SessionError) throw err;
        return { crNumber: cr, ok: false, error: err.message };
      }
    }));
    res.json({ ok: true, results });
  } catch (err) {
    if (err instanceof sapEventlog.SessionError) {
      return res.status(401).json({ ok: false, code: err.code, error: err.message });
    }
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Small-talk fallback for Auto Bot — used only when the widget's own
// keyword matching (greeting/farewell/intro, handled entirely client-side
// in shared.js) finds no match and there's no CR number in the message.
// Deliberately a separate, much lighter endpoint than /query: no SAP call,
// no JSON-mode schema, tiny token budget.
app.post('/api/eventlog-bot/chitchat', async (req, res) => {
  try {
    const settings = storage.readSettings();
    if (!settings.eventlogBotEnabled) {
      return res.status(400).json({ ok: false, error: 'Capybara is not enabled. Configure it on the Settings page first.' });
    }
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'Capybara needs AI Diagnosis (Groq key) enabled too — configure it on the Settings page.' });
    }
    const { message, language } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'message must be a non-empty string' });
    }
    const lang = language === 'vi' ? 'vi' : 'en';
    const reply = await groq.chitchat(settings.groqApiKey, message.trim(), lang, settings.aiModel);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Matches a suite name as mentioned in a free-text question against the
// canonical suite ids scanSuites() enumerates (read-only — see the
// EventLog Bot test-query route below). Never guesses across suites; a
// question naming a suite that doesn't resolve gets `suite_not_found` back
// with the real list, instead of the bot fabricating suite health.
function resolveSuiteName(rawName, suites) {
  if (!rawName) return null;
  const needle = rawName.trim().toLowerCase();
  if (!needle) return null;
  return (
    suites.find((s) => s.id.toLowerCase() === needle) ||
    suites.find((s) => (s.name || '').toLowerCase() === needle || (s.short || '').toLowerCase() === needle) ||
    suites.find((s) => s.id.toLowerCase().includes(needle) || (s.name || '').toLowerCase().includes(needle)) ||
    null
  );
}

// Natural-language questions about Automation Hub's OWN Playwright test run
// history (pass rate, latest run, top failing/flaky tests, per-suite
// health) — separate from both the SAP CR-lookup path and plain chitchat.
// All data comes from this dashboard's own SQLite store (storage.js/db.js)
// or a read-only scan of the sibling Playwright project's spec files
// (scanSuites(), used elsewhere in this file the same way) — nothing here
// writes to or otherwise touches the Playwright project.
app.post('/api/eventlog-bot/test-query', async (req, res) => {
  try {
    const settings = storage.readSettings();
    if (!settings.eventlogBotEnabled) {
      return res.status(400).json({ ok: false, error: 'Capybara is not enabled. Configure it on the Settings page first.' });
    }
    if (!settings.aiEnabled || !settings.groqApiKey) {
      return res.status(400).json({ ok: false, error: 'Capybara needs AI Diagnosis (Groq key) enabled too — configure it on the Settings page.' });
    }
    const { question, language } = req.body || {};
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ ok: false, error: 'question must be a non-empty string' });
    }
    const lang = language === 'vi' ? 'vi' : 'en';

    const intent = await groq.classifyTestQuery(settings.groqApiKey, question.trim(), settings.aiModel);
    const days = intent.days && intent.days > 0 && intent.days <= 90 ? intent.days : 7;

    if (intent.reportType === 'overview') {
      const stats = getReportOverviewWithDeltas(days, null);
      const { categoryBreakdown, topFailing } = getReportFailureInsights(days, null);
      const analysis = await groq.summarizeReport(settings.groqApiKey, { stats, categoryBreakdown, topFailing, days, suite: null, language: lang }, settings.aiModel);
      return res.json({ ok: true, reportType: 'overview', days, data: { stats, categoryBreakdown, topFailing }, analysis });
    }

    if (intent.reportType === 'latest_run') {
      const latest = storage.readIndex()[0] || null;
      const data = latest ? storage.readRunDetail(latest.id) : null;
      const analysis = await groq.summarizeTestData('latest_run', data, lang, settings.groqApiKey, settings.aiModel);
      return res.json({ ok: true, reportType: 'latest_run', data, analysis });
    }

    if (intent.reportType === 'top_failing') {
      const { topFailing } = getReportFailureInsights(days, null);
      const data = { topFailing, days };
      const analysis = await groq.summarizeTestData('top_failing', data, lang, settings.groqApiKey, settings.aiModel);
      return res.json({ ok: true, reportType: 'top_failing', days, data, analysis });
    }

    if (intent.reportType === 'flaky') {
      const data = { flaky: getFlakyTests(days, null), days };
      const analysis = await groq.summarizeTestData('flaky', data, lang, settings.groqApiKey, settings.aiModel);
      return res.json({ ok: true, reportType: 'flaky', days, data, analysis });
    }

    if (intent.reportType === 'suite_health') {
      const suites = await scanSuites();
      const resolved = resolveSuiteName(intent.suiteName, suites);
      if (!resolved) {
        return res.json({ ok: true, reportType: 'suite_not_found', availableSuites: suites.map((s) => s.id) });
      }
      const { suites: health } = await getSuiteHealth(days);
      const data = health.find((h) => h.suiteName === resolved.id) || null;
      const analysis = await groq.summarizeTestData('suite_health', data, lang, settings.groqApiKey, settings.aiModel);
      return res.json({ ok: true, reportType: 'suite_health', days, data, analysis });
    }

    res.json({ ok: true, reportType: 'unclear' });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: Notifications  (Phase 4)
// Sends a plain {"text": "..."} JSON payload — compatible with Slack incoming
// webhooks. Microsoft Teams webhooks require a different (Adaptive Card /
// MessageCard) payload format and are NOT supported by this simple sender.
// ─────────────────────────────────────────
// §I4 (v1.0.0) — notifierType branches the payload shape: 'slack' sends the
// original plain {"text": "..."} payload; 'teams' sends a simple Adaptive
// Card via Microsoft Teams (Power Automate Workflows). Same SSRF guard
// (assertOutboundUrlAllowed) is applied to both paths by every call site.
function sendWebhookNotification(webhookUrl, text, notifierType) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(webhookUrl);
    } catch (_) {
      return reject(new Error('Invalid webhook URL'));
    }
    const lib  = url.protocol === 'http:' ? http : https;
    const body = notifierType === 'teams'
      ? JSON.stringify(buildTeamsPayload('SimpleMDG Automation Hub', text))
      : JSON.stringify({ text });
    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'http:' ? 80 : 443),
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  10000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
          else {
            // §2.2 — never reflect the response body/status back to the
            // client (that's an SSRF response oracle); log server-side only.
            console.error(`[notify] Webhook responded with HTTP ${res.statusCode}: ${data.slice(0, 200)}`);
            reject(new Error('webhook_rejected'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Webhook request timed out')));
    req.on('error', (err) => {
      console.error('[notify] Webhook request error:', err.message);
      reject(new Error('webhook_rejected'));
    });
    req.write(body);
    req.end();
  });
}

app.post('/api/notifications/test', async (req, res) => {
  try {
    const { webhookUrl, notifierType } = req.body || {};
    if (!webhookUrl) return res.status(400).json({ ok: false, error: 'webhookUrl is required' });
    await assertOutboundUrlAllowed(webhookUrl);
    const type = NOTIFIER_TYPES.includes(notifierType) ? notifierType : (storage.readSettings().notifierType || 'slack');
    await sendWebhookNotification(webhookUrl, ':white_check_mark: Test notification from SimpleMDG Automation Hub.', type);
    res.json({ ok: true, sent: true });
  } catch (err) {
    // §2.2 — generic reason only, never the raw upstream response/error text.
    console.error('[notify] Webhook test failed:', err.message);
    res.status(502).json({ ok: false, reason: 'webhook_rejected' });
  }
});

// ─────────────────────────────────────────
// API: Maintenance / retention  (Phase 4)
// ─────────────────────────────────────────
app.get('/api/maintenance/stats', (req, res) => {
  try {
    const list = storage.readIndex();
    const oldestRun = list.length ? list.reduce((a, b) => (a.startTime < b.startTime ? a : b)) : null;
    res.json({
      ok: true,
      runCount:         list.length,
      dataSizeBytes:    dirSize(storage.DATA_DIR),
      reportsSizeBytes: dirSize(storage.REPORTS_DIR),
      oldestRunDate:    oldestRun ? oldestRun.startTime : null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: POST /api/maintenance/rebuild  (v0.8.0 — P4: derived data must be
// rebuildable). Detect-only: re-validates that each run's stored aggregate
// counts (total_tests/passed/failed/skipped/flaky) match the actual counts
// derived from its test_results rows. Logs and reports mismatches; does NOT
// auto-fix anything.
// ─────────────────────────────────────────
app.post('/api/maintenance/rebuild', (req, res) => {
  try {
    const conn = db.raw;
    const runs = conn.prepare('SELECT id, total_tests, passed, failed, skipped, flaky FROM runs').all();
    const aggStmt = conn.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'passed'  THEN 1 ELSE 0 END) AS passed,
        SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN status = 'flaky'   THEN 1 ELSE 0 END) AS flaky
      FROM test_results WHERE run_id = ?
    `);

    const mismatches = [];
    for (const r of runs) {
      const agg = aggStmt.get(r.id) || {};
      const actual = {
        total_tests: agg.total || 0,
        passed:      agg.passed || 0,
        failed:      agg.failed || 0,
        skipped:     agg.skipped || 0,
        flaky:       agg.flaky || 0,
      };
      const stored = {
        total_tests: r.total_tests || 0,
        passed:      r.passed || 0,
        failed:      r.failed || 0,
        skipped:     r.skipped || 0,
        flaky:       r.flaky || 0,
      };
      const diffFields = Object.keys(actual).filter((k) => actual[k] !== stored[k]);
      if (diffFields.length) {
        mismatches.push({ runId: r.id, stored, actual, diffFields });
      }
    }

    if (mismatches.length) {
      console.log(`[maintenance/rebuild] Found ${mismatches.length} run(s) with mismatched aggregate counts:`, mismatches);
    } else {
      console.log('[maintenance/rebuild] All run aggregate counts match test_results.');
    }

    res.json({ ok: true, checkedRuns: runs.length, mismatchCount: mismatches.length, mismatches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/maintenance/cleanup', (req, res) => {
  try {
    const settings = storage.readSettings();
    const days = (req.body && req.body.olderThanDays !== undefined) ? req.body.olderThanDays : (settings.retentionDays || 30);
    if (!isValidRetentionDays(days)) {
      return res.status(400).json({ ok: false, error: 'olderThanDays must be an integer between 1 and 3650' });
    }
    const result = cleanupOldRuns(Number(days));
    sweepTrash();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API: GET /api/report-status
// ─────────────────────────────────────────
app.get('/api/report-status', (req, res) => {
  const list = storage.readIndex();
  const latest = list.find(r => r.status === 'done' || r.status === 'failed');
  const available = !!(latest && fs.existsSync(path.join(storage.reportHtmlDir(latest.id), 'index.html')));
  res.json({ ok: true, available, runId: latest ? latest.id : null });
});

// ─────────────────────────────────────────
// API: POST /api/show-report
// §5.1 — used to spawn a detached PowerShell window running
// `playwright show-report`; that whole Windows-GUI-only mechanism is
// removed (§2.3/§5.1). The report is already served statically via
// /report-assets/<runId>/index.html (see GET /api/runs/:id/report), so this
// endpoint now just returns the URL for the frontend to open in a new tab.
// ─────────────────────────────────────────
app.post('/api/show-report', async (req, res) => {
  const bodyRunId = req.body && req.body.runId;
  const latest    = storage.readIndex().find(r => r.status === 'done' || r.status === 'failed');
  const targetId  = bodyRunId || (latest && latest.id);

  if (!targetId || !isSafeRunId(targetId)) {
    return res.status(404).json({ ok: false, error: 'No report found. Run a test first.' });
  }
  const htmlDir = storage.reportHtmlDir(targetId);
  if (!fs.existsSync(path.join(htmlDir, 'index.html'))) {
    return res.status(404).json({ ok: false, error: 'No report found for this run.' });
  }

  // §v1.8.1 — try Playwright's own show-report server first (correct
  // screenshot/video/trace attachment resolution — see UPGRADE_NOTES.md);
  // fall back to the old static /report-assets/ route on any failure so
  // "View Report" never hard-fails. `degraded`+`warning` let the frontend
  // surface a one-line notice when running in fallback mode.
  const started = await reportServerPool.ensure(targetId, htmlDir);
  if (started.ok) {
    return res.json({ ok: true, runId: targetId, url: started.url, degraded: false });
  }
  console.warn(`[report] show-report unavailable for run ${targetId}, falling back to static report-assets: ${started.error}`);
  res.json({
    ok: true,
    runId: targetId,
    url: `/report-assets/${targetId}/index.html`,
    degraded: true,
    warning: 'Playwright\'s own report server could not be started, so this report is showing in a degraded static mode — some screenshots, videos, or traces may not display correctly.',
  });
});

// ─────────────────────────────────────────
// API: POST /api/run
// ─────────────────────────────────────────
app.post('/api/run', async (req, res) => {
  const { type, suiteName, specFile, mode, workers } = req.body;
  if (!type || !suiteName) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  if (!isSafeSuiteName(suiteName)) {
    return res.status(400).json({ ok: false, error: 'Invalid suiteName' });
  }
  if (type === 'spec' && !isSafeSpecFile(specFile)) {
    return res.status(400).json({ ok: false, error: 'Invalid specFile' });
  }

  // §v1.3.0 item 2 — pre-flight checks BEFORE spawning Playwright. Only a
  // 'block' status actually stops the run; 'warn' statuses are returned
  // alongside a successfully-started run so the UI can surface them.
  const preflight = await runPreflightChecks();
  if (preflight.blocked) {
    return res.status(412).json({ ok: false, error: 'Pre-flight check failed', preflight });
  }

  // Quarantined tests are automatically skipped when running a whole suite.
  // §6.4 "false confidence" fix — the excluded titles + their governance
  // reason are captured here (quarantineSkipped) so the run's summary can
  // show them, not just a bare pass count.
  let grepInvert = null;
  let quarantineSkipped = [];
  if (type === 'suite') {
    const settings = storage.readSettings();
    const titles = quarantinedTitlesForSuite(settings, suiteName);
    if (titles.length) grepInvert = buildGrepPattern(titles);
    const activeEntries = quarantineStore.listActive(PROJECT_ROOT);
    quarantineSkipped = titles.map((title) => {
      const entry = activeEntries.find((e) => e.suiteName === suiteName && e.title === title);
      return { testKey: testKey(suiteName, title), reason: entry ? entry.reason : '(no reason on file)' };
    });
  }

  const result = startTestRun({ type, suiteName, specFile, mode, workers, grepInvert, quarantineSkipped });
  if (!result.ok) return res.status(result.statusCode || 500).json(result);
  res.json({ ...result, preflight });
});

// ─────────────────────────────────────────
// Core: starts a Playwright run (used by /api/run and rerun-failed).
// Returns { ok:true, runId, label } or { ok:false, statusCode, error }.
// ─────────────────────────────────────────
function startTestRun({ type, suiteName, specFile, mode, workers, grep, grepInvert, labelSuffix, quarantineSkipped }) {
  const testTarget = type === 'suite'
    ? `suites/${suiteName}/e2e`
    : `suites/${suiteName}/e2e/${specFile}`;

  // §2.3 — spawn the Playwright CLI directly via Node (process.execPath),
  // no shell, no npx.cmd. Args are passed as separate array elements, so
  // there is nothing here for a `"`/`&`/`%` in a test title to break out of.
  const args = [
    PW_CLI, 'test', testTarget,
    '--config', 'playwright.config.ts',
  ];
  if (type === 'suite') {
    args.push(`--workers=${workers || 2}`);
  } else if (mode === 'headed') {
    args.push('--headed');
  }
  if (grep) {
    args.push('--grep', grep); // no manual quoting needed — shell:false, argv is exact
  }
  if (grepInvert) {
    args.push('--grep-invert', grepInvert);
  }
  // line: keeps readable text output in the run log
  // json:  lets the dashboard parse per-test results after the run finishes
  // html:  a per-run report (destination set via PLAYWRIGHT_HTML_REPORT below)
  args.push('--reporter=line,json,html');

  const label     = (type === 'suite' ? `[SUITE] ${suiteName}` : `[SPEC]  ${specFile}`) + (labelSuffix || '');
  const modeLabel = type === 'suite' ? `headless · w${workers || 2}` : (mode || 'headless');

  const limitError = checkLimits(type, workers);
  if (limitError) {
    return { ok: false, statusCode: 429, error: limitError };
  }

  const runId = generateRunId();
  const run = {
    id:            runId,
    label,
    suite:         suiteName.replace(/^S4_(SIT|QAS)_AUTO_/, ''),
    suiteFullName: suiteName,
    modeLabel,
    status:        'running',
    startTime:     Date.now(),
    endTime:       null,
    exitCode:      null,
  };
  runs.unshift(run);

  // NOTE: suiteName is stored as the FULL suite id (matches /api/suites ids
  // and the History filter dropdown) — do not use the shortened `run.suite`
  // label here, or filtering by suite silently breaks.
  storage.upsertIndexEntry({
    id:         run.id,
    type,
    suiteName:  run.suiteFullName,
    label:      run.label,
    modeLabel:  run.modeLabel,
    status:     'running',
    startTime:  run.startTime,
    endTime:    null,
    totalTests: 0, passed: 0, failed: 0, flaky: 0, skipped: 0,
  });

  run.quarantineSkipped = quarantineSkipped || [];
  storage.setRunPlan(run.id, { quarantineSkipped: run.quarantineSkipped });

  // §6.2 — capture git branch/sha/dirty at run-start time (read-only, never
  // throws — see git-context.js; gracefully null when PROJECT_ROOT isn't a
  // git repo or git isn't on PATH, both real states for this repo).
  try {
    run.gitContext = getGitContext(PROJECT_ROOT);
    storage.setRunContext(run.id, run.gitContext);
  } catch (_) {
    run.gitContext = { branch: null, commitSha: null, dirty: null };
  }

  // §3.13 — temp files live under dashboard/data/tmp/, not PROJECT_ROOT.
  const jsonOutFile = path.join(storage.TMP_DIR, `_pw_result_${run.id}.json`);
  const htmlOutDir  = storage.reportHtmlDir(run.id);
  const logFile     = path.join(storage.TMP_DIR, `_pw_log_${run.id}.txt`);

  // §ADR-2 (v0.9.0) — HUB_RUN_ID is the opt-in reporter's ON switch. It does
  // NOT change how the hub invokes Playwright's own --reporter flag (that
  // stays exactly as built above); instead, a HOST project's
  // playwright.config.ts can add a reporter entry guarded by this env var
  // (`process.env.HUB_RUN_ID ? [...] : []`), which self-registers hub-reporter.js
  // for live progress/SSE ONLY when the hub itself launched the process — a
  // plain `npx playwright test` run never touches it. See UPGRADE_NOTES.md
  // for the exact one-line snippet host projects need to add.
  const pw = spawn(process.execPath, args, {
    cwd:   PROJECT_ROOT,
    shell: false, // §2.3 — no shell involved at all
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutFile,
      PLAYWRIGHT_HTML_REPORT:      htmlOutDir,
      PLAYWRIGHT_HTML_OPEN:        'never',
      HUB_RUN_ID:                  run.id,
    },
  });
  runningProcesses.set(run.id, pw);
  // §v1.3.0 item 1 — persist the PID immediately so a hub restart mid-run can
  // reconcile this run against the real OS process (see reconcileIndexOnBoot).
  try { storage.setRunPid(run.id, pw.pid); } catch (_) {}

  const logStream = fs.createWriteStream(logFile, { flags: 'w' });
  pw.stdout.pipe(logStream);
  pw.stderr.pipe(logStream);

  // §v1.1 — reopen a VISIBLE terminal window that tails this run's log file,
  // per user request ("Tôi mong muốn run ở terminal để tiện theo dõi hơn").
  // This does NOT touch the `pw` spawn above (still shell:false, argv-only).
  // The tail window only ever reads a path the server itself constructed
  // (logFile, under storage.TMP_DIR) — it is passed as a single argv element
  // to `Get-Content`, never interpolated into a shell string, so nothing a
  // test title could write into the log can act as a command.
  openLogTailWindow(logFile, label);

  function cleanupTmpFiles() {
    try { fs.unlinkSync(logFile); } catch (_) {}
    // jsonOutFile is unlinked in persistRunResult() after parsing; unlink
    // again here defensively in case parsing failed before reaching that step.
    try { fs.unlinkSync(jsonOutFile); } catch (_) {}
  }

  pw.on('close', (code) => {
    logStream.end();
    run.exitCode = code;
    run.endTime  = Date.now();
    // §3.11 — a run stopped by the user is 'cancelled', never 'failed', so
    // it doesn't pollute pass-rate / flaky / top-failing analytics (those
    // endpoints only include status === 'done' || 'failed').
    run.status = run.stoppedByUser ? 'cancelled' : ((code === 0) ? 'done' : 'failed');
    runningProcesses.delete(run.id);
    console.log(`[run #${run.id}] ${label} -> exit ${code} (${run.status})`);

    persistRunResult(run, jsonOutFile);
    cleanupTmpFiles();
  });

  pw.on('error', (err) => {
    logStream.end();
    run.status  = run.stoppedByUser ? 'cancelled' : 'failed';
    run.endTime = Date.now();
    runningProcesses.delete(run.id);
    console.error(`[run #${run.id}] spawn error:`, err.message);
    storage.upsertIndexEntry({ id: run.id, status: run.status, endTime: run.endTime });
    cleanupTmpFiles();
  });

  console.log(`[run #${run.id}] Started: ${label}`);
  return { ok: true, runId: run.id, label };
}

// ─────────────────────────────────────────
// Helper: archive a run's screenshots/videos/traces into the hub's own
// storage right after the run finishes, then resolve public URLs against
// THAT copy — not the live project test-results/ folder.
//
// Why: Playwright's default behavior is to wipe its outputDir (test-results/)
// at the START of the next `playwright test` invocation (its own or one
// triggered by anyone else on the machine). Attachment links that pointed
// straight into that live folder (the old /test-artifacts route) would 404
// as soon as a newer run happened — even though the OLD run's own report
// page still exists and still claims to have screenshots. Copying the files
// into dashboard/reports/<runId>/artifacts/ (see storage.reportArtifactsDir)
// immediately after this run's own process closes — and before any other
// run can start and clear test-results/ — fixes this permanently. The copy
// is nested under the same per-run reportDir() as the HTML report, so it's
// already covered by the existing soft-delete/trash and retention cleanup
// with no extra code (see deleteRunCompletely/cleanupOldRuns).
// ─────────────────────────────────────────
function archiveAttachments(runId, tests) {
  const destRoot = storage.reportArtifactsDir(runId);
  let copiedCount = 0;
  let skippedCount = 0;

  for (const t of tests) {
    if (!t.artifacts) continue;
    for (const key of ['screenshots', 'videos', 'traces']) {
      t.artifacts[key] = (t.artifacts[key] || []).map((absPath) => {
        // Only ever archive files that actually live under the project's
        // known test-results root — anything else (should never happen from
        // Playwright's own JSON report, but never trust it blindly) is
        // silently dropped rather than copied or exposed.
        const rel = path.relative(TEST_RESULTS_ROOT, absPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          skippedCount++;
          return { path: absPath, url: null };
        }
        const destPath = path.join(destRoot, rel);
        try {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(absPath, destPath);
          copiedCount++;
          return { path: absPath, url: `/run-artifacts/${runId}/${rel.split(path.sep).join('/')}` };
        } catch (err) {
          // Source file genuinely missing (e.g. a screenshot Playwright
          // reported but didn't actually write) or a copy error — don't crash
          // run persistence over a missing attachment, just leave it unlinked.
          skippedCount++;
          console.warn(`[run #${runId}] Could not archive attachment "${absPath}": ${err.message}`);
          return { path: absPath, url: null };
        }
      });
    }
  }

  if (copiedCount || skippedCount) {
    console.log(`[run #${runId}] Archived ${copiedCount} attachment(s) for permanent viewing` +
      (skippedCount ? ` (${skippedCount} skipped)` : ''));
  }
  return tests;
}

// ─────────────────────────────────────────
// Helper: parse the JSON result + persist it once a run finishes, then fire
// an optional webhook notification (Phase 4).
// ─────────────────────────────────────────
function persistRunResult(run, jsonOutFile) {
  let summary = { totalTests: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 };
  let tests   = [];

  const parsed = parsePlaywrightJsonReport(jsonOutFile);
  if (parsed) {
    summary = parsed.summary;
    tests   = archiveAttachments(run.id, parsed.tests);
  }

  const detail = {
    id:         run.id,
    suiteName:  run.suiteFullName,
    label:      run.label,
    modeLabel:  run.modeLabel,
    status:     run.status,
    startTime:  run.startTime,
    endTime:    run.endTime,
    exitCode:   run.exitCode,
    summary,
    tests,
  };
  storage.writeRunDetail(run.id, detail);
  storage.upsertIndexEntry({
    id:         run.id,
    suiteName:  run.suiteFullName,
    label:      run.label,
    modeLabel:  run.modeLabel,
    status:     run.status,
    startTime:  run.startTime,
    endTime:    run.endTime,
    ...summary,
  });

  try { fs.unlinkSync(jsonOutFile); } catch (_) {}

  // Fire-and-forget notification — never let a webhook failure affect the run itself.
  try {
    const settings = storage.readSettings();
    if (settings.notificationWebhook && settings.notifierType !== 'none') {
      const qCount = (run.quarantineSkipped || []).length;
      const text = `*${run.label}* finished: ${run.status.toUpperCase()} — ` +
        `${summary.passed}/${summary.totalTests} passed` +
        (summary.failed ? `, ${summary.failed} failed` : '') +
        (qCount ? `, ⚠ ${qCount} quarantined` : '');
      sendWebhookNotification(settings.notificationWebhook, text, settings.notifierType)
        .catch((err) => console.error('[notify] Failed to send webhook notification:', err.message));
    }
  } catch (err) {
    console.error('[notify] Notification step failed:', err.message);
  }
}

// ─────────────────────────────────────────
// Terminal log-tail window (§v1.1 — restores the "watch it live in a real
// terminal" experience the user asked for, WITHOUT reintroducing the
// shell:true / cmd.exe command-injection risk that the old v0.7-era
// buildTailCommand()/spawnPsWindow() helpers had.
//
// Key difference from the old implementation: the log path is passed as its
// own argv element to `powershell.exe -Command Get-Content -Path <path>
// -Wait`, with shell:false. There is no shell string for anything (including
// a test title that ended up in the log's content) to break out of — argv
// elements are never re-parsed as shell syntax. The window it opens is
// exclusively `Get-Content`'ing a file the server itself just created
// (logFile, under storage.TMP_DIR); it never executes a test-supplied string
// as a command.
// ─────────────────────────────────────────
function isSafeAbsoluteLogPath(p) {
  // Defense in depth: only ever tail a file that's actually inside our own
  // tmp dir. Should always be true given how logFile is built above, but a
  // cheap guard here costs nothing.
  const resolved = path.resolve(p);
  const root = path.resolve(storage.TMP_DIR);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function openLogTailWindow(logFile, label) {
  if (!isSafeAbsoluteLogPath(logFile)) {
    console.warn('[terminal] Refusing to tail a path outside the tmp dir:', logFile);
    return;
  }

  try {
    if (process.platform === 'win32') {
      // The log path is handed to the child ONLY via an environment variable
      // (HUB_TAIL_LOG_FILE), never spliced into the -Command string itself.
      // The PowerShell command text is a fixed literal we control end to
      // end; it reads the path back out of $env:HUB_TAIL_LOG_FILE, so there
      // is no string concatenation of untrusted data into anything that gets
      // parsed as PowerShell/shell syntax.
      // -NoExit keeps the window open after the tail loop ends (run finished)
      // so the operator can still scroll back through the final output.
      const psCommand =
        `$Host.UI.RawUI.WindowTitle = 'SimpleMDG Hub — live log'; ` +
        `Write-Host 'Waiting for log output...' -ForegroundColor DarkGray; ` +
        `Get-Content -LiteralPath $env:HUB_TAIL_LOG_FILE -Wait -Tail 50`;
      const child = spawn('powershell.exe', [
        '-NoProfile', '-NoExit', '-Command', psCommand,
      ], {
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: { ...process.env, HUB_TAIL_LOG_FILE: logFile },
      });
      child.unref();
    } else {
      // Best-effort on non-Windows: try common terminal emulators. If none
      // exist, log a note and move on — never crash the run over this.
      const candidates = [
        ['x-terminal-emulator', ['-e', 'tail', '-f', '-n', '50', logFile]],
        ['xterm',               ['-e', 'tail', '-f', '-n', '50', logFile]],
        ['gnome-terminal',      ['--', 'tail', '-f', '-n', '50', logFile]],
      ];
      let spawned = false;
      for (const [cmd, cmdArgs] of candidates) {
        try {
          const child = spawn(cmd, cmdArgs, { shell: false, detached: true, stdio: 'ignore' });
          child.on('error', () => {}); // ignore ENOENT for candidates that don't exist
          child.unref();
          spawned = true;
          break;
        } catch (_) { /* try next candidate */ }
      }
      if (!spawned) {
        console.log('[terminal] No visible terminal emulator found on this platform — skipping tail window. Log still captured at:', logFile);
      }
    }
  } catch (err) {
    // The tail window is a convenience layer only — never let it affect the
    // actual test run if spawning it fails for any reason.
    console.warn('[terminal] Could not open log tail window:', err.message);
  }
}

// ─────────────────────────────────────────
// API: GET /api/limits  (§3.1 — was missing; frontend has called this for
// 2+ releases and silently got overview.html back as a 200 due to the SPA
// catch-all, which the empty `catch(_){}` in the frontend then swallowed).
// ─────────────────────────────────────────
app.get('/api/limits', (req, res) => {
  const { specs, suites, totalWorkers } = getRunningStats();
  res.json({ ok: true, limits: LIMITS, current: { specs: specs.length, suites: suites.length, totalWorkers } });
});

// ─────────────────────────────────────────
// GET /api/execution/stats — Execution Center KPI strip + Run Status Trend
// (v1.9.0). Run-level status counts (done/failed/interrupted), distinct from
// Report Center's test-execution-level stats — see computeRunStats() vs.
// computeOverview() in report-aggregator.js.
// ─────────────────────────────────────────
function getFinishedRunsInRange(since, until) {
  return db.raw.prepare(`
    SELECT id, status, started_at AS startTime, finished_at AS endTime
    FROM runs
    WHERE started_at >= ? AND started_at < ? AND status IN ('done', 'failed', 'interrupted')
  `).all(since, until);
}

app.get('/api/execution/stats', (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const now = Date.now();
    const since = now - days * 24 * 60 * 60 * 1000;
    const prevSince = since - days * 24 * 60 * 60 * 1000;

    const currentRuns = getFinishedRunsInRange(since, now);
    const previousRuns = getFinishedRunsInRange(prevSince, since);

    const current = computeRunStats({ runs: currentRuns });
    const previous = computeRunStats({ runs: previousRuns });
    const deltas = computeDeltas(current, previous, RUN_STATS_DELTA_KEYS);
    const statusTrend = computeRunStatusTrend({ runs: currentRuns });

    res.json({ ok: true, days, ...current, deltas, statusTrend });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────
// API 404 — must be JSON, not the SPA catch-all. Registered AFTER every
// /api route above and BEFORE the SPA catch-all below.
// ─────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

// ─────────────────────────────────────────
// Fallback
// NOTE: this project pins express@4.x, which bundles the legacy
// path-to-regexp@0.1.x matcher — it does NOT understand the Express 5
// "{*splat}" named-wildcard syntax. Use the classic '*' wildcard instead,
// which is what actually works here. (Previously "/" happened to be served
// by express.static's automatic index.html lookup, masking this.)
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

// ─────────────────────────────────────────
// Start
// ─────────────────────────────────────────
// §2.1 — bind to loopback only by default (confirmed local-only, single-machine
// tooling per ARCHITECTURE_PLAN §0). Set HOST=0.0.0.0 explicitly to expose it
// on the LAN, at the operator's own risk (no auth/RBAC exists — see docs).
app.listen(PORT, HOST, () => {
  console.log('');
  console.log(`  SimpleMDG Automation Hub  v${pkg.version}`);
  console.log(`  ->  http://${HOST}:${PORT}`);
  console.log(`  ->  Project root: ${PROJECT_ROOT}`);
  console.log(`  ->  Data dir:     ${storage.DATA_DIR}`);
  console.log('');
});
