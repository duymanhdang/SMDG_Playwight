/**
 * groq-client.js — Minimal Groq API client for AI-assisted failure diagnosis.
 *
 * Uses Node's built-in https module only (no SDK dependency), keeping the
 * dashboard's own package.json limited to express + glob. AI is an entirely
 * optional layer: if no key is configured, this module is never called and
 * the app falls back to the rule-based classifier (classifier.js).
 *
 * NOTE: outbound network access to api.groq.com must be available from the
 * machine running the dashboard. This was NOT exercised against the live
 * Groq API during development (the build/test sandbox used to build this
 * app has no route to api.groq.com) — verify connectivity via
 * "Test connection" on the Settings page after configuring a key.
 */

const https = require('https');

const GROQ_API_HOST = 'api.groq.com';
const GROQ_API_PATH = '/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const REQUEST_TIMEOUT_MS = 20000;

function callGroq(apiKey, messages, { model = DEFAULT_MODEL, maxTokens = 500, temperature = 0.2, jsonMode = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('No Groq API key configured'));

    const body = JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });

    const req = https.request(
      {
        hostname: GROQ_API_HOST,
        path: GROQ_API_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Groq API error (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            reject(new Error('Could not parse Groq API response as JSON'));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Groq API request timed out')));
    req.on('error', (err) => reject(new Error(`Groq API request failed: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

function buildDiagnosisMessages(tests) {
  const listing = tests.map((t, i) => (
    `${i + 1}. ${t.title}\n   Category: ${t.category || 'unknown'}\n   Error: ${(t.error || 'n/a').slice(0, 500)}`
  )).join('\n\n');

  return [
    {
      role: 'system',
      content:
        'You are a senior QA automation engineer helping diagnose Playwright test ' +
        'failures. Respond ONLY with a JSON object of the form ' +
        '{"rootCause": string, "suggestion": string, "confidence": "low"|"medium"|"high"}. ' +
        'Keep rootCause and suggestion concise (2-3 sentences each, plain text, no markdown).',
    },
    {
      role: 'user',
      content:
        `Diagnose the likely root cause of the following Playwright test failure(s) ` +
        `and suggest a fix:\n\n${listing}`,
    },
  ];
}

function parseDiagnosisResponse(apiResponse, model) {
  const content = apiResponse
    && apiResponse.choices
    && apiResponse.choices[0]
    && apiResponse.choices[0].message
    && apiResponse.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('Groq response was not valid JSON');
  }

  return {
    rootCause:   parsed.rootCause || '',
    suggestion:  parsed.suggestion || '',
    confidence:  parsed.confidence || 'unknown',
    model,
    generatedAt: Date.now(),
  };
}

/**
 * @param {string} apiKey
 * @param {{title:string, error:string, category:string}[]} tests - one test for
 *   a single diagnosis, or several tests sharing a likely common root cause for
 *   a cluster diagnosis.
 * @param {string} [model]
 */
async function diagnose(apiKey, tests, model = DEFAULT_MODEL) {
  const messages = buildDiagnosisMessages(tests);
  const response = await callGroq(apiKey, messages, { model });
  return parseDiagnosisResponse(response, model);
}

/**
 * Lightweight connectivity/credential check for the Settings page.
 *
 * maxTokens is deliberately generous (not the ~5 tokens the {"ok":true}
 * reply itself needs): reasoning models available on Groq (e.g.
 * openai/gpt-oss-120b) emit internal reasoning tokens before the final JSON
 * content. A tight budget truncates the response mid-reasoning, before any
 * JSON is produced, which Groq reports as a confusing
 * "json_validate_failed" / empty failed_generation error instead of a
 * length-limit error.
 */
async function testConnection(apiKey, model = DEFAULT_MODEL) {
  const messages = [
    { role: 'system', content: 'Respond ONLY with a JSON object of the form {"ok": true}.' },
    { role: 'user', content: 'ping' },
  ];
  await callGroq(apiKey, messages, { model, maxTokens: 200 });
  return true;
}

/**
 * Report Center (v1.1) — "AI-powered summary". Builds the chat messages for
 * a natural-language QA health summary from already-aggregated stats (see
 * report-aggregator.js's computeOverview() + classifier.js's breakdown()).
 * Kept as a pure function (no network) so it's unit-testable on its own —
 * same split as buildDiagnosisMessages()/callGroq() above.
 *
 * @param {object} bundle
 * @param {object} bundle.stats - computeOverview() output
 * @param {Array<{category:string,count:number}>} [bundle.categoryBreakdown]
 * @param {Array<{suiteName:string,title:string,failCount:number}>} [bundle.topFailing]
 * @param {number} [bundle.days]
 * @param {string} [bundle.suite]
 * @param {'vi'|'en'} [bundle.language] - defaults to 'en' so the existing
 *   Report Center "AI summary" feature (which never passed this) keeps its
 *   original always-English behavior; Auto Bot's test-query path passes the
 *   user's detected language explicitly.
 */
function buildSummaryMessages({ stats = {}, categoryBreakdown = [], topFailing = [], days, suite, language } = {}) {
  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const lines = [];
  lines.push(`Time range: last ${days || '?'} day(s)${suite ? ` — suite: ${suite}` : ' — all suites'}`);
  lines.push(`Total runs: ${stats.totalRuns ?? 0}, total test executions: ${stats.totalExecutions ?? 0}`);
  lines.push(
    `Pass rate: ${stats.passRate ?? 'n/a'}%, Fail rate: ${stats.failRate ?? 'n/a'}%, ` +
    `Flaky rate: ${stats.flakyRate ?? 'n/a'}%, Skipped rate: ${stats.skippedRate ?? 'n/a'}%, ` +
    `Quarantined-skip rate: ${stats.quarantinedSkipRate ?? 'n/a'}%`
  );
  lines.push(`Average run duration: ${Math.round((stats.avgDurationMs || 0) / 1000)}s`);

  if (Array.isArray(stats.suiteBreakdown) && stats.suiteBreakdown.length) {
    lines.push('Per-suite pass rates (most recently run first):');
    stats.suiteBreakdown.slice(0, 10).forEach((s) => {
      lines.push(`  - ${s.suiteName}: ${s.passRate ?? 'n/a'}% pass rate over ${s.runs} run(s)`);
    });
  }
  if (Array.isArray(stats.timeSeries) && stats.timeSeries.length >= 2) {
    const first = stats.timeSeries[0];
    const last = stats.timeSeries[stats.timeSeries.length - 1];
    lines.push(`Pass-rate trend: ${first.date} = ${first.passRate ?? 'n/a'}% -> ${last.date} = ${last.passRate ?? 'n/a'}%`);
  }
  if (categoryBreakdown.length) {
    lines.push('Top failure categories:');
    categoryBreakdown.slice(0, 5).forEach((c) => lines.push(`  - ${c.category}: ${c.count}`));
  }
  if (topFailing.length) {
    lines.push('Top failing tests:');
    topFailing.slice(0, 5).forEach((t) => lines.push(`  - [${t.suiteName}] ${t.title}: ${t.failCount} failure(s)`));
  }

  return [
    {
      role: 'system',
      content:
        'You are a senior QA lead writing a concise executive summary of automated Playwright ' +
        `test results for engineering stakeholders. Respond in ${lang}. Respond ONLY with a JSON ` +
        'object of the form {"healthAssessment": string, "trends": string, "riskAreas": string, ' +
        '"recommendations": string[]}. healthAssessment/trends/riskAreas should be 2-4 plain-text ' +
        `sentences each (no markdown), written in ${lang}. recommendations should be 2-3 short, ` +
        `concrete, actionable items, also in ${lang}.`,
    },
    {
      role: 'user',
      content: `Analyze the following QA automation statistics and produce a QA summary:\n\n${lines.join('\n')}`,
    },
  ];
}

function parseSummaryResponse(apiResponse, model, language) {
  const content = apiResponse
    && apiResponse.choices
    && apiResponse.choices[0]
    && apiResponse.choices[0].message
    && apiResponse.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('Groq response was not valid JSON');
  }

  return {
    healthAssessment: parsed.healthAssessment || '',
    trends:           parsed.trends || '',
    riskAreas:        parsed.riskAreas || '',
    recommendations:  Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    language:         language === 'vi' ? 'vi' : 'en',
    model,
    generatedAt: Date.now(),
  };
}

/**
 * @param {string} apiKey
 * @param {object} bundle - same shape as buildSummaryMessages()'s argument
 * @param {string} [model]
 */
async function summarizeReport(apiKey, bundle, model = DEFAULT_MODEL) {
  const messages = buildSummaryMessages(bundle);
  // Bumped from 700 — same reasoning-model "max completion tokens reached
  // before generating a valid document" failure analyzeEventlog() hit (see
  // its comment above), confirmed here too once Auto Bot started calling
  // this same function for QA-overview questions.
  const response = await callGroq(apiKey, messages, { model, maxTokens: 2000 });
  return parseSummaryResponse(response, model, bundle && bundle.language);
}

// SAP MDG validation errors (e.g. validateDuplication) can list hundreds of
// duplicate CR/ObjectID references in a single `log` string — one real CR
// pushed a single prompt to 23k+ tokens against Groq's 8k TPM free-tier
// limit (HTTP 413). The identifying info is always at the front of the
// message; the long "In Request: CR..., CR..., ..." / "With ObjectID:
// PRD..., PRD..., ..." tails are supporting evidence, not needed for root
// cause analysis, so they're safe to cut.
const MAX_LOG_CHARS = 300;
function truncateLog(str) {
  if (!str || str.length <= MAX_LOG_CHARS) return str || null;
  return `${str.slice(0, MAX_LOG_CHARS)}… [truncated, ${str.length} chars total]`;
}

/**
 * EventlogBot (dashboard widget) — analyze SAP MDG CR event logs fetched by
 * sap-eventlog-client.js. Reuses the same Groq key/model already configured
 * for AI Diagnosis (settings.groqApiKey/aiModel) — no separate key needed.
 * Ported from check_var/src/summarize.js's prompt design.
 */
function buildEventlogAnalysisMessages(crLogs, userQuestion, language) {
  // SAP frequently retries the same failing step several times, producing
  // several events with the byte-for-byte identical (often very long) `log`
  // text — e.g. the same duplication or comparison-operator error repeated
  // 3-5x for one CR. Sending that text in full every time was the other half
  // of the TPM-budget problem (alongside per-message truncation below): a
  // real CR (CR0000029784) still blew the 8000 TPM free-tier limit even with
  // truncation once max_tokens was raised. Keep the full (truncated) text
  // only on the first occurrence; later repeats just point back to it.
  const seenLogs = new Map(); // raw (untruncated) log text -> mdgLogID it first appeared with
  function dedupeAndTruncate(text, mdgLogID) {
    if (!text) return null;
    const seenWith = seenLogs.get(text);
    if (seenWith !== undefined) {
      return `[same message as the event with mdgLogID ${seenWith || 'above'}]`;
    }
    seenLogs.set(text, mdgLogID || null);
    return truncateLog(text);
  }

  const presentStages = crLogs.stages
    .filter((s) => s.ok && s.events.length > 0)
    .map((s) => ({
      stage: s.label,
      events: s.events.map((e) => ({
        stepID: e.stepID,
        action: e.action || null,
        status: e.status,
        log: dedupeAndTruncate(e.log, e.mdgLogID),
        warningLog: dedupeAndTruncate(e.warningLog, e.mdgLogID),
        mdgLogID: e.mdgLogID || null,
        activateID: e.activateID || null,
        objectID: e.objectID || null,
        start: e.start,
        end: e.end,
        sendToSap: e.sendToSap || null,
      })),
    }));

  const dataPayload = {
    crNumber: crLogs.crNumber,
    overallStatus: crLogs.overall,
    stages: presentStages,
    stagesWithoutEvents: crLogs.stages.filter((s) => s.ok && s.events.length === 0).map((s) => s.label),
  };

  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const system =
    'You are a senior SAP MDG consultant. You receive event logs from an SAP MDG change request ' +
    '(CR) workflow: SubmitEventLog, ApproveEventLog, ActivateEventLog, RequestActionLog. Submit/' +
    'Approve/Activate entries have a validation stepID with a PASSED/FAILED/BYPASS status and ' +
    'optional error message (log). RequestActionLog entries are different: they have no stepID or ' +
    'status at all — instead each one has an `action` name (e.g. "submitCreateRequest", ' +
    '"CompleteSubmitValidation", "ApproveRequest") plus a free-text `log` describing what happened at ' +
    'that point — use these as a plain chronological narrative of the request-level workflow ' +
    '(who did what, when), not as pass/fail checks. ' +
    'Analyze ONLY the data provided. Never invent information, other systems (ABAP, Cloud Logging), ' +
    'or sources that are not in the data. Keep original SAP error messages (log) quoted verbatim ' +
    '(English) up to where they are given — some are truncated with "… [truncated, N chars total]" ' +
    'to fit the context window; treat that as the message being long, not as missing/hidden data. ' +
    'When SAP retried a step and produced the exact same error message on multiple events, only the ' +
    'first occurrence carries the full text — later ones show ' +
    '"[same message as the event with mdgLogID X]" instead; treat that as the identical error ' +
    'repeating, not as a different or missing error. ' +
    `When a step failed, mention its mdgLogID. Respond in ${lang}, in a professional, concise, ` +
    'plain-text tone (no markdown). Return STRICT JSON only: ' +
    '{"overview": string, "timeline": string, "errors": string, "recommendation": string} — ' +
    'overview: 2-3 sentences stating the CR\'s current overall status and what the user asked; ' +
    'timeline: the stages/steps in chronological order with their PASSED/FAILED/BYPASSED outcome, ' +
    'written as a short narrative (not a bare list) — this is the ordered story of what happened; ' +
    'errors: describe any failed/bypassed step\'s error in plain language (quoting the original SAP ' +
    'message), and state clearly which stage/step the CR is blocked at — say explicitly "no errors" ' +
    'if everything passed; recommendation: a concrete next step based only on the error messages ' +
    'present, or confirmation that no action is needed if everything passed — no escalation advice ' +
    'not supported by the data.\n\n' +
    'Special case — validateTemplatePayloadData failures: this step\'s log describes a specific ' +
    'field-level rule violation, not a generic error. Known patterns seen in this system (parse ' +
    'whichever applies, and if the log doesn\'t match any known pattern just explain it in plain ' +
    'language instead of forcing it into one of these): ' +
    '(a) "[Comparison operator: OP]: SECTION1 - fieldA | SECTION2 - fieldB" means fieldA and fieldB ' +
    'must satisfy the comparison OP (GT = greater than, LT = less than, GE, LE, EQ) — e.g. GT means ' +
    'fieldA must be greater than fieldB; ' +
    '(b) a message naming one field as missing/mandatory means that field must be filled in; ' +
    '(c) a message naming two fields that must both be present (a "paired rule") means neither can ' +
    'be filled in alone. In the errors section, name the exact SAP section(s) and field(s) involved ' +
    '(keep these English SAP names verbatim, do not translate them, so the user can find them in the ' +
    'system) and explain in plain language what values need to change or be filled in. Then in ' +
    'recommendation, explicitly classify the failure as either a DATA issue (the requester\'s ' +
    'template/payload is incomplete or violates a business rule — validateTemplatePayloadData and ' +
    'validateTestrun failures are always data issues) or a SYSTEM issue (anything else unexpected), ' +
    'and state whether escalating to the Node.js/ABAP technical team is warranted — for data issues, ' +
    'say explicitly that no escalation is needed and the requester should just correct the template ' +
    `and resubmit.\n\nIMPORTANT: write every one of the 4 JSON string values in ${lang} — this is not ` +
    `optional. Only SAP-specific identifiers (stepID, mdgLogID, section/field names like ` +
    `"BASICDIMENSION") stay in their original form; every explanatory sentence around them must be ` +
    `in ${lang}, never in English when ${lang} is Vietnamese.`;

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `User question: ${userQuestion || 'Analyze this CR.'}\n\nCR logs JSON:\n${JSON.stringify(dataPayload)}`,
    },
  ];
}

function parseEventlogAnalysisResponse(apiResponse) {
  const content = apiResponse
    && apiResponse.choices
    && apiResponse.choices[0]
    && apiResponse.choices[0].message
    && apiResponse.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('Groq response was not valid JSON');
  }

  return {
    overview: parsed.overview || '',
    timeline: parsed.timeline || '',
    errors: parsed.errors || '',
    recommendation: parsed.recommendation || '',
  };
}

/**
 * @param {string} apiKey
 * @param {object} crLogs - sap-eventlog-client.fetchCrLogs() output
 * @param {string} [userQuestion]
 * @param {'vi'|'en'} [language]
 * @param {string} [model]
 */
async function analyzeEventlog(apiKey, crLogs, userQuestion, language = 'en', model = DEFAULT_MODEL) {
  const messages = buildEventlogAnalysisMessages(crLogs, userQuestion, language);
  // Reasoning models on Groq (e.g. openai/gpt-oss-20b/120b) spend an unknown,
  // sometimes large number of hidden "thinking" tokens before writing the
  // final JSON. 1200 was enough for simple CRs but too tight for ones with
  // more failed/bypassed steps to narrate — the model hit max_tokens mid-JSON
  // and Groq reported it as "json_validate_failed" / "max completion tokens
  // reached before generating a valid document" (confirmed against a real
  // CR) instead of a clearer length-limit error. Budget generously.
  const response = await callGroq(apiKey, messages, { model, maxTokens: 2500 });
  const parsed = parseEventlogAnalysisResponse(response);
  return { crNumber: crLogs.crNumber, overall: crLogs.overall, language, ...parsed };
}

/**
 * Auto Bot (dashboard widget) — small-talk fallback for messages that are
 * neither a CR lookup nor a keyword-matched greeting/farewell/intro (those
 * are handled entirely client-side in shared.js, no Groq call needed). This
 * is deliberately NOT JSON mode: a natural-language reply doesn't need a
 * schema, and forcing one would be an odd, wasted constraint. Kept short
 * (small maxTokens, no SAP data attached) so it can't hit the TPM free-tier
 * ceiling that the CR-analysis path has repeatedly run into.
 */
function buildChitchatMessages(message, language) {
  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const system =
    'You are Capybara, a friendly assistant embedded in the SimpleMDG Automation Hub dashboard. ' +
    'Your main job is looking up SAP MDG Change Request (CR) event logs when someone types a CR ' +
    'number like CR0000029831. This particular message is small talk or a question unrelated to a ' +
    `specific CR. Reply warmly in ${lang}, in 1-3 short sentences, plain text (no markdown, no JSON, ` +
    'no code blocks). If it fits naturally, remind the user they can type a CR number to look one up ' +
    '— but do not force this into every reply. Never claim to know about a specific CR/SAP system ' +
    'unless the user\'s message actually contains data about one.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: message },
  ];
}

async function chitchat(apiKey, message, language = 'en', model = DEFAULT_MODEL) {
  const messages = buildChitchatMessages(message, language);
  const response = await callGroq(apiKey, messages, { model, maxTokens: 300, temperature: 0.6, jsonMode: false });
  const content = response
    && response.choices
    && response.choices[0]
    && response.choices[0].message
    && response.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');
  return content.trim();
}

/**
 * Auto Bot — natural-language questions about Automation Hub's OWN Playwright
 * test run/suite results (separate from the SAP CR-analysis path above).
 * Two-step flow: classify the question into one of a fixed set of report
 * types (cheap, tiny JSON-mode call), then — once server.js has fetched the
 * real data for that type — write a short natural-language summary of it
 * (also cheap: this data is small, nothing like the SAP log dedupe/
 * truncation problem analyzeEventlog() had to solve).
 */
const TEST_QUERY_REPORT_TYPES = ['overview', 'latest_run', 'top_failing', 'flaky', 'suite_health', 'unclear'];

function buildTestQueryIntentMessages(question, language) {
  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const system =
    'You classify a question about a QA dashboard\'s own Playwright test run history into exactly ' +
    'one report type. Return STRICT JSON only: {"reportType": string, "suiteName": string|null, ' +
    `"days": number|null}. reportType must be one of: ${TEST_QUERY_REPORT_TYPES.map((t) => `"${t}"`).join(', ')}. ` +
    '"overview" = general QA health/pass-rate/how-is-testing-going questions. "latest_run" = asking ' +
    'about the most recent test run specifically. "top_failing" = asking which test(s) fail the most, ' +
    'or about flaky tests when the question is more about "what\'s broken" than reliability — prefer ' +
    '"flaky" when the word flaky/unreliable/intermittent is used. "flaky" = asking specifically about ' +
    'flaky/unreliable/intermittent tests. "suite_health" = asking about one named test suite\'s status ' +
    '— extract that name into suiteName verbatim as written by the user. "unclear" = the question is ' +
    'not about test run data at all, or you cannot tell which of the above it is — never guess. ' +
    'Extract a number of days from phrases like "this week" (7), "this month" (30), "today" (1) into ' +
    `days; if no time range is mentioned, set days to null. This classification itself must always be ` +
    `in this JSON structure regardless of language; the question may be in ${lang} or English.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: question },
  ];
}

function parseTestQueryIntentResponse(apiResponse) {
  const content = apiResponse
    && apiResponse.choices
    && apiResponse.choices[0]
    && apiResponse.choices[0].message
    && apiResponse.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('Groq response was not valid JSON');
  }
  const reportType = TEST_QUERY_REPORT_TYPES.includes(parsed.reportType) ? parsed.reportType : 'unclear';
  const days = Number.isFinite(parsed.days) && parsed.days > 0 ? Math.round(parsed.days) : null;
  return { reportType, suiteName: parsed.suiteName || null, days };
}

async function classifyTestQuery(apiKey, question, model = DEFAULT_MODEL) {
  const messages = buildTestQueryIntentMessages(question, 'en');
  // The JSON output itself is tiny, but reasoning models still spend an
  // unpredictable number of hidden "thinking" tokens first — same
  // max_tokens-too-tight failure mode as the other Groq calls in this file.
  const response = await callGroq(apiKey, messages, { model, maxTokens: 400, temperature: 0.1 });
  return parseTestQueryIntentResponse(response);
}

const TEST_DATA_LABELS = {
  latest_run: 'the most recent Playwright test run',
  top_failing: 'the tests failing most often recently',
  flaky: 'tests with inconsistent (flaky) results recently',
  suite_health: 'one specific test suite\'s recent health',
};

function buildTestDataMessages(reportType, data, language) {
  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const label = TEST_DATA_LABELS[reportType] || 'Playwright test data';
  const system =
    `You are Capybara, a QA assistant. You are given JSON data about ${label} from this dashboard's ` +
    'own Playwright test history. Analyze ONLY the data provided — never invent test names, numbers, ' +
    'or suites not present in it. If the data is empty or null, say plainly that there is nothing to ' +
    `report instead of guessing. Respond in ${lang}, in a professional, concise, plain-text tone (no ` +
    'markdown). Return STRICT JSON only: {"summary": string, "recommendation": string} — summary: ' +
    '2-4 sentences describing what the data shows; recommendation: a concrete next step suggested by ' +
    'the data, or confirmation that nothing needs attention if the data looks healthy.';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Data (JSON):\n${JSON.stringify(data)}` },
  ];
}

function parseTestDataResponse(apiResponse) {
  const content = apiResponse
    && apiResponse.choices
    && apiResponse.choices[0]
    && apiResponse.choices[0].message
    && apiResponse.choices[0].message.content;
  if (!content) throw new Error('Empty response from Groq');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error('Groq response was not valid JSON');
  }
  return { summary: parsed.summary || '', recommendation: parsed.recommendation || '' };
}

async function summarizeTestData(reportType, data, language, apiKey, model = DEFAULT_MODEL) {
  const messages = buildTestDataMessages(reportType, data, language);
  // Same headroom as analyzeEventlog()/summarizeReport() above — reasoning
  // models need room for hidden "thinking" tokens before the JSON itself.
  const response = await callGroq(apiKey, messages, { model, maxTokens: 1500 });
  return { language, ...parseTestDataResponse(response) };
}

module.exports = {
  diagnose, testConnection, DEFAULT_MODEL,
  buildSummaryMessages, summarizeReport,
  buildEventlogAnalysisMessages, analyzeEventlog,
  buildChitchatMessages, chitchat,
  TEST_QUERY_REPORT_TYPES, buildTestQueryIntentMessages, classifyTestQuery,
  buildTestDataMessages, summarizeTestData,
};
