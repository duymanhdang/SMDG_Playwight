# SimpleMDG Automation Hub — Upgrade Notes

## v1.8.1 — Bugfix: Playwright's native HTML report attachments

**Problem reported by the user**: on a *brand-new* run from today, Playwright's
own HTML report (`GET /report-assets/:runId/index.html`, an `express.static`
mount over `storage.reportHtmlDir(runId)`) showed broken/blank screenshot
thumbnails in its "Screenshots" panel — on the very first viewing of that
run's report. This is a **different bug** from the v1.7.1 fix above: that one
was about `test-results/` getting wiped by the *next* run; this is broken
even before any next run happens, so it isn't explained by the same cause.

**Root cause (best-effort, not directly reproduced — see verification
caveat below)**: Playwright's HTML report is not a self-contained folder of
static files. Per Playwright's own docs, the report needs to be served by
Playwright's **own** report server (`playwright show-report <dir>`) for full
functionality — the trace viewer explicitly requires a real HTTP server, and
circumstantial evidence (Playwright issue reports on attachment resolution,
and the fact that `show-report`'s CLI implements its own request routing
rather than being a documented "just point any static server at this
folder" artifact) points to attachment resolution — not just the trace
viewer — depending on that server's own logic, which a generic
`express.static` mount does not replicate.

This project's own history backs up the hypothesis: `server.js`'s current
`/api/show-report` handler carries a comment ("§5.1 — used to spawn a
detached PowerShell window running `playwright show-report`; that whole
Windows-GUI-only mechanism is removed") confirming this hub used to actually
launch Playwright's real report server, before a `shell:true`/cmd.exe
command-injection risk in that mechanism (the old `spawnPsWindow` helper) was
correctly removed and the endpoint was simplified to just point at the plain
static `/report-assets/` route instead — likely losing whatever
attachment-resolution behavior the real server provided, as a side effect of
an otherwise-correct security fix.

**Fix**: restores launching Playwright's own `show-report` server, but
through the exact same safe spawn pattern already used everywhere else in
this file since the shell-injection fix — `spawn(process.execPath, [PW_CLI,
'show-report', ...], { shell: false })`, never a shell string, no
npx/cmd.exe. New module `dashboard/report-server-pool.js`
(`createReportServerPool()`) manages a small pool of these processes:

- `Map<runId, { proc, port, htmlDir, lastUsedAt }>` — viewing the same run's
  report again reuses its existing server instead of spawning a duplicate.
- Capped at 3 concurrent instances (single-user local tool); exceeding the
  cap kills the least-recently-used instance first.
- Picks a free port starting at 9223 by probing with a real
  `net.createServer()` listen/close check (a documented, version-independent
  way to find a free port — `--port 0` OS-assignment support wasn't
  confirmed for this Playwright CLI version, so this was the safer choice).
- Killing an evicted/stopped instance reuses the *exact same* platform-kill
  pattern as the existing Stop-run handler: `taskkill /pid <pid> /T /F`
  (spawned directly, `shell:false`) on Windows, `proc.kill('SIGTERM')`
  elsewhere. The graceful-shutdown handler (§v1.3.0) now also calls
  `reportServerPool.stopAll()` on SIGTERM/SIGINT.

`/api/show-report` and `GET /api/runs/:id/report` both now call
`reportServerPool.ensure(runId, htmlDir)` first and redirect to its
`http://127.0.0.1:<port>/` on success. **Critical fallback**: if spawning
fails for any reason (Playwright CLI genuinely missing, port exhaustion,
spawn error), both endpoints degrade to the old static
`/report-assets/:runId/index.html` route — which is kept in place, not
removed — and the frontend (`shared.js`'s `shellViewLastReport()`,
`explorer.html`'s `showReport()`) surfaces a one-line `⚠` toast warning that
some attachments may not display, rather than hard-failing. A report must
always be viewable in some form (per this project's "zero-config, degrade
gracefully" philosophy — see `docs/ARCHITECTURE_PLAN_v0.7-v1.0.md` §P3,
"Zero-config mặc định, opt-in để mở thêm năng lực").

**Verified**: `npm test` → 213/213 passing (201 existing + 12 new in
`__tests__/report-server-pool.test.js`, covering spawn-argv correctness
[`shell:false`, exact argv], reuse-by-runId, LRU-eviction order and count,
the taskkill/SIGTERM kill pattern, `stopAll()`, graceful degradation when the
CLI is reported missing or the child emits an immediate spawn error, the
port-retry logic against both recorded-used ports and a real occupied port,
and a real end-to-end spawn→track→kill cycle against a harmless stand-in
`node -e "setInterval(...)"` process). Booted `node server.js` for real,
seeded a fake completed run (`run_fake_test_0001`, with a real
`index.html`), and confirmed live against the actual server: since this
sandbox genuinely has no `node_modules/@playwright/test/cli.js`,
`POST /api/show-report` correctly returned `{ ok:true, degraded:true, url:
"/report-assets/run_fake_test_0001/index.html", warning: "..." }`, the
server logged a clear one-line fallback warning, and the static
`/report-assets/...` route still served the fake report's content
correctly — the degraded-fallback path is fully proven, for real, in this
sandbox. Cleaned up the fake run and stopped the server afterward.

**Honest limitation, please read**: the CORE hypothesis — that
`show-report`'s own server resolves screenshot/video/trace attachments
differently than plain static hosting, and that this is *why* the thumbnails
were broken — could **not** be directly proven end-to-end here, because this
sandbox has no real Playwright install (`@playwright/test`) and no
`suites/`, so there is no real HTML report to point the new `show-report`
spawn at. Everything above the "Verified" paragraph is strong circumstantial
evidence from Playwright's own documentation and this project's own git
history, not a directly-reproduced-and-confirmed root cause. **Please test
this on your real machine**: run a suite, click "View Report" (or use the
quick-launcher's "View Last Report"), and confirm the Screenshots panel now
actually shows working thumbnails — and report back either way, since this
is a best-effort fix, not a confirmed one.

## v1.8.0 — Visual Polish & Production Feel

**Status**: both planned agent passes are complete. `package.json` is at
plain `1.8.0`. Part 1 (design foundation — type/spacing scale, bug fixes,
colorized icons, product logo) is below; part 2 (charts, skeleton loading,
empty-state illustrations, micro-interactions) follows in its own section.

### Part 1: Design Foundation

A senior-designer review of the current design system found a mature OKLCH
color/status-token system but **no type scale** (8+ near-duplicate hardcoded
font sizes: 10/10.5/11/11.5/12/12.5/13/16/19/22/26px) and **no spacing scale**
(ad hoc padding/gap literals, no 4/8px grid), plus two real bugs. This pass
addresses all of it:

1. **Type scale** — added 9 `--text-*` custom properties to `shared.css`'s
   `:root` (`--text-2xs` 10px through `--text-3xl` 26px), consolidating the
   audit's 10+ raw values down to named steps (nearest-value mapped, so this
   is a token-extraction refactor — rendered sizes stay effectively identical,
   max drift ~0.5–1px on a couple of steps). Swept every `font-size` literal
   in `shared.css`, plus the inline `<style>` blocks in `overview.html`,
   `report-center.html`, and `readiness.html`, over to the new tokens.

2. **Spacing scale** — added `--space-1` (4px) through `--space-8` (32px) to
   the same `:root` block and swept `shared.css`'s padding/gap/margin literals
   that already sit on (or round to) the 4/8px grid. Odd optical
   values used for fine visual alignment (e.g. paired 7px/9px/11px offsets)
   were deliberately left as literals — forcing those onto the grid would be
   a visual redesign, not the non-breaking refactor this pass intends.

3. **Bug fixes**:
   - The "Readiness & Coverage" and "Triage Board" sidebar nav items
     (`partials/shell.html`) shared an identical copy-pasted icon path.
     Readiness now gets a shield/checkmark icon; Triage Board gets a
     clipboard/list icon — both matched to the existing nav icons'
     `stroke-width="2"` / `viewBox="0 0 24 24"` convention.
   - The density-mode block in `shared.css` selected every rule twice
     (`:root[data-density="compact"] X, html[data-density="compact"] X`) —
     redundant, since `shared.js`'s `shellApplyDensity()` sets the attribute
     on `document.documentElement`, which **is** `:root`. Consolidated to a
     single `html[data-density="compact"]` selector per rule.

4. **Colorized icon system** — icons now carry color as an accent rather than
   staying flat/monochrome:
   - Status badges already inherited their semantic status color via
     `currentColor` on the `::before` glyph (from the `.badge.<status>` rule);
     bumped `font-weight` on the glyph so that color reads more visibly, not
     just as background tint.
   - Sidebar nav icons now tint toward a category color on hover/active
     instead of the old flat blue-everywhere highlight: Results/Readiness →
     green, Triage Board → orange, Insights/Report Center/AI Workspace →
     purple. Settings/About stay on the original blue highlight (no natural
     category to signal). Colors reuse the existing 7-status OKLCH tokens,
     so saturation/contrast stays consistent with that system's restraint —
     this is an 8h/day QA tool, not a marketing surface.
   - `overview.html`'s stat cards gained a small colored icon badge
     (`.stat-icon`, 22px circle) next to each label: blue grid for Total
     Tests, green check for Passed, red X for Failed, orange slash for
     Skipped, neutral clock for Avg Duration — mirroring each stat's
     semantic meaning instead of being label+number only.

5. **Product logo + sidebar branding** — downloaded the real SimpleMDG logo
   (`https://cdn-ilejklm.nitrocdn.com/.../logo.svg`) to
   `dashboard/public/assets/logo.svg` (no hotlinking — the app stays
   self-contained/offline-capable). It's a 119×20 horizontal wordmark in
   fixed brand colors (navy `#245392` / green `#87CC2E`), so the sidebar
   brand area (`partials/shell.html` + `.sidebar-logo-chip` in `shared.css`)
   now shows it inside a small white chip card, keeping it legible in both
   light and dark mode instead of trying to recolor someone else's brand
   mark. The old 38×38px "◆" glyph mark is gone. "Automation Hub" remains as
   a sub-line under the chip since the logo itself already reads "SimpleMDG".

**Testing**: this is a CSS/branding-heavy pass with limited new pure logic —
no new unit tests were added (nothing pure/testable was factored out).
`npm test` stays at 190/190 passing. Server boot + `/`, `/overview.html`,
`/results.html`, `/api/meta`, and `/assets/logo.svg` all verified to serve
correctly. **A human still needs to open the app in a real browser and look
at it** — this pass could not be visually verified headlessly (nav icon
colors, logo legibility in both themes, stat-card icon layout, etc. all need
a real render to confirm they look right, not just that the CSS is valid).

### Part 2: Charts, Skeleton Loading, Empty States, Micro-interactions

A senior-designer review found Report Center's hand-rolled inline-SVG charts
"visually bare-bones" (flat colors, no gradient fill, no curve smoothing, no
entrance animation, browser-native `<title>` tooltips) and found the app had
only one generic spinner + plain-text empty-state divs everywhere. This pass
addresses it:

1. **Chart.js migration** — the app's ONE deliberate exception to its
   otherwise zero-CDN/zero-build philosophy. Chose Chart.js 4.4.4 over
   ApexCharts for the smaller payload across a line+donut+bar mix and
   first-class gradient/tension support with a plain UMD build. Loaded via
   `https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js`,
   pinned to the exact version (not `@latest`), with a computed Subresource
   Integrity hash
   (`sha384-NrKB+u6Ts6AtkIhwPixiKTzgSKNblyhlk0Sohlgar9UHUBzai/sgnNNWWd291xqt`),
   confirmed via `curl` + `openssl dgst -sha384` against the live file and
   cross-checked byte-identical on a second fetch. `onerror` sets
   `window.__chartLibFailed`, and each render function feature-detects
   `window.Chart` before use, so an unreachable CDN degrades to a clear
   "charts unavailable offline" message instead of a blank/broken page or
   console-error spam. Colors are read from computed CSS custom properties
   at draw time (not hardcoded hex), and a new `mdg:themechange` event
   (dispatched by `shared.js`'s `shellApplyTheme()`) triggers a full
   destroy/rebuild of any live chart so light/dark toggling repaints
   correctly (Chart.js bakes colors in at draw time and doesn't react to a
   CSS cascade change on its own `<canvas>`).
   - Report Center (`report-center.html`): pass-rate trend to a line chart
     with gradient fill under the curve and `tension: 0.35` smoothing;
     status donut to a Chart.js doughnut with entrance animation, preserving
     the v1.5.0 click-to-filter-into-Results behavior via the `onClick`
     option (same donut-key to `?status=` deep-link mapping as before);
     per-suite pass-rate to a horizontal bar chart (`indexAxis: 'y'`), bars
     colored by the same pass-rate-threshold logic the old SVG version used
     (green >=90%, orange >=70%, red below, gray for null).
   - Insights (`insights.html`): its pass-rate trend chart (same hand-rolled
     SVG pattern as Report Center's) got the same line-chart treatment for
     visual consistency across the two pages. Its category-breakdown bars
     were left as-is since they're plain HTML/CSS width bars, not
     hand-rolled SVG, so out of scope for "upgrade the SVG charts."

2. **Skeleton loading** (`shared.css`) — a `.skeleton` shimmer base
   (`@keyframes shimmer`, disabled under `prefers-reduced-motion`) plus
   shape variants: `.skeleton-stat` (matches a stat-card's icon-row/value/
   delta layout), `.skeleton-row` (matches a table row's column widths),
   `.skeleton-chart` / `.skeleton-chart.donut` (matches a chart panel's
   footprint). Applied to the three highest-visibility spots: overview.html's
   stat cards and recent-executions rows, results.html's run-history rows,
   and report-center.html's three chart containers. Left as a plain
   `.spinner` everywhere else (small inline action-button loading states,
   insights.html's non-primary panels) — not every spinner needed a
   skeleton.

3. **Empty-state illustrations** — small inline SVG line-art (roughly
   100px viewBox, app color tokens, no stock imagery) added above the
   existing v1.6.0/v1.7.0 empty-state copy (kept intact, not replaced):
   overview.html's "no runs yet" and results.html's "no runs saved yet" get
   a simple folder/play-button glyph; overview.html's "no failures in 14
   days" and triage-board's "nothing to triage" get a celebratory
   check-circle (kept the existing celebration emoji too, since it already
   read well); readiness.html's three-state coverage empty state (v1.6.0
   item 3, text untouched) gained a shared tag/grid illustration above each
   variant.

4. **Micro-interactions**:
   - Stagger fade-in (`row-fade-in` class + a per-row `animation-delay` via
     the new `staggerDelayMs()` helper, 30ms/row capped at 300ms, disabled
     under `prefers-reduced-motion`) on results.html's run-history table and
     overview.html's recent-executions list.
   - Count-up animation for overview.html's stat-card numbers, driven by a
     small `requestAnimationFrame` loop calling the new pure
     `countUpValue()`/`easeOutCubic()` helpers (`public/count-up.js`),
     animating 0 to the target value over 650ms. Skips straight to the
     final value when
     `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
   - Spot-checked `.panel`/`.stat-card` hover-elevation on `setup.html`,
     `triage-board.html`, and `readiness.html` against the established
     global `.panel:hover`/`.stat-card:hover` rules in `shared.css` — all
     three already use the plain `.panel`/`.stat-card` classes with no
     overriding rule, so hover-lift was already inherited correctly; no fix
     was needed there.

**Testing**: added `public/count-up.js` (pure `easeOutCubic`,
`countUpValue`, `staggerDelayMs` — the one genuinely testable slice of this
otherwise CSS/DOM/chart-library-heavy pass) with
`__tests__/count-up.test.js` (11 new tests). `npm test` now passes at
201/201 (190 existing + 11 new). Server boot + `curl` verified:
`/report-center.html` and `/insights.html` both serve the Chart.js
`<script>` tag well-formed; `/api/reports/overview` unchanged;
`/overview.html` and `/results.html` both serve the new skeleton
markup/CSS classes.

**A human still needs to open the app in a real browser** to verify: chart
rendering, gradient fill, curve smoothing, entrance animation, and styled
tooltips actually render as intended; the donut's click-to-filter still
lands on the right Results URL; skeleton shimmer timing/shape; empty-state
illustrations; count-up animation timing; stagger fade-in; and two
specifically interactive/hard-to-fake behaviors — (a) whether charts
re-render correctly when the theme toggle is clicked mid-session, and (b)
whether disabling the network before loading Report Center/Insights shows
the clean "charts unavailable offline" message rather than a broken page or
console spam. None of this is verifiable headlessly.

## v1.7.1 — Bugfix: failure screenshots/videos/traces going dead after a new run

**Problem reported by the user**: on a run's Results detail page
(`results.html?id=...`), the Failure Screenshots gallery's links would stop
working — because they pointed straight at the host Playwright project's
live `test-results/` folder (`/test-artifacts/...`), and Playwright's default
behavior is to **wipe that folder at the start of every new run** (its own or
anyone else's). So the moment a newer run happened, every older run's
screenshot/video/trace links 404'd, even though that older run's own report
page still claimed to have them.

**Fix**: `server.js`'s `persistRunResult()` now calls a new
`archiveAttachments(runId, tests)` (replacing the old `resolveArtifactUrls`)
that **copies** each screenshot/video/trace file into the hub's own storage —
`dashboard/reports/<runId>/artifacts/` (`storage.reportArtifactsDir`, new,
nested under the same per-run `reportDir()` already used for the HTML
report) — immediately after the run's Playwright process closes, before any
other run can start and clear `test-results/`. Links are then built against
a new `/run-artifacts/:runId/...` static route (`storage.reportArtifactsDir`,
guarded by the same `isSafeRunId` check as the existing `/report-assets`
route) instead of the old `/test-artifacts` route into the live project
folder. A file that's missing or fails to copy is skipped (logged, not
fatal) rather than crashing run persistence.

Because the archived copy lives inside `reportDir(runId)`, it's automatically
covered by the existing soft-delete-to-trash and retention/cleanup lifecycle
(`deleteRunCompletely`/`cleanupOldRuns`) with no extra code — deleting or
expiring a run also removes its archived artifacts.

**Verified**: seeded a fake screenshot under `test-results/`, ran the new
archive logic, deleted `test-results/` entirely (simulating Playwright's
next-run wipe), and confirmed the archived copy under
`dashboard/reports/<runId>/artifacts/` still existed with correct content.
`npm test` → 190/190 passing (no test changes needed — this path wasn't
previously covered by a dedicated test; consider adding one if this area
changes again). Server boot + a request to `/run-artifacts/...` both verified
clean.

**Trade-off, worth knowing**: this duplicates attachment files on disk
(hub storage + the project's own `test-results/`, until Playwright clears
the latter) rather than moving them — copies, not symlinks/hardlinks, for
maximum filesystem compatibility (works identically across Windows/Defender,
network drives, etc.). For very large traces/videos across many runs, this
adds to `dashboard/reports/`'s disk usage — already subject to the existing
retention/trash policy, but worth keeping an eye on if trace files are large
in your suites.

## v1.7.0 — Onboarding & Adoption Visibility

A senior-architect review diagnosed that several of this hub's most valuable
features — business-process tagging (`@bp:`), test-case ID tagging (`@TC-`),
the Hub Reporter opt-in (live SSE progress, v0.9.0), and target-environment
configuration — depend on the user knowing these conventions exist AND
adopting them, but nothing in the app ever taught them or showed adoption
progress over time. This release adds a guided setup flow and a visible,
trackable adoption metric — no new conventions, no new dependencies, no
feature removed.

**1. Setup / Onboarding Wizard** (`dashboard/public/setup.html`, new;
`dashboard/setup-status.js`, new): a guided checklist walking through the 6
integration points this hub actually depends on for full value, each with a
live ✅ (ok) / ⚠ (warn) / ⬜ (todo) status pulled from real endpoints/checks —
nothing hardcoded:

- **Playwright resolvable** — reuses the exact same `checkPlaywrightCliPresent()`
  check `runPreflightChecks()` already used before a run.
- **Suites discovered** — reuses `scanSuites()` (via the same data
  `GET /api/coverage` already computes) and shows the suite/spec counts found.
- **Hub Reporter opt-in** — can't be auto-detected (it's a change in the HOST
  project's `playwright.config.ts`), so the wizard shows the exact opt-in
  snippet from the v0.9.0 notes above with a "Copy" button, plus a manual
  "I've added this" acknowledgment checkbox — persisted as a new
  `setupHubReporterAcked` boolean in settings (same
  add-a-boolean-to-DEFAULT_SETTINGS pattern as `notifierType`, v1.0.0).
- **Business-process tagging** — shows the live Tag Adoption % (see below)
  with the exact same `@bp:` example snippet already used in
  `readiness.html`'s empty state, reused rather than duplicated.
- **Target environment configured** — checks `settings.targetUrl`, links to
  Settings if unset.
- **AI (optional)** — checks `settings.aiEnabled` + a configured key,
  explicitly labeled optional and never rendered as a blocking red X.

Each step is independently actionable — a direct link to Settings/Readiness,
or the copy-paste snippet + acknowledgment for the one step (Hub Reporter)
that requires an external file edit the hub cannot see. `computeSetupStatus()`
(the ✅/⚠/⬜ derivation) and `computeTagAdoptionPercent()` are pure functions
in `setup-status.js`, unit-tested without booting Express/SQLite (same
pattern as `coverage-matrix.js`/`readiness.js`), backing a new
`GET /api/setup/status` endpoint.

**Reachable from**: a "Setup" link in the sidebar nav, a "Setup Wizard" panel
on Settings, a "Setup Wizard" mention on About, and a small dismissible
banner on Overview (see below).

**2. Tag Adoption % metric**: `(specs with >=1 test carrying a @bp: or @TC-
tag) / (total specs discovered)`, computed from the v1.6.0 AST scanner's
per-test data (`specTestTags`) — accurate per-test resolution, not the old
file-level approximation. Exposed as a `tagAdoption: {totalSpecs, taggedSpecs,
percent}` field on the existing `GET /api/coverage` response (no new endpoint
for one number) and surfaced as a prominent stat card on **Overview** — the
page users see most — with a percentage, a small progress-bar visual, and a
"N / M specs tagged" caption, reinforcing that this is meant to grow over
time rather than being a one-off audit buried in Readiness.

**3. Dismissible Overview banner**: when the setup checklist's required steps
aren't all complete, Overview shows a small non-blocking "N/5 setup steps
complete — finish setup" banner linking to `/setup.html`. Dismissing it sets
`localStorage['mdg-setup-banner-dismissed']` (same shared-localStorage-key
convention as `mdg-theme`/`mdg-density` in `shared.js`) so it never nags again
on a later page load, even across reloads — until the flag is cleared
(browser storage clear) it stays hidden regardless of setup state.

## v1.6.0 — AST Tag Resolution & Coverage Consolidation

A senior-architect review diagnosed the Coverage page as "feels useless" for
two concrete reasons: (a) `tag-scanner.js` resolved `@bp:`/`@TC-` tags at the
whole-SPEC-FILE level (regex over the entire file), so one tag applied to
every test in that file even when tests belonged to different business
processes — a known, previously-deferred limitation (see the v1.0.0/§3.2
notes in earlier sections of this file); (b) Coverage's data (business-process
pass/fail/quarantine counts) had become redundant with `readiness.html`
(v1.4.0), which already computes a `coverageGapPct` per business process as
part of its requirement-risk score. This release fixes both.

**1. AST-based tag scanner, per-test resolution** (`tag-scanner.js`, rewritten):
replaced the whole-file regex scan with a TypeScript-compiler-API AST walk
(`ts.createSourceFile` + a recursive `ts.forEachChild`-based tree walk). New
`scanFileForTestTags(filePath)` returns one record per `test()` call —
`{ titlePath, tags, testCaseId, testCaseIds, businessProcess,
businessProcesses, tagTypos, tagTypoObjects }` — extracting tags **only**
from the title-argument string literals of `test`/`test.describe`/
`test.only`/`test.skip`/`test.fixme` calls, plus the modern
`test('title', { tag: ['@smoke'] }, fn)` second-argument tag-array syntax.
A tag on an enclosing `test.describe()` title is inherited by every test
nested inside it, **combined with** (not replacing) any tags on that test's
own title — this is more correct than the old whole-file approach, not less:
two tests in the same file can now resolve to two different business
processes, and a describe-level tag reaches every test under it without also
leaking onto unrelated tests in a sibling describe block.

Because extraction only ever looks at title-argument string literals, the
previously-documented false-positive regression — JSDoc `@param`/`@returns`,
email addresses, `@ts-ignore` directives, and the `@playwright/test` import
specifier all leaking in as fake tags under the old whole-file regex scan —
is fixed as a natural consequence of this design, not patched around. The
old test that documented that regression as a known, accepted gap
(`__tests__/tag-scanner.test.js`) has been rewritten into a "no false
positives" assertion against the exact same fixture.

`scanFileForTags()`/`scanFileForExtendedTags()` (file-level, still exported
for callers that reasonably want file-level info — e.g. Explorer's spec-card
tag chips) are now thin unions over `scanFileForTestTags()`'s per-test
results, rather than independent regex passes. Parse errors and unreadable
files are handled defensively — logged as a warning and skipped (returns
`[]`), so one malformed spec file never aborts a whole-suite scan.

New dependency: **`typescript`** (`^5.6.3`, pinned below the in-development
7.x line whose parser API changed shape — `ts.createSourceFile`/
`ts.ScriptTarget` are stable on the 5.x line). Pure JS, no native bindings,
used purely for its `createSourceFile`/AST-walk API — no `tsc` build step is
introduced anywhere in the (still vanilla JS/HTML) dashboard.

**2. Coverage merged into Readiness, standalone page removed**
(`readiness.html`, `coverage.html` deleted, `partials/shell.html`,
`shared.js`): `server.js`'s `scanSuites()` now also stores each spec's
per-test tag data (`specTestTags`), and `coverage-matrix.js`'s
`buildCoverageMatrix()` was rewired to bucket each test by looking up its
**own** resolved business-process list (keyed by the test's leaf title — the
same string Playwright's JSON reporter records) instead of a shared
file-level list; a run test whose title doesn't match any known per-test
record falls back to `noCoverage` rather than guessing. `GET /api/coverage`
is unchanged at the route level and still backs both the coverage matrix and
`GET /api/reports/readiness`'s coverage-percent input.

The Coverage Matrix table and the "Tag taxonomy gaps" panel (untagged specs +
typo list) moved from the now-deleted `coverage.html` into `readiness.html`,
below the existing verdict banner / check cards / requirement-risk table,
reusing the same `GET /api/coverage` and `GET /api/tags/validation` fetches
— no duplicated fetch logic. The nav item and page title changed from
"Readiness" to "**Readiness & Coverage**" to reflect the merge; the "Coverage"
sidebar link, and the `coverage.html` entries in the command palette
(`shared.js`'s `LAUNCHER_NAV_PAGES`), were removed. `/coverage.html` now 404s.

**3. Differentiated empty states** (`readiness.html`, `GET /api/coverage`):
the single generic "No @bp: tags found" message is now three distinct
messages, each with one concrete next step, based on new `totalSuites`/
`totalSpecs`/`hasAnyRun` fields added to `GET /api/coverage`'s response:
(a) no suites/specs discovered at all → suggests checking `PROJECT_ROOT`'s
`suites/<name>/e2e/*.spec.ts` structure; (b) suites discovered but zero runs
exist yet → suggests running a suite first; (c) suites exist and have run,
but zero tests have any `@bp:` tag → shows a copy-pasteable example
(`test('create material @bp:material-create', ...)`).

## v1.5.0 — UI/UX Polish

**1. Run Timeline Strip** (`execution-center.html`, `results.html`,
`server.js`): a horizontal strip of one small colored cell per test, using
the same 7-status color tokens (`--green`/`--red`/`--orange`/`--gray`, etc.)
as everywhere else. On Execution Center's live-run view it's wired into the
**existing** SSE consumer (`openLiveStream()`'s `EventSource` against
`GET /api/runs/:id/stream`, v0.9.0) rather than opening a second connection
— `renderLivePanel()` now also rebuilds a `#timeline-<runId>` strip from the
same `state.tests` array the live console/test list already track, sized
using the `begin` event's `totalTests` (confirmed present in
`hub-reporter.js`'s `buildBeginEvent()`). On a completed run's Results
detail page it renders once, statically, from a new
`GET /api/runs/:id/events` endpoint (`server.js`) that does a one-shot read
of the run's `events.ndjson` via the existing `readNewLines()` helper
(offset 0 = "read the whole file") — if the file was already cleaned up
(`dashboard/data/tmp/runs/<runId>/` retention), the endpoint returns
`{ok:true, exists:false}` and the strip section just stays hidden; this only
works for recent runs, by design, no new persistence was added.
**Caveat**: the live strip's cell count is capped at the same 200-entry cap
`state.tests` already uses for the console/list (very long runs beyond 200
tests will show a shorter strip than the total) — an existing cap from v0.9,
not new to this feature.

**2. Deep-link URL state** (`public/deep-link.js`, new — plus
`results.html`, `report-center.html`, `insights.html`, `triage-board.html`):
`?suite=`/`?status=` read-support on `results.html`'s history list already
existed (Report Center's suite drill-down links, v1.1) but had no
write-back — filter changes never touched the URL. New shared, pure
`parseDeepLinkParams(params, spec)` / `buildDeepLinkParams(state, spec)`
pair (declarative `{ paramName: { key, default } }` spec, omits
default-valued keys so links stay short) plus a thin `syncDeepLinkState()`
wrapper that calls `history.replaceState` (never `pushState`, so toggling a
filter doesn't spam back-history). Wired into: `results.html`'s history-list
suite/status filters (now bidirectional) and its existing `?id=` detail-view
selection (already a full navigation, so already deep-linkable — no change
needed there); `insights.html`'s days/suite filters; `report-center.html`'s
days/suite filters; `triage-board.html`'s status filter. **`coverage.html`
has no filter controls at all currently** (just tables + a tag-typo warning
banner) — nothing to deep-link there yet. No debounce was needed since all
of the above are `<select>` dropdowns, not free-text search boxes.
`__tests__/deep-link.test.js` (9 tests) covers the pure parse/build
functions directly, including the round-trip and default-omission cases —
the DOM-wiring side (reading `location.search` on load, calling
`replaceState`) isn't unit-tested, only the pure logic is.

**3. Command palette (⌘K) expansion** (`shared.js`, `partials/shell.html`):
the existing quick-launcher (v1.3.0) only ran a suite. It's now a small
prefix-driven multi-mode palette (still plain substring filtering, no fuzzy-
match library): no prefix still runs a suite; `>` jumps to any nav page
(hardcoded label/href list mirroring the sidebar); `#` fuzzy-searches a
capped recent-run list (`GET /api/runs/history?limit=40` — deliberately not
the full history) and opens it on Results; `!` searches flaky tests
(reusing `GET /api/flaky?days=90` — the same dataset Insights' own
"Quarantine" button already acts on, rather than adding a new "list every
test" endpoint just for the palette) and quarantines the selected one via
the **same** reason/requestedBy-required prompt flow as
`insights.html`'s `toggleQuarantine()` (governance rule from v1.0, not
bypassed). `results.html`'s new keyboard-triage `q` shortcut (item 5) calls
this same `launcherQuarantineTest()` function, so there is exactly one
quarantine-prompt code path in the whole app. **Skipped**: opening a trace
file directly from the palette. There's no existing "trace-viewer launching
mechanism" to cheaply reuse — `results.html` only renders a plain
`<a href target="_blank">` to the trace file's static URL (opening it still
requires `npx playwright show-trace` locally), so building palette support
for it would mean inventing a new mechanism rather than reusing one, which
the task brief said to skip in that case.

**4. Density mode** (`shared.js`, `partials/shell.html`, `shared.css`): a
Comfortable/Compact toggle button next to the existing theme toggle,
mirroring its exact pattern — `shellApplyDensity()`/`shellToggleDensity()`
alongside `shellApplyTheme()`/`shellToggleTheme()`, same `localStorage`
persistence approach (new key `mdg-density`), same "apply once before the
shell HTML exists, apply again after" two-call boot sequence in
`initShell()`. Sets `data-density="compact"` on `<html>` (checked before the
shell partial loads, so there's no flash of the comfortable layout).
`shared.css` compact overrides target table/row density specifically —
`th`/`td` padding, `.run-card` padding, `.panel-head`/`.page-body` padding,
`.summary-card`/`.stat-card` padding — a real, visible tightening across
Results' table, Triage Board, Execution Center's run-history cards, and
Report Center/Insights' stat panels, not a cosmetic no-op.

**5. Keyboard-first triage** (`results.html`): on the test-details table,
`j`/`k` move a highlighted "focus" through failed/flaky rows only (a plain
JS array built once per `renderDetailView()` call, not re-sorted on every
keypress); `b`/`f` set the focused row's triage status directly (`bug` /
`flaky-ignore`) by driving the existing `<select class="js-triage-select">`
and its `change` handler — no new save path, reuses `saveTriageStatus()`
as-is; `q` opens the quarantine prompt flow (reason+requestedBy required,
same shared function as item 3's palette — never a silent one-key
quarantine). All five are bare keys, so `handleResultsKeydown()` bails out
whenever `document.activeElement` is an `INPUT`/`TEXTAREA`/`SELECT`/
`contenteditable` element (covers the triage-note text field on the same
page) or a modifier key is held (never fights `shared.js`'s `⌘K`/`⌘N`/`⌘1-4`
global shortcuts, which are all modifier-gated already).

**6. Report Center chart interactivity** (`report-center.html`): the
pass-rate trend line already had per-point `<title>` tooltips on its visible
dots (unchanged); added a fatter (`r=10`, transparent) invisible hit-circle
under each dot with the same tooltip text, so hovering *near* a point (not
just exactly on its 3px dot) shows the date/pass-rate/run-count tooltip —
plain SVG `<title>`, no JS-positioned tooltip div, no new dependency. The
result-breakdown donut's arcs and legend rows are now clickable
(`goToResultsFilteredBy()`), linking out to `results.html?status=failed` via
`deep-link.js` for the "Failed" segment. **Semantic caveat, called out
directly in code comments**: the donut's segments are per-TEST status
(passed/failed/flaky/skipped/quarantined) while `results.html`'s `?status=`
filter is per-RUN status (running/done/failed/interrupted/cancelled) — only
`failed` has an obvious 1:1 mapping between the two domains, so that's the
only segment wired to a filtered link; the rest fall back to an unfiltered
link to Results (still useful, just not filtered) rather than inventing a
fake mapping. This is intentionally the "keep it simple" reading of the
task brief, not a full cross-filtering framework.

**7. Version bump**: `dashboard/package.json`'s `"version"` bumped to
`"1.5.0"`; `GET /api/meta`'s `dashboardVersion` reflects it automatically
(re-verified, not rebuilt — confirmed via a real `curl /api/meta` against a
booted server, see Testing below).

**Testing**: added `__tests__/deep-link.test.js` (9 tests: `parseDeepLinkParams`/
`buildDeepLinkParams` including default-omission, round-trip, and
undefined/null-value edge cases) — full suite: **170 tests passing (161
pre-existing + 9 new), 0 failures**. This pass is overwhelmingly DOM/CSS
wiring rather than pure logic (timeline strips, keyboard shortcuts, density
CSS, palette prefix-routing, chart hover/click handlers), so most of it
intentionally has no unit tests — there was nothing else genuinely separable
into a pure, testable function without forcing it.

**Sandbox-verification limitations**: this is a headless sandbox with no
way to click through a real browser, so the following are unverified beyond
"the code is wired up correctly and the server boots/serves it" —
**please spot-check these on a real machine**:
- The actual visual rendering and cell sizing of the Run Timeline Strip
  (both the live version on Execution Center and the static version on
  Results) against a real run with `hub-reporter.js` opted in.
- The actual feel of `j`/`k`/`b`/`f`/`q` keyboard navigation on
  `results.html` — timing, whether the focus outline is visually clear
  enough, and whether any other page element unexpectedly steals focus.
- The visual difference the Density mode toggle makes in practice (padding
  numbers were chosen by inspection of `shared.css`, not by eye on a
  rendered page).
- Tooltip positioning/readability for the Report Center trend-line hover
  (native `<title>` tooltips render differently across browsers/OSes).
- The command palette's new `>`/`#`/`!` prefix modes end-to-end (typing,
  fuzzy substring match quality, Enter-to-activate) — only confirmed the
  endpoints they call (`/api/runs/history`, `/api/flaky`) respond correctly
  via `curl`, not the actual keystroke-by-keystroke UX.

## v1.4.0 — Reporting & Governance

**1. Release Readiness / Go-No-Go view** (`readiness.js`, `server.js`,
`public/readiness.html`): new pure `computeReadiness()` aggregates four
checks — none of which track any new data, all pulled from what v0.8-v1.3
already persist:
- **Overall pass rate** (`report-aggregator.js`'s `computeOverview().passRate`)
  vs. a configurable threshold, default **95%**.
- **Quarantine health** (`quarantine-store.js`'s `listActive()` /
  `daysRemaining`): any past-due entry is FAIL, near-expiry-only is WARN,
  none is PASS. "Near-expiry" defaults to **≤3 days remaining**.
- **Business-process coverage** (`coverage-matrix.js`'s `@bp:` groups): % of
  groups with at least one automated&passing test, vs. a configurable
  threshold, default **80%**.
- **Recent regressions**: approximated (no full run-compare feature was
  built) as "tests failing in the most recent completed run of a suite that
  passed in the prior completed run of that same suite" — `0` is PASS, `≥1`
  is WARN, `≥3` is FAIL (both configurable).

Each check gets its own PASS/WARN/FAIL verdict; the overall verdict is the
worst of the four (`worstVerdict()`). A `value === null` (no data yet, e.g. a
fresh sandbox) is reported as WARN, never FAIL — "unknown" is not the same as
"broken". All four thresholds are configurable via `dashboard/hub.config.json`
(same `readHubConfig()` merge pattern introduced in v0.9 for the concurrency
`LIMITS`, extended here rather than duplicated):
`passRateThreshold` (95), `coverageThreshold` (80), `nearExpiryDays` (3),
`regressionWarnAt` (1), `regressionFailAt` (3). New endpoint
`GET /api/reports/readiness?days=N&suite=X`. New page `readiness.html` — an
overall verdict banner plus one card per check, all print-friendly (`@media
print`, same convention as `export.js`'s print reports), reusing the
existing green/orange/red status tokens (PASS≈passed, WARN≈flaky, FAIL≈failed).
Nav link added to the sidebar between Report Center and Triage Board.

**2. Requirement-risk view** (`readiness.js`'s `computeRequirementRisk()`,
same `readiness.html` page): ranks `@bp:` business processes by a simple,
explainable weighted risk score —

```
risk = failRate × 0.4 + coverageGap × 0.4 + quarantineRatio × 0.2
```

— where, per business process, `failRate = automatedFailing / total`,
`coverageGap = 1 - automatedPassing / total`, `quarantineRatio = quarantined
/ total` (`total` = passing + failing + quarantined tests for that process;
a process with zero tracked tests reports a `coverageGap` of 1 rather than
dividing by zero — no coverage at all is itself the risk signal). Fail rate
and coverage gap are weighted equally and heaviest because they most
directly answer "does this business process actually work and get tested?";
quarantine ratio is weighted lower because a quarantined test *hides* risk
rather than proving it. New endpoint `GET /api/reports/requirement-risk?days=N`,
sorted descending (highest risk first). **Placement decision**: folded into
`readiness.html` as its own panel rather than a new full page or an addition
to `coverage.html` — it's a natural companion to the coverage check on the
same readiness rollup, and a third near-duplicate dashboard wasn't
justified for one table.

**3. Tag taxonomy validation** (`tag-scanner.js`'s `findTagTypos()`,
`server.js`, `coverage.html`): the coverage matrix and requirement-risk view
only have value if `@bp:`/`@TC-` tags are used consistently, so `scanSuites()`
now also flags specs with **neither** tag at all (the ones silently landing
in coverage-matrix's "no-coverage" bucket — a taxonomy gap, not just a
coverage gap) and two simple pattern-based typo heuristics: `@bp-foo` (dash
instead of colon) and lowercase `@tc-123` (instead of `@TC-123`) — deliberately
just these two known typos, no fuzzy/Levenshtein matching. New endpoint
`GET /api/tags/validation` returns `untaggedCount`/`untaggedBySuite` and a
`typos` list. Surfaced as a lightweight amber warning banner on
`coverage.html` (hidden entirely when there's nothing to flag) linking to an
expandable "Tag taxonomy gaps" panel lower on the same page — proportionate
to a supporting/nudging feature, not a flagship page of its own.

**4. Version bump**: `dashboard/package.json`'s `"version"` bumped to
`"1.4.0"`; `GET /api/meta`'s `dashboardVersion` reflects it automatically.

**Testing**: added `__tests__/readiness.test.js` (21 tests: verdict helpers,
`computeReadiness()`'s overall-verdict-is-worst-of-checks behavior, and
`computeRequirementRisk()`'s formula including the zero-tests edge case) and
extended `__tests__/tag-scanner-traceability.test.js` with 5 new
`findTagTypos()`/`scanFileForExtendedTags()` typo-detection cases — full
suite: 161 tests passing (135 pre-existing + 26 new), 0 failures.

**Sandbox-verification limitations**: this sandbox has no seeded run/suite
history, so `/api/reports/readiness`, `/api/reports/requirement-risk`, and
`/api/tags/validation` were verified to degrade to clean empty/zero responses
(not crash) against the real, unseeded SQLite database, and separately
verified against a small set of runs/tests/quarantine entries/tagged specs
seeded directly via `storage.js`/`db.js`/`quarantine-store.js` (then removed)
to confirm the readiness verdicts and risk-score math compute correctly on
non-trivial data. **Please spot-check both pages against a real project's
data** — the "regressions" approximation in particular (comparing only the
two most recent completed runs per suite) is a deliberately simple heuristic,
not a full run-compare feature, and its behavior on a long, noisy run history
hasn't been exercised here.

## v1.3.0 — Data Integrity & Triage Efficiency

**1. Persist active-run state across restart** (`db.js`, `storage.js`,
`process-liveness.js`, `server.js`): `runs.pid` is a new column (idempotent
`ALTER TABLE`, same pattern as the v1.0 quarantine columns) storing the
spawned Playwright child's OS PID, set right after `spawn()` in
`startTestRun()`. `reconcileIndexOnBoot()` no longer blindly flips every
`status:'running'` row to `'interrupted'` — for each one it checks
`isProcessAlive(pid)` (new `process-liveness.js`, `process.kill(pid, 0)`
under the hood; ESRCH -> dead, EPERM -> alive-but-unsignalable, no throw ->
alive). If the process is still alive, the run stays `'running'` and gets
re-tracked into the in-memory `runs`/`runningProcesses` maps with a
lightweight stand-in handle (`{pid, kill()}`), so `POST /api/runs/:id/stop`
keeps working by PID even though this hub instance never spawned that
process. Runs with no PID on file (pre-migration) fall back to the old
mark-interrupted behavior automatically. Also added `SIGTERM`/`SIGINT`
handlers that log a clear warning if any run is still in progress at
shutdown (children are intentionally left running rather than killed, so a
graceful hub restart doesn't kill an in-progress regression cycle — they get
correctly re-detected by PID on the next boot). Verified in the sandbox: a
seeded run with a dead PID reconciles to `'interrupted'`; a seeded run
pointed at a real, still-alive detached child process reconciles to
`'running'` after a simulated hub restart, and `/api/runs/:id/stop` was able
to kill that reattached process by PID. **Please spot-check the EPERM path
on a real Windows machine under a locked-down service account** — the
sandbox here ran as a normal user, so only the ESRCH/alive paths were
directly exercised.

**2. Pre-flight checks before starting a run** (`server.js`,
`explorer.html`, `shared.js`): new `runPreflightChecks()` runs three checks
before every `POST /api/run` spawns Playwright: (a) target environment
reachability, reusing the existing `pingUrl()`/`assertOutboundUrlAllowed()`
used by `/api/environment/ping` — no duplicated HTTP code; configurable
block-vs-warn via `dashboard/hub.config.json`'s `blockOnUnreachableTarget`
(default `false`, i.e. warn-only, since a hard block can be too strict
against a known-flaky env); (b) Playwright CLI presence
(`node_modules/@playwright/test/cli.js`) — always a hard block with a clear
message instead of an obscure spawn ENOENT; (c) disk space on the drive
containing `dashboard/data`, via `fs.statfsSync` (built into Node >= 18.15,
no new dependency) — warn-only, and gracefully skipped (not fatal) on
platforms/Node builds where `statfsSync` isn't available. A new
`GET /api/preflight` endpoint lets the UI query these independently; the
checks also always run again server-side inside `POST /api/run` itself, so
a run can never bypass them by skipping the GET call. `explorer.html`'s
`runTest()` and `shared.js`'s `launcherRunSuite()` (Test Explorer / quick
launcher, the two places a run is actually started) now surface a blocking
check's message as the run-start error, and any warn-only checks as toasts
alongside the normal "Started: ..." toast.

**3. Failure signature clustering** (`failure-signature.js`, `server.js`,
`insights.html`): new pure `normalizeErrorSignature(errorMessage)` strips
volatile substrings — file paths (Windows and POSIX, with optional
`:line:col`), ISO-ish timestamps, UUID/hex-like ids, and any remaining digit
runs (material numbers, ms durations, line numbers, etc.) — down to a stable
signature, so "Timeout waiting for #material-4521" and "...#material-9981"
group together. `GET /api/insights/failure-clusters?days=N&suite=X` groups
all failed `test_results` in range by this signature (same SQL-analytics
pattern as the existing `/api/insights/categories`/`trend` endpoints),
returning clusters sorted by size with a representative error, count,
affected test titles, and category. Surfaced as a new "Top failure
clusters" panel on `insights.html`, alongside the existing category/trend/
flaky panels.

**4. Cross-run triage view** (`triage-board.html`, `server.js`,
`partials/shell.html`): new page listing every triage entry across all runs
(previously only visible one run at a time via `results.html`), filterable
by status, with an "Open run" link to that test's most recent run in
`results.html`. `GET /api/triage`'s response is enriched server-side with
`lastRunId`/`lastSeenAt` per entry — a join against `test_results`/`runs` on
`suite_name` + `title` (NOT `test_key`, which is built from file/project in
`pw-json-parser.js` and uses a different convention than the triage/
quarantine `"suiteName::title"` key — same join approach the existing
flaky/coverage queries already use, to avoid the mismatch). Nav link added
to the sidebar between Report Center and AI Workspace.

**5. Version bump**: `dashboard/package.json`'s `"version"` field was still
the stale literal `"0.6.0-alpha"` despite all work through v1.2.0 — bumped to
`"1.3.0"`. `GET /api/meta`'s `dashboardVersion` reads straight from this
file, so the footer/About page version now update automatically.

**Testing**: added `__tests__/process-liveness.test.js` (5 tests) and
`__tests__/failure-signature.test.js` (7 tests) — full suite: 135 tests
passing (123 pre-existing + 12 new), 0 failures.

## v1.2.0 — Bugfix: Groq "Test connection" HTTP 400

`testConnection()` in `dashboard/groq-client.js` sent `response_format:
{type:'json_object'}` but its ping message never contained the literal word
"json" — Groq (OpenAI-compatible) requires at least one message to mention
"json" when that response format is requested, otherwise it rejects the
request with HTTP 400 (`'messages' must contain the word 'json' in some
form...`). Fixed by rewording the system message to explicitly say "Respond
ONLY with a JSON object...". The other AI call sites (`diagnose`,
`summarizeReport`) already phrased their prompts this way and were unaffected.

## v1.1.0 — Report Center, terminal logs, design refresh, branding

**Report Center** (`report-center.html`, flagship QC reporting page):
- `GET /api/reports/overview?days=N&suite=X` — total runs/executions,
  pass/fail/flaky/skipped/quarantined-skip rates, average duration, per-suite
  breakdown, and a day-bucketed pass-rate trend (SQL against the existing
  `runs`/`test_results` tables, no new storage).
- Hand-rolled inline SVG charts (no charting library): pass-rate trend line,
  status-breakdown donut, per-suite pass-rate bars — using the same 7-status
  color tokens as everywhere else in the app.
- Suite drill-down table links straight into `results.html` pre-filtered by
  suite/status.
- **AI summary** (`POST /api/reports/ai-summary`, Groq): health assessment,
  trend, top risk areas, 2-3 recommendations — gated behind the same
  `aiEnabled`+API-key check as the existing AI Diagnose feature, labeled
  "AI-generated, verify before sharing".
- "Export Report" → print-optimized HTML (`GET /api/reports/print`),
  Ctrl+P → Save as PDF, same approach as the v1.0 print-report feature.
- **Known metric caveat**: `quarantinedSkipRate` is a normalized ratio, not a
  bounded percentage of executions — it can read >100%. Worth relabeling
  before putting it in front of a manager/client-facing report.
- **Not built yet** (flagged for a future pass, not started): scheduled/
  emailed reports, a release-readiness go/no-go view, requirement-risk
  weighting by `@bp:` business process.

**Terminal-based live logs (reverted from the v0.9 in-browser console).**
Starting a run now also opens a separate terminal window that tails the run's
log file live — closer to the pre-v0.7 experience, but without reintroducing
the `shell:true`/cmd.exe injection risk that was removed in v0.7: the log
path is passed as its own argv element / env var, never interpolated into a
shell command string, so nothing in the log content (including a test title)
can be parsed as a command. The v0.9 in-browser console panel on Execution
Center is kept as a secondary/collapsed option (useful if no desktop session
is available to show a window) but the terminal window is now the primary
experience. **Please spot-check on a real Windows machine** that the
PowerShell window actually appears — this was verified to spawn a real,
correctly-tailing process, but visual confirmation needs a real desktop
session, which the build sandbox didn't have.

**Design refresh** (`shared.css`): OKLCH-based color tokens, dark-by-default
("control room" look, per the architecture plan's design direction), a
distinct color + small icon for all 7 statuses (passed/failed/flaky/skipped/
quarantined/cancelled/stale) used consistently on every page, and subtle
hover/transition effects on cards and buttons.

**Branding**: bigger/bolder "SimpleMDG Automation Hub" wordmark in the
sidebar, a footer with "Built by Alain Truong" + the current app version
(read from `/api/meta`'s `dashboardVersion`, which already existed and was
verified untouched by all the earlier refactors).

**Shortcuts → About**: removed the static "list of shortcuts" panel (the
underlying shortcuts themselves — ⌘1-4 nav, ⌘K/⌘N quick launcher — still
work, only the explanatory panel was removed for being low-value). Added a
new **About** page: product name/version, a short description, a shortcuts
reference table, and a curated summary of past releases.

## v1.0.0 — Enterprise QA capability

**Quarantine Governance** (fixes the "false-green" risk from earlier releases):
quarantining a test now requires a `reason` + `requestedBy`, gets an `expiresAt`
(default 14 days, max 60), and auto-releases when expired (checked on boot and
every 24h). Source of truth is `<project-root>/.hub/quarantine.json` (commit
this to git — it's team governance data, not machine-local); SQLite just
mirrors it for fast queries. Every run now records `quarantineSkipped` and
Results/Overview show a visible "⚠ N test(s) quarantined" banner instead of a
silently-inflated pass rate. New endpoints: `GET /api/quarantine`,
`GET /api/quarantine/impact`.

**Traceability tags**: `@TC-1234` (test case id) and `@bp:create-material`
(business process) are now extracted alongside the existing `@tag` scanning —
purely additive, opt-in by convention in your test titles.

**Coverage Matrix** (`coverage.html`, `GET /api/coverage`): groups tests by
`@bp:` business-process tag into automated&passing / automated&failing /
quarantined / no-coverage. Tests without a `@bp:` tag show up under
"no-coverage", not silently dropped.

**Run metadata**: each run now records git branch/commit/dirty-state
(read-only, via `git`, degrades to `null`s if not a git repo or `git` isn't on
PATH) — shown in Results detail.

**Teams notifications**: `notifierType` setting (`slack`/`teams`/`none`) in
Settings — Teams uses an Adaptive Card payload via Power Automate Workflows
(the old O365 connector is deprecated), Slack keeps the plain `{text}` format.

**Print-optimized report**: `GET /api/runs/:id/print` + a "Print / Save as
PDF" button on Results — a browser-printable HTML page (`@media print`) as an
alternative to the existing Chromium-rendered PDF export (that one still
works, this is just a lighter/faster option).

**Deliberately out of scope**: ADO Test Plans sync, data-footprint/workflow-
instance tracking, tag taxonomy validation UI, PWA installability, the
5-page IA reorg — these need either external integration credentials or
conventions your test suites may not follow yet; ask explicitly if you want
any of them next.

## v0.9.0 — Platform & CI/CD (Live Observability, §ADR-2)

This release adds an **opt-in** Playwright reporter that gives the dashboard
real live progress (n/total, per-test pass/fail as it happens) over
Server-Sent Events, instead of only the indeterminate progress bar backed by
polling `/api/runs` every 3s (that polling fallback is unchanged and keeps
working with or without the opt-in below).

**Opt-in reporter registration (one line, guarded by an env var).** This does
**not** change how the hub invokes Playwright's `--reporter` flag (that stays
exactly as it was — no more reporter-overriding, per §5.6/A6 of the v0.6.0
code review). Instead, add this to your `playwright.config.ts`, at your
project root (the config file that sits next to your `suites/` folder — this
whole `dashboard/` folder is a subfolder of that same project root):

```ts
export default defineConfig({
  // ...
  reporter: [
    ...existingReporters,
    ...(process.env.HUB_RUN_ID ? [['./dashboard/hub-reporter.js']] : []),
  ],
});
```

> **Path assumption**: the snippet above assumes `dashboard/` sits directly
> under the same root as `playwright.config.ts` (i.e. `<project-root>/dashboard/hub-reporter.js`),
> which matches this repo's current layout. `docs/ARCHITECTURE_PLAN_v0.7-v1.0.md`
> proposes renaming `dashboard/` → `automation-hub/` in a future release — if/when
> that rename lands, update the path in this snippet (and in your own
> `playwright.config.ts`) to `./automation-hub/hub-reporter.js` accordingly.

`HUB_RUN_ID` is only set by the hub itself (in `startTestRun()` in
`dashboard/server.js`) when it spawns a Playwright process — a normal
`npx playwright test` run never sets it, so `hub-reporter.js` is a guaranteed
complete no-op (every method returns immediately, nothing is ever written)
unless the hub launched the run. Reviewable, revertible, single line.

**What this unlocks once opted in:**
- `GET /api/runs/:id/stream` (SSE) — live `begin`/`testBegin`/`testEnd`/`stepEnd`/`end`/`error`
  events, tailed from `dashboard/data/tmp/runs/<runId>/events.ndjson`.
- Execution Center now opens an `EventSource` for the active run and shows a
  real progress counter, a live-updating list of test results, and a
  scrollable console/log panel with a client-side text filter (persists after
  the run ends, so you can review it afterwards).
- If a host project never opts in, none of the above appears — the page just
  keeps using the existing 3s-polled progress bar, with no errors.

**Other v0.9.0 additions:**
- `GET /healthz` — `{ ok, uptime, dbOk }`, with `dbOk` from an actual
  `SELECT 1` against the SQLite db (never crashes the endpoint on DB failure).
- `PORT` is now env-overridable (`HOST` already was, since v0.7).
- Concurrency limits (`maxSpecs`/`maxSuites`/`maxTotalWorkers`, previously
  hardcoded — §A6 of the v0.6.0 code review) can now be overridden via an
  optional `dashboard/hub.config.json` (plain JSON, no YAML dependency added;
  see `dashboard/hub.config.example.json`). Missing or malformed config falls
  back to the same defaults as before and never fails to boot.

**Explicitly deferred to a future release** (full v1.0 feature catalog,
§6.C of the architecture plan) — none of these were attempted here: the
full 5-page IA reorg, step-level timeline UI polish, the "Run Timeline Strip"
signature visual element, desktop notifications, a coverage matrix,
quarantine governance UI, traceability/tag taxonomy, ADO integration, and PWA
installability.

## v0.6.0-alpha (Phase 6 complete — QA workflow features)

Finishes the roadmap discussed earlier: 6.1 (suite health) and 6.2 (slow
tests) shipped early in v0.5.0-alpha; 6.3 (screenshot gallery) also shipped
early. This release adds the remaining three:

**6.4 — Failure triage** (`results.html`, Results detail page)
- Every failed/flaky test row now has a **Triage** dropdown: Bug,
  Environment issue, Flaky/ignore, Investigating — plus an optional free-text
  note. Saves immediately on change via `POST /api/triage`, no permissions —
  anyone can set or change it, per the earlier discussion.
- Stored in `dashboard/data/triage.json`, keyed by `suiteName::title` (same
  convention as flaky quarantine). Distinct from Quarantine: triage never
  changes what runs, it's purely a label for the next person reviewing results.
- Tests marked **Flaky/ignore** are now excluded from the "Failure Highlight"
  top-failing calculation on Overview, so a known-flaky test doesn't keep
  dominating the spotlight.
- Triage entries are attached to each test automatically in
  `GET /api/runs/:id`, so Results shows existing triage without an extra call.

**6.5 — Run Comparison / Diff** (new page: `compare.html`)
- Pick two runs of the same suite, see 4 groups: **Newly Failed** (the ones to
  investigate first — a real regression), **Newly Fixed**, **Still Failing**,
  **Still Passing**. Matching is by test title.
- Reachable via a **"Compare with…"** button on the Results detail page
  (pre-fills Run A), or by picking both runs manually on the Compare page.
- Backed by `GET /api/runs/compare?a=<id>&b=<id>`.

**6.6 — Regression Cycle grouping** (Execution Center, as agreed — no separate nav item)
- Create a named cycle (e.g. "Release 2.5 Regression"), add any finished run
  to it directly from the Recent Runs list, see aggregated pass rate across
  the whole cycle. Remove individual runs or delete the whole cycle.
- Stored in `dashboard/data/cycles.json` — a cycle only stores which run ids
  belong to it; all stats are computed fresh from the run index on read, so
  deleting a run elsewhere won't leave stale numbers in a cycle.
- Endpoints: `GET/POST /api/cycles`, `GET /api/cycles/:id`,
  `POST /api/cycles/:id/runs`, `DELETE /api/cycles/:id/runs/:runId`,
  `DELETE /api/cycles/:id`.

**Bug found and fixed during this pass**: `GET /api/runs/compare` was
registered *after* `GET /api/runs/:id` in server.js, so a request to
`/api/runs/compare?a=...&b=...` was being swallowed by the `:id` route
(`id="compare"`) and always returned "Invalid run id" — the exact same class
of route-ordering bug fixed for `/history` and `/export/csv` back in Phase 2.
Moved it before `/api/runs/:id` and re-verified with a real two-run diff
(seeded a regression + a fix + an unchanged test, got back the exact expected
groups).

**What was tested for this release** (Linux sandbox, simulated project —
please still spot-check on Windows):
- Run comparison correctly classified a hand-seeded regression, fix, and
  unchanged test into the right buckets
- Triage create/read/delete round-trips correctly, and a test marked
  flaky-ignore was confirmed to drop out of the Overview failure highlight
  (verified against a second-highest-failure test taking its place)
- Regression cycle create → add two runs → aggregated pass rate (67%) matched
  hand-calculated expected value → remove/delete all round-tripped correctly
- Full Vietnamese-language sweep re-run (diacritics + common ASCII words like
  "cho"/"va") across every file — clean

**Known gaps / deliberately out of scope for now**:
- Run Comparison matches tests by **title only**, not suite — comparing runs
  from different suites will produce a mostly-meaningless diff (lots of
  "onlyInA"/"onlyInB"). Not validated against real duplicate test titles
  across different suites.
- No UI yet to browse triage entries independently of a specific run (e.g. a
  "here's everything currently marked as a known bug" list across all runs)
  — triage is only visible from within the Results detail page it was set on.
- Cycle names aren't validated for uniqueness — you can create two cycles
  with the same name.

## v0.5.0-alpha (Phase 5 — UI Redesign)

**Renamed**: the app is now called **SimpleMDG Automation Hub** (was "SimpleMDG
Automation App"). This shows up in page titles, the sidebar, server console
output, and the test-notification webhook message.

**New page structure** (sidebar shell, replacing the old single-page layout):

| Page | File | What it does |
|---|---|---|
| Overview | `overview.html` | Stat cards (Total/Passed/Failed/Skipped/Avg Duration) with 7-day sparklines and vs-yesterday deltas, Recent Executions, Failure Highlight (top failing test + consecutive-failure streak), Quick Actions |
| Test Explorer | `explorer.html` | Renamed from the old Home page — browse suites/specs, tag filter, run configuration (unchanged logic) |
| Execution Center | `execution-center.html` | Live Active Runs (polled, with Stop) + Recent Runs in one place. Regression Cycle grouping (Phase 6.6) will land here later. |
| Results | `results.html` | Renamed from History — run detail, AI Diagnose, Rerun Failed, exports, and a **new failure screenshot gallery** (Phase 6.3, added early since it needed no new backend) |
| Insights | `insights.html` | Pass-rate trend, failure categories, **new Suite Health panel** (Phase 6.1) and **new Slow Tests panel** (Phase 6.2), Flaky tests |
| AI Workspace | `ai-workspace.html` | **New** — lists recent runs with failures, "Analyze with AI" clusters each run's failures by category and shows one diagnosis per category instead of per test |
| Settings | `settings.html` | Same as before, plus a **new Target Environment** field (URL + one-shot reachability ping, shown live in the sidebar) |

**New shared shell** (`shared.css` + `shared.js` + `partials/shell.html`):
loaded by every page, no build step involved (plain `fetch()` + `innerHTML`
injection). Centralizes the sidebar, design tokens, theme toggle, toasts, and:
- **Quick launcher** (⌘K / ⌘N): search-and-run any suite from anywhere
- **Keyboard shortcuts**: ⌘1 Execution Center, ⌘2 Test Explorer, ⌘3 View Last
  Report, ⌘4 Insights
- **Target Environment indicator**: green/red dot + response time in the
  sidebar footer, backed by `GET /api/environment/ping`

**New endpoints**: `GET /api/overview/stats`, `GET /api/insights/top-failing`,
`GET /api/insights/suite-health`, `GET /api/insights/slow-tests`,
`GET/POST /api/environment/ping` + `targetUrl` in Settings. All computed from
data already being stored — no new files or migrations needed.

**Bug found and fixed during this pass**: the old catch-all route
`app.get('/{*path}', ...)` used Express 5's named-wildcard syntax, which the
project's pinned `express@4.x` (bundling the legacy `path-to-regexp@0.1.x`
matcher) does not understand. This was silently masked before because
`express.static` auto-serves `public/index.html` for `/`, so the broken
fallback route was never actually exercised. Now that the home page is
`overview.html` instead of `index.html`, the bug surfaced (`Cannot GET /`) and
was fixed by switching to the classic `app.get('*', ...)` wildcard, which
`path-to-regexp@0.1.x` does support. Verified with both `/` and a random deep
path.

**What was tested for this release** (Linux sandbox, simulated project — please
still spot-check on Windows):
- All 7 pages return 200, and the `/` and unmatched-path fallback both
  correctly serve Overview after the fix above
- Overview stats, top-failing streak detection, suite health, and slow-test
  trend all produce correct numbers against a hand-seeded 7-day dataset
  (cross-checked the JSON output against the seeded values by hand)
- Environment ping tested against both a reachable domain (real HTTP 200) and
  an unreachable one (real DNS failure) — both surfaced correctly in the UI
  fields, no crash
- Full Vietnamese-language sweep re-run across every file (including a
  second pass for non-diacritic words like "cho" that a diacritics-only regex
  would miss) — one leftover Vietnamese word was found and fixed in
  `package.json`'s description field

**Known gaps / not yet built** (tracked for Phase 6):
- Regression Cycle grouping (6.6) — Execution Center has a placeholder comment
  for where it will go
- Run Comparison/Diff (6.5) and Failure triage with notes (6.4) — not started
- No live/real-time progress bar for an in-progress run (deprioritized per
  earlier discussion); the Execution Center shows an indeterminate progress
  bar instead of an actual percentage

## v0.4.0-alpha (Phase 3 + Phase 4)


**Added — Phase 3 (AI diagnosis, optional)**
- New **Settings page** (`/settings.html`): configure a Groq API key, enable/disable
  AI diagnosis, pick a model, test the connection, set the notification webhook,
  and set the data retention period.
- **AI Diagnose button** on failed/flaky tests in the History detail page (only
  shown when AI is enabled and a key is configured). Calls Groq once per test
  (or once per group when using cluster diagnosis) and caches the result inside
  `dashboard/data/runs/<id>.json` so it's not re-requested on every page load.
- `GET/POST /api/settings`, `POST /api/ai/test-connection`,
  `POST /api/ai/diagnose`, `POST /api/ai/diagnose/cluster`.
- AI is strictly **optional and off by default**. When disabled (or the key/
  request fails), every other feature — including the rule-based failure
  category shown on every test — keeps working unchanged.
- **Not verified against the live Groq API**: the sandbox used to build this
  app has no network route to `api.groq.com`, so only the request-building,
  response-parsing, and error-handling code paths were exercised (including a
  real network failure, which was confirmed to fail gracefully rather than
  crash the server). Please run "Test connection" on the Settings page after
  entering a real key to confirm end-to-end connectivity from your machine.

**Added — Phase 4**
- **Rerun failed tests**: a "Rerun failed (N)" button on the History detail
  page starts a new run scoped to only the tests that failed last time, via
  `POST /api/runs/:id/rerun-failed` (uses Playwright's `--grep`).
  - ⚠️ **Windows quoting caveat, not verified on real Windows**: the failed
    test titles are joined into a regex and passed as `--grep "<pattern>"`
    through `spawn(..., { shell: true })`. This was only tested with simple
    titles in this Linux sandbox. Titles containing double quotes, `%`, or
    other cmd.exe-special characters may not survive the round trip on
    Windows — please verify with a real failing suite before relying on it,
    and report back any title that breaks it.
- **Flaky test detection**: `GET /api/flaky` looks at recent runs of each
  suite and flags any test with both passing and failing results as a flaky
  candidate, shown on the new **Flaky tests** panel on the Insights page.
- **Quarantine**: quarantining a flaky test (`POST /api/flaky/quarantine`)
  adds it to `dashboard/data/settings.json`; the next time its suite is run as
  a whole, that test is automatically skipped via `--grep-invert`. Release it
  from the same panel to include it again.
- **Notifications**: `dashboard/data/settings.json` can hold a webhook URL.
  After each run finishes, a plain `{"text": "..."}` JSON payload is POSTed to
  it — this matches the **Slack** incoming-webhook format. **Microsoft Teams
  is NOT supported**: Teams webhooks require a different (Adaptive Card /
  MessageCard) payload shape that this simple sender does not build. Test any
  webhook via Settings → "Send test message" before relying on it.
- **Automatic retention**: on every server start, runs older than
  `retentionDays` (default 30) are deleted automatically — closing the gap
  noted in the v0.2.0-alpha notes below. Manual cleanup and usage stats are
  also available on the Settings page.
- `GET /api/maintenance/stats`, `POST /api/maintenance/cleanup`.

**What was actually tested for this release** (in a Linux sandbox with a
simulated project, so please still validate on a real Windows machine with a
real Playwright suite before relying on these):
- Settings save/read round-trip, including that the raw API key is never
  echoed back by `GET /api/settings`.
- Every new endpoint fails gracefully (no server crash) when given bad input,
  a blocked network call, or a missing run/test id.
- Rerun-failed correctly starts a new run scoped to only the previously-failed
  test title(s).
- Automatic retention cleanup deleted an old seeded run and kept a recent one
  after a simulated server restart, while a run stuck in "running" state also
  correctly flipped to "interrupted" in the same restart.
- Flaky/quarantine endpoints round-trip correctly and are reflected in
  `GET /api/flaky`.

## v0.2.0-alpha (Phase 2)


**Fixed**
- **History filter bug**: the persisted `suiteName` was stored using the shortened
  display label (e.g. `MM01`) instead of the full suite id (e.g. `S4_SIT_AUTO_MM01`),
  which never matched the suite filter dropdown (populated from `/api/suites`, which
  uses full ids). Filtering by suite on the History page now works correctly.
- All code comments and UI text are now in English (previously mixed with Vietnamese).

**Added**
- **Tag filtering**: spec files are scanned for `@tag` annotations placed directly
  in test/describe titles (e.g. `test('create material master @smoke', ...)`).
  Scoped npm import specifiers such as `from '@playwright/test'` are intentionally
  excluded so they never get picked up as tags. Tags appear as filter chips in the
  Test Cases panel on the Home page and are exposed via `GET /api/tags`. Note:
  this filter is for *browsing/selecting* specs only — "Run Entire Suite" still
  runs every spec in the folder; tag-based partial suite execution (e.g. via
  `--grep`) is not implemented yet.
- **Artifact links**: screenshots, videos and traces captured by Playwright for a
  failing test are now linked directly from the History detail page (served from
  `/test-artifacts/...`, restricted to files under the project's `test-results/`
  folder).
- **Export**:
  - `GET /api/runs/:id/export/json` — download the full run detail as JSON.
  - `GET /api/runs/:id/export/pdf` — one-page PDF summary (pass/fail counts,
    category breakdown, failed test list), rendered using the Chromium browser
    that Playwright already installs in the parent project — no new dependency
    with a native binding was added.
  - `GET /api/runs/export/csv` — exports the (filtered) run history table as CSV.
- **Insights page** (`/insights.html`): pass-rate trend over time and a failure
  category breakdown chart, both rendered as plain SVG (no charting library).
  Backed by `GET /api/insights/trend` and `GET /api/insights/categories`.

## v0.1.0-alpha (Phase 1)

First alpha release. Moved from a stateless "run tests from a browser" dashboard
to a small app with persistent history:

- Persistent run history (JSON files under `dashboard/data/`, no database).
- Per-test results (pass/fail/skip/flaky) instead of only the process exit code,
  parsed from Playwright's own JSON reporter.
- Rule-based failure categorization (`timeout`, `selector`, `network`,
  `assertion`, `frame`, `auth`, `other`) — no AI required.
- Per-run HTML report (`dashboard/reports/<runId>/html/`) so concurrent runs no
  longer overwrite each other's report.
- New History page (`/history.html`) — browse past runs, filter, view per-test
  detail, delete old runs.
- Stop button for a running suite/spec.
- Input validation/sanitization for `suiteName` / `specFile` (blocks path
  traversal).
- Crash recovery: any run still marked "running" when the server restarts is
  automatically flagged "interrupted" instead of staying stuck forever.

## Quick usage guide (current feature set, v1.0.0)

1. **Run tests**: Test Explorer → pick suite/spec + tags → Run. Execution
   Center shows it live (real progress if you've opted into the Hub Reporter
   below, otherwise a 3s-polled bar either way).
2. **Live progress (optional)**: add the one-line opt-in from the v0.9.0
   section below to your `playwright.config.ts` to get real n/total progress,
   a live pass/fail feed, and a persistent console panel instead of an
   indeterminate bar.
3. **After a run**: Results page — per-test detail, screenshots/traces,
   AI diagnose (if configured), Rerun Failed, Compare with another run,
   export CSV/JSON/PDF/print, and set Triage notes on failures.
4. **Flaky tests**: Insights → Flaky panel → Quarantine (now requires a
   reason + your name + expiry ≤60 days) — it auto-releases, so it can't
   silently hide a broken test forever. Check the quarantine banner on
   Overview any time to see what's currently excluded and why.
5. **Coverage**: tag tests with `@bp:your-process-name` in the title, then
   check the Coverage page to see what's automated vs. untested per process.
6. **Settings**: Groq API key (or set `GROQ_API_KEY` env var instead — safer),
   retention days, target environment URL, notification webhook (Slack or
   Teams).
7. **Server**: binds to `127.0.0.1:3000` by default (local-only, per machine
   — override with `HOST`/`PORT` env vars). `GET /healthz` for a quick check.

## Installing on top of an existing project

1. Back up your current `dashboard/` folder (in case you need to roll back).
2. Copy the contents of this package (`automation.bat`, `install.bat`,
   `dashboard/`) over your Playwright project's root folder.
3. Re-run `install.bat` — it will create `dashboard/data/` and
   `dashboard/reports/` if missing. No new dependency was added; the dashboard
   still only depends on `express` + `glob`.
4. Run `automation.bat` as usual.

You do not need to delete the parent project's own `node_modules` — only
`dashboard/node_modules` (the web server's own dependencies) gets reinstalled.

## Important notes (read before using)

- **(Fixed as of v0.7.0)** `--reporter` is no longer overridden — the dashboard
  still needs its own JSON output, but it no longer clobbers reporters declared
  in your `playwright.config.ts`. See the v0.9.0 section above for the
  optional Hub Reporter opt-in (separate, additive, for live progress).
- **(Fixed as of v0.8.0)** Run history/triage/quarantine/cycles are now stored
  in `dashboard/data/hub.db` (SQLite via `node:sqlite`), not JSON files — the
  old JSON files are kept as a one-time migration backup, not deleted.
- **HTML reports now live under `dashboard/reports/<runId>/html/`**, not the
  project's root `playwright-report/` folder anymore. The "Show Report" button
  was updated to automatically open the most recent run's report — no change in
  how you use it.
- **Artifact links assume the default `test-results/` output folder.** If your
  `playwright.config.ts` sets a custom `outputDir`, screenshot/video/trace links
  on the History page will not resolve. Update `TEST_RESULTS_ROOT` in
  `dashboard/server.js` to match if you use a custom output folder.
- **No automatic retention/cleanup yet** — `dashboard/reports/` will keep growing
  over time. Automatic cleanup is planned for Phase 4. In the meantime, delete
  old runs manually from the History page ("Delete this run").
- This is still an **alpha** release. AI diagnosis (Groq), flaky-test detection,
  WebSocket live updates, and notifications are planned for later phases.

## Current folder structure inside `dashboard/`

```
dashboard/
├── server.js
├── storage.js           (JSON storage layer)
├── classifier.js         (rule-based failure categorizer)
├── pw-json-parser.js     (parses Playwright's JSON reporter output)
├── tag-scanner.js        (scans spec files for @tag annotations)
├── export.js             (CSV + PDF export helpers)
├── groq-client.js        (Groq API client, used only if AI is enabled)
├── package.json          (v0.6.0-alpha)
├── public/
│   ├── shared.css              (design tokens + sidebar/topbar/card/modal — loaded by every page)
│   ├── shared.js                (injects the sidebar shell, theme, shortcuts, quick launcher, toasts)
│   ├── partials/shell.html      (sidebar + quick launcher markup, injected at runtime)
│   ├── overview.html            (Overview — stat cards, recent executions, failure highlight)
│   ├── explorer.html            (Test Explorer — run tests, tag filter, run configuration)
│   ├── execution-center.html    (Execution Center — active runs, recent runs, regression cycles)
│   ├── results.html             (Results — run detail, AI diagnose, rerun failed, triage, gallery)
│   ├── compare.html             (Compare Runs — diff two runs of the same suite)
│   ├── insights.html            (Insights — trend, categories, suite health, slow tests, flaky)
│   ├── ai-workspace.html        (AI Workspace — cluster-diagnose failures across recent runs)
│   └── settings.html            (Settings — target environment, AI/Groq, notifications, retention)
├── data/                  (auto-created at runtime — do not commit to git)
│   ├── runs-index.json
│   ├── settings.json      (contains the Groq API key if configured — keep this file private)
│   ├── triage.json        (failure triage labels/notes, keyed by suiteName::title)
│   ├── cycles.json        (regression cycle groupings)
│   └── runs/<id>.json
└── reports/                (auto-created at runtime — do not commit to git)
    └── <runId>/html/
```

Recommended `.gitignore` additions for the project:
```
dashboard/data/
dashboard/reports/
dashboard/node_modules/
```

## Checklist to run through on a real Windows machine before trusting this release

Everything below was built and unit/integration-tested in a Linux sandbox
against a simulated project. Please verify on a real Windows box with a real
Playwright suite:

- [ ] Groq "Test connection" on the Settings page with a real API key
- [ ] "AI Diagnose" button on an actual failed test, confirm the response reads sensibly
- [ ] "Analyze with AI" on the AI Workspace page for a run with multiple failure categories
- [ ] "Rerun failed" on a run with a test title containing quotes, `%`, or other
      special characters — this is the highest-risk untested code path
- [ ] Quarantine a flaky test, then run its suite as a whole and confirm it's skipped
- [ ] A real Slack webhook receives the run-finished notification
- [ ] Quick launcher (⌘K/⌘N) actually starts a suite run from a non-Explorer page
- [ ] Keyboard shortcuts (⌘1–⌘4) don't conflict with anything in your browser/OS
- [ ] Target Environment ping against your real SIT/QAS URL
- [ ] Compare two real runs of the same suite and sanity-check the groups
- [ ] Set triage on a few failed tests across a real work session, confirm notes persist
- [ ] Create a regression cycle, add several real runs, confirm the pass rate matches manual math
- [ ] Stop button + rerun-failed + AI diagnose all still work together during a
      normal working session (no interaction tested between all of them at once)

