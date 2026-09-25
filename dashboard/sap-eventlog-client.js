/**
 * sap-eventlog-client.js — Minimal SAP MDG (BTP) OData client for the
 * EventlogBot widget.
 *
 * Uses Node's built-in https module only (no axios/SDK dependency), mirroring
 * groq-client.js's style so the dashboard's own package.json stays limited to
 * express + glob. Auth is a manually-pasted Cookie header (session cookie
 * copied from the SAP BTP app's own browser session) — there is no OAuth flow
 * here, this is the same trust model already validated by the check_var/
 * Teams-bot prototype this module is ported from.
 *
 * Each entity is a separate OData request against the same
 * CommonProcessService, filtered by reqID (the CR number). Four entities are
 * queried in v1: SubmitEventLog, ApproveEventLog, ActivateEventLog and
 * RequestActionLog. ABAP MDApiLog / Cloud Logging are NOT included — their
 * calling convention isn't confirmed yet (see EventlogBot_SolutionDesign
 * addendum's Open Questions).
 */

const https = require('https');

const ENTITIES = [
  { key: 'submit', name: 'SubmitEventLog', label: 'Submit' },
  { key: 'approve', name: 'ApproveEventLog', label: 'Approve' },
  { key: 'activate', name: 'ActivateEventLog', label: 'Activate' },
  { key: 'requestAction', name: 'RequestActionLog', label: 'RequestAction' },
];

const REQUEST_TIMEOUT_MS = 20000;

class SessionError extends Error {
  constructor() {
    super('SAP session is expired or invalid. Update the Cookie value on the Settings page.');
    this.code = 'SAP_SESSION_EXPIRED';
  }
}

function buildUrl(baseUrl, servicePath, entityName, crNumber) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const path = servicePath || '/srv-process/CommonProcessService';
  const filter = encodeURIComponent(`reqID eq '${crNumber}'`);
  return `${base}${path}/${entityName}?$filter=${filter}`;
}

function compactEvent(e) {
  const out = {
    stepID: e.stepID,
    status: e.status,
    start: e.createdAt,
    end: e.endTime,
    durationSec: e.createdAt && e.endTime
      ? (new Date(e.endTime) - new Date(e.createdAt)) / 1000
      : null,
    createdBy: e.createdBy,
  };
  // RequestActionLog entries have no stepID/status at all — they carry an
  // `action` name instead (e.g. "submitCreateRequest", "CompleteSubmitValidation").
  if (e.action) out.action = e.action;
  if (e.sendToSap) out.sendToSap = e.sendToSap;
  if (e.mdgLogID) out.mdgLogID = e.mdgLogID;
  if (e.activateID) out.activateID = e.activateID;
  if (e.objectID) out.objectID = e.objectID;
  if (e.log) out.log = e.log;
  if (e.warningLog) out.warningLog = e.warningLog;
  return out;
}

function fetchJson(url, cookieHeader) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: 'application/json',
      'User-Agent': 'automation-hub-eventlog-bot/1.0',
    };
    if (cookieHeader) headers.Cookie = cookieHeader;

    const req = https.request(url, { method: 'GET', headers, timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new SessionError());
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`SAP OData error (HTTP ${res.statusCode}): ${data.slice(0, 300)}`);
          err.status = res.statusCode;
          return reject(err);
        }
        // An expired SAP session doesn't always come back as 401/403 — it can
        // also be a 200 OK whose body is the BTP login/auth-redirect HTML
        // page instead of the requested JSON (confirmed against a real CR:
        // content-type text/html, body starting with a login redirect
        // <script>). Treat any non-JSON content-type as an expired session
        // rather than a generic parse error, since that's what it means here.
        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('json')) {
          return reject(new SessionError());
        }
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          reject(new Error('Could not parse SAP OData response as JSON'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('SAP OData request timed out')));
    req.on('error', (err) => reject(new Error(`SAP OData request failed: ${err.message}`)));
    req.end();
  });
}

async function fetchEntity(url, cookieHeader) {
  const body = await fetchJson(url, cookieHeader);
  const value = Array.isArray(body && body.value) ? body.value : [];
  return value.map(compactEvent);
}

async function fetchEntityWithRetry(entity, crNumber, cookieHeader, sapConfig) {
  const url = buildUrl(sapConfig.baseUrl, sapConfig.servicePath, entity.name, crNumber);
  try {
    const events = await fetchEntity(url, cookieHeader);
    return { entity: entity.key, label: entity.label, url, ok: true, events };
  } catch (err) {
    if (err instanceof SessionError) throw err;
    return {
      entity: entity.key,
      label: entity.label,
      url,
      ok: false,
      status: err.status || null,
      message: err.message,
      events: [],
    };
  }
}

/**
 * Pure aggregation logic — factored out so it's unit-testable without
 * mocking https (same pattern as groq-client.js's buildSummaryMessages()).
 * @param {Array<{ok:boolean, events:object[]}>} stageResults
 */
function aggregateOverall(stageResults) {
  const withEvents = stageResults.filter((r) => r.ok && r.events.length > 0);
  if (withEvents.length === 0) return 'NO_EVENTS';
  const anyFailedStep = withEvents.some((r) =>
    r.events.some((ev) => ev.status && ev.status.toUpperCase() !== 'PASSED')
  );
  return anyFailedStep ? 'FAILED' : 'PASSED';
}

async function fetchCrLogs(cookieHeader, sapConfig, crNumber) {
  const stages = await Promise.all(
    ENTITIES.map((entity) => fetchEntityWithRetry(entity, crNumber, cookieHeader, sapConfig))
  );
  const overall = aggregateOverall(stages);
  const hasEvents = stages.some((r) => r.ok && r.events.length > 0);
  return { crNumber, overall, stages, hasEvents };
}

module.exports = { fetchCrLogs, buildUrl, aggregateOverall, SessionError, ENTITIES };
