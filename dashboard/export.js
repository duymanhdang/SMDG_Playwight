/**
 * export.js — Export helpers: CSV (run history) and summary PDF (single run).
 *
 * PDF generation reuses the Chromium browser that Playwright already installs
 * in the parent project (via install.bat), instead of adding puppeteer or any
 * other dependency with a native binding. This keeps the dashboard's own
 * package.json limited to express + glob, matching the "just copy & run"
 * deployment goal.
 */

const path = require('path');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {object[]} rows - run-index entries
 * @returns {string} CSV text
 */
function buildRunHistoryCsv(rows) {
  const header = [
    'id', 'suiteName', 'label', 'status',
    'startTime', 'endTime', 'totalTests', 'passed', 'failed', 'flaky', 'skipped',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map((key) => csvEscape(r[key])).join(','));
  }
  return lines.join('\n');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildSummaryHtml(run) {
  const s = run.summary || {};
  const failedTests = (run.tests || []).filter((t) => t.status === 'failed');
  const rows = failedTests.map((t) => `
    <tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.category || '-')}</td>
      <td>${escapeHtml((t.error || '').slice(0, 300))}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #111827; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
  .summary { display: flex; gap: 14px; margin: 18px 0; }
  .card { border: 1px solid #e2e5eb; border-radius: 8px; padding: 10px 16px; text-align: center; flex: 1; }
  .val { font-size: 20px; font-weight: 700; } .lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
  th, td { border: 1px solid #e2e5eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8f9fb; }
  h3 { margin-top: 20px; font-size: 13px; }
</style></head>
<body>
  <h1>${escapeHtml(run.label || run.id)}</h1>
  <div class="sub">${run.startTime ? new Date(run.startTime).toLocaleString() : ''} — Status: ${escapeHtml(run.status)}</div>
  <div class="summary">
    <div class="card"><div class="val">${s.totalTests || 0}</div><div class="lbl">Total</div></div>
    <div class="card"><div class="val">${s.passed || 0}</div><div class="lbl">Passed</div></div>
    <div class="card"><div class="val">${s.failed || 0}</div><div class="lbl">Failed</div></div>
    <div class="card"><div class="val">${s.flaky || 0}</div><div class="lbl">Flaky</div></div>
    <div class="card"><div class="val">${s.skipped || 0}</div><div class="lbl">Skipped</div></div>
  </div>
  <h3>Failed tests (${failedTests.length})</h3>
  <table>
    <thead><tr><th style="width:35%">Test</th><th style="width:15%">Category</th><th style="width:50%">Error</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="3">None</td></tr>'}</tbody>
  </table>
</body></html>`;
}

/**
 * Renders a 1-page summary PDF for a run using the parent project's own
 * Playwright/Chromium install.
 *
 * @param {string} projectRoot - absolute path to the parent Playwright project
 * @param {object} runDetail   - RunDetail object (from storage.readRunDetail)
 * @param {string} outputPath  - absolute path to write the PDF to
 */
async function generateSummaryPdf(projectRoot, runDetail, outputPath) {
  let chromium;
  try {
    ({ chromium } = require(path.join(projectRoot, 'node_modules', 'playwright')));
  } catch (_) {
    throw new Error(
      'Could not load Playwright from the project node_modules. ' +
      'Make sure install.bat has been run in the parent project.'
    );
  }

  const html = buildSummaryHtml(runDetail);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
  } finally {
    await browser.close();
  }
}

/**
 * D6 — print-optimized HTML report (replaces the Chromium-PDF-launch concern,
 * ADR-10). The user hits Ctrl+P -> "Save as PDF" instead of the hub spawning
 * headless Chromium. Full test list (not just failed), @media print rules,
 * sensible page breaks.
 */
function buildPrintReportHtml(run) {
  const s = run.summary || {};
  const rows = (run.tests || []).map((t) => `
    <tr class="row-${escapeHtml(t.status)}">
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.status)}</td>
      <td>${escapeHtml(t.category || '-')}</td>
      <td>${t.duration ? Math.round(t.duration / 1000) + 's' : '-'}</td>
      <td>${escapeHtml((t.error || '').slice(0, 300))}</td>
    </tr>`).join('');

  const qSkipped = run.quarantineSkipped || [];
  const qBanner = qSkipped.length
    ? `<div class="q-banner">⚠ ${qSkipped.length} test(s) quarantined and excluded from this run:
        <ul>${qSkipped.map((q) => `<li>${escapeHtml(q.testKey)} — ${escapeHtml(q.reason)}</li>`).join('')}</ul>
       </div>`
    : '';

  const ctx = run.gitContext || {};
  const ctxLine = (ctx.branch || ctx.commitSha)
    ? `<div class="sub">branch: ${escapeHtml(ctx.branch || 'n/a')} · commit: ${escapeHtml((ctx.commitSha || '').slice(0, 12) || 'n/a')}${ctx.dirty ? ' · (dirty working tree)' : ''}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(run.label || run.id)} — Print Report</title><style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111827; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 6px; }
  .summary { display: flex; gap: 14px; margin: 16px 0; }
  .card { border: 1px solid #e2e5eb; border-radius: 8px; padding: 10px 16px; text-align: center; flex: 1; }
  .val { font-size: 20px; font-weight: 700; } .lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 14px; }
  th, td { border: 1px solid #e2e5eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8f9fb; }
  .row-failed { background: #fef2f2; }
  .q-banner { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin: 14px 0; font-size: 12px; }
  .print-btn { margin: 10px 0; }
  @media print {
    .print-btn { display: none; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
  }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>${escapeHtml(run.label || run.id)}</h1>
  <div class="sub">${run.startTime ? new Date(run.startTime).toLocaleString() : ''} — Status: ${escapeHtml(run.status)}</div>
  ${ctxLine}
  ${qBanner}
  <div class="summary">
    <div class="card"><div class="val">${s.totalTests || 0}</div><div class="lbl">Total</div></div>
    <div class="card"><div class="val">${s.passed || 0}</div><div class="lbl">Passed</div></div>
    <div class="card"><div class="val">${s.failed || 0}</div><div class="lbl">Failed</div></div>
    <div class="card"><div class="val">${s.flaky || 0}</div><div class="lbl">Flaky</div></div>
    <div class="card"><div class="val">${s.skipped || 0}</div><div class="lbl">Skipped</div></div>
    <div class="card"><div class="val">${qSkipped.length}</div><div class="lbl">Quarantined</div></div>
  </div>
  <table>
    <thead><tr><th style="width:30%">Test</th><th>Status</th><th>Category</th><th>Duration</th><th style="width:35%">Error</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No tests recorded</td></tr>'}</tbody>
  </table>
</body></html>`;
}

/**
 * Report Center (v1.1) — print-optimized HTML report for the AGGREGATE
 * overview (across many runs), as opposed to buildPrintReportHtml() above
 * which is for a single run. Same Ctrl+P -> Save as PDF approach, no
 * headless-Chromium dependency (ADR-10, D6, v1.0.0).
 *
 * @param {object} params
 * @param {object} params.overview - computeOverview() output (report-aggregator.js)
 * @param {number} [params.days]
 * @param {string} [params.suite]
 * @param {object} [params.aiSummary] - optional groq-client.summarizeReport() output
 */
function buildReportCenterPrintHtml({ overview, days, suite, aiSummary } = {}) {
  const o = overview || {};
  const rangeLabel = `Last ${days || '?'} day(s)${suite ? ` — suite: ${suite}` : ' — all suites'}`;

  const suiteRows = (o.suiteBreakdown || []).map((s) => `
    <tr>
      <td>${escapeHtml(s.suiteName)}</td>
      <td>${s.runs}</td>
      <td>${s.passRate === null ? '-' : s.passRate + '%'}</td>
      <td>${s.lastRunTime ? new Date(s.lastRunTime).toLocaleString() : '-'}</td>
    </tr>`).join('');

  const aiBlock = aiSummary ? `
    <h3>AI-generated summary <span style="font-weight:400;font-size:10px;color:#b45309">(AI-generated — verify before sharing)</span></h3>
    <table>
      <tbody>
        <tr><td style="width:20%"><strong>Health assessment</strong></td><td>${escapeHtml(aiSummary.healthAssessment)}</td></tr>
        <tr><td><strong>Trends</strong></td><td>${escapeHtml(aiSummary.trends)}</td></tr>
        <tr><td><strong>Risk areas</strong></td><td>${escapeHtml(aiSummary.riskAreas)}</td></tr>
        <tr><td><strong>Recommendations</strong></td><td>${(aiSummary.recommendations || []).map(escapeHtml).join('<br>')}</td></tr>
      </tbody>
    </table>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Report Center — Test Report</title><style>
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111827; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h3 { margin-top: 20px; font-size: 13px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 6px; }
  .summary { display: flex; gap: 14px; margin: 16px 0; flex-wrap: wrap; }
  .card { border: 1px solid #e2e5eb; border-radius: 8px; padding: 10px 16px; text-align: center; flex: 1; min-width: 90px; }
  .val { font-size: 20px; font-weight: 700; } .lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 14px; }
  th, td { border: 1px solid #e2e5eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f8f9fb; }
  .print-btn { margin: 10px 0; }
  @media print {
    .print-btn { display: none; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    thead { display: table-header-group; }
  }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>Report Center — Test Report</h1>
  <div class="sub">${rangeLabel} — generated ${new Date().toLocaleString()}</div>
  <div class="summary">
    <div class="card"><div class="val">${o.totalRuns || 0}</div><div class="lbl">Runs</div></div>
    <div class="card"><div class="val">${o.totalExecutions || 0}</div><div class="lbl">Executions</div></div>
    <div class="card"><div class="val">${o.passRate === null || o.passRate === undefined ? '-' : o.passRate + '%'}</div><div class="lbl">Pass rate</div></div>
    <div class="card"><div class="val">${o.failed || 0}</div><div class="lbl">Failed</div></div>
    <div class="card"><div class="val">${o.flaky || 0}</div><div class="lbl">Flaky</div></div>
    <div class="card"><div class="val">${o.skipped || 0}</div><div class="lbl">Skipped</div></div>
    <div class="card"><div class="val">${o.quarantinedSkip || 0}</div><div class="lbl">Quarantined</div></div>
  </div>
  <h3>Per-suite breakdown</h3>
  <table>
    <thead><tr><th>Suite</th><th>Runs</th><th>Pass rate</th><th>Last run</th></tr></thead>
    <tbody>${suiteRows || '<tr><td colspan="4">No runs in this range</td></tr>'}</tbody>
  </table>
  ${aiBlock}
</body></html>`;
}

/** Microsoft Teams (Power Automate Workflows) Adaptive Card payload — kept
 * deliberately simple: title + text body, no over-engineering. */
function buildTeamsPayload(title, text) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
          { type: 'TextBlock', text, wrap: true },
        ],
      },
    }],
  };
}

module.exports = { buildRunHistoryCsv, generateSummaryPdf, buildPrintReportHtml, buildReportCenterPrintHtml, buildTeamsPayload };
