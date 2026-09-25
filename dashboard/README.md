# Automation Hub

Local-first orchestration and reporting dashboard for a Playwright test-automation project. Runs runs, stores results in SQLite, and surfaces pass rate/flaky/coverage insights — plus **Capybara** 🦫, a built-in chat assistant. Single-user, local-only tool (binds to `127.0.0.1` by default, no authentication) — see [`docs/ARCHITECTURE_PLAN_v0.7-v1.0.md`](../docs/ARCHITECTURE_PLAN_v0.7-v1.0.md) for the architectural reasoning behind that.

## Requirements

- **Node.js ≥ 22.5** — `db.js` uses Node's built-in `node:sqlite` module (`DatabaseSync`), which isn't available on older Node versions. Declared in `package.json`'s `engines` field.
- A Playwright project with `dashboard/` living as a **direct subfolder** of it (see [Porting to a new Playwright project](#porting-to-a-new-playwright-project) if you're setting this up somewhere new).

## Quick start

```bash
cd dashboard
npm install
npm start
```

Then open `http://127.0.0.1:3000` (or the `PORT`/`HOST` env vars if you've overridden them). First time here? Go to `/setup.html` — the Setup Wizard checks Playwright CLI presence, suite discovery, hub-reporter registration, tag coverage, target environment, and AI configuration, in that order.

## Features

| Page | What it does |
|---|---|
| Overview | Today-vs-yesterday snapshot, 7-day sparkline |
| Test Explorer | Browse suites/specs/tags from the Playwright project |
| Execution Center | Start/stop runs, live progress |
| Results | Per-run test detail, triage, rerun failed |
| Insights | Failure categories, trend, failure clusters, top-failing test, suite health, slow tests |
| Report Center | Aggregated QA overview + optional AI summary, print/export |
| Readiness & Coverage | Go/No-Go rollup, tag-to-run coverage matrix, requirement risk |
| Triage Board | Failure triage annotations |
| AI Workspace | Cluster-diagnose failures via Groq |
| Setup | First-time setup checklist |
| Settings | Target environment, AI/Groq key, notifications, retention, Capybara |
| About | In-app description |

## Capybara 🦫 — the built-in chat assistant

A floating chat widget (bottom-right, every page) with three capabilities:

1. **SAP MDG CR lookups** — type a CR number (e.g. `check CR0000029831`) and Capybara fetches and analyzes its `SubmitEventLog`/`ApproveEventLog`/`ActivateEventLog`/`RequestActionLog` OData events, up to 3 CRs per question.
2. **Test results Q&A** — ask about this dashboard's own Playwright run history: overall QA health/pass rate ("how's QA doing this week?"), the latest run, top failing or flaky tests, or a specific suite's health ("how's suite X doing?").
3. **Greetings/small talk** — handled by keyword matching for common greeting/farewell/"what can you do" phrasing; anything else falls back to a lightweight Groq chitchat reply.

Capybara always answers in whichever language the question was asked in (auto-detected).

**Enabling it** (Settings page):
- **AI Diagnosis (Groq)** must be enabled first — Capybara reuses that same Groq key/model for every capability, including CR analysis and test-result summaries.
- **Capybara (SAP MDG)** panel — toggle it on, set the SAP BTP base URL + OData service path, and paste a session cookie (F12 → Network → any request → Headers → `Cookie`). The cookie expires after a few hours; when a query fails with "session expired," paste a fresh one here. Test-result Q&A doesn't need the SAP cookie at all — only CR lookups do.

**Limits:** 20 requests/minute across all three Capybara endpoints combined (`/api/eventlog-bot/query`, `/chitchat`, `/test-query`), and at most 3 CR numbers per lookup — both by design, to stay well under Groq's free-tier token-per-minute ceiling.

## Configuration (Settings)

| Field | Purpose |
|---|---|
| Target URL | The QA environment under test — pinged for the sidebar's online/offline indicator |
| AI Diagnosis (Groq) | API key + model, powers AI Workspace, Report Center's AI summary, and Capybara |
| Notifications | Slack or Teams webhook for run-completion notifications |
| Data retention | Days to keep run history before automatic cleanup |
| Capybara (SAP MDG) | Enable toggle, SAP base URL/service path/cookie for CR lookups |

## Porting to a new Playwright project

`dashboard/` assumes it's a **direct subfolder** of the Playwright project it reports on (`PROJECT_ROOT = path.resolve(__dirname, '..')` in `server.js`). To move it:

1. **Check the target project's layout.** Suite/spec discovery (`scanSuites()`) expects `suites/<suiteName>/e2e/*.spec.ts`, with `@bp:<name>` (business process) and `@TC-<number>` (test case ID) tags in test titles for full Insights/Coverage/Suite Health support. If the target project uses a different layout, the dashboard still runs — it just won't discover any suites, so suite-scoped features stay empty rather than erroring.
2. **Copy the `dashboard/` folder** into the target project, as a direct subfolder (sibling to its `playwright.config.ts`, `suites/`, `node_modules/`).
3. **Install its dependencies separately**: `cd dashboard && npm install`. This is an independent `package.json`/`node_modules` tree from the host Playwright project's own.
4. **Register `hub-reporter.js`** in the target project's `playwright.config.ts`:
   ```ts
   export default defineConfig({
     // ...
     reporter: [
       ...existingReporters,
       ...(process.env.HUB_RUN_ID ? [['./dashboard/hub-reporter.js']] : []),
     ],
   });
   ```
   `hub-reporter.js` itself is generic (no SAP-specific logic) — it's a no-op unless `HUB_RUN_ID` is set, which the dashboard sets internally when it spawns a run.

   ⚠️ **Known issue in this project's own `playwright.config.ts`**: the `reporter` line there currently places the `...(process.env.HUB_RUN_ID ? ... : [])` spread *outside* the `reporter` array instead of inside it, so hub-reporter never actually gets registered here. Test execution itself isn't affected (that only breaks the Hub's live-progress SSE stream during a run), but **don't copy that line as a template** — use the correct shape above instead.
5. **Run `npm start`**, open the app, and walk through `/setup.html` — it verifies each of the above automatically.
6. **Configure Settings**: Target URL, and AI Diagnosis if you want AI Workspace / Report Center summaries / Capybara.
7. **Capybara CR lookups for a different SAP system**: fully settings-driven (base URL, service path, cookie) *except* the four OData entity names (`SubmitEventLog`, `ApproveEventLog`, `ActivateEventLog`, `RequestActionLog`), which are hard-coded in `sap-eventlog-client.js` to match this specific `CommonProcessService` shape. A different OData service with different entity/field names needs a code change there — Capybara's test-result Q&A capability needs no such change and works immediately once hub-reporter data starts flowing in.
8. **(Optional) Rebrand.** "SimpleMDG" / "S4_QAS"-style strings are hard-coded cosmetically in a few places — none of it is functional, so skip this if you don't care about the branding:
   - `public/*.html` — `<title>` tags
   - `public/partials/shell.html` — sidebar logo alt text
   - `server.js` — startup console banner, Teams webhook title, test-notification text
   - `groq-client.js` — the chitchat system prompt's dashboard name
   - `package.json` — `name`/`description`

## Further reading

- [`docs/ARCHITECTURE_PLAN_v0.7-v1.0.md`](../docs/ARCHITECTURE_PLAN_v0.7-v1.0.md) — architecture principles, the Playwright-project integration contract, domain model, ADRs, roadmap.
- [`UPGRADE_NOTES.md`](../UPGRADE_NOTES.md) — full version history. Its own "Installing on top of an existing project" section predates this README and is out of date (it undercounts current dependencies and still describes the pre-SQLite JSON storage layer) — this README is the current source of truth for setup.

## Development

```bash
npm test
```

Runs the Vitest suite (`__tests__/*.test.js`, one file per module). Network-touching code (Groq API calls, SAP OData fetches) isn't exercised directly in tests — only the pure prompt-building/parsing/aggregation functions are; each such test file says so in its header comment.
