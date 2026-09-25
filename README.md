# core_v17_s4_qas — SimpleMDG v1.7.0 Automated Testing (S4_QAS)

> Playwright-based end-to-end test automation for the **SimpleMDG** application on SAP BTP (environment S4_QAS), targeting SimpleMDG **v1.7.0**.

This is a **standalone, run-only** copy of the test framework. It contains only what is needed to run the test suites — no AI-agent system, no `smdg-skills`, no MCP configuration. It is a **local project with no Git remote**.

---

## Prerequisites

| Requirement | Version | Notes                                |
| ----------- | ------- | ------------------------------------ |
| Node.js     | >= 18.x | LTS recommended                      |
| npm         | >= 9.x  | Ships with Node.js                   |
| Chromium    | Latest  | Installed via Playwright (see below) |

---

## Installation

```bash
cd D:\PLAYWRIGHT\core_v17_s4_qas

# 1. Install dependencies
npm install

# 2. Install Playwright browser (Chromium)
npm run install:browsers
```

## Configuration

The `.env` file is already present (copied from the source environment) and is loaded automatically by `playwright.config.ts`. It contains `BASE_URL` plus the role accounts used by the suites:

| Variable                           | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `BASE_URL`                         | SimpleMDG application URL                     |
| `SAP_USER` / `SAP_PASS`            | Requestor (default user)                      |
| `ADMIN_USER` / `ADMIN_PASS`        | Admin / Process Designer                      |
| `APPROVER_USER` / `APPROVER2_USER` | Approver L1 / L2                              |
| `STEWARD_USER` / `STEWARD_PASS`    | Steward / Activation                          |
| `MUL_USER` / `MUL_PASS`            | Single multi-role user (MUL suites)           |
| `ATTACH_USER` / `ATTACH_PASS`      | Attachment suite (falls back to steward)      |
| `COMMENT_*`                        | Dedicated accounts for the COMMENT_LOGO suite |
| `CI`                               | `true` for CI mode (headless, 3 workers)      |

> `.env` is ignored by Git and must **never** be committed or shared.

---

## Project Structure

```
core_v17_s4_qas/
├── helpers/             # Shared helpers (auth, data, workflow, ui, attachment, hyperlink, ...)
├── pages/               # Page Objects (actions, cr, mass, activation, admin, search, verify, ...)
├── suites/              # 21 runnable test suites (one folder per suite)
├── test-data/           # Excel uploads, attachment files, logo images
├── tests/smoke/         # Smoke tests (login, search, full-flow)
├── playwright.config.ts # Main Playwright config
├── playwright.smoke.config.ts # Smoke-only config
├── package.json         # Scripts + dependencies
└── .env                 # Environment configuration (do not commit)
```

---

## Running Tests

```bash
# All tests (suites + smoke)
npm test                 # = playwright test

# Smoke tests only
npm run test:smoke

# E2E suites only
npm run test:e2e         # = playwright test suites

# A single spec
npx playwright test suites/S4_QAS_NPI/e2e/npi-e2e-01-create-submit-approve-activate.spec.ts

# A whole suite folder
npx playwright test suites/S4_QAS_NPI/e2e/

# Headed mode (see the UI)
npm run test:headed

# HTML report after a run
npm run report           # = playwright show-report

# Lint (prettier)
npm run lint
npm run lint:fix
```

Run-level settings (from `playwright.config.ts`):

- **Workers:** 1 locally, 3 when `CI=true`
- **Retries:** 2 when `NODE_ENV !== 'development'`
- **Timeout:** 120s per test, 5s per assertion
- Headless only when `CI=true`; otherwise headed

---

## Tags

Every test carries two kinds of tags: **domain/object** tags on the `test.describe` block and **behavior** tags on the `test()` itself. They let you slice the suite by area or by what the test does (262 generated tests in total).

### Domain / object tags (on `test.describe`)

| Tag             | Tests | Scope                                                                                                                                          |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cr`           | 52    | Change Request lifecycle (AUTO + DUP, BP + MM)                                                                                                 |
| `@bp`           | 57    | Business Partner master data                                                                                                                   |
| `@mm`           | 183   | Material Master master data                                                                                                                    |
| `@mass`         | 28    | Mass upload via Excel                                                                                                                          |
| `@duplication`  | 50    | Duplication check flows (incl. duplication-rule suite)                                                                                         |
| `@mul`          | 12    | Multi-process, single multi-role user                                                                                                          |
| `@attachment`   | 9     | Attachment upload/delete flows                                                                                                                 |
| `@comment-logo` | 16    | Comment box + logo verification                                                                                                                |
| `@hyperlink`    | 12    | Hyperlink CRUD                                                                                                                                 |
| `@npi`          | 9     | New Product Introduction                                                                                                                       |
| `@search-md`    | 13    | Search Master Data                                                                                                                             |
| `@rules`        | 100   | All rule suites (`@assignment-rule` 8, `@duplication-rule` 7, `@editable-rule` 17, `@filter-rule` 11, `@mandatory-rule` 12, `@visible-rule` 8) |

### Behavior tags (on `test()`)

| Tag            | Tests | Meaning                                             |
| -------------- | ----- | --------------------------------------------------- |
| `@smoke`       | 18    | Smoke subset (login, search, full-flow)             |
| `@happy-path`  | 162   | Standard successful flow                            |
| `@negative`    | 89    | Expected-failure / rejection paths                  |
| `@admin`       | 53    | Admin / Process Designer configuration              |
| `@state`       | 7     | State transitions / persistence checks              |
| `@data-driven` | 24    | Loop-generated cases (same spec, multiple datasets) |
| `@workflow`    | 145   | Multi-step approval / activation workflow           |

### Examples

```bash
# Single tag (quote it in PowerShell)
npx playwright test --grep "@cr"           # all CR lifecycle tests
npm run test:cr                            # same thing

# Predefined tag runs
npm run test:smoke:tag                     # --grep @smoke
npm run test:rules                         # --grep @rules
npm run test:negative                      # --grep @negative
npm run test:workflow                      # --grep @workflow

# Any tag: use npx directly (npm run <script> -- <tag> is not reliable)
npx playwright test --grep "@attachment"

# Union of tags (multiple --grep are OR'd)
npx playwright test --grep "@bp" --grep "@mass"

# AND: combine with a regex
npx playwright test --grep "(?=.*@bp)(?=.*@mass)"

# Exclude a tag
npx playwright test --grep-invert "@workflow"

# Dry-run: list matching tests without running
npx playwright test --list --grep "@smoke"
```

---

## Test Suites

| Suite                                           | Area                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `S4_QAS_AUTO_BP01` / `S4_QAS_AUTO_MM01`         | Standard CR lifecycle (copy, approve, steward, rework, cancel) |
| `S4_QAS_DUP_AUTO_BP01` / `S4_QAS_DUP_AUTO_MM01` | Duplication check flows                                        |
| `S4_QAS_MASS_AUTO_BP01` / `S4_QAS_MASS_MM01`    | Mass upload via Excel                                          |
| `S4_QAS_MASS_DUP_BP01` / `S4_QAS_MASS_DUP_MM01` | Mass upload + duplication                                      |
| `S4_QAS_MUL_AUTO_BP01` / `S4_QAS_MUL_MM01`      | Multiple-process (single multi-role user)                      |
| `S4_QAS_MM01_ATTACHMENTS`                       | Attachment upload/delete flows                                 |
| `S4_QAS_MM01_COMMENT_LOGO`                      | Comment box + logo verification                                |
| `S4_QAS_MM01_HYPERLINK`                         | Hyperlink CRUD                                                 |
| `S4_QAS_NPI`                                    | New Product Introduction (project-based, multi-item)           |
| `S4_QAS_SEARCH_MD`                              | Search Master Data (admin config + main search)                |
| `S4_QAS_AUTO_MM01_ASSIGNMENT_RULE`              | Assignment rules                                               |
| `S4_QAS_AUTO_MM01_DUPLICATION_RULE`             | Duplication rules                                              |
| `S4_QAS_AUTO_MM01_EDITABLE_RULE`                | Editable rules                                                 |
| `S4_QAS_AUTO_MM01_FILTER_RULE`                  | Filter rules                                                   |
| `S4_QAS_AUTO_MM01_MANDATORY_RULE`               | Mandatory rules                                                |
| `S4_QAS_AUTO_MM01_VISIBLE_RULE`                 | Visible rules                                                  |

---

## Notes

- **SimpleMDG v1.7.0 compatibility:** tests use v1.7.0 locator patterns (`.sapMObjStatus` instead of `getByRoleUI5('ObjectStatus')`, `role="option"` SegmentedButton for chart areas, `getByText` template selection, "Comments" dialog for Cancel actions, per-row "..." overflow menus for NPI).
- **No Git remote:** this copy is intentionally local. Do not `git remote add` unless instructed.
- Test artifacts (`playwright-report/`, `test-results/`) are gitignored and regenerated on each run.
